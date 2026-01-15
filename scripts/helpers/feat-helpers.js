// Feat Helpers - Feat filtering, archetype detection, and feat type logic
import { MODULE_NAME, debugLog } from '../module.js';
import dataProvider from '../data-provider.js';

// Feat level arrays for different feat types
const FREE_ARCHETYPE_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const MYTHIC_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const ANCESTRY_PARAGON_FEAT_LEVELS = [1, 3, 7, 11, 15, 19];

/**
 * Get feats available for a specific type and level
 * @param {Actor} actor - The actor
 * @param {string} type - Feat type (class, ancestry, skill, general, archetype, mythic, ancestryParagon)
 * @param {number} targetLevel - Target level
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of available feats
 */
export async function getFeatsForLevel(actor, type, targetLevel, options = {}) {
  const classItem = actor.items.find(i => i.type === 'class');
  const ancestry = actor.items.find(i => i.type === 'ancestry');
  const heritage = actor.items.find(i => i.type === 'heritage');

  // Determine if this feat type is available at this level
  let levelsArray = [];

  switch (type) {
    case 'archetype':
      levelsArray = FREE_ARCHETYPE_FEAT_LEVELS;
      break;
    case 'mythic':
      levelsArray = MYTHIC_FEAT_LEVELS;
      break;
    case 'ancestryParagon':
      levelsArray = ANCESTRY_PARAGON_FEAT_LEVELS;
      break;
    case 'class':
    case 'ancestry':
    case 'skill':
    case 'general':
      levelsArray = classItem?.system?.[`${type}FeatLevels`]?.value || [];
      break;
    default:
      console.warn(`${MODULE_NAME} | Unknown feat type: ${type}`);
      return [];
  }

  // Check if this level grants this feat type
  if (!levelsArray.includes(targetLevel)) {
    debugLog('getFeatsForLevel', `Level ${targetLevel} does not grant ${type} feat`);
    return [];
  }

  // Determine search query based on feat type
  let searchQuery = null;

  switch (type) {
    case 'class':
      searchQuery = options.dualClassName || classItem?.name;
      break;

    case 'ancestry':
    case 'ancestryParagon':
      searchQuery = [ancestry?.name];
      if (heritage) {
        searchQuery.push(heritage.name);

        // Special cases for versatile heritages
        if (heritage.name === 'Aiuvarin') {
          searchQuery.push('Elf');
        } else if (heritage.name === 'Dromaar') {
          searchQuery.push('Orc');
        }
      }
      break;

    case 'general':
      searchQuery = 'general';
      break;

    case 'skill':
      searchQuery = 'skill';
      break;

    case 'archetype':
      searchQuery = 'archetype';
      break;

    case 'mythic':
      // At level 12 (tier 3), can choose Destiny feat instead of Mythic feat
      searchQuery = targetLevel === 12 ? ['mythic', 'destiny'] : 'mythic';
      break;

    default:
      console.error(`${MODULE_NAME} | Unknown feat type: ${type}`);
      return [];
  }

  if (!searchQuery) {
    console.error(`${MODULE_NAME} | Could not determine search query for feat type: ${type}`);
    return [];
  }

  // Get existing feats
  const existingFeats = actor.items.filter(i => i.type === 'feat');

  // Filter feats
  const feats = await filterFeats(searchQuery, targetLevel, existingFeats);

  // For class feats, also include archetype feats as options
  let archetypeFeats = [];
  if (type === 'class') {
    archetypeFeats = await filterFeats('archetype', targetLevel, existingFeats);

    // Mark as archetype feats
    archetypeFeats.forEach(feat => {
      feat.isArchetypeFeat = true;

      // If feat appears in both class and archetype, it's not really an archetype feat
      if (feats.some(classFeat => feat.slug === classFeat.slug)) {
        feat.isArchetypeFeat = false;
      }
    });

    // Remove duplicates
    const uniqueArchetypeFeats = archetypeFeats.filter(
      archetypeFeat => !feats.some(feat => feat.slug === archetypeFeat.slug)
    );

    archetypeFeats = uniqueArchetypeFeats;
  }

  // Combine feats
  const allFeats = [...feats, ...archetypeFeats];

  // Sort feats
  const sortMethod = game.settings.get(MODULE_NAME, 'feat-sort-method');
  const sortedFeats = sortFeats(allFeats, sortMethod);

  debugLog('getFeatsForLevel', `Found ${sortedFeats.length} ${type} feats for level ${targetLevel}`);

  return sortedFeats;
}

