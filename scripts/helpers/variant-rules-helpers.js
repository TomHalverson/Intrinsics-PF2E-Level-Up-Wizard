// Variant Rules Helpers - Detection and management of PF2e variant rules
import { MODULE_NAME, debugLog } from '../module.js';

/**
 * Detect all active variant rules
 * @returns {Object} Variant rules object
 */
export function detectVariantRules() {
  return {
    freeArchetype: isFreeArchetypeEnabled(),
    gradualBoosts: isGradualBoostsEnabled(),
    ancestryParagon: isAncestryParagonEnabled(),
    dualClass: isDualClassEnabled(),
    mythic: getMythicSetting(),
    abp: getABPSetting()
  };
}

/**
 * Check if Free Archetype variant is enabled
 * @returns {boolean} True if enabled
 */
export function isFreeArchetypeEnabled() {
  try {
    const settings = game.settings.settings;
    if (settings.has('pf2e.freeArchetypeVariant')) {
      return game.settings.get('pf2e', 'freeArchetypeVariant') === true;
    }
    return false;
  } catch (error) {
    debugLog('isFreeArchetypeEnabled', 'Error checking setting', error);
    return false;
  }
}

/**
 * Check if Gradual Ability Boosts variant is enabled
 * @returns {boolean} True if enabled
 */
export function isGradualBoostsEnabled() {
  try {
    const settings = game.settings.settings;
    if (settings.has('pf2e.gradualBoostsVariant')) {
      return game.settings.get('pf2e', 'gradualBoostsVariant') === true;
    }
    return false;
  } catch (error) {
    debugLog('isGradualBoostsEnabled', 'Error checking setting', error);
    return false;
  }
}

/**
 * Check if Ancestry Paragon variant is enabled
 * @returns {boolean} True if enabled
 */
export function isAncestryParagonEnabled() {
  try {
    const workbenchActive = game.modules.get('xdy-pf2e-workbench')?.active;

    if (!workbenchActive) {
      return false;
    }

    return game.settings.get('xdy-pf2e-workbench', 'ancestryParagonVariant') === 'enabled';
  } catch (error) {
    debugLog('isAncestryParagonEnabled', 'Error checking setting', error);
    return false;
  }
}

/**
 * Check if Dual Class variant is enabled
 * @returns {boolean} True if enabled
 */
export function isDualClassEnabled() {
  try {
    // Dual class might be from workbench or a future PF2e variant
    // Check if the setting exists first
    const settings = game.settings.settings;
    if (settings.has('pf2e.dualClass')) {
      return game.settings.get('pf2e', 'dualClass') === true;
    }
    return false;
  } catch (error) {
    debugLog('isDualClassEnabled', 'Error checking setting', error);
    return false;
  }
}

/**
 * Get Mythic variant setting
 * @returns {string} Mythic setting value ('disabled', 'enabled')
 */
export function getMythicSetting() {
  try {
    const settings = game.settings.settings;
    if (settings.has('pf2e.mythic')) {
      return game.settings.get('pf2e', 'mythic');
    }
    return 'disabled';
  } catch (error) {
    debugLog('getMythicSetting', 'Error checking setting', error);
    return 'disabled';
  }
}

/**
 * Check if Mythic variant is enabled
 * @returns {boolean} True if enabled
 */
export function isMythicEnabled() {
  return getMythicSetting() === 'enabled';
}

/**
 * Get ABP (Automatic Bonus Progression) setting
 * @returns {string} ABP setting value ('noABP', 'ABPFundamentalPotency', 'ABPRulesAsWritten')
 */
export function getABPSetting() {
  try {
    const settings = game.settings.settings;
    if (settings.has('pf2e.automaticBonusVariant')) {
      return game.settings.get('pf2e', 'automaticBonusVariant');
    }
    return 'noABP';
  } catch (error) {
    debugLog('getABPSetting', 'Error checking setting', error);
    return 'noABP';
  }
}

/**
 * Check if ABP is enabled
 * @returns {boolean} True if any ABP variant is enabled
 */
