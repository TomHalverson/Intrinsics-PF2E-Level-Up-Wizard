// Level Up Wizard Application
import { MODULE_NAME, debugLog } from './module.js';
import BuildPlanManager from './build-plan-manager.js';
import LevelUpStateManager from './level-up-state-manager.js';
import * as ClassFeaturesHelpers from './helpers/class-features-helpers.js';
import * as VariantRulesHelpers from './helpers/variant-rules-helpers.js';
import * as SkillsHelpers from './helpers/skills-helpers.js';
import * as SpellHelpers from './helpers/spell-helpers.js';
import * as SpellSlotProgression from './helpers/spell-slot-progression.js';
import { FeatSelectorApp } from './feat-selector.js';
import { SpellSelectorApp } from './spell-selector.js';
import { RuneSelectorApp } from './rune-selector.js';
import dataProvider from './data-provider.js';

function countSelections(values = []) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function hasSelection(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

function getClassIconPath(classSlug) {
  return `modules/intrinsics-pf2e-character-builder/ClassIcons/${classSlug}_Icon.png`;
}

/**
 * Level Up Wizard - Guide player through single level-up
 */
export class LevelUpWizardApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor, targetLevel) {
    super();
    this.actor = actor;
    this.targetLevel = targetLevel || actor.system.details.level.value;
    this.stateManager = new LevelUpStateManager(this.actor, this.targetLevel);

    // Check for build plan
    this.buildPlan = BuildPlanManager.loadPlan(this.actor);
    this.hasPlan = this.buildPlan && BuildPlanManager.hasChoicesForLevel(this.buildPlan, this.targetLevel);