/**
 * Filter feats by search query and level
 * @param {string|Array<string>} searchQueries - Search query or queries
 * @param {number} targetLevel - Maximum level
 * @param {Array<Item>} existingFeats - Existing feats on actor
 * @returns {Promise<Array>} Filtered feats
 */
export async function filterFeats(searchQueries, targetLevel, existingFeats) {
  const allFeats = await dataProvider.getFeats();

  // Load manual archetype feats (edge cases)
  const manualArchetypeFeats = await loadManualArchetypeFeats();

  // Normalize search queries
  const normalizedQueries = Array.isArray(searchQueries)
    ? searchQueries.map(normalizeString)
    : [normalizeString(searchQueries)];

  // Get existing feat names (lowercase)
  const existingFeatNames = existingFeats.map(f => f.name.toLowerCase());

  // Filter feats
  return allFeats.filter(feat => {
    const traits = feat.system.traits.value.map(normalizeString);
    const isTaken = existingFeatNames.includes(feat.name.toLowerCase());
    const maxTakable = feat.system.maxTakable || 1;

    // Check if feat is in manual archetype feats list
    const isManualArchetypeFeat =
      normalizedQueries.includes('archetype') &&
      Object.values(manualArchetypeFeats).flat().includes(feat.slug);

    // Exclude destiny feats from levels other than 12
    const isDestinyTraitExcluded =
      targetLevel !== 12 && traits.includes('destiny');

    // Include feat if:
    // - It has one of the search traits OR is in manual list
    // - Level is <= target level
    // - Not already taken (unless maxTakable > 1)
    // - Not a destiny feat at wrong level
    return (
      (normalizedQueries.some(query => traits.includes(query)) || isManualArchetypeFeat) &&
      feat.system.level.value <= targetLevel &&
      !(isTaken && maxTakable === 1) &&
      !isDestinyTraitExcluded
    );
  });
}

/**
 * Sort feats by specified method
 * @param {Array} feats - Feats to sort
 * @param {string} method - Sort method (LEVEL_ASC, LEVEL_DESC, ALPHABETICAL)
 * @returns {Array} Sorted feats
 */
export function sortFeats(feats, method) {
  switch (method) {
    case 'LEVEL_ASC':
      return feats.sort((a, b) =>
        a.system.level.value !== b.system.level.value
          ? a.system.level.value - b.system.level.value
          : a.name.localeCompare(b.name)
      );

    case 'ALPHABETICAL':
      return feats.sort((a, b) => a.name.localeCompare(b.name));

    case 'LEVEL_DESC':
    default:
      return feats.sort((a, b) =>
        a.system.level.value !== b.system.level.value
          ? b.system.level.value - a.system.level.value
          : a.name.localeCompare(b.name)
      );
  }
}

/**
 * Normalize string for comparison (lowercase, no spaces)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
export function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\s+/g, '');
}

/**
 * Load manual archetype feat mappings (edge cases)
 * These are feats that should be treated as archetype feats but don't have the archetype trait
 * @returns {Promise<Object>} Archetype feat mappings
 */
async function loadManualArchetypeFeats() {
  // For now, return empty object
  // In the future, this could load from a JSON file like pf2e-level-up-wizard does
  return {};
}

/**
 * Check if feat has prerequisites
 * @param {Item} feat - Feat to check
 * @returns {boolean} True if has prerequisites
 */
export function hasPrerequisites(feat) {
  const prereqs = feat.system.prerequisites?.value || [];
  return prereqs.length > 0;
}

