// Spell Helpers - Spell filtering, tradition detection, and spell type logic
import { MODULE_NAME, debugLog } from '../module.js';
import dataProvider from '../data-provider.js';

/**
 * Get spells available for actor at specific rank
 * @param {Actor} actor - The actor
 * @param {number} rank - Spell rank (0 = cantrips, 1-10 = spell levels)
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of available spells
 */
export async function getSpellsForRank(actor, rank, options = {}) {
  const tradition = getSpellTradition(actor);

  if (!tradition) {
    debugLog('getSpellsForRank', 'Actor has no spell tradition');
    return [];
  }

  // Get existing spells
  const existingSpells = actor.items.filter(i => i.type === 'spell');

  // Filter spells
  const spells = await dataProvider.getSpells({
    rank,
    tradition,
    rarity: options.includeUncommon ? undefined : 'common',
    knownSpells: options.excludeKnown ? existingSpells : []
  });

  debugLog('getSpellsForRank', `Found ${spells.length} rank ${rank} ${tradition} spells`);

  return spells;
}

/**
 * Get spell tradition for actor's class
 * @param {Actor} actor - The actor
 * @returns {string|null} Tradition name (arcane, divine, occult, primal) or null
 */
export function getSpellTradition(actor) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return null;

  const traditions = {
    'wizard': 'arcane',
    'sorcerer': getSorcererTradition(actor),
    'cleric': 'divine',
    'druid': 'primal',
    'bard': 'occult',
    'oracle': 'divine',
    'witch': getWitchTradition(actor),
    'magus': 'arcane',
    'summoner': 'arcane',
    'psychic': 'occult',
    'animist': 'divine',
    'necromancer': 'occult'
  };

  return traditions[classItem.slug] || null;
}

/**
 * Get sorcerer tradition based on bloodline
 * @param {Actor} actor - The actor
 * @returns {string} Tradition name
 */
export function getSorcererTradition(actor) {
  // Find bloodline item
  const bloodlineItem = actor.items.find(i =>
    i.name.toLowerCase().includes('bloodline')
  );

  if (!bloodlineItem) {
    debugLog('getSorcererTradition', 'No bloodline found, using default arcane');
    return 'arcane';
  }

  const bloodlineName = bloodlineItem.name.toLowerCase();
  const slug = (bloodlineItem.slug || '').toLowerCase();
  const searchText = bloodlineName + ' ' + slug;

  // Map bloodlines to traditions
  if (searchText.includes('aberrant')) return 'occult';
  if (searchText.includes('angelic')) return 'divine';
  if (searchText.includes('demonic')) return 'divine';
  if (searchText.includes('diabolic')) return 'divine';
  if (searchText.includes('draconic')) return 'arcane';
  if (searchText.includes('elemental')) return 'primal';
  if (searchText.includes('fey')) return 'primal';
  if (searchText.includes('hag')) return 'occult';
  if (searchText.includes('imperial')) return 'arcane';
  if (searchText.includes('undead')) return 'divine';
  if (searchText.includes('wyrmblessed')) return 'divine';
  if (searchText.includes('psychopomp')) return 'divine';
  if (searchText.includes('nymph')) return 'primal';
  if (searchText.includes('genie')) return 'arcane';
  if (searchText.includes('phoenix')) return 'primal';

  debugLog('getSorcererTradition', `Unknown bloodline: ${bloodlineName}, using default arcane`);
  return 'arcane';
}

/**
 * Get witch tradition based on patron
 * @param {Actor} actor - The actor
 * @returns {string} Tradition name
 */
export function getWitchTradition(actor) {
  // Find patron item
  const patronItem = actor.items.find(i =>
    i.type === 'feat' &&
    i.system?.category === 'classfeature' &&
    i.name.toLowerCase().includes('patron')
  );

  if (patronItem && patronItem.system?.tradition?.value) {
    return patronItem.system.tradition.value;
  }

  debugLog('getWitchTradition', 'No patron found, using default occult');
  return 'occult';
}

/**
 * Get spellcasting type for actor's class
 * @param {Actor} actor - The actor
 * @returns {string} Type (prepared, spontaneous) or null
 */
