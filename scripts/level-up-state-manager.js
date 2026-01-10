// Level Up State Manager - Manages state for single level-up session
import { MODULE_NAME, debugLog } from './module.js';
import BuildPlanManager from './build-plan-manager.js';

/**
 * LevelUpStateManager - Manages state for a single level-up session
 * Tracks user selections during the wizard and provides validation
 */
export class LevelUpStateManager {
  constructor(actor, level) {
    this.actor = actor;
    this.level = level;
    this.reset();
  }

  /**
   * Reset state for new level-up session
   */
  reset() {
    this.choices = {
      classFeats: null,
      ancestryFeats: null,
      skillFeats: null,
      generalFeats: null,
      freeArchetypeFeats: null,
      ancestryParagonFeats: null,
      mythicFeats: null,
      dualClassFeats: null,
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
    };

    this.complete = false;

    debugLog('LevelUpStateManager.reset', `Reset state for level ${this.level}`);
  }

  /**
   * Set a choice
   * @param {string} category - Choice category (e.g., 'classFeats', 'skillIncreases')
   * @param {*} value - Choice value
   */
  setChoice(category, value) {
    if (!this.choices.hasOwnProperty(category)) {
      console.warn(`${MODULE_NAME} | Invalid choice category: ${category}`);
      return;
    }

    this.choices[category] = value;

    debugLog('LevelUpStateManager.setChoice', `Set ${category}:`, value);

    // Check if all required choices are complete
    this.checkCompletion();
  }

  /**
   * Get a choice
   * @param {string} category - Choice category
   * @returns {*} Choice value
   */
  getChoice(category) {
    return this.choices[category];
  }

  /**
   * Load choices from build plan
   * @param {Object} plan - Build plan object
   * @param {number} level - Level to load from plan
   */
  loadFromPlan(plan, level) {
    if (!plan) {
      console.warn(`${MODULE_NAME} | No build plan provided to load from`);
      return;
    }

    const levelChoices = BuildPlanManager.getLevelChoices(plan, level);

    if (!levelChoices) {
      console.warn(`${MODULE_NAME} | No choices found in plan for level ${level}`);
      return;
    }

    // Copy choices from plan
    this.choices = foundry.utils.deepClone(levelChoices);

    debugLog('LevelUpStateManager.loadFromPlan', `Loaded choices from plan for level ${level}`, this.choices);

    // Check completion
    this.checkCompletion();
  }

  /**
   * Save current choices to build plan
   * @param {Actor} actor - The actor
   * @returns {Promise<void>}
   */
  async saveToPlan(actor) {
    // Load existing plan or create new one
    let plan = BuildPlanManager.loadPlan(actor);

    if (!plan) {
      plan = BuildPlanManager.createNewPlan(actor);
    }

    // Set choices for this level
    BuildPlanManager.setLevelChoices(plan, this.level, foundry.utils.deepClone(this.choices));

    // Save plan back to actor
    await BuildPlanManager.savePlan(actor, plan);

    debugLog('LevelUpStateManager.saveToPlan', `Saved choices to plan for level ${this.level}`);
  }

  /**
   * Check if all required choices are made
   * @returns {boolean} True if all required choices complete
   */
  canComplete() {
    // This will be implemented based on what's actually required for this level
    // For now, just return true - validators will handle specific requirements

    return true;
  }

  /**
   * Check completion status
   * @private
   */
  checkCompletion() {
    this.complete = this.canComplete();
  }

  /**
   * Get class from actor
   * @returns {Item|null} Class item
   */
  getClass() {
    return this.actor.items.find(i => i.type === 'class');
  }

  /**
   * Get ancestry from actor
   * @returns {Item|null} Ancestry item
   */
  getAncestry() {
    return this.actor.items.find(i => i.type === 'ancestry');
  }

  /**
   * Get heritage from actor
   * @returns {Item|null} Heritage item
   */
  getHeritage() {
    return this.actor.items.find(i => i.type === 'heritage');
  }

