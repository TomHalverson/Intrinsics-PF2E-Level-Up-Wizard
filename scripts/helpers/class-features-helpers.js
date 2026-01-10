// Class Features Helpers - Class feature detection, ability boosts, and level progression
import { MODULE_NAME, debugLog } from '../module.js';
import dataProvider from '../data-provider.js';

/**
 * Get class features for actor at specific level
 * @param {Actor} actor - The actor
 * @param {number} level - Level to get features for
 * @returns {Promise<Array>} Array of class features
 */
export async function getClassFeaturesForLevel(actor, level) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return [];
  }

  // Get features from class item
  const features = classItem.system.items || [];

  // Filter by level
  const levelFeatures = features.filter(f => {
    const featureLevel = f.level || f.system?.level?.value || 0;
    return featureLevel === level;
  });

  debugLog('getClassFeaturesForLevel', `Found ${levelFeatures.length} features for level ${level}`);

  return levelFeatures;
}

/**
 * Detect ability boost levels based on variant rules
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {Object} Boost info { hasBoosts: boolean, count: number, isPartial: boolean }
 */
export function detectAbilityBoosts(actor, targetLevel) {
  const gradualBoosts = game.settings.get('pf2e', 'gradualBoosts') === 'enabled';

  if (gradualBoosts) {
    // Gradual boosts: every even level (2, 4, 6, 8, 10, 12, 14, 16, 18, 20)
    // Plus levels 3, 7, 13, 17 (for completing previous set)
    const evenLevels = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    const completionLevels = [3, 7, 13, 17];

    if (evenLevels.includes(targetLevel)) {
      // Start of new boost set - partial boosts
      return { hasBoosts: true, count: 4, isPartial: true };
    } else if (completionLevels.includes(targetLevel)) {
      // Completion of previous boost set
      return { hasBoosts: true, count: 0, isPartial: true, completing: true };
    }

    return { hasBoosts: false, count: 0, isPartial: false };
  } else {
    // Standard boosts: levels 5, 10, 15, 20
    const standardBoostLevels = [5, 10, 15, 20];

    if (standardBoostLevels.includes(targetLevel)) {
      return { hasBoosts: true, count: 4, isPartial: false };
    }

    return { hasBoosts: false, count: 0, isPartial: false };
  }
}

/**
 * Detect partial boosts from previous level (for gradual boosts)
 * @param {Actor} actor - The actor
 * @param {Array} boostsForCurrentSet - Boosts already in current set
 * @returns {Array} Array of partial boost ability keys
 */
export function detectPartialBoosts(actor, boostsForCurrentSet) {
  const gradualBoosts = game.settings.get('pf2e', 'gradualBoosts') === 'enabled';

  if (!gradualBoosts || !boostsForCurrentSet) {
    return [];
  }

  // Find abilities that have partial boosts (value ends in .5)
  const partialBoosts = [];

  const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  for (const ability of abilities) {
    const score = actor.system.abilities[ability]?.value || 0;

    // Check if score ends in .5 (partial boost)
    if (score % 1 === 0.5) {
      partialBoosts.push(ability);
    }
  }

  return partialBoosts;
}

/**
 * Get skill increase count for level
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {number} Number of skill increases
 */
export function getSkillIncreasesForLevel(actor, targetLevel) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return 0;
  }

  // Get skill increase levels from class
  const skillIncreaseLevels = classItem.system.skillIncreaseLevels?.value || [];

  // Count how many times this level appears (usually 1, but could be more)
  const count = skillIncreaseLevels.filter(l => l === targetLevel).length;

  // Also check for Intelligence modifier bonus skill increases
  // Every odd level after 1, if Int modifier > 0
  if (targetLevel > 1 && targetLevel % 2 === 1) {
    const intMod = actor.system.abilities.int?.mod || 0;
    if (intMod > 0) {
      return count + intMod;
    }
  }

  return count;
}

/**
 * Get skill training count at level 1
 * @param {Actor} actor - The actor
 * @returns {number} Number of trained skills
 */
export function getInitialSkillTrainingCount(actor) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return 0;
  }

  // Base skill count from class
  const baseCount = classItem.system.skillFeatLevels?.trained || 0;

  // Add Intelligence modifier
  const intMod = Math.max(0, actor.system.abilities.int?.mod || 0);

  // Add background skill (usually 1)
  const backgroundCount = 1;

  return baseCount + intMod + backgroundCount;
}

/**
 * Check if level grants new spell rank
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {number|null} New spell rank or null
 */
export function getNewSpellRankAtLevel(actor, targetLevel) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return null;
  }

  const fullCasters = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'oracle', 'witch', 'psychic', 'animist', 'necromancer'];
  const partialCasters = ['magus', 'summoner'];

  if (fullCasters.includes(classItem.slug)) {
    // Full casters gain new ranks on odd levels
    if (targetLevel % 2 === 1 && targetLevel >= 1) {
      return Math.min(Math.ceil(targetLevel / 2), 10);
    }
  } else if (partialCasters.includes(classItem.slug)) {
    // Partial casters gain ranks on odd levels starting at 1
    if (targetLevel % 2 === 1 && targetLevel >= 1) {
      return Math.min(Math.floor((targetLevel + 1) / 2), 6);
    }
  }

  return null;
}

/**
 * Get spell slots for level and rank
 * @param {Actor} actor - The actor
 * @param {number} level - Character level
 * @param {number} rank - Spell rank
 * @returns {number} Number of spell slots
 */
