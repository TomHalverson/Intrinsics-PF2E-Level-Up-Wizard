/**
 * Retraining Wizard Application
 * Guided workflow for PF2e retraining — swap feats, skill proficiencies,
 * and spells while respecting dependency chains and time-cost rules.
 *
 * PF2e Retraining Rules (CRB p.481):
 * - Feats: 1 week per level of the feat
 * - Skill increases: 1 week
 * - Class feature (limited): GM discretion
 * - Spells in repertoire: 1 week per spell rank (spontaneous casters)
 */

import { MODULE_NAME, debugLog } from './module.js';
import dataProvider from './data-provider.js';
import * as ClassFeaturesHelpers from './helpers/class-features-helpers.js';
import * as SpellHelpers from './helpers/spell-helpers.js';
import * as VariantRulesHelpers from './helpers/variant-rules-helpers.js';
import { FeatSelectorApp } from './feat-selector.js';
import { SpellSelectorApp } from './spell-selector.js';

export class RetrainingWizardApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;

    // Retraining state
    this.selectedCategory = 'feats'; // 'feats', 'skills', 'spells'
    this.selectedItem = null;        // UUID or key of item to retrain
    this.replacementItem = null;     // UUID or key of replacement
    this.retrainingLog = [];         // History of retraining actions this session
    this.detailHTML = '';            // Enriched HTML for selected item detail
    this.replacementDetailHTML = ''; // Enriched HTML for replacement detail

    // Pre-compute retrainable items
    this._retrainableFeats = null;
    this._retrainableSkills = null;
    this._retrainableSpells = null;
  }

  static DEFAULT_OPTIONS = {
    id: 'retraining-wizard-{id}',
    tag: 'div',
    classes: ['intrinsics-level-up-wizard', 'retraining-wizard-app'],
    window: {
      title: 'Retraining Wizard',
      icon: 'fa-solid fa-rotate',
      resizable: true
    },
    position: {
      width: 900,
      height: 700
    },
    actions: {
      selectCategory: RetrainingWizardApp.prototype._onSelectCategory,
      selectItem: RetrainingWizardApp.prototype._onSelectItem,
      chooseReplacement: RetrainingWizardApp.prototype._onChooseReplacement,
      applyRetraining: RetrainingWizardApp.prototype._onApplyRetraining,
      clearSelection: RetrainingWizardApp.prototype._onClearSelection,
      cancel: RetrainingWizardApp.prototype._onCancel
    }
  };

  static PARTS = {
    form: {
      template: 'modules/intrinsics-pf2e-level-up-wizard/templates/retraining-wizard.hbs'
    }
  };

  get title() {
    return `Retraining - ${this.actor.name}`;
  }

  // ===========================================================================
  // Context Preparation
  // ===========================================================================

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.actor = this.actor;
    context.actorName = this.actor.name;
    context.actorLevel = this.actor.system.details.level.value;
    context.selectedCategory = this.selectedCategory;
    context.selectedItem = this.selectedItem;
    context.replacementItem = this.replacementItem;
    context.retrainingLog = this.retrainingLog;

    // Category tabs
    context.categories = [
      { key: 'feats', label: 'Feats', icon: 'fas fa-fist-raised', active: this.selectedCategory === 'feats' },
      { key: 'skills', label: 'Skills', icon: 'fas fa-graduation-cap', active: this.selectedCategory === 'skills' },
      { key: 'spells', label: 'Spells', icon: 'fas fa-hat-wizard', active: this.selectedCategory === 'spells' }
    ];

    // Get retrainable items for the selected category
    if (this.selectedCategory === 'feats') {
      const allFeats = await this._getRetrainableFeats();
      const isMythic = VariantRulesHelpers.isMythicEnabled();

      // Define group order and labels
      const groupDefs = [
        { key: 'ancestry', label: 'Ancestry Feats', icon: 'fas fa-dna' },
        { key: 'class', label: 'Class Feats', icon: 'fas fa-fist-raised' },
        { key: 'archetype', label: 'Archetype Feats', icon: 'fas fa-mask' },
        { key: 'skill', label: 'Skill Feats', icon: 'fas fa-tools' },
        { key: 'general', label: 'General Feats', icon: 'fas fa-star' },
      ];

      if (isMythic) {
        groupDefs.push({ key: 'mythic', label: 'Mythic Feats', icon: 'fas fa-bolt' });
      }

      // Build groups — only include groups that have feats
      context.featGroups = [];
      for (const def of groupDefs) {
        const items = allFeats.filter(f => f.type === def.key);
        if (items.length > 0) {
          context.featGroups.push({ ...def, items, count: items.length });
        }
      }

      // Catch any uncategorized feats
      const knownTypes = groupDefs.map(d => d.key);
      const otherFeats = allFeats.filter(f => !knownTypes.includes(f.type));
      if (otherFeats.length > 0) {
        context.featGroups.push({
          key: 'other', label: 'Other Feats', icon: 'fas fa-question-circle',
          items: otherFeats, count: otherFeats.length
        });
      }

      context.hasFeatGroups = context.featGroups.length > 0;
    } else if (this.selectedCategory === 'skills') {
      context.retrainableItems = this._getRetrainableSkills();
    } else if (this.selectedCategory === 'spells') {
      context.retrainableItems = await this._getRetrainableSpells();
    }

    // Selected item details
    if (this.selectedItem) {
      context.selectedItemDetails = await this._getSelectedItemDetails();
      context.dependents = await this._getDependents(this.selectedItem);
      context.hasDependents = context.dependents.length > 0;
      context.timeCost = this._calculateTimeCost(context.selectedItemDetails);
    }

    // Replacement item details
    if (this.replacementItem) {
      context.replacementDetails = await this._getReplacementDetails();
    }

    // Ready to apply?
    context.canApply = this.selectedItem && this.replacementItem && !context.hasDependents;

    // Enriched descriptions
    context.detailHTML = this.detailHTML;
    context.replacementDetailHTML = this.replacementDetailHTML;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const element = this.element;
    if (!element) return;

    // Add click handlers for retrainable item rows
    element.querySelectorAll('.retrainable-item').forEach(row => {
      row.addEventListener('click', (ev) => {
        const uuid = ev.currentTarget.dataset.uuid;
        const key = ev.currentTarget.dataset.key;
        this._onSelectItem(ev, ev.currentTarget);
      });
    });
  }

  // ===========================================================================
  // Retrainable Item Discovery
  // ===========================================================================

  /**
   * Get all feats on the actor that can be retrained
   */
  async _getRetrainableFeats() {
    if (this._retrainableFeats) return this._retrainableFeats;

    const feats = this.actor.items.filter(i => {
      if (i.type !== 'feat') return false;
      // Exclude auto-granted class/ancestry features — these are not player choices
      const category = i.system?.category;
      if (category === 'classfeature' || category === 'ancestryfeature') return false;
      return true;
    });
    const retrainable = [];

    for (const feat of feats) {
      const location = feat.system?.location || '';
      const featType = this._categorizeFeat(feat);

      // Determine the level this feat was taken at
      const takenLevel = feat.system?.level?.taken || this._inferFeatLevel(feat);

      // Check if any other feat depends on this one
      const dependents = await this._findFeatDependents(feat);
      const blocked = dependents.length > 0;

      retrainable.push({
        uuid: feat.uuid,
        id: feat.id,
        name: feat.name,
        img: feat.img,
        type: featType,
        typeLabel: this._getFeatTypeLabel(featType),
        level: feat.system?.level?.value || 1,
        takenLevel,
        location,
        rarity: feat.system?.traits?.rarity || 'common',
        blocked,
        blockedBy: blocked ? dependents.map(d => d.name).join(', ') : '',
        selected: this.selectedItem === feat.uuid,
        timeCost: `${feat.system?.level?.value || 1} week(s)`
      });
    }

    // Sort by type, then level
    retrainable.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.level - b.level;
    });

    this._retrainableFeats = retrainable;
    return retrainable;
  }

  /**
   * Get skill proficiencies that can be retrained
   */
  _getRetrainableSkills() {
    if (this._retrainableSkills) return this._retrainableSkills;

    const skills = this.actor.system.skills;
    const retrainable = [];

    for (const [key, skill] of Object.entries(skills)) {
      // Can only retrain skills that have been increased (rank > 0)
      if (skill.rank <= 0) continue;

      // Check if any feat requires this skill proficiency
      const dependentFeats = this._findSkillDependentFeats(key, skill.rank);
      const blocked = dependentFeats.length > 0;

      retrainable.push({
        key,
        uuid: key, // Use key as identifier for skills
        name: game.i18n.localize(`PF2E.Skill.${key.charAt(0).toUpperCase() + key.slice(1)}`),
        img: null,
        type: 'skill',
        typeLabel: 'Skill Proficiency',
        rank: skill.rank,
        rankLabel: this._getRankLabel(skill.rank),
        blocked,
        blockedBy: blocked ? dependentFeats.map(f => f.name).join(', ') : '',
        selected: this.selectedItem === key,
        timeCost: '1 week'
      });
    }

    retrainable.sort((a, b) => a.name.localeCompare(b.name));
    this._retrainableSkills = retrainable;
    return retrainable;
  }

  /**
   * Get spells in the repertoire that can be retrained (spontaneous casters)
   */
  async _getRetrainableSpells() {
    if (this._retrainableSpells) return this._retrainableSpells;

    const spellcastingType = SpellHelpers.getSpellcastingType(this.actor);

    // Retraining spells in repertoire mainly applies to spontaneous casters
    // Prepared casters change spells daily. We'll still allow it for all types
    // since some GMs allow broader retraining.
    const spellcastingEntry = SpellHelpers.getClassSpellcastingEntry(this.actor);
    if (!spellcastingEntry) {
      this._retrainableSpells = [];
      return [];
    }

    const spells = this.actor.items.filter(i =>
      i.type === 'spell' &&
      i.system?.location?.value === spellcastingEntry.id
    );

    const retrainable = [];
    for (const spell of spells) {
      const rank = spell.system?.level?.value ?? spell.rank ?? 0;
      const isCantrip = rank === 0 || spell.system?.traits?.value?.includes('cantrip');

      retrainable.push({
        uuid: spell.uuid,
        id: spell.id,
        name: spell.name,
        img: spell.img,
        type: isCantrip ? 'cantrip' : 'spell',
        typeLabel: isCantrip ? 'Cantrip' : `Rank ${rank} Spell`,
        rank,
        rarity: spell.system?.traits?.rarity || 'common',
        blocked: false,
        blockedBy: '',
        selected: this.selectedItem === spell.uuid,
        timeCost: isCantrip ? '1 week' : `${rank} week(s)`
      });
    }

    retrainable.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.name.localeCompare(b.name);
    });

    this._retrainableSpells = retrainable;
    return retrainable;
  }

  // ===========================================================================
  // Dependency Checking
  // ===========================================================================

  /**
   * Find feats that depend on the given feat (prerequisite chains)
   */
  async _findFeatDependents(feat) {
    const dependents = [];
    const featName = feat.name.toLowerCase();
    const actorFeats = this.actor.items.filter(i => i.type === 'feat' && i.id !== feat.id);

    for (const otherFeat of actorFeats) {
      const prereqs = otherFeat.system?.prerequisites?.value || [];
      for (const prereq of prereqs) {
        const prereqText = (prereq.value || prereq || '').toLowerCase();
        if (prereqText.includes(featName)) {
          dependents.push({
            name: otherFeat.name,
            uuid: otherFeat.uuid,
            img: otherFeat.img
          });
          break;
        }
      }
    }

    return dependents;
  }

  /**
   * Find feats that require a specific skill at a specific rank
   */
  _findSkillDependentFeats(skillKey, rank) {
    const dependents = [];
    const skillName = this._getSkillName(skillKey).toLowerCase();
    const rankLabel = this._getRankLabel(rank).toLowerCase();
    const actorFeats = this.actor.items.filter(i => i.type === 'feat');

    for (const feat of actorFeats) {
      const prereqs = feat.system?.prerequisites?.value || [];
      for (const prereq of prereqs) {
        const prereqText = (prereq.value || prereq || '').toLowerCase();
        // Check if this feat requires this skill at this or higher rank
        if (prereqText.includes(skillName) && (
          prereqText.includes('trained') ||
          prereqText.includes('expert') ||
          prereqText.includes('master') ||
          prereqText.includes('legendary')
        )) {
          // Only block if the feat requires the current or higher rank
          const requiredRank = this._parsePrereqRank(prereqText);
          if (requiredRank >= rank) {
            dependents.push(feat);
            break;
          }
        }
      }
    }

    return dependents;
  }

  /**
   * Get all dependents for a selected item
   */
  async _getDependents(itemIdentifier) {
    if (this.selectedCategory === 'feats') {
      const feat = this.actor.items.find(i => i.uuid === itemIdentifier || i.id === itemIdentifier);
      if (feat) return this._findFeatDependents(feat);
    } else if (this.selectedCategory === 'skills') {
      const skill = this.actor.system.skills[itemIdentifier];
      if (skill) return this._findSkillDependentFeats(itemIdentifier, skill.rank).map(f => ({
        name: f.name, uuid: f.uuid, img: f.img
      }));
    }
    // Spells generally don't have dependents
    return [];
  }

  // ===========================================================================
  // Item Details & Enrichment
  // ===========================================================================

  /**
   * Get enriched details for the selected item
   */
  async _getSelectedItemDetails() {
    if (this.selectedCategory === 'feats' || this.selectedCategory === 'spells') {
      let item;
      // Try by uuid first, then by actor item id
      try {
        item = await fromUuid(this.selectedItem);
      } catch {
        item = this.actor.items.find(i => i.uuid === this.selectedItem || i.id === this.selectedItem);
      }

      if (!item) return null;

      const description = item.system?.description?.value || '';
      if (description) {
        this.detailHTML = await TextEditor.enrichHTML(description, {
          async: true,
          relativeTo: this.actor,
          rollData: this.actor.getRollData()
        });
      } else {
        this.detailHTML = '<p><em>No description available.</em></p>';
      }

      return {
        name: item.name,
        img: item.img,
        uuid: item.uuid,
        id: item.id,
        level: item.system?.level?.value,
        type: item.type,
        traits: item.system?.traits?.value || [],
        rarity: item.system?.traits?.rarity || 'common'
      };
    } else if (this.selectedCategory === 'skills') {
      const skill = this.actor.system.skills[this.selectedItem];
      if (!skill) return null;

      this.detailHTML = `<p>Current proficiency: <strong>${this._getRankLabel(skill.rank)}</strong></p>
        <p>Retraining a skill increase allows you to move the proficiency increase to a different skill.</p>
        <p><em>Note: You can only reduce by one rank at a time. The replacement skill will gain one rank.</em></p>`;

      return {
        name: this._getSkillName(this.selectedItem),
        rank: skill.rank,
        rankLabel: this._getRankLabel(skill.rank),
        type: 'skill',
        key: this.selectedItem
      };
    }

    return null;
  }

  /**
   * Get enriched details for the replacement item
   */
  async _getReplacementDetails() {
    if (this.selectedCategory === 'feats' || this.selectedCategory === 'spells') {
      let item;
      try {
        item = await fromUuid(this.replacementItem);
      } catch {
        return null;
      }

      if (!item) return null;

      const description = item.system?.description?.value || '';
      if (description) {
        this.replacementDetailHTML = await TextEditor.enrichHTML(description, {
          async: true,
          relativeTo: this.actor,
          rollData: this.actor.getRollData()
        });
      } else {
        this.replacementDetailHTML = '<p><em>No description available.</em></p>';
      }

      return {
        name: item.name,
        img: item.img,
        uuid: item.uuid,
        level: item.system?.level?.value,
        type: item.type,
        traits: item.system?.traits?.value || [],
        rarity: item.system?.traits?.rarity || 'common'
      };
    } else if (this.selectedCategory === 'skills') {
      const skillName = this._getSkillName(this.replacementItem);
      const skill = this.actor.system.skills[this.replacementItem];

      this.replacementDetailHTML = `<p>Will increase <strong>${skillName}</strong> from ${this._getRankLabel(skill?.rank || 0)} to ${this._getRankLabel((skill?.rank || 0) + 1)}.</p>`;

      return {
        name: skillName,
        rank: (skill?.rank || 0) + 1,
        rankLabel: this._getRankLabel((skill?.rank || 0) + 1),
        type: 'skill',
        key: this.replacementItem
      };
    }

    return null;
  }

  // ===========================================================================
  // Time Cost Calculation
  // ===========================================================================

  /**
   * Calculate retraining time cost per PF2e rules
   */
  _calculateTimeCost(itemDetails) {
    if (!itemDetails) return null;

    if (this.selectedCategory === 'feats') {
      const featLevel = itemDetails.level || 1;
      return {
        weeks: featLevel,
        description: `1 week of downtime`,
        rule: `Feats require 1 week of downtime`
      };
    } else if (this.selectedCategory === 'skills') {
      return {
        weeks: 1,
        description: '1 week of downtime',
        rule: 'Skill retraining requires 1 week'
      };
    } else if (this.selectedCategory === 'spells') {
      const rank = itemDetails.rank || itemDetails.level || 0;
      const weeks = Math.max(1, rank);
      return {
        weeks,
        description: `${weeks} week${weeks !== 1 ? 's' : ''} of downtime`,
        rule: rank === 0
          ? 'Cantrip retraining: 1 week'
          : `Spell retraining requires 1 week per spell rank`
      };
    }

    return { weeks: 1, description: '1 week', rule: 'GM discretion' };
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Switch retraining category (feats/skills/spells)
   */
  async _onSelectCategory(event, target) {
    const category = target.dataset.category;
    if (category && category !== this.selectedCategory) {
      this.selectedCategory = category;
      this.selectedItem = null;
      this.replacementItem = null;
      this.detailHTML = '';
      this.replacementDetailHTML = '';

      // Clear cached items to force refresh
      this._retrainableFeats = null;
      this._retrainableSkills = null;
      this._retrainableSpells = null;

      this.render();
    }
  }

  /**
   * Select an item to retrain
   */
  async _onSelectItem(event, target) {
    const uuid = target.dataset.uuid;
    const key = target.dataset.key;
    const identifier = uuid || key;

    if (!identifier) return;

    // Check if blocked
    const blocked = target.dataset.blocked === 'true';
    if (blocked) {
      ui.notifications.warn('This item cannot be retrained because other items depend on it.');
      return;
    }

    this.selectedItem = identifier;
    this.replacementItem = null;
    this.replacementDetailHTML = '';
    this.render();
  }

  /**
   * Open replacement selector
   */
  async _onChooseReplacement(event, target) {
    if (!this.selectedItem) return;

    if (this.selectedCategory === 'feats') {
      await this._openFeatReplacementSelector();
    } else if (this.selectedCategory === 'skills') {
      await this._openSkillReplacementSelector();
    } else if (this.selectedCategory === 'spells') {
      await this._openSpellReplacementSelector();
    }
  }

  /**
   * Open the feat selector to pick a replacement feat
   */
  async _openFeatReplacementSelector() {
    const currentFeat = this.actor.items.find(i =>
      i.uuid === this.selectedItem || i.id === this.selectedItem
    );
    if (!currentFeat) return;

    const featType = this._categorizeFeat(currentFeat);
    const level = currentFeat.system?.level?.taken || this.actor.system.details.level.value;

    // Open feat selector for the same type/level slot
    const selector = new FeatSelectorApp(this.actor, featType, level, null, {
      onSelect: async (uuid) => {
        this.replacementItem = uuid;
        this.render();
      },
      title: `Choose Replacement ${this._getFeatTypeLabel(featType)}`
    });
    selector.render(true);
  }

  /**
   * Open a dialog to pick a replacement skill
   */
  async _openSkillReplacementSelector() {
    const currentSkillKey = this.selectedItem;
    const skills = this.actor.system.skills;
    const currentRank = skills[currentSkillKey]?.rank || 0;

    // Can retrain the increase to any skill that is at least one rank lower
    const eligibleSkills = [];
    for (const [key, skill] of Object.entries(skills)) {
      if (key === currentSkillKey) continue;
      // The replacement skill must be able to gain a rank (rank < 4 or whatever max is)
      if ((skill.rank || 0) < 4) {
        eligibleSkills.push({
          key,
          name: this._getSkillName(key),
          currentRank: skill.rank || 0,
          currentRankLabel: this._getRankLabel(skill.rank || 0),
          newRank: (skill.rank || 0) + 1,
          newRankLabel: this._getRankLabel((skill.rank || 0) + 1)
        });
      }
    }

    eligibleSkills.sort((a, b) => a.name.localeCompare(b.name));

    // Build dialog content
    let content = '<div class="retraining-skill-picker">';
    content += `<p>Choose a skill to gain the rank from <strong>${this._getSkillName(currentSkillKey)}</strong>:</p>`;
    content += '<div class="skill-list">';
    for (const skill of eligibleSkills) {
      content += `<label class="skill-option">
        <input type="radio" name="replacement-skill" value="${skill.key}" />
        <span class="skill-name">${skill.name}</span>
        <span class="skill-rank">${skill.currentRankLabel} → ${skill.newRankLabel}</span>
      </label>`;
    }
    content += '</div></div>';

    const result = await Dialog.prompt({
      title: 'Choose Replacement Skill',
      content,
      callback: (html) => {
        const jq = html instanceof jQuery ? html : $(html);
        const selected = jq.find('input[name="replacement-skill"]:checked').val();
        return selected || null;
      },
      rejectClose: false
    });

    if (result) {
      this.replacementItem = result;
      this.render();
    }
  }

  /**
   * Open the spell selector to pick a replacement spell
   */
  async _openSpellReplacementSelector() {
    const currentSpell = this.actor.items.find(i =>
      i.uuid === this.selectedItem || i.id === this.selectedItem
    );
    if (!currentSpell) return;

    const rank = currentSpell.system?.level?.value ?? currentSpell.rank ?? 0;
    const tradition = SpellHelpers.getSpellTradition(this.actor);

    const selector = new SpellSelectorApp(this.actor, rank, 1, [], {
      tradition,
      onSelect: async (selectedSpells) => {
        if (selectedSpells?.length > 0) {
          this.replacementItem = selectedSpells[0];
          this.render();
        }
      },
      title: `Choose Replacement Spell (Rank ${rank})`
    });
    selector.render(true);
  }

  /**
   * Apply the retraining swap
   */
  async _onApplyRetraining(event, target) {
    if (!this.selectedItem || !this.replacementItem) {
      ui.notifications.warn('Please select both an item to retrain and its replacement.');
      return;
    }

    // Confirm
    const confirmed = await Dialog.confirm({
      title: 'Confirm Retraining',
      content: await this._buildConfirmationContent()
    });

    if (!confirmed) return;

    try {
      if (this.selectedCategory === 'feats') {
        await this._applyFeatRetraining();
      } else if (this.selectedCategory === 'skills') {
        await this._applySkillRetraining();
      } else if (this.selectedCategory === 'spells') {
        await this._applySpellRetraining();
      }

      // Log it
      const details = await this._getSelectedItemDetails();
      const replDetails = await this._getReplacementDetails();
      this.retrainingLog.push({
        time: new Date().toLocaleTimeString(),
        category: this.selectedCategory,
        oldName: details?.name || 'Unknown',
        newName: replDetails?.name || 'Unknown',
        timeCost: this._calculateTimeCost(details)
      });

      // Post chat message
      await this._postRetrainingChatMessage(details, replDetails);

      ui.notifications.success('Retraining applied successfully!');

      // Reset selection
      this.selectedItem = null;
      this.replacementItem = null;
      this.detailHTML = '';
      this.replacementDetailHTML = '';
      this._retrainableFeats = null;
      this._retrainableSkills = null;
      this._retrainableSpells = null;
      this.render();

    } catch (error) {
      console.error(`${MODULE_NAME} | Retraining error:`, error);
      ui.notifications.error(`Retraining failed: ${error.message}`);
    }
  }

  /**
   * Apply feat retraining - remove old feat, add new one
   */
  async _applyFeatRetraining() {
    const oldFeat = this.actor.items.find(i =>
      i.uuid === this.selectedItem || i.id === this.selectedItem
    );
    if (!oldFeat) throw new Error('Original feat not found on actor');

    const newFeatSource = await fromUuid(this.replacementItem);
    if (!newFeatSource) throw new Error('Replacement feat not found');

    // Clone the new feat with the same location/level metadata
    const newFeatData = foundry.utils.duplicate(newFeatSource.toObject());
    newFeatData.system.location = oldFeat.system.location;
    if (newFeatData.system.level) {
      newFeatData.system.level.taken = oldFeat.system?.level?.taken;
    }

    // Delete old, create new
    await this.actor.deleteEmbeddedDocuments('Item', [oldFeat.id]);
    await this.actor.createEmbeddedDocuments('Item', [newFeatData]);

    debugLog('RetrainingWizard', `Retrained feat: ${oldFeat.name} → ${newFeatSource.name}`);
  }

  /**
   * Apply skill retraining - reduce one skill rank, increase another
   */
  async _applySkillRetraining() {
    const oldSkillKey = this.selectedItem;
    const newSkillKey = this.replacementItem;

    const oldRank = this.actor.system.skills[oldSkillKey]?.rank || 0;
    const newRank = this.actor.system.skills[newSkillKey]?.rank || 0;

    if (oldRank <= 0) throw new Error('Cannot reduce skill rank below untrained');
    if (newRank >= 4) throw new Error('Replacement skill is already at legendary');

    await this.actor.update({
      [`system.skills.${oldSkillKey}.rank`]: oldRank - 1,
      [`system.skills.${newSkillKey}.rank`]: newRank + 1
    });

    debugLog('RetrainingWizard', `Retrained skill: ${oldSkillKey} (${oldRank}→${oldRank - 1}) to ${newSkillKey} (${newRank}→${newRank + 1})`);
  }

  /**
   * Apply spell retraining - remove old spell, add new one
   */
  async _applySpellRetraining() {
    const oldSpell = this.actor.items.find(i =>
      i.uuid === this.selectedItem || i.id === this.selectedItem
    );
    if (!oldSpell) throw new Error('Original spell not found on actor');

    const newSpellSource = await fromUuid(this.replacementItem);
    if (!newSpellSource) throw new Error('Replacement spell not found');

    // Clone with same spellcasting entry location
    const newSpellData = foundry.utils.duplicate(newSpellSource.toObject());
    if (!newSpellData.system.location) newSpellData.system.location = {};
    newSpellData.system.location.value = oldSpell.system?.location?.value;
    if (!newSpellData.flags) newSpellData.flags = {};
    if (!newSpellData.flags.core) newSpellData.flags.core = {};
    newSpellData.flags.core.sourceId = this.replacementItem;

    // Delete old, create new
    await this.actor.deleteEmbeddedDocuments('Item', [oldSpell.id]);
    await this.actor.createEmbeddedDocuments('Item', [newSpellData]);

    debugLog('RetrainingWizard', `Retrained spell: ${oldSpell.name} → ${newSpellSource.name}`);
  }

  // ===========================================================================
  // Chat Message
  // ===========================================================================

  async _postRetrainingChatMessage(oldDetails, newDetails) {
    const timeCost = this._calculateTimeCost(oldDetails);
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <h3><i class="fas fa-rotate"></i> Retraining Complete</h3>
        <p><strong>${this.actor.name}</strong> retrained:</p>
        <p>
          <span style="text-decoration: line-through; opacity: 0.6;">${oldDetails?.name || 'Unknown'}</span>
          → <strong>${newDetails?.name || 'Unknown'}</strong>
        </p>
        <p><em>Downtime cost: ${timeCost?.description || 'Unknown'}</em></p>
      `
    };
    await ChatMessage.create(chatData);
  }

  // ===========================================================================
  // Confirmation Dialog
  // ===========================================================================

  async _buildConfirmationContent() {
    const oldDetails = await this._getSelectedItemDetails();
    const newDetails = await this._getReplacementDetails();
    const timeCost = this._calculateTimeCost(oldDetails);

    return `
      <div style="text-align: center; padding: 8px;">
        <h3>Confirm Retraining</h3>
        <p>Remove <strong style="color: #f87171;">${oldDetails?.name || 'Unknown'}</strong></p>
        <p style="font-size: 1.2rem;">↓</p>
        <p>Replace with <strong style="color: #4ade80;">${newDetails?.name || 'Unknown'}</strong></p>
        <hr>
        <p><em>${timeCost?.description || ''}</em></p>
        <p><small>${timeCost?.rule || ''}</small></p>
      </div>
    `;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Categorize a feat by its location/type
   */
  _categorizeFeat(feat) {
    const category = feat.system?.category;
    const traits = feat.system?.traits?.value || [];
    const location = feat.system?.location || '';

    // Archetype feats: have 'archetype' trait regardless of system category
    if (traits.includes('archetype')) return 'archetype';

    // Mythic / Destiny feats
    if (traits.includes('mythic') || traits.includes('destiny')) return 'mythic';
    if (location.startsWith('mythic-')) return 'mythic';

    // Use system.category when available (most reliable for PF2e v6+)
    if (category === 'class') return 'class';
    if (category === 'ancestry') return 'ancestry';
    if (category === 'skill') return 'skill';
    if (category === 'general') return 'general';

    // Fallback to location-based detection
    if (location.startsWith('class-')) return 'class';
    if (location.startsWith('ancestry-')) return 'ancestry';
    if (location.startsWith('skill-')) return 'skill';
    if (location.startsWith('general-')) return 'general';
    if (location.startsWith('archetype-')) return 'archetype';
    if (location.startsWith('xdy_ancestryparagon-')) return 'ancestry';
    if (location.startsWith('xdy_dualclass-')) return 'class';

    // Final fallback: check traits
    if (traits.includes('class')) return 'class';
    if (traits.includes('ancestry')) return 'ancestry';
    if (traits.includes('skill')) return 'skill';
    if (traits.includes('general')) return 'general';

    return 'other';
  }

  _getFeatTypeLabel(type) {
    const labels = {
      class: 'Class Feat',
      ancestry: 'Ancestry Feat',
      skill: 'Skill Feat',
      general: 'General Feat',
      archetype: 'Archetype Feat',
      mythic: 'Mythic Feat',
      ancestryParagon: 'Ancestry Paragon Feat',
      dualclass: 'Dual Class Feat',
      other: 'Feat'
    };
    return labels[type] || 'Feat';
  }

  _inferFeatLevel(feat) {
    const location = feat.system?.location || '';
    const match = location.match(/-(\d+)$/);
    return match ? parseInt(match[1]) : 1;
  }

  _getRankLabel(rank) {
    const labels = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'];
    return labels[rank] || 'Unknown';
  }

  _getSkillName(key) {
    // Try localization first
    try {
      const localized = game.i18n.localize(`PF2E.Skill.${key.charAt(0).toUpperCase() + key.slice(1)}`);
      if (localized && !localized.startsWith('PF2E.')) return localized;
    } catch { /* ignore */ }

    // Fallback to capitalizing the key
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ');
  }

  _parsePrereqRank(prereqText) {
    if (prereqText.includes('legendary')) return 4;
    if (prereqText.includes('master')) return 3;
    if (prereqText.includes('expert')) return 2;
    if (prereqText.includes('trained')) return 1;
    return 0;
  }

  _onClearSelection(event, target) {
    this.selectedItem = null;
    this.replacementItem = null;
    this.detailHTML = '';
    this.replacementDetailHTML = '';
    this.render();
  }

  _onCancel(event, target) {
    this.close();
  }
}

export default RetrainingWizardApp;