    // Scroll position preservation
    this.scrollPosition = 0;
  }

  static DEFAULT_OPTIONS = {
    id: 'level-up-wizard-{id}',
    classes: ['intrinsics-level-up-wizard', 'level-up-wizard-app'],
    position: {
      width: 920,
      height: 760
    },
    window: {
      resizable: true,
      title: 'Level Up Wizard'
    },
    actions: {
      selectFeat: LevelUpWizardApp.prototype._onSelectFeat,
      selectSpell: LevelUpWizardApp.prototype._onSelectSpell,
      selectRune: LevelUpWizardApp.prototype._onSelectRune,
      toggleAbilityBoost: LevelUpWizardApp.prototype._onToggleAbilityBoost,
      toggleSkillIncrease: LevelUpWizardApp.prototype._onToggleSkillIncrease,
      applyPlan: LevelUpWizardApp.prototype._onApplyPlan,
      toggleSkipArchetypeFeat: LevelUpWizardApp.prototype._onToggleSkipArchetypeFeat,
      submit: LevelUpWizardApp.prototype._onSubmit,
      cancel: LevelUpWizardApp.prototype._onCancel
    }
  };

  static PARTS = {
    form: {
      template: 'modules/intrinsics-pf2e-level-up-wizard/templates/level-up-wizard.hbs'
    }
  };

  get title() {
    return `Level Up Wizard - ${this.actor.name} (Level ${this.targetLevel})`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Basic context
    context.actor = this.actor;
    context.actorName = this.actor.name;
    const classItem = this.actor.class ?? this.actor.itemTypes?.class?.[0] ?? null;
    const classSlug = classItem?.slug
      || classItem?.system?.slug
      || classItem?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    context.className = classItem?.name || this.actor.system.details.class?.name || null;
    context.classIconPath = classSlug ? getClassIconPath(classSlug) : null;
    context.actorPortrait = this.actor.img || 'icons/svg/mystery-man.svg';
    context.currentLevel = this.actor.system.details.level.value;
    context.targetLevel = this.targetLevel;
    context.isLevelUp = this.targetLevel > context.currentLevel;

    // Check for build plan
    context.hasPlan = this.hasPlan;
    context.planChoices = this.hasPlan ? BuildPlanManager.getLevelChoices(this.buildPlan, this.targetLevel) : null;

    // Get feat slots
    context.featSlots = ClassFeaturesHelpers.getFeatSlotsForLevel(this.actor, this.targetLevel);

    // Current choices from state manager
    context.choices = this.stateManager.choices;
    if (!context.choices.runes) {
      context.choices.runes = [];
    }

    // Get ability boost info
    context.abilityBoostInfo = ClassFeaturesHelpers.detectAbilityBoosts(this.actor, this.targetLevel);

    // Get skill increase count and available skills
    context.skillIncreaseCount = ClassFeaturesHelpers.getSkillIncreasesForLevel(this.actor, this.targetLevel);
    context.availableSkills = context.skillIncreaseCount > 0
      ? SkillsHelpers.getSkillsForLevel(this.actor, this.targetLevel, this._getSelectedSkillIncreaseCounts())
      : [];

    // Check if Runesmith and get progression info
    context.isRunesmith = ClassFeaturesHelpers.isRunesmith(this.actor);
    if (context.isRunesmith) {
      context.runesmithChanges = ClassFeaturesHelpers.getRunesmithChangesAtLevel(this.targetLevel);
      debugLog('LevelUpWizard', `Runesmith detected, changes at level ${this.targetLevel}:`, context.runesmithChanges);
      const runesToLearn = ClassFeaturesHelpers.getRunesToLearnAtLevel(this.actor, this.targetLevel);
      if (runesToLearn > 0) {
        context.runeSelection = {
          maxRunes: runesToLearn,
          current: this.stateManager.choices.runes || []
        };
      }
    }

    // Check if spellcaster and get spell info
    context.isSpellcaster = ClassFeaturesHelpers.isSpellcaster(this.actor);
    context.newSpellRank = ClassFeaturesHelpers.getNewSpellRankAtLevel(this.actor, this.targetLevel);

    // Get spell selection info
    if (context.isSpellcaster) {
      const tradition = SpellHelpers.getSpellTradition(this.actor);
      const spellcastingType = SpellHelpers.getSpellcastingType(this.actor);
      const autoLearns = SpellHelpers.autoLearnsCommonSpells(this.actor);

      context.spellTradition = tradition;
      context.spellcastingType = spellcastingType;
      context.autoLearnsSpells = autoLearns;

      debugLog('LevelUpWizard', `Spellcaster detected: tradition=${tradition}, type=${spellcastingType}, autoLearns=${autoLearns}`);

      // Don't show spell selection for classes that auto-learn all spells (Cleric, Druid, Animist)
      if (!autoLearns) {
        // Cantrips at level 1 (initial spell selection)
        if (this.targetLevel === 1) {
          const cantripCount = SpellHelpers.getCantripCount(this.actor);
          context.cantripSelection = {
            rank: 0,
            maxSpells: cantripCount,
            current: this.stateManager.choices.cantrips || []
          };
          debugLog('LevelUpWizard', `Cantrip selection: maxSpells=${cantripCount}`);
        }

        // Rank 1 spells at level 1 (initial spell selection)
        if (this.targetLevel === 1) {
          const rank1Count = SpellHelpers.getRank1SpellCount(this.actor);
          context.rank1Selection = {
            rank: 1,
            maxSpells: rank1Count,
            current: this.stateManager.choices.rank1Spells || []
          };
          debugLog('LevelUpWizard', `Rank 1 spell selection: maxSpells=${rank1Count}`);
        }

        // New spell rank at higher levels - REMOVED
        // Players don't automatically gain multiple spells at new ranks
        // Additional spell learning is handled by the "Learn Additional Spells" section
      } else {
        debugLog('LevelUpWizard', 'Skipping spell selection - class auto-learns spells');
      }

      // Additional spells learned on every level
      // Use spell slot progression framework to determine what spells to learn
      if (this.targetLevel > 1 && !autoLearns) {
        const spellsToLearn = SpellSlotProgression.getSpellsToLearnAtLevel(this.actor, this.targetLevel);

        if (spellsToLearn.totalSpells > 0) {
          // Get the rank we're learning spells at
          const learningRank = spellsToLearn.highestRank;
          const spellCount = spellsToLearn.byRank[learningRank] || 0;
          const additionalSpellKey = `additionalRank${learningRank}Spells`;

          context.additionalSpellSelection = {
            rank: learningRank,
            maxSpells: spellCount,
            current: this.stateManager.choices[additionalSpellKey] || [],
            spellKey: additionalSpellKey,
            type: spellsToLearn.learningRule
          };
          debugLog('LevelUpWizard', `Additional spell learning: rank ${learningRank}, maxSpells=${spellCount}, rule=${spellsToLearn.learningRule}`);
        }
      }
    }

    // Get class features for this level and enrich HTML for @UUID links
    const rawClassFeatures = await ClassFeaturesHelpers.getClassFeaturesForLevel(this.actor, this.targetLevel);
    debugLog('LevelUpWizard', 'Raw class features:', rawClassFeatures);
    context.classFeatures = [];
    for (const feature of rawClassFeatures) {
      const enrichedFeature = foundry.utils.duplicate(feature);
      debugLog('LevelUpWizard', `Processing feature: ${enrichedFeature.name}`, enrichedFeature);

      // Class features from class item have description at different paths
      // Try various possible paths
      let description = enrichedFeature.system?.description?.value
                     || enrichedFeature.system?.description
                     || enrichedFeature.description?.value
                     || enrichedFeature.description
                     || '';

      debugLog('LevelUpWizard', `Feature "${enrichedFeature.name}" description found:`, description);

      if (description) {
        description = await TextEditor.enrichHTML(description, {
          async: true,
          relativeTo: this.actor,
          rollData: this.actor.getRollData()
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
    for (const [key, value] of Object.entries(this.stateManager.choices)) {
      if (typeof value === 'string' && value.startsWith('Compendium.')) {
        // It's a feat UUID, resolve to name
        try {
          const feat = await fromUuid(value);
          context.choicesWithNames[key] = feat?.name || value;
        } catch (e) {
          context.choicesWithNames[key] = value;
        }
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value[0].startsWith('Compendium.')) {
        // Array of UUIDs
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

    // Variant rules
    context.variantRules = VariantRulesHelpers.detectVariantRules();

    // Progress tracking - calculate completion status for each requirement
    const choices = context.choices; // Local reference for easier access
    context.requirements = [];
    let totalRequirements = 0;
    let completedRequirements = 0;

    // Class feat
    if (context.featSlots.class) {
      totalRequirements++;
      const complete = hasSelection(choices.classFeats);
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'Class Feat',
        icon: 'fa-fist-raised',
        complete: complete,
        required: true
      });
    }

    // Ancestry feat
    if (context.featSlots.ancestry) {
      totalRequirements++;
      const complete = hasSelection(choices.ancestryFeats);
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'Ancestry Feat',
        icon: 'fa-dna',
        complete: complete,
        required: true
      });
    }

    // Skill feat
    if (context.featSlots.skill) {
      totalRequirements++;
      const complete = hasSelection(choices.skillFeats);
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'Skill Feat',
        icon: 'fa-hand-sparkles',
        complete: complete,
        required: true
      });
    }

    // General feat
    if (context.featSlots.general) {
      totalRequirements++;
      const complete = hasSelection(choices.generalFeats);
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'General Feat',
        icon: 'fa-star',
        complete: complete,
        required: true
      });
    }

    // Free archetype feat (only if variant enabled AND slot exists)
    if (context.featSlots.archetype && context.featSlots.archetype > 0) {
      totalRequirements++;
      const complete = hasSelection(choices.freeArchetypeFeats) || !!choices.skipArchetypeFeat;
      if (complete) completedRequirements++;
      context.requirements.push({
        name: choices.skipArchetypeFeat ? 'Free Archetype Feat (Skipped)' : 'Free Archetype Feat',
        icon: 'fa-book',
        complete: complete,
        required: true
      });
    }

    // Mythic feat (only if variant enabled AND slot exists)
    if (context.featSlots.mythic && context.featSlots.mythic > 0) {
      totalRequirements++;
      const complete = hasSelection(choices.mythicFeats);
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'Mythic Feat',
        icon: 'fa-crown',
        complete: complete,
        required: true
      });
    }

    // Runesmith rune selections
    if (context.runeSelection) {
      totalRequirements++;
      const runeCount = choices.runes?.length || 0;
      const complete = runeCount >= context.runeSelection.maxRunes;
      if (complete) completedRequirements++;
      context.requirements.push({
        name: `Runes (${runeCount}/${context.runeSelection.maxRunes})`,
        icon: 'fa-gem',
        complete,
        required: true
      });
    }

    // Ability boosts
    if (context.abilityBoostInfo.hasBoosts) {
      totalRequirements++;
      const boostCount = choices.abilityBoosts?.length || 0;
      const complete = boostCount >= context.abilityBoostInfo.count;
      if (complete) completedRequirements++;
      context.requirements.push({
        name: `Ability Boosts (${boostCount}/${context.abilityBoostInfo.count})`,
        icon: 'fa-bolt',
        complete: complete,
        required: true
      });
    }

    // Skill increases
    if (context.skillIncreaseCount > 0) {
      totalRequirements++;
      const increaseCount = choices.skillIncreases?.length || 0;
      const complete = increaseCount >= context.skillIncreaseCount;
      if (complete) completedRequirements++;
      context.requirements.push({
        name: `Skill Increases (${increaseCount}/${context.skillIncreaseCount})`,
        icon: 'fa-graduation-cap',
        complete: complete,
        required: true
      });
    }

    // Spell selections (only if not auto-learning)
    if (context.isSpellcaster && !context.autoLearnsSpells) {
      // Cantrips at level 1
      if (context.cantripSelection) {
        totalRequirements++;
        const cantripCount = choices.cantrips?.length || 0;
        const complete = cantripCount >= context.cantripSelection.maxSpells;
        if (complete) completedRequirements++;
        context.requirements.push({
          name: `Cantrips (${cantripCount}/${context.cantripSelection.maxSpells})`,
          icon: 'fa-wand-sparkles',
          complete: complete,
          required: true
        });
      }

      // Rank 1 spells at level 1
      if (context.rank1Selection) {
        totalRequirements++;
        const rank1Count = choices.rank1Spells?.length || 0;
        const complete = rank1Count >= context.rank1Selection.maxSpells;
        if (complete) completedRequirements++;
        context.requirements.push({
          name: `Rank 1 Spells (${rank1Count}/${context.rank1Selection.maxSpells})`,
          icon: 'fa-hat-wizard',
          complete: complete,
          required: true
        });
      }

      // Additional spells (prepared/spontaneous)
      if (context.additionalSpellSelection) {
        totalRequirements++;
        const key = context.additionalSpellSelection.spellKey;
        const spellCount = choices[key]?.length || 0;
        const complete = spellCount >= context.additionalSpellSelection.maxSpells;
        if (complete) completedRequirements++;
        context.requirements.push({
          name: `Learn Additional Spells (${spellCount}/${context.additionalSpellSelection.maxSpells})`,
          icon: 'fa-book-open',
          complete: complete,
          required: true
        });
      }
    }

    // Progress tracking
    context.progressPercent = totalRequirements > 0 ? Math.round((completedRequirements / totalRequirements) * 100) : 100;
    context.allRequirementsMet = completedRequirements >= totalRequirements;
    context.totalRequirements = totalRequirements;
    context.completedRequirements = completedRequirements;

    debugLog('LevelUpWizardApp._prepareContext', context);

    return context;
  }

  /**
   * Save current scroll position before re-render
   */
  _saveScrollPosition() {
    const element = this.element;
    if (element) {
      // The wizard-content div is the scrollable container
      const contentContainer = element.querySelector('.wizard-content');
      if (contentContainer) {
        this.scrollPosition = contentContainer.scrollTop;
      }
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Activate listeners for enriched HTML content (for @UUID links to work)
    const element = this.element;
    if (element) {
      const progressFill = element.querySelector('.wizard-progress-compact .progress-bar-fill');
      const progressText = element.querySelector('.wizard-progress-compact .progress-bar-text');
      const progressCounter = element.querySelector('.wizard-progress-compact .progress-counter');
      const progressPercent = Math.max(0, Math.min(100, Number(context.progressPercent ?? 0)));
      if (progressFill) {
        progressFill.style.width = `${progressPercent}%`;
      }
      if (progressText) {
        progressText.textContent = `${progressPercent}%`;
      }
      if (progressCounter) {
        progressCounter.textContent = `${context.completedRequirements ?? 0}/${context.totalRequirements ?? 0} Requirements Met`;
      }

      element.querySelectorAll('.class-feature-description').forEach(desc => {
        TextEditor.activateListeners(desc);
      });

      // Restore scroll position after render - use wizard-content which is the scrollable container
      const contentContainer = element.querySelector('.wizard-content');
      if (contentContainer && this.scrollPosition > 0) {
        setTimeout(() => {
          contentContainer.scrollTop = this.scrollPosition;
        }, 0);
      }
    }

    // If plan exists and hasn't been shown, show prompt
    if (this.hasPlan && !this._planPromptShown) {
      this._planPromptShown = true;
      this._showPlanPrompt();
    }
  }

  /**
   * Show dialog to apply build plan
   */
  _showPlanPrompt() {
    const planChoices = BuildPlanManager.getLevelChoices(this.buildPlan, this.targetLevel);

    // Build summary
    const summary = [];
    if (planChoices.classFeats) summary.push('Class Feat');
    if (planChoices.ancestryFeats) summary.push('Ancestry Feat');
    if (planChoices.skillFeats) summary.push('Skill Feat');
    if (planChoices.generalFeats) summary.push('General Feat');
    if (planChoices.freeArchetypeFeats) summary.push('Free Archetype Feat');
    if (planChoices.mythicFeats) summary.push('Mythic Feat');
    if (planChoices.abilityBoosts?.length) summary.push(`${planChoices.abilityBoosts.length} Ability Boosts`);
    if (planChoices.skillIncreases?.length) summary.push(`${planChoices.skillIncreases.length} Skill Increases`);
    if (planChoices.runes?.length) summary.push(`${planChoices.runes.length} Runes`);

    const summaryText = summary.length > 0
      ? `<ul><li>${summary.join('</li><li>')}</li></ul>`
      : '<p><em>No choices in plan.</em></p>';

    Dialog.confirm({
      title: 'Apply Build Plan?',
      content: `
        <h2>Build Plan Available</h2>
        <p>A build plan exists for level ${this.targetLevel}.</p>
        <h3>Planned Choices:</h3>
        ${summaryText}
        <p>Would you like to apply these choices automatically?</p>
      `,
      yes: () => {
        this.stateManager.loadFromPlan(this.buildPlan, this.targetLevel);
        this._saveScrollPosition();
        this.render();
      },
      no: () => {
        // Continue with manual selection
      },
      defaultYes: true
    });
  }

  /**
   * Select feat
   */
  async _onSelectFeat(event, target) {
    const featType = target.dataset.featType;
    const currentSelection = this.stateManager.choices[featType];

    // Create feat selector
    const selector = new FeatSelectorApp(this.actor, featType, this.targetLevel, currentSelection, {
      prerequisiteContext: this._getFeatPrerequisiteContext(),
      onSelect: async (featUuid) => {
        // Update state manager with selection
        this.stateManager.setChoice(featType, featUuid);
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
  async _onSelectSpell(event, target) {
    const rank = parseInt(target.dataset.rank);
    const spellType = target.dataset.spellType; // 'cantrips', 'rank1Spells', 'rank2Spells', etc.
    const maxSpells = parseInt(target.dataset.maxSpells);

    // Get current selections
    const currentSelections = this.stateManager.choices[spellType] || [];

    // Get already-known spells from actor
    const knownSpells = this.actor.items
      .filter(item => item.type === 'spell')
      .map(spell => spell.sourceId || spell.uuid);

    // Create spell selector
    const selector = new SpellSelectorApp(this.actor, rank, maxSpells, currentSelections, {
      onConfirm: async (spellUuids) => {
        debugLog('LevelUpWizard._onSelectSpell.onConfirm', `Received ${spellUuids.length} spells for ${spellType}:`, spellUuids);
        // Update state manager with selections
        this.stateManager.setChoice(spellType, spellUuids);
        debugLog('LevelUpWizard._onSelectSpell.onConfirm', `State after setChoice:`, this.stateManager.choices);
        this._saveScrollPosition();
        this.render();
      },
      knownSpells: knownSpells
    });

    // Render the selector
    selector.render(true);
  }

  async _onSelectRune(event, target) {
    const maxRunes = parseInt(target.dataset.maxRunes);
    const currentSelections = this.stateManager.choices.runes || [];
    const knownRunes = this.actor.items.filter(item =>
      item.flags?.core?.sourceId?.startsWith('Compendium.pf2e-playtest-data.impossible-playtest-runes.Item.') ||
      item.sourceId?.startsWith?.('Compendium.pf2e-playtest-data.impossible-playtest-runes.Item.')
    );

    const selector = new RuneSelectorApp(this.actor, maxRunes, currentSelections, {
      levelCap: this.targetLevel,
      onConfirm: async (runeUuids) => {
        this.stateManager.setChoice('runes', runeUuids);
        this._saveScrollPosition();
        this.render();
      },
      knownRunes
    });

    selector.render(true);
  }

  /**
   * Toggle ability boost
   */
  async _onToggleAbilityBoost(event, target) {
    const ability = target.dataset.ability;
    const selected = target.classList.contains('selected');

    if (selected) {
      // Remove boost
      const index = this.stateManager.choices.abilityBoosts.indexOf(ability);
      if (index > -1) {
        this.stateManager.choices.abilityBoosts.splice(index, 1);
      }
      target.classList.remove('selected');
    } else {
      // Add boost (if not at max)
      const abilityBoostInfo = ClassFeaturesHelpers.detectAbilityBoosts(this.actor, this.targetLevel);
      const hasRoom = this.stateManager.choices.abilityBoosts.length < abilityBoostInfo.count;
      if (hasRoom) {
        this.stateManager.choices.abilityBoosts.push(ability);
        target.classList.add('selected');
      } else {
        ui.notifications.warn(`You can only select ${abilityBoostInfo.count} ability boosts at this level.`);
      }
    }

    this._saveScrollPosition();
    this.render();
  }

  /**
   * Toggle skill increase
   */
  async _onToggleSkillIncrease(event, target) {
    const skill = target.dataset.skill;
    const selected = target.classList.contains('selected');

    if (selected) {
      // Remove increase
      const index = this.stateManager.choices.skillIncreases.indexOf(skill);
      if (index > -1) {
        this.stateManager.choices.skillIncreases.splice(index, 1);
      }
      target.classList.remove('selected');
    } else {
      // Add increase (if not at max)
      const skillIncreaseCount = ClassFeaturesHelpers.getSkillIncreasesForLevel(this.actor, this.targetLevel);
      const hasRoom = this.stateManager.choices.skillIncreases.length < skillIncreaseCount;
      const availability = SkillsHelpers.getSkillIncreaseEligibility(
        this.actor,
        skill,
        this.targetLevel,
        this._getSelectedSkillIncreaseCounts()
      );

      if (!availability.canIncrease) {
        ui.notifications.warn(availability.unavailableReason || 'That skill cannot be increased right now.');
        return;
      }

      if (hasRoom) {
        this.stateManager.choices.skillIncreases.push(skill);
        target.classList.add('selected');
      } else {
        ui.notifications.warn(`You can only select ${skillIncreaseCount} skill increases at this level.`);
      }
    }

    this._saveScrollPosition();
    this.render();
  }

  _getSelectedSkillIncreaseCounts() {
    return countSelections(this.stateManager.choices.skillIncreases || []);
  }

  _getFeatPrerequisiteContext() {
    return {
      effectiveLevel: this.targetLevel,
      skillRanks: SkillsHelpers.getProjectedSkillRanks(this.actor, this._getSelectedSkillIncreaseCounts())
    };
  }

  /**
   * Toggle skip archetype feat
   */
  async _onToggleSkipArchetypeFeat(event, target) {
    const currentSkip = this.stateManager.choices.skipArchetypeFeat;
    this.stateManager.setChoice('skipArchetypeFeat', !currentSkip);

    // If skipping, clear any selected archetype feat
    if (!currentSkip) {
      this.stateManager.setChoice('freeArchetypeFeats', null);
    }

    this._saveScrollPosition();
    this.render();
  }

  /**
   * Apply build plan
   */
  async _onApplyPlan(event, target) {
    try {
      const { BuildPlanApplicator } = await import('./build-plan-applicator.js');

      ui.notifications.info(`Applying build plan for level ${this.targetLevel}...`);

      await BuildPlanApplicator.applyLevel(this.actor, this.buildPlan, this.targetLevel);

      ui.notifications.success(`Successfully applied build plan for level ${this.targetLevel}!`);

      this.close();
    } catch (error) {
      console.error(`${MODULE_NAME} | Error applying build plan:`, error);
      ui.notifications.error(`Failed to apply build plan: ${error.message}`);
    }
  }

  /**
   * Submit level-up
   */
  async _onSubmit(event, target) {
    try {
      const { BuildPlanApplicator } = await import('./build-plan-applicator.js');

      await BuildPlanApplicator.applyLevel(this.actor, this.stateManager.choices, this.targetLevel, {
        notify: true,
        createChatMessage: true,
        updatePlan: false
      });

      // Close wizard
      this.close();
    } catch (error) {
      console.error(`${MODULE_NAME} | Error submitting level-up:`, error);
      ui.notifications.error(`Failed to apply level-up: ${error.message}`);
    }
  }

  /**
   * Cancel wizard
   */
  async _onCancel(event, target) {
    this.close();
  }

  /**
   * Add all common spells for auto-learn classes (Cleric, Druid, Animist)
   * These classes have access to all common spells from their tradition
   * @param {Item} spellcastingEntry - The spellcasting entry to add spells to
   * @param {string} classSlug - The class slug
   * @param {Object} targetSlots - The spell slots at the target level
   */
  async _addAutoLearnSpells(spellcastingEntry, classSlug, targetSlots) {
    console.log(`${MODULE_NAME} | Auto-learning spells for ${classSlug}...`);
    
    // Get the tradition from the spellcasting entry
    const tradition = spellcastingEntry.system?.tradition?.value;
    if (!tradition) {
      console.log(`${MODULE_NAME} | No tradition found on spellcasting entry, skipping auto-learn`);
      return;
    }
    
    // Determine the maximum spell rank this class can cast at this level
    let maxRank = 0;
    if (targetSlots) {
      maxRank = Math.max(...Object.keys(targetSlots).map(Number));
    }
    
    // Also include cantrips (rank 0)
    console.log(`${MODULE_NAME} | Fetching ${tradition} spells up to rank ${maxRank} (including cantrips)`);
    
    // Get existing spells on the actor
    const existingSpells = this.actor.items.filter(i => i.type === 'spell');
    const existingSpellNames = new Set(existingSpells.map(s => s.name.toLowerCase()));
    
    // Fetch all common spells from the tradition for each rank
    const spellsToAdd = [];
    
    for (let rank = 0; rank <= maxRank; rank++) {
      const spells = await dataProvider.getSpells({
        rank: rank,
        tradition: tradition,
        rarity: 'common'  // Only common spells are auto-learned
      });
      
      // Filter out spells the actor already has
      for (const spell of spells) {
        if (!existingSpellNames.has(spell.name.toLowerCase())) {
          const spellClone = foundry.utils.duplicate(spell.toObject());
          
          // Set the location to the spellcasting entry
          if (!spellClone.system.location) spellClone.system.location = {};
          spellClone.system.location.value = spellcastingEntry.id;
          
          // Set sourceId for tracking
          if (!spellClone.flags) spellClone.flags = {};
          if (!spellClone.flags.core) spellClone.flags.core = {};
          spellClone.flags.core.sourceId = spell.uuid;
          
          spellsToAdd.push(spellClone);
          existingSpellNames.add(spell.name.toLowerCase()); // Prevent duplicates in same batch
        }
      }
    }
    
    if (spellsToAdd.length > 0) {
      console.log(`${MODULE_NAME} | Adding ${spellsToAdd.length} auto-learned ${tradition} spells`);
      const createdSpells = await this.actor.createEmbeddedDocuments('Item', spellsToAdd);
      console.log(`${MODULE_NAME} | Successfully added ${createdSpells.length} auto-learned spells`);
      ui.notifications.info(`Auto-learned ${createdSpells.length} ${tradition} spell(s)`);
    } else {
      console.log(`${MODULE_NAME} | No new spells to auto-learn (already has all available spells)`);
    }
  }
}

export default LevelUpWizardApp;