export function getSpellcastingType(actor) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return null;

  const types = {
    'wizard': 'prepared',
    'sorcerer': 'spontaneous',
    'cleric': 'prepared',
    'druid': 'prepared',
    'bard': 'spontaneous',
    'oracle': 'spontaneous',
    'witch': 'prepared',
    'magus': 'prepared',
    'summoner': 'spontaneous',
    'psychic': 'spontaneous',
    'animist': 'prepared',
    'necromancer': 'prepared'
  };

  return types[classItem.slug] || 'prepared';
}

/**
 * Check if actor auto-learns all common spells (prepared casters with access to tradition's full list)
 * @param {Actor} actor - The actor
 * @returns {boolean} True if auto-learns
 */
export function autoLearnsCommonSpells(actor) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return false;

  const autoLearnClasses = ['cleric', 'druid', 'animist'];
  return autoLearnClasses.includes(classItem.slug);
}

/**
 * Get number of cantrips known at level 1
 * @param {Actor} actor - The actor
 * @returns {number} Number of cantrips
 */
export function getCantripCount(actor) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return 0;

  const cantripCounts = {
    'wizard': 5,
    'sorcerer': 5,
    'cleric': 5,
    'druid': 5,
    'bard': 5,
    'oracle': 5,
    'witch': 5,
    'magus': 5,
    'summoner': 5,
    'psychic': 5,
    'animist': 5,
    'necromancer': 5
  };

  return cantripCounts[classItem.slug] || 5;
}

/**
 * Get number of rank 1 spells learned at level 1
 * @param {Actor} actor - The actor
 * @returns {number} Number of spells
 */
export function getRank1SpellCount(actor) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return 0;

  // Auto-learn classes don't select spells
  if (autoLearnsCommonSpells(actor)) {
    return 0;
  }

  const spellCounts = {
    'wizard': 4, // 2 per spell slot at level 1
    'sorcerer': 3,
    'bard': 2,
    'oracle': 2,
    'witch': 4,
    'magus': 2,
    'summoner': 2,
    'psychic': 2,
    'necromancer': 4
  };

  return spellCounts[classItem.slug] || 2;
}

/**
 * Get number of new spells learned when gaining access to a new rank
 * @param {Actor} actor - The actor
 * @param {number} rank - Spell rank
 * @returns {number} Number of spells
 */
export function getNewSpellsForRank(actor, rank) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return 0;

  // Auto-learn classes don't select spells
  if (autoLearnsCommonSpells(actor)) {
    return 0;
  }

  const type = getSpellcastingType(actor);

  if (type === 'spontaneous') {
    // Spontaneous casters learn 1 spell per rank when they gain it
    return 1;
  } else {
    // Prepared casters learn 2 spells per rank (one per spell slot typically)
    return 2;
  }
}

/**
 * Check if actor can replace spells on level up (spontaneous casters)
 * @param {Actor} actor - The actor
 * @returns {boolean} True if can replace spells
 */
export function canReplaceSpells(actor) {
  const type = getSpellcastingType(actor);
  return type === 'spontaneous';
}

/**
 * Get spell school from spell
 * @param {Item} spell - The spell
 * @returns {string} School name
 */
export function getSpellSchool(spell) {
  const traits = spell.system.traits.value || [];

  const schools = [
    'abjuration', 'conjuration', 'divination', 'enchantment',
    'evocation', 'illusion', 'necromancy', 'transmutation'
  ];

  for (const school of schools) {
    if (traits.includes(school)) {
      return school;
    }
  }

  return 'none';
}

/**
 * Get spell traditions from spell
 * @param {Item} spell - The spell
 * @returns {Array<string>} Array of tradition names
 */
export function getSpellTraditions(spell) {
  return spell.system.traits.traditions || [];
}

/**
 * Format spell traditions for display
 * @param {Item} spell - The spell
 * @returns {string} Formatted traditions
 */
export function formatSpellTraditions(spell) {
  const traditions = getSpellTraditions(spell);
  return traditions.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
}

/**
 * Get spell action cost
 * @param {Item} spell - The spell
 * @returns {string} Action cost (e.g., "2", "reaction", "free")
 */
export function getSpellActionCost(spell) {
  const time = spell.system.time?.value;

  if (!time) return '';

  if (time.includes('action')) {
    return time.replace(' actions', '').replace(' action', '').trim();
  }

  if (time.includes('reaction')) return 'reaction';
  if (time.includes('free')) return 'free';

  return time;
}

