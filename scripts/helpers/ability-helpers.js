// Ability Helpers - Ability boost logic and ability score calculations
import { MODULE_NAME, debugLog } from '../module.js';

// Ability keys
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Ability names
export const ABILITY_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
};

/**
 * Get ability scores for actor
 * @param {Actor} actor - The actor
 * @returns {Object} Ability scores { str: 10, dex: 12, ... }
 */
export function getAbilityScores(actor) {
  const scores = {};

  for (const ability of ABILITIES) {
    scores[ability] = actor.system.abilities[ability]?.value || 10;
  }

  return scores;
}

/**
 * Get ability modifiers for actor
 * @param {Actor} actor - The actor
 * @returns {Object} Ability modifiers { str: 0, dex: 1, ... }
 */
export function getAbilityModifiers(actor) {
  const modifiers = {};

  for (const ability of ABILITIES) {
    modifiers[ability] = actor.system.abilities[ability]?.mod || 0;
  }

  return modifiers;
}

/**
 * Calculate modifier from ability score
 * @param {number} score - Ability score
 * @returns {number} Modifier
 */
export function calculateModifier(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * Format modifier for display
 * @param {number} modifier - Modifier value
 * @returns {string} Formatted modifier (e.g., "+2", "-1")
 */
export function formatModifier(modifier) {
  if (modifier >= 0) {
    return `+${modifier}`;
  }
  return `${modifier}`;
}

/**
 * Get ability boost options for level
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @param {Array<string>} alreadySelected - Already selected boosts
 * @returns {Array} Array of boost options
 */
export function getAbilityBoostOptions(actor, targetLevel, alreadySelected = []) {
  const scores = getAbilityScores(actor);
  const options = [];

  for (const ability of ABILITIES) {
    const currentScore = scores[ability];
    const currentMod = calculateModifier(currentScore);
    const newScore = currentScore + 1;
    const newMod = calculateModifier(newScore);
    const modChange = newMod - currentMod;

    // Check if ability is at cap (18 before level 1, no cap after)
    const atCap = targetLevel === 1 && currentScore >= 18;

    options.push({
      ability,
      name: ABILITY_NAMES[ability],
      currentScore,
      currentMod,
      newScore,
      newMod,
      modChange,
      atCap,
      selected: alreadySelected.includes(ability)
    });
  }

  return options;
}

/**
 * Apply ability boost to actor
 * @param {Actor} actor - The actor
 * @param {string} ability - Ability key
 * @returns {Promise<void>}
 */
export async function applyAbilityBoost(actor, ability) {
  if (!ABILITIES.includes(ability)) {
    throw new Error(`Invalid ability: ${ability}`);
  }

  const currentScore = actor.system.abilities[ability]?.value || 10;
  const newScore = currentScore + 1;

  await actor.update({
    [`system.abilities.${ability}.value`]: newScore
  });

  debugLog('applyAbilityBoost', `Boosted ${ability} from ${currentScore} to ${newScore}`);
}

/**
 * Apply multiple ability boosts
 * @param {Actor} actor - The actor
 * @param {Array<string>} abilities - Array of ability keys
 * @returns {Promise<void>}
 */
export async function applyAbilityBoosts(actor, abilities) {
  if (!abilities || abilities.length === 0) {
    return;
  }

  const updates = {};

  for (const ability of abilities) {
    if (!ABILITIES.includes(ability)) {
      console.warn(`${MODULE_NAME} | Invalid ability: ${ability}`);
      continue;
    }

    const currentScore = actor.system.abilities[ability]?.value || 10;
    const newScore = currentScore + 1;

    updates[`system.abilities.${ability}.value`] = newScore;
  }

  await actor.update(updates);

  debugLog('applyAbilityBoosts', `Applied ${abilities.length} ability boosts`, abilities);
}

/**
 * Apply partial ability boost (for gradual boosts variant)
 * @param {Actor} actor - The actor
 * @param {string} ability - Ability key
 * @returns {Promise<void>}
 */
export async function applyPartialAbilityBoost(actor, ability) {
  if (!ABILITIES.includes(ability)) {
    throw new Error(`Invalid ability: ${ability}`);
  }

  const currentScore = actor.system.abilities[ability]?.value || 10;
  const newScore = currentScore + 0.5;

  await actor.update({
    [`system.abilities.${ability}.value`]: newScore
  });

  debugLog('applyPartialAbilityBoost', `Partial boost ${ability} from ${currentScore} to ${newScore}`);
}

/**
 * Complete partial ability boost (for gradual boosts variant)
 * @param {Actor} actor - The actor
 * @param {string} ability - Ability key
 * @returns {Promise<void>}
 */
export async function completePartialAbilityBoost(actor, ability) {
  if (!ABILITIES.includes(ability)) {
    throw new Error(`Invalid ability: ${ability}`);
  }

  const currentScore = actor.system.abilities[ability]?.value || 10;

  // Should be X.5, round up to X+1
  const newScore = Math.ceil(currentScore);

  await actor.update({
    [`system.abilities.${ability}.value`]: newScore
  });

  debugLog('completePartialAbilityBoost', `Completed partial boost ${ability} from ${currentScore} to ${newScore}`);
}

/**
 * Get abilities with partial boosts
 * @param {Actor} actor - The actor
 * @returns {Array<string>} Array of ability keys with partial boosts
 */
export function getPartialBoosts(actor) {
  const partialBoosts = [];

  for (const ability of ABILITIES) {
    const score = actor.system.abilities[ability]?.value || 0;

    // Check if score has .5 (partial boost)
    if (score % 1 === 0.5) {
      partialBoosts.push(ability);
    }
  }

  return partialBoosts;
}

/**
 * Check if ability has partial boost
 * @param {Actor} actor - The actor
 * @param {string} ability - Ability key
 * @returns {boolean} True if has partial boost
 */
export function hasPartialBoost(actor, ability) {
  const score = actor.system.abilities[ability]?.value || 0;
  return score % 1 === 0.5;
}

/**
 * Get key ability for class
 * @param {Actor} actor - The actor
 * @returns {string|null} Key ability or null
 */
export function getClassKeyAbility(actor) {
  const classItem = actor.items.find(i => i.type === 'class');

  if (!classItem) {
    return null;
  }

  // Key ability is stored in class item
  return classItem.system.keyAbility?.value || null;
}

/**
 * Validate ability boost selection
 * @param {Actor} actor - The actor
 * @param {Array<string>} selectedBoosts - Selected boosts
 * @param {number} expectedCount - Expected number of boosts
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export function validateAbilityBoosts(actor, selectedBoosts, expectedCount) {
  const errors = [];

  // Check count
  if (selectedBoosts.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} ability boosts, got ${selectedBoosts.length}`);
  }

  // Check for duplicates
  const uniqueBoosts = [...new Set(selectedBoosts)];
  if (uniqueBoosts.length !== selectedBoosts.length) {
    errors.push('Cannot boost the same ability more than once in a single set');
  }

  // Check for invalid abilities
  for (const ability of selectedBoosts) {
    if (!ABILITIES.includes(ability)) {
      errors.push(`Invalid ability: ${ability}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get ability score cap for level
 * @param {number} level - Character level
 * @returns {number} Cap value (18 for level 1, no cap after)
 */
export function getAbilityScoreCap(level) {
  // At level 1, ability scores are capped at 18
  // After level 1, there is no cap
  return level === 1 ? 18 : Infinity;
}

/**
 * Format ability score display
 * @param {Actor} actor - The actor
 * @param {string} ability - Ability key
 * @returns {Object} Formatted ability info
 */
export function formatAbilityDisplay(actor, ability) {
  const score = actor.system.abilities[ability]?.value || 10;
  const modifier = actor.system.abilities[ability]?.mod || 0;
  const isPartial = score % 1 === 0.5;

  return {
    ability,
    name: ABILITY_NAMES[ability],
    score,
    modifier,
    modifierStr: formatModifier(modifier),
    isPartial
  };
}

/**
 * Get all abilities formatted for display
 * @param {Actor} actor - The actor
 * @returns {Array} Array of formatted ability objects
 */
export function formatAllAbilities(actor) {
  return ABILITIES.map(ability => formatAbilityDisplay(actor, ability));
}