/**
 * Get feat prerequisites as formatted string
 * @param {Item} feat - Feat to check
 * @returns {string} Formatted prerequisites
 */
export function getPrerequisitesString(feat) {
  const prereqs = feat.system.prerequisites?.value || [];

  if (prereqs.length === 0) {
    return '';
  }

  return prereqs.map(p => p.value).join(', ');
}

/**
 * Check if actor meets feat prerequisites
 * @param {Actor} actor - The actor
 * @param {Item} feat - The feat to check
 * @returns {Object} { meets: boolean, missing: Array }
 */
export function checkPrerequisites(actor, feat) {
  const prereqs = feat.system.prerequisites?.value || [];

  if (prereqs.length === 0) {
    return { meets: true, missing: [], unknown: [] };
  }

  const missing = [];
  const unknown = [];

  // This is a simplified check - full prerequisite checking would require
  // parsing the prerequisite text and checking against actor's abilities,
  // skills, feats, etc.

  for (const prereq of prereqs) {
    // Check common prerequisite types
    const prereqText = prereq.value?.toLowerCase() || '';

    // If prereq is empty or can't be parsed, mark as unknown
    if (!prereqText) {
      unknown.push(prereq.value || 'Unknown prerequisite');
      continue;
    }

    // Check for ability score requirements (e.g., "Strength 14")
    const abilityMatch = prereqText.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(\d+)/);
    if (abilityMatch) {
      const [_, ability, value] = abilityMatch;
      const abilityKey = ability.substring(0, 3); // str, dex, con, etc.
      const actorValue = actor.system.abilities[abilityKey]?.value || 0;

      if (actorValue < parseInt(value)) {
        missing.push(prereq.value);
      }
      continue; // Handled this prerequisite
    }

    // Check for feat requirements (specific feat names)
    // Prerequisites often mention the feat name directly or with "feat" suffix
    // Examples: "Power Attack", "Cavalier Dedication", "Shield Block feat"

    // Get all actor's feat names in lowercase for comparison
    const actorFeatNames = actor.items
      .filter(i => i.type === 'feat')
      .map(i => i.name.toLowerCase());

    // Check if any actor feat name appears in the prerequisite text
    // Also handle cases where the prerequisite is just the feat name
    const hasFeat = actorFeatNames.some(featName => {
      // Check if the prerequisite contains this feat name
      // Use word boundaries to avoid partial matches (e.g., "Shield" shouldn't match "Shield Block")
      const regex = new RegExp('\\b' + featName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      return regex.test(prereqText);
    });

    if (!hasFeat && (prereqText.includes('feat') || prereqText.includes('dedication') || prereqText.includes('archetype'))) {
      // Only mark as missing if we're confident this is a feat prerequisite
      missing.push(prereq.value);
      continue; // Handled this prerequisite
    } else if (hasFeat) {
      // Found the feat
      continue; // Handled this prerequisite
    }
    // If we couldn't determine if this is a feat prerequisite, fall through to unknown

    // Check for proficiency requirements
    if (prereqText.includes('trained') || prereqText.includes('expert') || prereqText.includes('master') || prereqText.includes('legendary')) {
      // Try to extract skill name and rank requirement
      const skills = ['acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy',
                      'intimidation', 'lore', 'medicine', 'nature', 'occultism', 'performance',
                      'religion', 'society', 'stealth', 'survival', 'thievery'];

      let foundSkill = false;
      for (const skillName of skills) {
        if (prereqText.includes(skillName)) {
          const skillData = actor.system.skills?.[skillName];
          if (skillData) {
            const rank = skillData.rank || 0;
            const rankNames = ['untrained', 'trained', 'expert', 'master', 'legendary'];
            const requiredRank = rankNames.findIndex(r => prereqText.includes(r));

            if (requiredRank !== -1 && rank < requiredRank) {
              missing.push(prereq.value);
            }
            foundSkill = true;
            break;
          }
        }
      }

      if (foundSkill) {
        continue; // Handled this prerequisite
      }
    }

    // Check for class/ancestry requirements
    if (prereqText.includes('class') || prereqText.includes('ancestry') || prereqText.includes('heritage')) {
      // These are usually structural and difficult to validate programmatically
      // Mark as unknown for now
      unknown.push(prereq.value);
      continue;
    }

    // If we couldn't determine how to check this prerequisite, mark as unknown
    unknown.push(prereq.value);
  }

  // Determine final state:
  // - If any prerequisites are unknown, return null (can't determine)
  // - If all prerequisites are checked and some are missing, return false
  // - If all prerequisites are checked and none are missing, return true
  let meetsStatus;
  if (unknown.length > 0) {
    meetsStatus = null; // Can't determine
  } else if (missing.length > 0) {
    meetsStatus = false; // Definitely not met
  } else {
    meetsStatus = true; // All met
  }

  return {
    meets: meetsStatus,
    missing,
    unknown
  };
}

