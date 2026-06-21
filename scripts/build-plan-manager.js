// Build Plan Manager - Manages build plan CRUD operations and validation
import { MODULE_NAME, debugLog } from './module.js';
import * as VariantRulesHelpers from './helpers/variant-rules-helpers.js';

/**
 * BuildPlanManager - Manages build plans stored in actor flags
 * Static class with methods for loading, saving, and validating build plans
 */
export class BuildPlanManager {
  /**
   * Load build plan from actor flags
   * @param {Actor} actor - The actor to load plan from
   * @returns {Object|null} Build plan object or null if none exists
   */
  static loadPlan(actor) {
    if (!actor) {
      console.error(`${MODULE_NAME} | BuildPlanManager.loadPlan: No actor provided`);
      return null;
    }

    const plan = actor.getFlag(MODULE_NAME, 'buildPlan');

    if (plan) {
      debugLog('BuildPlanManager.loadPlan', `Loaded plan for ${actor.name}`, plan);
    } else {
      debugLog('BuildPlanManager.loadPlan', `No plan found for ${actor.name}`);
    }

    return plan || null;
  }

  /**
   * Save build plan to actor flags
   * @param {Actor} actor - The actor to save plan to
   * @param {Object} plan - The build plan object
   * @returns {Promise<void>}
   */
  static async savePlan(actor, plan) {
    if (!actor) {
      throw new Error('No actor provided');
    }

    if (!plan) {
      throw new Error('No plan provided');
    }

    // Update lastModified timestamp
    plan.lastModified = Date.now();

    // Ensure version is set
    if (!plan.version) {
      plan.version = '1.0.0';
    }

    await actor.setFlag(MODULE_NAME, 'buildPlan', plan);

    debugLog('BuildPlanManager.savePlan', `Saved plan for ${actor.name}`);
  }

  /**
   * Delete build plan from actor
   * @param {Actor} actor - The actor to delete plan from
   * @returns {Promise<void>}
   */
  static async deletePlan(actor) {
    if (!actor) {
      throw new Error('No actor provided');
    }

    await actor.unsetFlag(MODULE_NAME, 'buildPlan');

    debugLog('BuildPlanManager.deletePlan', `Deleted plan for ${actor.name}`);
  }

  /**
   * Create a new empty build plan
   * @param {Actor} actor - The actor to create plan for
   * @returns {Object} New build plan object
   */
  static createNewPlan(actor) {
    const currentLevel = actor.system.details.level.value;

    // Get current variant rules
    const variantRules = this.detectVariantRules();

    // Create empty levels structure
    const levels = {};
    for (let i = 1; i <= 20; i++) {
      levels[i] = {
        choices: {
          classFeats: null,
          ancestryFeats: null,
          skillFeats: null,
          generalFeats: null,
          freeArchetypeFeats: variantRules.freeArchetype ? null : undefined,
          ancestryParagonFeats: variantRules.ancestryParagon ? null : undefined,
          mythicFeats: variantRules.mythic === 'enabled' ? null : undefined,
          dualClassFeats: variantRules.dualClass ? null : undefined,
          skillIncreases: [],
          abilityBoosts: [],
          spells: {
            cantrips: [],
            rank1: [],
            rank2: [],
            rank3: [],
            rank4: [],
            rank5: [],
            rank6: [],
            rank7: [],
            rank8: [],
            rank9: [],
            rank10: []
          }
        },
        applied: i <= currentLevel, // Mark levels up to current as applied
        notes: ''
      };
    }

    // Create mythic tier progression if mythic enabled
    const mythicTiers = variantRules.mythic === 'enabled'
      ? this.detectMythicTierProgression(actor)
      : {};

    const plan = {
      version: '1.0.0',
      lastModified: Date.now(),
      levels,
      variantRules,
      mythicTiers
    };

    debugLog('BuildPlanManager.createNewPlan', 'Created new plan', plan);

    return plan;
  }

  /**
   * Get choices for a specific level
   * @param {Object} plan - The build plan
   * @param {number} level - The level to get choices for
   * @returns {Object|null} Level choices or null
   */
  static getLevelChoices(plan, level) {
    if (!plan || !plan.levels || !plan.levels[level]) {
      return null;
    }

    return plan.levels[level].choices;
  }

  /**
   * Set choices for a specific level
   * @param {Object} plan - The build plan
   * @param {number} level - The level to set choices for
   * @param {Object} choices - The choices object
   */
  static setLevelChoices(plan, level, choices) {
    if (!plan || !plan.levels) {
      throw new Error('Invalid plan object');
    }

    if (!plan.levels[level]) {
      plan.levels[level] = {
        choices: {},
        applied: false,
        notes: ''
      };
    }

    plan.levels[level].choices = choices;

    debugLog('BuildPlanManager.setLevelChoices', `Set choices for level ${level}`, choices);
  }