export function isABPEnabled() {
  const setting = getABPSetting();
  return setting !== 'noABP';
}

/**
 * Compare variant rules between two sets
 * @param {Object} rules1 - First set of variant rules
 * @param {Object} rules2 - Second set of variant rules
 * @returns {Object} Comparison result { matches: boolean, differences: Array }
 */
export function compareVariantRules(rules1, rules2) {
  const differences = [];

  if (rules1.freeArchetype !== rules2.freeArchetype) {
    differences.push({
      rule: 'Free Archetype',
      old: rules1.freeArchetype,
      new: rules2.freeArchetype
    });
  }

  if (rules1.gradualBoosts !== rules2.gradualBoosts) {
    differences.push({
      rule: 'Gradual Ability Boosts',
      old: rules1.gradualBoosts,
      new: rules2.gradualBoosts
    });
  }

  if (rules1.ancestryParagon !== rules2.ancestryParagon) {
    differences.push({
      rule: 'Ancestry Paragon',
      old: rules1.ancestryParagon,
      new: rules2.ancestryParagon
    });
  }

  if (rules1.dualClass !== rules2.dualClass) {
    differences.push({
      rule: 'Dual Class',
      old: rules1.dualClass,
      new: rules2.dualClass
    });
  }

  if (rules1.mythic !== rules2.mythic) {
    differences.push({
      rule: 'Mythic',
      old: rules1.mythic,
      new: rules2.mythic
    });
  }

  if (rules1.abp !== rules2.abp) {
    differences.push({
      rule: 'Automatic Bonus Progression',
      old: rules1.abp,
      new: rules2.abp
    });
  }

  return {
    matches: differences.length === 0,
    differences
  };
}

/**
 * Format variant rule differences for display
 * @param {Array} differences - Array of difference objects
 * @returns {string} Formatted string
 */
export function formatVariantRuleDifferences(differences) {
  if (differences.length === 0) {
    return 'No differences';
  }

  return differences.map(diff => {
    const oldValue = formatVariantRuleValue(diff.old);
    const newValue = formatVariantRuleValue(diff.new);
    return `${diff.rule}: ${oldValue} → ${newValue}`;
  }).join('\n');
}

/**
 * Format variant rule value for display
 * @param {*} value - Value to format
 * @returns {string} Formatted string
 */
function formatVariantRuleValue(value) {
  if (value === true) return 'Enabled';
  if (value === false) return 'Disabled';
  if (value === 'enabled') return 'Enabled';
  if (value === 'disabled') return 'Disabled';
  if (value === 'noABP') return 'Disabled';
  return String(value);
}

/**
 * Get feat levels for Free Archetype variant
 * @returns {Array<number>} Array of levels
 */