/**
 * Get archetype dedication from feat slug
 * @param {string} featSlug - Feat slug
 * @returns {string|null} Archetype name or null
 */
export function getArchetypeFromFeat(featSlug) {
  if (!featSlug) return null;

  // Check if it's a dedication feat
  if (!featSlug.includes('dedication')) {
    return null;
  }

  // Extract archetype name (e.g., "champion-dedication" -> "champion")
  const archetype = featSlug.replace('-dedication', '');
  return archetype;
}

/**
 * Check if actor has archetype dedication
 * @param {Actor} actor - The actor
 * @param {string} archetypeName - Archetype name
 * @returns {boolean} True if has dedication
 */
export function hasArchetypeDedication(actor, archetypeName) {
  if (!archetypeName) return false;

  const dedicationSlug = `${archetypeName}-dedication`;

  return actor.items.some(i =>
    i.type === 'feat' &&
    i.slug === dedicationSlug
  );
}

/**
 * Get all archetype dedications actor has
 * @param {Actor} actor - The actor
 * @returns {Array<string>} Array of archetype names
 */
export function getArchetypeDedications(actor) {
  const dedications = actor.items.filter(i =>
    i.type === 'feat' &&
    i.slug?.includes('dedication')
  );

  return dedications.map(d => d.slug.replace('-dedication', ''));
}

/**
 * Check if feat is an archetype feat (not dedication)
 * @param {Item} feat - The feat
 * @returns {boolean} True if archetype feat
 */
export function isArchetypeFeat(feat) {
  const traits = feat.system.traits.value || [];
  return traits.includes('archetype') && !feat.slug?.includes('dedication');
}

/**
 * Check if feat is a dedication
 * @param {Item} feat - The feat
 * @returns {boolean} True if dedication
 */
export function isDedication(feat) {
  return feat.slug?.includes('dedication') || false;
}

/**
 * Get feat rarity
 * @param {Item} feat - The feat
 * @returns {string} Rarity (common, uncommon, rare, unique)
 */
export function getFeatRarity(feat) {
  return feat.system.traits.rarity || 'common';
}

/**
 * Check if feat is uncommon or rarer
 * @param {Item} feat - The feat
 * @returns {boolean} True if uncommon or rarer
 */
export function isUncommonOrRarer(feat) {
  const rarity = getFeatRarity(feat);
  return rarity !== 'common';
}

/**
 * Get feat traits as array
 * @param {Item} feat - The feat
 * @returns {Array<string>} Array of trait names
 */
export function getFeatTraits(feat) {
  return feat.system.traits.value || [];
}

/**
 * Format feat traits for display
 * @param {Item} feat - The feat
 * @returns {string} Formatted traits
 */
export function formatFeatTraits(feat) {
  const traits = getFeatTraits(feat);
  const rarity = getFeatRarity(feat);

  // Add rarity if not common
  if (rarity !== 'common') {
    traits.unshift(rarity.toUpperCase());
  }

  return traits.join(', ');
}
