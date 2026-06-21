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
import dataProvider from './data-provider.js';

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
      width: 800,
      height: 700
    },
    window: {
      resizable: true,
      title: 'Level Up Wizard'
    },
    actions: {
      selectFeat: LevelUpWizardApp.prototype._onSelectFeat,
      selectSpell: LevelUpWizardApp.prototype._onSelectSpell,
      toggleAbilityBoost: LevelUpWizardApp.prototype._onToggleAbilityBoost,
      toggleSkillIncrease: LevelUpWizardApp.prototype._onToggleSkillIncrease,
      applyPlan: LevelUpWizardApp.prototype._onApplyPlan,
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
    context.currentLevel = this.actor.system.details.level.value;
    context.targetLevel = this.targetLevel;
    context.isLevelUp = this.targetLevel > context.currentLevel;

    // Check for build plan
    context.hasPlan = this.hasPlan;
    context.planChoices = this.hasPlan ? BuildPlanManager.getLevelChoices(this.buildPlan, this.targetLevel) : null;

    // Get feat slots
    context.featSlots = ClassFeaturesHelpers.getFeatSlotsForLevel(this.actor, this.targetLevel);

    // Get ability boost info
    context.abilityBoostInfo = ClassFeaturesHelpers.detectAbilityBoosts(this.actor, this.targetLevel);

    // Get skill increase count and available skills
    context.skillIncreaseCount = ClassFeaturesHelpers.getSkillIncreasesForLevel(this.actor, this.targetLevel);
    context.availableSkills = context.skillIncreaseCount > 0 ? SkillsHelpers.getSkillsForLevel(this.actor, this.targetLevel) : [];

    // Check if Runesmith and get progression info
    context.isRunesmith = ClassFeaturesHelpers.isRunesmith(this.actor);
    if (context.isRunesmith) {
      context.runesmithChanges = ClassFeaturesHelpers.getRunesmithChangesAtLevel(this.targetLevel);
      debugLog('LevelUpWizard', `Runesmith detected, changes at level ${this.targetLevel}:`, context.runesmithChanges);
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
          relativeTo: this.actor
        });
      }

      // Normalize the structure so template can access it
      enrichedFeature.description = description;
      if (!enrichedFeature.system) enrichedFeature.system = {};
      enrichedFeature.system.description = { value: description };

      context.classFeatures.push(enrichedFeature);
    }

    // Current choices from state manager
    context.choices = this.stateManager.choices;

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
      const complete = !!choices.classFeats;
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
      const complete = !!choices.ancestryFeats;
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
      const complete = !!choices.skillFeats;
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
      const complete = !!choices.generalFeats;
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
      const complete = !!choices.freeArchetypeFeats;
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'Free Archetype Feat',
        icon: 'fa-book',
        complete: complete,
        required: true
      });
    }

    // Mythic feat (only if variant enabled AND slot exists)
    if (context.featSlots.mythic && context.featSlots.mythic > 0) {
      totalRequirements++;
      const complete = !!choices.mythicFeats;
      if (complete) completedRequirements++;
      context.requirements.push({
        name: 'Mythic Feat',
        icon: 'fa-crown',
        complete: complete,
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
      const choices = this.stateManager.choices;
      const currentLevel = this.actor.system.details.level.value;

      // Validate required choices
      // TODO: Add comprehensive validation

      ui.notifications.info(`Applying level ${this.targetLevel} selections...`);

      // 0. Update actor level if needed (only if actually leveling up, not if already at target level)
      if (currentLevel < this.targetLevel) {
        await this.actor.update({ 'system.details.level.value': this.targetLevel });
        ui.notifications.info(`Level increased to ${this.targetLevel}`);
      }

      // 1. Add feats
      const featTypes = {
        classFeats: 'class',
        ancestryFeats: 'ancestry',
        skillFeats: 'skill',
        generalFeats: 'general',
        freeArchetypeFeats: 'archetype',
        ancestryParagonFeats: 'xdy_ancestryparagon',
        mythicFeats: 'mythic',
        dualClassFeats: 'xdy_dualclass'
      };

      const featsToCreate = [];
      for (const [featType, locationGroup] of Object.entries(featTypes)) {
        const featUuid = choices[featType];
        if (featUuid) {
          try {
            const feat = await fromUuid(featUuid);
            if (feat) {
              // Check if actor already has this feat (check by sourceId, name+location, or UUID)
              const targetLocation = `${locationGroup}-${this.targetLevel}`;
              const existingFeat = this.actor.items.find(i =>
                i.type === 'feat' && (
                  i.sourceId === featUuid ||
                  i.uuid === featUuid ||
                  i.flags?.core?.sourceId === featUuid ||
                  (i.name === feat.name && i.system.location === targetLocation)
                )
              );

              if (existingFeat) {
                console.log(`${MODULE_NAME} | Feat ${feat.name} already exists at ${targetLocation}, skipping`);
                continue;
              }

              const featClone = foundry.utils.duplicate(feat.toObject());
              featClone.system.location = `${locationGroup}-${this.targetLevel}`;
              featClone.system.level = {
                ...featClone.system.level,
                taken: this.targetLevel
              };
              featsToCreate.push(featClone);
            }
          } catch (e) {
            console.warn(`${MODULE_NAME} | Failed to load feat ${featUuid}:`, e);
          }
        }
      }

      if (featsToCreate.length > 0) {
        await this.actor.createEmbeddedDocuments('Item', featsToCreate);
        ui.notifications.info(`Added ${featsToCreate.length} feat(s)`);
      } else if (Object.values(choices).some(v => v)) {
        ui.notifications.info('All selected feats already exist on character');
      }

      // 2. Apply skill increases
      if (choices.skillIncreases && choices.skillIncreases.length > 0) {
        const updates = {};
        for (const skillKey of choices.skillIncreases) {
          const currentRank = this.actor.system.skills[skillKey]?.rank || 0;
          updates[`system.skills.${skillKey}.rank`] = currentRank + 1;
        }
        await this.actor.update(updates);
        ui.notifications.info(`Increased ${choices.skillIncreases.length} skill(s)`);
      }

      // 3. Apply ability boosts using PF2e's build system
      // PF2e stores ability boosts in system.build.attributes.boosts.{boostSet}
      // The boostSet corresponds to the level milestone (5, 10, 15, 20)
      if (choices.abilityBoosts && choices.abilityBoosts.length > 0) {
        // Determine which boost set this level belongs to
        const boostSetLevels = [5, 10, 15, 20];
        const currentBoostSet = boostSetLevels.find(level => level >= this.targetLevel);
        
        if (currentBoostSet) {
          const boostPath = `system.build.attributes.boosts.${currentBoostSet}`;
          await this.actor.update({ [boostPath]: choices.abilityBoosts });
          ui.notifications.info(`Applied ${choices.abilityBoosts.length} ability boost(s)`);
        } else {
          console.warn(`${MODULE_NAME} | Could not determine boost set for level ${this.targetLevel}`);
        }
      }

      // 4. Apply spells
      const spellsToCreate = [];
      const spellTypes = ['cantrips', 'rank1Spells', 'rank2Spells', 'rank3Spells', 'rank4Spells',
                          'rank5Spells', 'rank6Spells', 'rank7Spells', 'rank8Spells', 'rank9Spells', 'rank10Spells',
                          'additionalRank1Spells', 'additionalRank2Spells', 'additionalRank3Spells', 'additionalRank4Spells',
                          'additionalRank5Spells', 'additionalRank6Spells', 'additionalRank7Spells', 'additionalRank8Spells',
                          'additionalRank9Spells', 'additionalRank10Spells'];

      // Find the spellcasting entry for the actor using the shared helper
      // Debug: Log all spellcasting entries on the actor
      const allSpellcastingEntries = this.actor.items.filter(i => i.type === 'spellcastingEntry');
      console.log(`${MODULE_NAME} | Found ${allSpellcastingEntries.length} spellcasting entries on actor:`);
      allSpellcastingEntries.forEach((entry, idx) => {
        console.log(`${MODULE_NAME} |   [${idx}] "${entry.name}" - id: ${entry.id}, category: ${entry.system?.category}, tradition: ${entry.system?.tradition?.value}`);
      });
      
      const spellcastingEntry = SpellHelpers.getClassSpellcastingEntry(this.actor);
      console.log(`${MODULE_NAME} | FINAL spellcasting entry selected: "${spellcastingEntry?.name}" (id: ${spellcastingEntry?.id})`);

      for (const spellType of spellTypes) {
        const spellUuids = choices[spellType];
        if (spellUuids && Array.isArray(spellUuids) && spellUuids.length > 0) {
          for (const spellUuid of spellUuids) {
            try {
              const spell = await fromUuid(spellUuid);
              if (spell) {
                // Check if actor already has this spell
                const existingSpell = this.actor.items.find(i =>
                  i.type === 'spell' && (
                    i.sourceId === spellUuid ||
                    i.uuid === spellUuid ||
                    i.flags?.core?.sourceId === spellUuid ||
                    i.name === spell.name
                  )
                );

                if (existingSpell) {
                  console.log(`${MODULE_NAME} | Spell ${spell.name} already exists, skipping`);
                  continue;
                }

                const spellClone = foundry.utils.duplicate(spell.toObject());

                // Set sourceId for tracking
                if (!spellClone.flags) spellClone.flags = {};
                if (!spellClone.flags.core) spellClone.flags.core = {};
                spellClone.flags.core.sourceId = spellUuid;

                // Set location to spellcasting entry so spell appears in the correct list
                if (spellcastingEntry) {
                  if (!spellClone.system.location) spellClone.system.location = {};
                  spellClone.system.location.value = spellcastingEntry.id;
                  debugLog('LevelUpWizard._onSubmit', `Set spell location to: ${spellcastingEntry.id}`);
                }

                debugLog('LevelUpWizard._onSubmit', `Adding spell: ${spell.name} (${spellUuid})`);
                spellsToCreate.push(spellClone);
              }
            } catch (e) {
              console.warn(`${MODULE_NAME} | Failed to load spell ${spellUuid}:`, e);
            }
          }
        }
      }

      if (spellsToCreate.length > 0) {
        debugLog('LevelUpWizard._onSubmit', `Creating ${spellsToCreate.length} spell(s)`);
        const createdSpells = await this.actor.createEmbeddedDocuments('Item', spellsToCreate);
        debugLog('LevelUpWizard._onSubmit', `Successfully created ${createdSpells.length} spell(s)`);
        ui.notifications.info(`Added ${createdSpells.length} spell(s) to your character`);
      }

      // Update spell slots in spellcasting entry based on target level
      // This runs for ALL spellcasters, including auto-learn classes like Cleric/Druid
      console.log(`${MODULE_NAME} | Checking spell slot update - spellcastingEntry: ${spellcastingEntry ? spellcastingEntry.name : 'NONE'}`);
      if (spellcastingEntry) {
        const classItem = this.actor.items.find(i => i.type === 'class');
        console.log(`${MODULE_NAME} | Class item: ${classItem ? classItem.name : 'NONE'}`);
        if (classItem) {
          const classSlug = classItem.slug || classItem.name?.toLowerCase().replace(/\s+/g, '-');
          console.log(`${MODULE_NAME} | Class slug: ${classSlug}`);
          const targetSlots = SpellSlotProgression.getSpellSlotsAtLevel(classSlug, this.targetLevel);
          console.log(`${MODULE_NAME} | Target slots for ${classSlug} at level ${this.targetLevel}:`, targetSlots);

          // Always update slots - for wave casters we need to set slots to 0 for lost ranks
          if (targetSlots || SpellSlotProgression.isWaveCaster(classSlug)) {
            console.log(`${MODULE_NAME} | Updating spell slots for ${classSlug} at level ${this.targetLevel}:`, targetSlots);

            // Build the slots update object
            // For wave casters (Magus, Summoner), we need to explicitly set slots to 0 for ranks that are lost
            const slotsUpdate = {};
            for (let rank = 1; rank <= 10; rank++) {
              const slotCount = (targetSlots && targetSlots[rank]) || 0;
              // Always set the slot value - this handles both gaining and losing slots
              // PF2e uses slot1, slot2, etc. for each rank (skip slot0 for cantrips)
              slotsUpdate[`system.slots.slot${rank}`] = {
                max: slotCount,
                value: slotCount // Set current slots to max on level up
              };
            }

            await spellcastingEntry.update(slotsUpdate);
            console.log(`${MODULE_NAME} | Spell slots updated successfully for ${spellcastingEntry.name}`);
          } else {
            console.log(`${MODULE_NAME} | No spell slot data found for class: ${classSlug}`);
          }

          // For auto-learn classes (Cleric, Druid, Animist), add all common spells they can now cast
          if (SpellHelpers.autoLearnsCommonSpells(this.actor)) {
            await this._addAutoLearnSpells(spellcastingEntry, classSlug, targetSlots);
          }
        }
      } else {
        console.log(`${MODULE_NAME} | No spellcasting entry found - skipping spell slot update`);
      }

      // 5. Create chat message
      const chatData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<h3>Level Up Complete!</h3><p><strong>${this.actor.name}</strong> has reached <strong>Level ${this.targetLevel}</strong>!</p>`
      };
      await ChatMessage.create(chatData);

      ui.notifications.success(`Successfully leveled up to ${this.targetLevel}!`);

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