export function getFreeArchetypeFeatLevels() {
  return [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
}

/**
 * Get feat levels for Ancestry Paragon variant
 * @returns {Array<number>} Array of levels
 */
export function getAncestryParagonFeatLevels() {
  return [1, 3, 7, 11, 15, 19];
}

/**
 * Get feat levels for Mythic variant
 * @returns {Array<number>} Array of levels
 */
export function getMythicFeatLevels() {
  return [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
}

/**
 * Get ability boost levels for standard boosts
 * @returns {Array<number>} Array of levels
 */
export function getStandardBoostLevels() {
  return [5, 10, 15, 20];
}

/**
 * Get ability boost levels for gradual boosts
 * @returns {Array<number>} Array of levels
 */
export function getGradualBoostLevels() {
  return [2, 3, 4, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 20];
}

/**
 * Get mythic tier progression (default)
 * @returns {Object} Tier to level mapping { 1: 2, 2: 6, ... }
 */
export function getDefaultMythicTierProgression() {
  return {
    1: 2,
    2: 6,
    3: 10,
    4: 14,
    5: 18
  };
}

/**
 * Get mythic tier for level
 * @param {number} level - Character level
 * @param {Object} tierProgression - Optional custom tier progression
 * @returns {number|null} Mythic tier or null
 */
export function getMythicTierForLevel(level, tierProgression = null) {
  if (!tierProgression) {
    tierProgression = getDefaultMythicTierProgression();
  }

  // Find which tier corresponds to this level
  for (const [tier, tierLevel] of Object.entries(tierProgression)) {
    if (level === tierLevel) {
      return parseInt(tier);
    }
  }

  return null;
}

/**
 * Get level for mythic tier
 * @param {number} tier - Mythic tier
 * @param {Object} tierProgression - Optional custom tier progression
 * @returns {number|null} Level or null
 */
export function getLevelForMythicTier(tier, tierProgression = null) {
  if (!tierProgression) {
    tierProgression = getDefaultMythicTierProgression();
  }

  return tierProgression[tier] || null;
}

/**
 * Get variant rule summary for display
 * @returns {Object} Summary object
 */
export function getVariantRuleSummary() {
  const rules = detectVariantRules();

  return {
    freeArchetype: {
      name: 'Free Archetype',
      enabled: rules.freeArchetype,
      description: 'Grants additional archetype feats at even levels'
    },
    gradualBoosts: {
      name: 'Gradual Ability Boosts',
      enabled: rules.gradualBoosts,
      description: 'Ability boosts are split across multiple levels'
    },
    ancestryParagon: {
      name: 'Ancestry Paragon',
      enabled: rules.ancestryParagon,
      description: 'Grants additional ancestry feats at specific levels'
    },
    dualClass: {
      name: 'Dual Class',
      enabled: rules.dualClass,
      description: 'Character has two classes with dual progression'
    },
    mythic: {
      name: 'Mythic',
      enabled: rules.mythic === 'enabled',
      value: rules.mythic,
      description: 'Grants mythic feats and abilities'
    },
    abp: {
      name: 'Automatic Bonus Progression',
      enabled: rules.abp !== 'noABP',
      value: rules.abp,
      description: 'Automatic item bonuses replace magic items'
    }
  };
}

/**
 * Check if actor is dual class
 * @param {Actor} actor - The actor
 * @returns {boolean} True if dual class
 */
export function isDualClassActor(actor) {
  const classItems = actor.items.filter(i => i.type === 'class');
  return classItems.length >= 2;
}

/**
 * Get both classes for dual class actor
 * @param {Actor} actor - The actor
 * @returns {Object} { primary: Item, secondary: Item } or null
 */
export function getDualClasses(actor) {
  const classItems = actor.items.filter(i => i.type === 'class');

  if (classItems.length < 2) {
    return null;
  }

  return {
    primary: classItems[0],
    secondary: classItems[1]
  };
}

/**
 * Validate variant rules compatibility with build plan
 * @param {Object} planRules - Variant rules from build plan
 * @param {Object} currentRules - Current variant rules
 * @returns {Object} Validation result { compatible: boolean, warnings: Array }
 */
export function validateVariantRulesCompatibility(planRules, currentRules) {
  const warnings = [];

  // Critical incompatibilities
  if (planRules.freeArchetype && !currentRules.freeArchetype) {
    warnings.push('Build plan expects Free Archetype but it is disabled');
  }

  if (planRules.mythic === 'enabled' && currentRules.mythic !== 'enabled') {
    warnings.push('Build plan expects Mythic but it is disabled');
  }

  if (planRules.dualClass && !currentRules.dualClass) {
    warnings.push('Build plan expects Dual Class but it is disabled');
  }

  // Non-critical differences
  if (planRules.gradualBoosts !== currentRules.gradualBoosts) {
    warnings.push('Gradual Ability Boosts setting has changed');
  }

  if (planRules.ancestryParagon !== currentRules.ancestryParagon) {
    warnings.push('Ancestry Paragon setting has changed');
  }

  if (planRules.abp !== currentRules.abp) {
    warnings.push('Automatic Bonus Progression setting has changed');
  }

  return {
    compatible: warnings.length === 0,
    warnings
  };
}