  /**
   * Mark a level as applied
   * @param {Object} plan - The build plan
   * @param {number} level - The level to mark as applied
   */
  static markLevelApplied(plan, level) {
    if (!plan || !plan.levels || !plan.levels[level]) {
      throw new Error('Invalid plan or level');
    }

    plan.levels[level].applied = true;

    debugLog('BuildPlanManager.markLevelApplied', `Marked level ${level} as applied`);
  }

  /**
   * Get list of applied levels
   * @param {Object} plan - The build plan
   * @returns {Array<number>} Array of applied level numbers
   */
  static getAppliedLevels(plan) {
    if (!plan || !plan.levels) {
      return [];
    }

    return Object.keys(plan.levels)
      .map(Number)
      .filter(level => plan.levels[level].applied);
  }

  /**
   * Get list of unapplied levels
   * @param {Object} plan - The build plan
   * @returns {Array<number>} Array of unapplied level numbers
   */
  static getUnappliedLevels(plan) {
    if (!plan || !plan.levels) {
      return [];
    }

    return Object.keys(plan.levels)
      .map(Number)
      .filter(level => !plan.levels[level].applied);
  }

  /**
   * Validate entire build plan
   * @param {Object} plan - The build plan to validate
   * @param {Actor} actor - The actor this plan is for
   * @returns {Object} Validation results { valid: boolean, errors: Array }
   */
  static validatePlan(plan, actor) {
    const errors = [];

    if (!plan) {
      errors.push('No build plan provided');
      return { valid: false, errors };
    }

    if (!plan.levels) {
      errors.push('Build plan has no levels');
      return { valid: false, errors };
    }

    // Check variant rules match current settings
    const currentVariantRules = this.detectVariantRules();
    const planVariantRules = plan.variantRules || {};

    if (currentVariantRules.freeArchetype !== planVariantRules.freeArchetype) {
      errors.push('Free Archetype variant rule mismatch');
    }

    if (currentVariantRules.mythic !== planVariantRules.mythic) {
      errors.push('Mythic variant rule mismatch');
    }

    if (currentVariantRules.gradualBoosts !== planVariantRules.gradualBoosts) {
      errors.push('Gradual Ability Boosts variant rule mismatch');
    }

    // Validate each level (basic validation)
    for (let level = 1; level <= 20; level++) {
      if (!plan.levels[level]) {
        errors.push(`Missing data for level ${level}`);
      }
    }

    const valid = errors.length === 0;

    debugLog('BuildPlanManager.validatePlan', `Validation ${valid ? 'passed' : 'failed'}`, errors);

    return { valid, errors };
  }

  /**
   * Detect current variant rules settings
   * @returns {Object} Variant rules object
   */
  static detectVariantRules() {
    // Use the helper function from variant-rules-helpers.js
    return VariantRulesHelpers.detectVariantRules();
  }

  /**
   * Detect mythic tier progression
   * @param {Actor} actor - The actor
   * @returns {Object} Mythic tiers mapping { tier: level }
   */
  static detectMythicTierProgression(actor) {
    // Default progression: tiers at levels 2, 6, 10, 14, 18
    // This may be customizable in xdy-pf2e-workbench
    // For now, use default progression

    return {
      1: 2,
      2: 6,
      3: 10,
      4: 14,
      5: 18
    };
  }

  /**
   * Export build plan as JSON
   * @param {Object} plan - The build plan
   * @returns {string} JSON string
   */
  static exportPlan(plan) {
    return JSON.stringify(plan, null, 2);
  }

  /**
   * Import build plan from JSON
   * @param {string} json - JSON string
   * @returns {Object} Parsed build plan
   */
  static importPlan(json) {
    try {
      const plan = JSON.parse(json);

      // Basic validation
      if (!plan.version) {
        throw new Error('Invalid plan format: missing version');
      }

      if (!plan.levels) {
        throw new Error('Invalid plan format: missing levels');
      }

      debugLog('BuildPlanManager.importPlan', 'Imported plan', plan);

      return plan;
    } catch (error) {
      console.error(`${MODULE_NAME} | Failed to import plan:`, error);
      throw error;
    }
  }

  /**
   * Check if plan has choices for specific level
   * @param {Object} plan - The build plan
   * @param {number} level - The level to check
   * @returns {boolean} True if level has any choices
   */
  static hasChoicesForLevel(plan, level) {
    const choices = this.getLevelChoices(plan, level);
    if (!choices) return false;

    // Check if any choice is set
    return (
      choices.classFeats ||
      choices.ancestryFeats ||
      choices.skillFeats ||
      choices.generalFeats ||
      choices.freeArchetypeFeats ||
      choices.mythicFeats ||
      choices.dualClassFeats ||
      (choices.skillIncreases && choices.skillIncreases.length > 0) ||
      (choices.abilityBoosts && choices.abilityBoosts.length > 0) ||
      (choices.spells && Object.values(choices.spells).some(arr => arr.length > 0))
    );
  }
}

export default BuildPlanManager;
