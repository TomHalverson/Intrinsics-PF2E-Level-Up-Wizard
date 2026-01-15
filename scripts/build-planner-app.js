// Build Planner Application
import { MODULE_NAME, debugLog } from './module.js';
import BuildPlanManager from './build-plan-manager.js';
import * as ClassFeaturesHelpers from './helpers/class-features-helpers.js';
import * as VariantRulesHelpers from './helpers/variant-rules-helpers.js';
import * as SkillsHelpers from './helpers/skills-helpers.js';
import * as SpellHelpers from './helpers/spell-helpers.js';
import * as SpellSlotProgression from './helpers/spell-slot-progression.js';
import { FeatSelectorApp } from './feat-selector.js';
import { SpellSelectorApp } from './spell-selector.js';

/**
 * Build Planner - Plan character progression from levels 1-20
 */
export class BuildPlannerApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor) {
    super();
    this.actor = actor;
    this.currentLevel = actor.system.details.level.value;

    // Load or create build plan
    this.buildPlan = BuildPlanManager.loadPlan(this.actor);
    if (!this.buildPlan) {
      this.buildPlan = BuildPlanManager.createNewPlan(this.actor);
      this._autoSave();
    }

    // Selected level (start at current level)
    this.selectedLevel = this.currentLevel;

    // View mode: 'level' or 'summary'
    this.viewMode = 'level';