/**
 * Format spell action cost with glyph
 * @param {Item} spell - The spell
 * @returns {string} Formatted action cost
 */
export function formatSpellActionCost(spell) {
  const cost = getSpellActionCost(spell);

  const glyphs = {
    '1': '[one-action]',
    '2': '[two-actions]',
    '3': '[three-actions]',
    'reaction': '[reaction]',
    'free': '[free-action]'
  };

  return glyphs[cost] || cost;
}

/**
 * Get spell range
 * @param {Item} spell - The spell
 * @returns {string} Range (e.g., "30 feet", "touch")
 */
export function getSpellRange(spell) {
  return spell.system.range?.value || '';
}

/**
 * Get spell area
 * @param {Item} spell - The spell
 * @returns {string} Area description
 */
export function getSpellArea(spell) {
  const area = spell.system.area;

  if (!area || !area.value) return '';

  return `${area.value} ${area.type}`;
}

/**
 * Get spell duration
 * @param {Item} spell - The spell
 * @returns {string} Duration
 */
export function getSpellDuration(spell) {
  return spell.system.duration?.value || '';
}

/**
 * Check if spell has heightening
 * @param {Item} spell - The spell
 * @returns {boolean} True if has heightening
 */
export function hasHeightening(spell) {
  const heightening = spell.system.heightening;
  return heightening && (heightening.type === 'interval' || heightening.type === 'fixed');
}

/**
 * Get spell rarity
 * @param {Item} spell - The spell
 * @returns {string} Rarity (common, uncommon, rare, unique)
 */
export function getSpellRarity(spell) {
  return spell.system.traits.rarity || 'common';
}

/**
 * Check if spell is uncommon or rarer
 * @param {Item} spell - The spell
 * @returns {boolean} True if uncommon or rarer
 */
export function isUncommonOrRarer(spell) {
  const rarity = getSpellRarity(spell);
  return rarity !== 'common';
}

/**
 * Format spell summary for display
 * @param {Item} spell - The spell
 * @returns {Object} Summary object
 */
export function formatSpellSummary(spell) {
  return {
    name: spell.name,
    rank: spell.system.level.value,
    traditions: formatSpellTraditions(spell),
    school: getSpellSchool(spell),
    actions: formatSpellActionCost(spell),
    range: getSpellRange(spell),
    area: getSpellArea(spell),
    duration: getSpellDuration(spell),
    rarity: getSpellRarity(spell),
    hasHeightening: hasHeightening(spell)
  };
}

/**
 * Get highest spell rank actor has access to
 * @param {Actor} actor - The actor
 * @returns {number} Highest rank (0-10)
 */
export function getHighestSpellRank(actor) {
  const level = actor.system.details.level.value;
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) return 0;

  // Full casters get new spell ranks every odd level
  const fullCasters = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'oracle', 'witch'];

  if (fullCasters.includes(classItem.slug)) {
    return Math.min(Math.ceil(level / 2), 10);
  }

  // Partial casters (magus, summoner) get new spell ranks slower
  // Level 1: rank 1, Level 3: rank 2, Level 5: rank 3, etc.
  return Math.min(Math.floor((level + 1) / 2), 10);
}

/**
 * Check if actor gains new spell rank at specific level
 * @param {Actor} actor - The actor
 * @param {number} level - Level to check
 * @returns {number|null} New spell rank or null
 */
export function getNewSpellRankAtLevel(actor, level) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return null;

  const fullCasters = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'oracle', 'witch', 'psychic', 'animist', 'necromancer'];
  const partialCasters = ['magus', 'summoner'];

  if (fullCasters.includes(classItem.slug)) {
    // Full casters gain new ranks on odd levels
    if (level % 2 === 1 && level > 1) {
      return Math.min(Math.ceil(level / 2), 10);
    }
  } else if (partialCasters.includes(classItem.slug)) {
    // Partial casters gain new ranks on odd levels starting at 3
    if (level % 2 === 1 && level >= 3) {
      return Math.min(Math.floor((level + 1) / 2), 6); // Max rank 6 for partial casters
    }
  }

  return null;
}