export function getSpellSlotsForRank(actor, level, rank) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return 0;
  }

  // This would require reading the spell slot progression table
  // For now, return a simplified version

  // Cantrips are unlimited
  if (rank === 0) {
    return Infinity;
  }

  // Basic slot progression for full casters
  // Level 1: 2 rank-1 slots
  // Level 3: 3 rank-1 slots, 2 rank-2 slots
  // Level 5: 3 rank-1, 3 rank-2, 2 rank-3
  // etc.

  const fullCasters = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'oracle', 'witch', 'psychic', 'animist', 'necromancer'];

  if (fullCasters.includes(classItem.slug)) {
    const rankLevel = rank * 2 - 1; // Level when this rank is first gained

    if (level < rankLevel) {
      return 0; // Don't have access to this rank yet
    }

    if (level === rankLevel) {
      return 2; // First level: 2 slots
    } else if (level === rankLevel + 2) {
      return 3; // Two levels later: 3 slots
    } else if (level > rankLevel + 2) {
      return 3; // Keep 3 slots
    }
  }

  return 0;
}

/**
 * Get feat slots for level
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {Object} Feat slots { class, ancestry, skill, general, archetype, mythic }
 */
export function getFeatSlotsForLevel(actor, targetLevel) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return {};
  }

  const slots = {};

  // Class feats
  const classFeatLevels = classItem.system.classFeatLevels?.value || [];
  slots.class = classFeatLevels.includes(targetLevel) ? 1 : 0;

  // Ancestry feats
  const ancestryFeatLevels = classItem.system.ancestryFeatLevels?.value || [];
  slots.ancestry = ancestryFeatLevels.includes(targetLevel) ? 1 : 0;

  // Skill feats
  const skillFeatLevels = classItem.system.skillFeatLevels?.value || [];
  slots.skill = skillFeatLevels.includes(targetLevel) ? 1 : 0;

  // General feats
  const generalFeatLevels = classItem.system.generalFeatLevels?.value || [];
  slots.general = generalFeatLevels.includes(targetLevel) ? 1 : 0;

  // Free archetype (if variant enabled)
  if (game.settings.get('pf2e', 'freeArchetype') === 'enabled') {
    const archetypeLevels = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    slots.archetype = archetypeLevels.includes(targetLevel) ? 1 : 0;
  }

  // Mythic (if variant enabled)
  if (game.settings.get('pf2e', 'mythic') === 'enabled') {
    const mythicLevels = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    slots.mythic = mythicLevels.includes(targetLevel) ? 1 : 0;
  }

  // Ancestry Paragon (if variant enabled)
  if (game.modules.get('xdy-pf2e-workbench')?.active &&
      game.settings.get('xdy-pf2e-workbench', 'ancestryParagonVariant') === 'enabled') {
    const paragonLevels = [1, 3, 7, 11, 15, 19];
    slots.ancestryParagon = paragonLevels.includes(targetLevel) ? 1 : 0;
  }

  // Dual Class (if variant enabled)
  if (game.settings.get('pf2e', 'dualClass') === 'enabled') {
    // Dual class grants second set of class feats
    slots.dualClass = slots.class;
  }

  return slots;
}

/**
 * Get current boost set for actor
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {string|null} Boost set key or null
 */
export function getCurrentBoostSet(actor, targetLevel) {
  const gradualBoosts = game.settings.get('pf2e', 'gradualBoosts') === 'enabled';

  if (!gradualBoosts) {
    // Standard boosts
    if (targetLevel === 5) return '0';
    if (targetLevel === 10) return '1';
    if (targetLevel === 15) return '2';
    if (targetLevel === 20) return '3';
    return null;
  } else {
    // Gradual boosts
    // Set 0: levels 2-3
    // Set 1: levels 4-7
    // Set 2: levels 8-13
    // Set 3: levels 14-17
    // Set 4: levels 18-20

    if (targetLevel >= 2 && targetLevel <= 3) return '0';
    if (targetLevel >= 4 && targetLevel <= 7) return '1';
    if (targetLevel >= 8 && targetLevel <= 13) return '2';
    if (targetLevel >= 14 && targetLevel <= 17) return '3';
    if (targetLevel >= 18 && targetLevel <= 20) return '4';

    return null;
  }
}

/**
 * Get allowed boosts for current set
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {number} Number of allowed boosts
 */
export function getAllowedBoostsForSet(actor, targetLevel) {
  const boostInfo = detectAbilityBoosts(actor, targetLevel);

  if (!boostInfo.hasBoosts) {
    return 0;
  }

  return boostInfo.count;
}

/**
 * Check if actor is spellcaster
 * @param {Actor} actor - The actor
 * @returns {boolean} True if spellcaster
 */
export function isSpellcaster(actor) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return false;
  }

  const spellcasterClasses = [
    'wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'oracle',
    'witch', 'magus', 'summoner', 'psychic', 'animist', 'necromancer'
  ];

  return spellcasterClasses.includes(classItem.slug);
}

/**
 * Get class journal entry
 * @param {Actor} actor - The actor
 * @returns {JournalEntry|null} Class journal or null
 */
export async function getClassJournal(actor) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return null;
  }

  // Try to find class journal in pf2e.journals compendium
  const journalCompendium = game.packs.get('pf2e.journals');

  if (!journalCompendium) {
    return null;
  }

  // Search for journal entry matching class name
  const journals = await journalCompendium.getDocuments();
  const classJournal = journals.find(j =>
    j.name.toLowerCase() === classItem.name.toLowerCase()
  );

  return classJournal || null;
}