    // Scroll position preservation
    this.scrollPosition = 0;
  }

  static DEFAULT_OPTIONS = {
    id: 'build-planner-{id}',
    classes: ['intrinsics-level-up-wizard', 'build-planner-app'],
    position: {
      width: 1000,
      height: 800
    },
    window: {
      resizable: true,
      title: 'Build Planner'
    },
    actions: {
      selectLevel: this._onSelectLevel,
      selectFeat: this._onSelectFeat,
      selectSpell: this._onSelectSpell,
      toggleAbilityBoost: this._onToggleAbilityBoost,
      toggleSkillIncrease: this._onToggleSkillIncrease,
      savePlan: this._onSavePlan,
      exportPlan: this._onExportPlan,
      importPlan: this._onImportPlan,
      showSummary: this._onShowSummary,
      showLevel: this._onShowLevel
    }
  };

  static PARTS = {
    form: {
      template: 'modules/intrinsics-pf2e-level-up-wizard/templates/build-planner.hbs'
    }
  };

  get title() {
    return `Build Planner - ${this.actor.name}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Basic context
    context.actor = this.actor;
    context.actorName = this.actor.name;
    context.currentLevel = this.currentLevel;
    context.selectedLevel = this.selectedLevel;
    context.viewMode = this.viewMode;

    // Level navigation
    context.levels = [];
    for (let i = 1; i <= 20; i++) {
      const levelData = this.buildPlan.levels[i];
      const isComplete = levelData && levelData.applied;
      const hasChoices = BuildPlanManager.hasChoicesForLevel(this.buildPlan, i);

      context.levels.push({
        number: i,
        isActive: i === this.selectedLevel,
        isComplete: isComplete,
        hasChoices: hasChoices,
        isCurrent: i === this.currentLevel
      });
    }

    if (this.viewMode === 'level') {
      // Single level view
      const levelData = this.buildPlan.levels[this.selectedLevel];
      context.levelData = levelData;
      context.choices = levelData.choices;
      context.notes = levelData.notes;

      // Ensure skillIncreases and abilityBoosts are always arrays
      if (!context.choices.skillIncreases) {
        context.choices.skillIncreases = [];
      }
      if (!context.choices.abilityBoosts) {
        context.choices.abilityBoosts = [];
      }

      // Get feat slots
      context.featSlots = ClassFeaturesHelpers.getFeatSlotsForLevel(this.actor, this.selectedLevel);

      // Get ability boost info
      context.abilityBoostInfo = ClassFeaturesHelpers.detectAbilityBoosts(this.actor, this.selectedLevel);

      // Get skill increase count and available skills
      context.skillIncreaseCount = ClassFeaturesHelpers.getSkillIncreasesForLevel(this.actor, this.selectedLevel);
      context.availableSkills = context.skillIncreaseCount > 0 ? SkillsHelpers.getSkillsForLevel(this.actor, this.selectedLevel) : [];

      // Check if spellcaster
      context.isSpellcaster = ClassFeaturesHelpers.isSpellcaster(this.actor);
      context.newSpellRank = ClassFeaturesHelpers.getNewSpellRankAtLevel(this.actor, this.selectedLevel);

      // Spell selections (if spellcaster)
      if (context.isSpellcaster) {
        const autoLearnsSpells = SpellHelpers.autoLearnsCommonSpells(this.actor);
        context.autoLearnsSpells = autoLearnsSpells;

        if (!autoLearnsSpells) {
          // Cantrips at level 1
          if (this.selectedLevel === 1) {
            const cantripCount = SpellHelpers.getCantripCount(this.actor);
            context.cantripSelection = {
              rank: 0,
              maxSpells: cantripCount,
              current: levelData.choices.cantrips || []
            };
          }

          // Rank 1 spells at level 1
          if (this.selectedLevel === 1) {
            const rank1Count = SpellHelpers.getRank1SpellCount(this.actor);
            context.rank1Selection = {
              rank: 1,
              maxSpells: rank1Count,
              current: levelData.choices.rank1Spells || []
            };
          }

          // Additional spell learning (prepared/spontaneous)
          // Use spell slot progression framework to determine what spells to learn
          const spellsToLearn = SpellSlotProgression.getSpellsToLearnAtLevel(this.actor, this.selectedLevel);

          if (spellsToLearn.totalSpells > 0) {
            // Get the rank we're learning spells at
            const learningRank = spellsToLearn.highestRank;
            const spellCount = spellsToLearn.byRank[learningRank] || 0;
            const additionalSpellKey = `additionalRank${learningRank}Spells`;

            context.additionalSpellSelection = {
              rank: learningRank,
              maxSpells: spellCount,
              current: levelData.choices[additionalSpellKey] || [],
              spellKey: additionalSpellKey,
              type: spellsToLearn.learningRule,
              description: this._getSpellLearningDescription(spellsToLearn)
            };
          }
        }
      }

      // Get class features for this level and enrich HTML for @UUID links
      const rawClassFeatures = await ClassFeaturesHelpers.getClassFeaturesForLevel(this.actor, this.selectedLevel);
      debugLog('BuildPlannerApp', 'Raw class features:', rawClassFeatures);
      context.classFeatures = [];
      for (const feature of rawClassFeatures) {
        const enrichedFeature = foundry.utils.duplicate(feature);
        debugLog('BuildPlannerApp', `Processing feature: ${enrichedFeature.name}`, enrichedFeature);

        // Class features from class item have description at different paths
        let description = enrichedFeature.system?.description?.value
                       || enrichedFeature.system?.description
                       || enrichedFeature.description?.value
                       || enrichedFeature.description
                       || '';

        debugLog('BuildPlannerApp', `Feature "${enrichedFeature.name}" description found:`, description);

        if (description) {
          description = await TextEditor.enrichHTML(description, {
            async: true,
            relativeTo: this.actor
          });
        }

        // Normalize the structure so template can access it
        enrichedFeature.description = description;
        if (!enrichedFeature.system) enrichedFeature.system = {};
        enrichedFeature.system.description = { value: description };

        context.classFeatures.push(enrichedFeature);
      }

      // Resolve feat UUIDs to names for display
      context.choicesWithNames = {};
      for (const [key, value] of Object.entries(levelData.choices)) {
        if (typeof value === 'string' && value.startsWith('Compendium.')) {
          // It's a feat UUID, resolve to name
          try {
            const feat = await fromUuid(value);
            context.choicesWithNames[key] = feat?.name || value;
          } catch (e) {
            context.choicesWithNames[key] = value;
          }
        } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value[0].startsWith('Compendium.')) {
          // Array of UUIDs (spells, etc.)
          context.choicesWithNames[key] = [];
          for (const uuid of value) {
            try {
              const item = await fromUuid(uuid);
              context.choicesWithNames[key].push(item?.name || uuid);
            } catch (e) {
              context.choicesWithNames[key].push(uuid);
            }
          }
        } else {
          context.choicesWithNames[key] = value;
        }
      }
    } else {
      // Summary view
      context.summaryLevels = [];
      for (let i = 1; i <= 20; i++) {
        const levelData = this.buildPlan.levels[i];
        const hasChoices = BuildPlanManager.hasChoicesForLevel(this.buildPlan, i);

        context.summaryLevels.push({
          number: i,
          isComplete: levelData.applied,
          hasChoices: hasChoices,
          choices: levelData.choices,
          notes: levelData.notes
        });
      }
    }

    // Variant rules
    context.variantRules = VariantRulesHelpers.detectVariantRules();

    // Check for variant rule conflicts
    const currentRules = VariantRulesHelpers.detectVariantRules();
    const comparison = VariantRulesHelpers.compareVariantRules(this.buildPlan.variantRules, currentRules);
    context.variantRuleConflicts = !comparison.matches;
    context.variantRuleDifferences = comparison.differences;

    debugLog('BuildPlannerApp._prepareContext', context);

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Activate listeners for enriched HTML content (for @UUID links to work)
    const element = this.element;
    if (element) {
      element.querySelectorAll('.class-feature-description').forEach(desc => {
        TextEditor.activateListeners(desc);
      });
    }
  }

  /**
   * Get spell learning description for display
   * @param {Object} spellsToLearn - Spell learning info from getSpellsToLearnAtLevel
   * @returns {string} Human-readable description
   */
  _getSpellLearningDescription(spellsToLearn) {
    if (spellsToLearn.learningRule === 'prepared') {
      return `As a prepared caster, you learn ${spellsToLearn.totalSpells} new spells this level.`;
    } else if (spellsToLearn.learningRule === 'spontaneous') {
      const ranks = Object.keys(spellsToLearn.byRank);
      if (ranks.length === 1) {
        return `As a spontaneous caster, you learn ${spellsToLearn.totalSpells} new spell(s) this level.`;
      } else {
        // Multiple ranks (shouldn't happen but handle it)
        const parts = ranks.map(rank => `${spellsToLearn.byRank[rank]} rank ${rank}`);
        return `As a spontaneous caster, you learn ${parts.join(', ')} spell(s) this level.`;
      }
    }
    return '';
  }

  /**
   * Select a level
   */
  static async _onSelectLevel(event, target) {
    const level = parseInt(target.dataset.level);
    if (level >= 1 && level <= 20) {
      this.selectedLevel = level;
      this.viewMode = 'level';
      this.render();
    }
  }

  /**
   * Select feat
   */
  static async _onSelectFeat(event, target) {
    const featType = target.dataset.featType;
    const currentSelection = this.buildPlan.levels[this.selectedLevel].choices[featType];

    // Create feat selector
    const selector = new FeatSelectorApp(this.actor, featType, this.selectedLevel, currentSelection, {
      onSelect: async (featUuid) => {
        // Update build plan with selection
        this.buildPlan.levels[this.selectedLevel].choices[featType] = featUuid;
        this._autoSave();
        this._saveScrollPosition();
        this.render();
      }
    });

    // Render the selector
    selector.render(true);
  }

  /**
   * Select spell
   */
  static async _onSelectSpell(event, target) {
    const rank = parseInt(target.dataset.rank);
    const spellType = target.dataset.spellType; // 'cantrips', 'rank1Spells', 'additionalRank2Spells', etc.
    const maxSpells = parseInt(target.dataset.maxSpells);

    // Get current selections
    const currentSelections = this.buildPlan.levels[this.selectedLevel].choices[spellType] || [];

    // Get already-known spells from actor
    const knownSpells = this.actor.items
      .filter(item => item.type === 'spell')
      .map(spell => spell.sourceId || spell.uuid);

    // Create spell selector
    const selector = new SpellSelectorApp(this.actor, rank, maxSpells, currentSelections, {
      onConfirm: async (spellUuids) => {
        debugLog('BuildPlanner._onSelectSpell.onConfirm', `Received ${spellUuids.length} spells for ${spellType}:`, spellUuids);
        // Update build plan with selections
        this.buildPlan.levels[this.selectedLevel].choices[spellType] = spellUuids;
        this._autoSave();
        this._saveScrollPosition();
        this.render();
      },
      knownSpells: knownSpells
    });

    // Render the selector
    selector.render(true);
  }

  /**
   * Toggle ability boost
   */
  static async _onToggleAbilityBoost(event, target) {
    const ability = target.dataset.ability;
    const choices = this.buildPlan.levels[this.selectedLevel].choices;

    if (!choices.abilityBoosts) {
      choices.abilityBoosts = [];
    }

    const index = choices.abilityBoosts.indexOf(ability);
    if (index > -1) {
      choices.abilityBoosts.splice(index, 1);
    } else {
      // Check limit
      const abilityBoostInfo = ClassFeaturesHelpers.detectAbilityBoosts(this.actor, this.selectedLevel);
      if (choices.abilityBoosts.length < abilityBoostInfo.count) {
        choices.abilityBoosts.push(ability);
      } else {
        ui.notifications.warn(`You can only select ${abilityBoostInfo.count} ability boosts at level ${this.selectedLevel}.`);
        return;
      }
    }

    this._autoSave();
    this._saveScrollPosition();
    this.render();
  }

  /**
   * Toggle skill increase
   */
  static async _onToggleSkillIncrease(event, target) {
    const skill = target.dataset.skill;
    const choices = this.buildPlan.levels[this.selectedLevel].choices;

    if (!choices.skillIncreases) {
      choices.skillIncreases = [];
    }

    const index = choices.skillIncreases.indexOf(skill);
    if (index > -1) {
      choices.skillIncreases.splice(index, 1);
    } else {
      // Check limit
      const skillIncreaseCount = ClassFeaturesHelpers.getSkillIncreasesForLevel(this.actor, this.selectedLevel);
      if (choices.skillIncreases.length < skillIncreaseCount) {
        choices.skillIncreases.push(skill);
      } else {
        ui.notifications.warn(`You can only select ${skillIncreaseCount} skill increases at level ${this.selectedLevel}.`);
        return;
      }
    }

    this._autoSave();
    this._saveScrollPosition();
    this.render();
  }

  /**
   * Save plan manually
   */
  static async _onSavePlan(event, target) {
    try {
      await BuildPlanManager.savePlan(this.actor, this.buildPlan);
      ui.notifications.success('Build plan saved!');
    } catch (error) {
      console.error(`${MODULE_NAME} | Error saving plan:`, error);
      ui.notifications.error(`Failed to save plan: ${error.message}`);
    }
  }

  /**
   * Export plan
   */
  static async _onExportPlan(event, target) {
    const json = BuildPlanManager.exportPlan(this.buildPlan);

    // Copy to clipboard
    navigator.clipboard.writeText(json).then(() => {
      ui.notifications.success('Build plan exported to clipboard!');
    }).catch(err => {
      console.error(`${MODULE_NAME} | Failed to copy to clipboard:`, err);
      ui.notifications.error('Failed to copy to clipboard');
    });
  }

  /**
   * Import plan
   */
  static async _onImportPlan(event, target) {
    new Dialog({
      title: 'Import Build Plan',
      content: `
        <p>Paste your build plan JSON below:</p>
        <textarea id="import-json" style="width: 100%; height: 200px; font-family: monospace;"></textarea>
      `,
      buttons: {
        import: {
          icon: '<i class="fas fa-upload"></i>',
          label: 'Import',
          callback: async (html) => {
            try {
              const json = html.find('#import-json').val();
              const plan = BuildPlanManager.importPlan(json);

              this.buildPlan = plan;
              await BuildPlanManager.savePlan(this.actor, this.buildPlan);

              ui.notifications.success('Build plan imported successfully!');
              this._saveScrollPosition();
              this.render();
            } catch (error) {
              console.error(`${MODULE_NAME} | Error importing plan:`, error);
              ui.notifications.error(`Failed to import plan: ${error.message}`);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel'
        }
      },
      default: 'import'
    }).render(true);
  }

  /**
   * Show summary view
   */
  static async _onShowSummary(event, target) {
    this.viewMode = 'summary';
    this.render();
  }

  /**
   * Show level view
   */
  static async _onShowLevel(event, target) {
    this.viewMode = 'level';
    this.render();
  }

  /**
   * Auto-save with debounce
   */
  _autoSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }

    this._saveTimeout = setTimeout(async () => {
      try {
        await BuildPlanManager.savePlan(this.actor, this.buildPlan);
        debugLog('BuildPlannerApp', 'Auto-saved plan');
      } catch (error) {
        console.error(`${MODULE_NAME} | Error auto-saving plan:`, error);
      }
    }, 2000); // 2 second debounce
  }

  /**
   * Save current scroll position before re-render
   */
  _saveScrollPosition() {
    const element = this.element;
    if (element) {
      // The build-planner-content div is the scrollable container
      const contentContainer = element.querySelector('.build-planner-content');
      if (contentContainer) {
        this.scrollPosition = contentContainer.scrollTop;
      }
    }
  }

  /**
   * Called after render to restore scroll position and set up listeners
   */
  _onRender(context, options) {
    super._onRender(context, options);

    const element = this.element;
    if (element) {
      // Restore scroll position after render
      const contentContainer = element.querySelector('.build-planner-content');
      if (contentContainer && this.scrollPosition > 0) {
        setTimeout(() => {
          contentContainer.scrollTop = this.scrollPosition;
        }, 0);
      }
    }
  }
}

export default BuildPlannerApp;