  /**
   * Check if actor is a spellcaster
   * @returns {boolean} True if spellcaster
   */
  isSpellcaster() {
    const classItem = this.getClass();
    if (!classItem) return false;

    const spellcasterClasses = [
      'wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'oracle',
      'witch', 'magus', 'summoner', 'psychic', 'animist', 'necromancer',
      'kineticist' // Has kinetic elements but still has spell-like features
    ];

    return spellcasterClasses.includes(classItem.slug);
  }

  /**
   * Get spell tradition for actor's class
   * @returns {string|null} Tradition name or null
   */
  getSpellTradition() {
    const classItem = this.getClass();
    if (!classItem) return null;

    const traditions = {
      'wizard': 'arcane',
      'sorcerer': this._getSorcererTradition(),
      'cleric': 'divine',
      'druid': 'primal',
      'bard': 'occult',
      'oracle': 'divine',
      'witch': this._getWitchTradition(),
      'magus': 'arcane',
      'summoner': 'arcane',
      'psychic': 'occult',
      'animist': 'divine',
      'necromancer': 'occult'
    };

    return traditions[classItem.slug] || null;
  }

  /**
   * Get sorcerer tradition from bloodline
   * @private
   */
  _getSorcererTradition() {
    // Find bloodline item
    const bloodlineItem = this.actor.items.find(i =>
      i.name.toLowerCase().includes('bloodline')
    );

    if (!bloodlineItem) return 'arcane'; // Default

    const bloodlineName = bloodlineItem.name.toLowerCase();

    // Map bloodlines to traditions
    if (bloodlineName.includes('aberrant')) return 'occult';
    if (bloodlineName.includes('angelic')) return 'divine';
    if (bloodlineName.includes('demonic')) return 'divine';
    if (bloodlineName.includes('diabolic')) return 'divine';
    if (bloodlineName.includes('draconic')) return 'arcane';
    if (bloodlineName.includes('elemental')) return 'primal';
    if (bloodlineName.includes('fey')) return 'primal';
    if (bloodlineName.includes('hag')) return 'occult';
    if (bloodlineName.includes('imperial')) return 'arcane';
    if (bloodlineName.includes('undead')) return 'divine';
    if (bloodlineName.includes('wyrmblessed')) return 'divine';

    return 'arcane'; // Default
  }

  /**
   * Get witch tradition from patron
   * @private
   */
  _getWitchTradition() {
    // Find patron item
    const patronItem = this.actor.items.find(i =>
      i.type === 'feat' &&
      i.system?.category === 'classfeature' &&
      i.name.toLowerCase().includes('patron')
    );

    if (patronItem && patronItem.system?.tradition?.value) {
      return patronItem.system.tradition.value;
    }

    return 'occult'; // Default
  }

  /**
   * Get current ability scores
   * @returns {Object} Ability scores
   */
  getAbilityScores() {
    return {
      str: this.actor.system.abilities.str.mod,
      dex: this.actor.system.abilities.dex.mod,
      con: this.actor.system.abilities.con.mod,
      int: this.actor.system.abilities.int.mod,
      wis: this.actor.system.abilities.wis.mod,
      cha: this.actor.system.abilities.cha.mod
    };
  }

  /**
   * Get existing feats on actor
   * @returns {Array<Item>} Array of feat items
   */
  getExistingFeats() {
    return this.actor.items.filter(i => i.type === 'feat');
  }

  /**
   * Get existing spells on actor
   * @returns {Array<Item>} Array of spell items
   */
  getExistingSpells() {
    return this.actor.items.filter(i => i.type === 'spell');
  }

  /**
   * Export state as JSON
   * @returns {string} JSON string
   */
  exportState() {
    return JSON.stringify({
      actor: this.actor.uuid,
      level: this.level,
      choices: this.choices,
      complete: this.complete
    }, null, 2);
  }
}

export default LevelUpStateManager;
