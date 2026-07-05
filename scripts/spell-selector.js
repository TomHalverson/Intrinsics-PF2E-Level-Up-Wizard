// Spell Selector Application
import { MODULE_NAME, debugLog } from './module.js';
import dataProvider from './data-provider.js';
import * as SpellHelpers from './helpers/spell-helpers.js';

const PRIORITY_SPELL_TAGS = [
  { key: 'attack', label: 'Attack' },
  { key: 'exploration', label: 'Exploration' },
  { key: 'healing', label: 'Healing' },
  { key: 'teleportation', label: 'Teleportation' },
  { key: 'illusion', label: 'Illusion' },
  { key: 'summon', label: 'Summon' }
];

/**
 * Spell Selector - Modal for selecting spells
 */
export class SpellSelectorApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor, rank, maxSpells, currentSelections = [], options = {}) {
    super();
    this.actor = actor;
    this.rank = rank; // 0 = cantrips, 1-10 = spell levels (used as default for filters)
    this.maxSpells = maxSpells; // Maximum number of spells that can be selected
    this.currentSelections = Array.isArray(currentSelections) ? currentSelections : [];
    this.knownSpells = options.knownSpells || []; // UUIDs of spells the character already knows

    // Spell tradition (can be manually overridden)
    this.selectedTradition = null; // Manual override
    this.autoDetectedTradition = SpellHelpers.getSpellTradition(this.actor);

    // State
    this.searchQuery = '';
    this.showUncommon = game.settings.get(MODULE_NAME, 'spell-selector-show-uncommon');
    this.showRare = game.settings.get(MODULE_NAME, 'spell-selector-show-rare');
    this.showCantrips = rank === 0; // Include cantrips if selecting cantrips
    this.traitFilter = ''; // Trait search
    this.tagFilter = 'all'; // Filter by important spell tags
    this.showSelectedOnly = false; // Narrow list to selected spells only
    // Set initial rank filter range based on selected rank
    this.minLevel = rank === 0 ? 0 : rank; // Minimum spell rank for filter
    this.maxLevel = rank === 0 ? 0 : rank; // Maximum spell rank for filter
    this.groupBy = game.settings.get(MODULE_NAME, 'spell-selector-group-by');
    if (this.groupBy === 'school') this.groupBy = 'tag';
    this.collapsedGroups = new Set();

    // UI state
    this.activeSpell = null; // Spell currently shown in preview
    this.comparisonMode = false;
    this.comparisonSpells = []; // Up to 3 spells for comparison
    this.scrollPosition = 0; // Store scroll position for preservation

    // Callback when spells are confirmed
    this.onConfirm = options.onConfirm || (() => {});
  }

  static DEFAULT_OPTIONS = {
    id: 'spell-selector-{id}',
    tag: 'div',
    classes: ['intrinsics-level-up-wizard', 'spell-selector-app'],
    window: {
      title: 'Select Spells',
      icon: 'fa-solid fa-sparkles',
      resizable: true
    },
    position: {
      width: 980,
      height: 760
    },
    actions: {
      toggleSpell: SpellSelectorApp.prototype._onToggleSpell,
      toggleSpellSelection: SpellSelectorApp.prototype._onToggleSpellSelection,
      previewSpell: SpellSelectorApp.prototype._onPreviewSpell,
      compareToggle: SpellSelectorApp.prototype._onCompareToggle,
      addToCompare: SpellSelectorApp.prototype._onAddToCompare,
      removeFromCompare: SpellSelectorApp.prototype._onRemoveFromCompare,
      updateSearch: SpellSelectorApp.prototype._onUpdateSearch,
      updateFilters: SpellSelectorApp.prototype._onUpdateFilters,
      changeTradition: SpellSelectorApp.prototype._onChangeTradition,
      speakPreview: SpellSelectorApp.prototype._onSpeakPreview,
      toggleGroup: SpellSelectorApp.prototype._onToggleGroup,
      resetFilters: SpellSelectorApp.prototype._onResetFilters,
      confirm: SpellSelectorApp.prototype._onConfirm,
      cancel: SpellSelectorApp.prototype._onCancel
    }
  };

  static PARTS = {
    form: {
      template: 'modules/intrinsics-pf2e-level-up-wizard/templates/spell-selector.hbs'
    }
  };

  get title() {
    const rankName = this.rank === 0 ? 'Cantrips' : this.rank.toString();
    return game.i18n.format('intrinsics-pf2e-level-up-wizard.titles.spell-selector', {
      rank: rankName
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get all available spells
    const spells = await this._getFilteredSpells();
    const tagOptionSpells = await this._getTagOptionSpells();
    const spellGroups = this._getSpellGroups(spells);
    const selectedSpellSummaries = await this._getSelectedSpellSummaries();

    // Get active spell details if one is selected
    let activeSpellDetails = null;
    if (this.activeSpell) {
      const spell = await fromUuid(this.activeSpell);
      activeSpellDetails = await this._prepareSpellDetails(spell);
    }

    // Get comparison spell details
    let comparisonDetails = [];
    if (this.comparisonMode && this.comparisonSpells.length > 0) {
      for (const spellUuid of this.comparisonSpells) {
        const spell = await fromUuid(spellUuid);
        const details = await this._prepareSpellDetails(spell);
        comparisonDetails.push(details);
      }
    }

    // Get current spell tradition (manual selection or auto-detected)
    const activeTradition = this.selectedTradition || this.autoDetectedTradition;

    return {
      ...context,
      actor: this.actor,
      rank: this.rank,
      rankName: this.rank === 0 ? 'Cantrips' : `Rank ${this.rank}`,
      maxSpells: this.maxSpells,

      // Tradition info
      tradition: activeTradition,
      autoDetectedTradition: this.autoDetectedTradition,
      selectedTradition: this.selectedTradition,
      traditions: [
        { value: 'arcane', label: 'Arcane', selected: activeTradition === 'arcane' },
        { value: 'divine', label: 'Divine', selected: activeTradition === 'divine' },
        { value: 'occult', label: 'Occult', selected: activeTradition === 'occult' },
        { value: 'primal', label: 'Primal', selected: activeTradition === 'primal' }
      ],

      // Filters
      searchQuery: this.searchQuery,
      showUncommon: this.showUncommon,
      showRare: this.showRare,
      showCantrips: this.showCantrips,
      traitFilter: this.traitFilter,
      tagFilter: this.tagFilter,
      showSelectedOnly: this.showSelectedOnly,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      groupBy: this.groupBy,
      tagOptions: this._getAvailableTags(tagOptionSpells),
      groupOptions: [
        { value: 'none', label: 'No Grouping', selected: this.groupBy === 'none' },
        { value: 'rank', label: 'Group by Rank', selected: this.groupBy === 'rank' },
        { value: 'tag', label: 'Group by Tag', selected: this.groupBy === 'tag' }
      ],

      // Spells
      spells: spells,
      spellGroups: spellGroups,
      hasSpellGroups: spellGroups.length > 0,
      canCollapseGroups: spellGroups.length > 0 && this.groupBy !== 'none',
      spellCount: spells.length,

      // UI state
      activeSpell: this.activeSpell,
      activeSpellDetails: activeSpellDetails,
      activeSpellSelected: this.activeSpell && this.currentSelections.includes(this.activeSpell),
      comparisonMode: this.comparisonMode,
      comparisonSpells: this.comparisonSpells,
      comparisonDetails: comparisonDetails,
      canAddToCompare: this.comparisonSpells.length < 3,

      // Current selections
      currentSelections: this.currentSelections,
      selectedSpellSummaries: selectedSpellSummaries,
      hasSelectedSpells: selectedSpellSummaries.length > 0,
      hasActiveFilters: this._hasActiveFilters(),
      selectionsCount: this.currentSelections.length,
      canSelectMore: this.currentSelections.length < this.maxSpells,
      canConfirm: this.currentSelections.length > 0
    };
  }

  /**
   * Save current scroll position before re-render
   */
  _saveScrollPosition() {
    const element = this.element;
    if (element) {
      const spellListContainer = element.querySelector('.spell-list-container');
      if (spellListContainer) {
        this.scrollPosition = spellListContainer.scrollTop;
      }
    }
  }

  /**
   * Save the currently focused input before render
   */
  _saveFocusState() {
    const element = this.element;
    if (!element) return;
    
    const activeElement = element.querySelector(':focus');
    if (activeElement) {
      // Store the selector to find this element again after render
      if (activeElement.classList.contains('filter-search')) {
        // Determine which search input it is by checking data-filter attribute or position
        const filterType = activeElement.dataset.filter;
        if (filterType === 'trait') {
          this._focusedInput = { selector: '.filter-search[data-filter="trait"]', cursorPos: activeElement.selectionStart };
        } else {
          this._focusedInput = { selector: '.filter-search:not([data-filter])', cursorPos: activeElement.selectionStart };
        }
      } else if (activeElement.classList.contains('filter-level-input')) {
        this._focusedInput = {
          selector: `.filter-level-input[data-filter="${activeElement.dataset.filter}"]`,
          cursorPos: activeElement.selectionStart
        };
      } else {
        this._focusedInput = null;
      }
    }
  }

  /**
   * Restore focus to the previously focused input after render
   */
  _restoreFocusState() {
    if (!this._focusedInput) return;
    
    const element = this.element;
    if (!element) return;
    
    const input = element.querySelector(this._focusedInput.selector);
    if (input) {
      // Use setTimeout to ensure the DOM is fully ready
      setTimeout(() => {
        input.focus();
        // Restore cursor position if possible
        if (this._focusedInput.cursorPos !== undefined && input.setSelectionRange) {
          const pos = this._focusedInput.cursorPos;
          input.setSelectionRange(pos, pos);
        }
      }, 0);
    }
    
    this._focusedInput = null;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Activate listeners for enriched HTML content (for @UUID links to work)
    const element = this.element;
    if (element) {
      // Activate listeners for preview panel descriptions
      element.querySelectorAll('.spell-preview-description').forEach(desc => {
        TextEditor.activateListeners(desc);
      });

      // Activate listeners for card descriptions (left side)
      element.querySelectorAll('.spell-card-description').forEach(desc => {
        TextEditor.activateListeners(desc);
      });

      // Scroll position preservation
      const spellListContainer = element.querySelector('.spell-list-container');
      if (spellListContainer) {
        // Add scroll listener only once (check if not already added)
        if (!this._scrollListenerAdded) {
          spellListContainer.addEventListener('scroll', () => {
            this.scrollPosition = spellListContainer.scrollTop;
          });
          this._scrollListenerAdded = true;
        }

        // Restore scroll position after render (use setTimeout to ensure DOM is ready)
        if (this.scrollPosition > 0) {
          setTimeout(() => {
            spellListContainer.scrollTop = this.scrollPosition;
          }, 0);
        }
      }

      // Manually attach change listener for tradition select (select elements don't trigger data-action)
      // Note: We attach this on every render because ApplicationV2 recreates the DOM
      const traditionSelect = element.querySelector('#tradition-select');
      if (traditionSelect) {
        traditionSelect.addEventListener('change', (event) => {
          this._onChangeTradition(event, event.target);
        });
      }

      const tagSelect = element.querySelector('.filter-select[data-filter="tag"]');
      if (tagSelect) {
        tagSelect.addEventListener('change', (event) => {
          this._onUpdateFilters(event, event.target);
        });
      }

      const groupSelect = element.querySelector('.filter-select[data-filter="groupBy"]');
      if (groupSelect) {
        groupSelect.addEventListener('change', (event) => {
          this._onUpdateFilters(event, event.target);
        });
      }

      // Manually attach input listeners for search and trait filter (ApplicationV2 actions don't work well with input events)
      const searchInputs = element.querySelectorAll('.filter-search');
      searchInputs.forEach((input, index) => {
        input.addEventListener('input', (event) => {
          // First search input is the main search, second is trait filter
          if (index === 0) {
            this._onUpdateSearch(event, event.target);
          } else {
            this._onUpdateFilters(event, event.target);
          }
        });
      });

      const levelInputs = element.querySelectorAll('.filter-level-input');
      levelInputs.forEach((input) => {
        input.addEventListener('input', (event) => {
          clearTimeout(this._levelFilterTimeout);
          this._levelFilterTimeout = setTimeout(async () => {
            this._saveScrollPosition();
            this._saveFocusState();
            await this._onUpdateFilters(event, event.target);
          }, 250);
        });
      });

      // Restore focus to search input if it was focused before render
      this._restoreFocusState();
    }
  }

  async _getFilteredSpells() {
    // Use manually selected tradition, or fall back to auto-detected
    const tradition = this.selectedTradition || this.autoDetectedTradition;

    debugLog('SpellSelector', `Getting spells for tradition: ${tradition} (selected: ${this.selectedTradition}, auto: ${this.autoDetectedTradition})`);

    if (!tradition) {
      ui.notifications.warn('Unable to determine spell tradition. Please select one manually.');
      return [];
    }

    // Get existing spells to exclude
    const existingSpells = this.actor.items.filter(i => i.type === 'spell');

    // Load spells for all ranks in the selected range
    let allSpells = [];
    for (let rank = this.minLevel; rank <= this.maxLevel; rank++) {
      debugLog('SpellSelector', `Loading rank ${rank} spells for ${tradition} tradition...`);
      const rankedSpells = await dataProvider.getSpells({
        rank: rank,
        tradition: tradition,
        rarity: undefined, // Get all rarities
        knownSpells: existingSpells
      });
      debugLog('SpellSelector', `Received ${rankedSpells.length} rank ${rank} ${tradition} spells`);
      allSpells = allSpells.concat(rankedSpells);
    }

    debugLog('SpellSelector', `Loaded ${allSpells.length} total spells (ranks ${this.minLevel}-${this.maxLevel}, tradition: ${tradition})`);

    // Apply additional filters
    let filtered = allSpells;

    // Rarity filter
    filtered = filtered.filter(spell => {
      const rarity = spell.system.traits?.rarity || 'common';

      if (rarity === 'common') return true;
      if (rarity === 'uncommon' && this.showUncommon) return true;
      if ((rarity === 'rare' || rarity === 'unique') && this.showRare) return true;

      return false;
    });

    // Cantrip filter - exclude cantrips unless showCantrips is true
    if (!this.showCantrips) {
      filtered = filtered.filter(spell => {
        const traits = spell.system.traits?.value || [];
        return !traits.includes('cantrip'); // Exclude spells with cantrip trait
      });
    }

    // Filter out already-known spells
    if (this.knownSpells && this.knownSpells.length > 0) {
      filtered = filtered.filter(spell => {
        return !this.knownSpells.includes(spell.uuid);
      });
    }

    // Search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(spell =>
        spell.name.toLowerCase().includes(query) ||
        spell.system.description?.value?.toLowerCase().includes(query)
      );
    }

    // Trait filter
    if (this.traitFilter) {
      const traitQuery = this.traitFilter.toLowerCase();
      filtered = filtered.filter(spell => {
        const traits = spell.system.traits?.value || [];
        return traits.some(trait => trait.toLowerCase().includes(traitQuery));
      });
    }

    // Important tag filter
    if (this.tagFilter && this.tagFilter !== 'all') {
      filtered = filtered.filter(spell => {
        const tags = this._getImportantSpellTags(spell);
        return this.tagFilter === 'other'
          ? tags.length === 0
          : tags.includes(this.tagFilter);
      });
    }

    // Selected-only filter
    if (this.showSelectedOnly) {
      filtered = filtered.filter(spell => this.currentSelections.includes(spell.uuid));
    }

    // Note: Level range filter is now applied during loading (lines 186-193)
    // No need to filter again here since we only loaded spells in the selected range

    // Sort alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    // Add selection state, rarity info, and enriched description to each spell
    filtered = await Promise.all(filtered.map(async spell => {
      const importantTags = this._getImportantSpellTags(spell);
      const primaryTag = importantTags[0] || 'other';

      // Enrich description for @UUID links, @Damage, @Check, etc. in card view
      let enrichedDescription = spell.system.description?.value || '';
      if (enrichedDescription) {
        enrichedDescription = await TextEditor.enrichHTML(enrichedDescription, {
          async: true,
          relativeTo: this.actor,
          rollData: this.actor.getRollData()
        });
      }

      return {
        ...spell,
        uuid: spell.uuid, // Explicitly include uuid since it's a getter
        isSelected: this.currentSelections.includes(spell.uuid),
        rarity: spell.system.traits?.rarity || 'common',
        rarityClass: this._getRarityClass(spell.system.traits?.rarity || 'common'),
        importantTags,
        primaryTag,
        primaryTagLabel: this._getSpellTagLabel(primaryTag),
        enrichedDescription: enrichedDescription
      };
    }));

    debugLog('SpellSelector', `Filtered to ${filtered.length} spells`);

    return filtered;
  }

  async _getTagOptionSpells() {
    const tradition = this.selectedTradition || this.autoDetectedTradition;
    if (!tradition) return [];

    const existingSpells = this.actor.items.filter(i => i.type === 'spell');
    let allSpells = [];

    for (let rank = this.minLevel; rank <= this.maxLevel; rank++) {
      const rankedSpells = await dataProvider.getSpells({
        rank,
        tradition,
        rarity: undefined,
        knownSpells: existingSpells
      });
      allSpells = allSpells.concat(rankedSpells);
    }

    let filtered = allSpells.filter(spell => {
      const rarity = spell.system.traits?.rarity || 'common';
      if (rarity === 'uncommon' && !this.showUncommon) return false;
      if (rarity === 'rare' && !this.showRare) return false;
      return true;
    });

    if (!this.showCantrips) {
      filtered = filtered.filter(spell => {
        const traits = spell.system.traits?.value || [];
        return !traits.includes('cantrip');
      });
    }

    if (this.knownSpells && this.knownSpells.length > 0) {
      filtered = filtered.filter(spell => !this.knownSpells.includes(spell.uuid));
    }

    if (this.traitFilter) {
      const traitQuery = this.traitFilter.toLowerCase();
      filtered = filtered.filter(spell => {
        const traits = spell.system.traits?.value || [];
        return traits.some(trait => trait.toLowerCase().includes(traitQuery));
      });
    }

    return filtered.map(spell => ({
      ...spell,
      importantTags: this._getImportantSpellTags(spell)
    }));
  }

  _getImportantSpellTags(spell) {
    const traits = (spell.system.traits?.value || []).map(trait => String(trait).toLowerCase());
    const name = spell.name?.toLowerCase() || '';
    const slug = spell.slug?.toLowerCase() || '';
    const description = spell.system.description?.value?.toLowerCase() || '';

    return PRIORITY_SPELL_TAGS
      .filter(({ key }) => {
        if (key === 'summon') {
          return traits.includes('summon') || name.includes('summon') || slug.includes('summon') || description.includes('summon');
        }

        return traits.includes(key);
      })
      .map(({ key }) => key);
  }

  _getSpellTagLabel(tagKey) {
    if (tagKey === 'other') return 'Other';
    return PRIORITY_SPELL_TAGS.find(tag => tag.key === tagKey)?.label || tagKey;
  }

  _getAvailableTags(spells) {
    const tags = new Set();
    let hasOther = false;

    for (const spell of spells) {
      const spellTags = spell.importantTags || this._getImportantSpellTags(spell);
      if (spellTags.length === 0) {
        hasOther = true;
        continue;
      }

      for (const tag of spellTags) tags.add(tag);
    }

    return [
      { value: 'all', label: 'All Tags', selected: this.tagFilter === 'all' },
      ...PRIORITY_SPELL_TAGS.filter(tag => tags.has(tag.key)).map(tag => ({
        value: tag.key,
        label: tag.label,
        selected: this.tagFilter === tag.key
      })),
      ...(hasOther ? [{ value: 'other', label: 'Other', selected: this.tagFilter === 'other' }] : [])
    ];
  }

  _getSpellGroups(spells) {
    if (this.groupBy === 'none') {
      return [];
    }

    const groups = new Map();

    for (const spell of spells) {
      const groupKey = this.groupBy === 'tag'
        ? (spell.primaryTag || 'other')
        : `${spell.system.level?.value ?? 0}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: this.groupBy === 'tag'
            ? this._getSpellTagLabel(groupKey)
            : (Number(groupKey) === 0 ? 'Cantrips' : `Rank ${groupKey}`),
          collapsed: this.collapsedGroups.has(groupKey),
          spells: []
        });
      }

      groups.get(groupKey).spells.push(spell);
    }

    const sortedGroups = Array.from(groups.values());
    sortedGroups.sort((a, b) => {
      if (this.groupBy === 'rank') return Number(a.key) - Number(b.key);
      return a.label.localeCompare(b.label);
    });

    return sortedGroups;
  }

  _hasActiveFilters() {
    const defaultMinLevel = this.rank === 0 ? 0 : this.rank;
    const defaultMaxLevel = this.rank === 0 ? 0 : this.rank;
    return Boolean(
      this.searchQuery ||
      this.traitFilter ||
      this.tagFilter !== 'all' ||
      this.showSelectedOnly ||
      this.showCantrips !== (this.rank === 0) ||
      this.minLevel !== defaultMinLevel ||
      this.maxLevel !== defaultMaxLevel ||
      this.showUncommon !== game.settings.get(MODULE_NAME, 'spell-selector-show-uncommon') ||
      this.showRare !== game.settings.get(MODULE_NAME, 'spell-selector-show-rare') ||
      this.groupBy !== game.settings.get(MODULE_NAME, 'spell-selector-group-by')
    );
  }

  _persistPreferences() {
    game.settings.set(MODULE_NAME, 'spell-selector-show-uncommon', this.showUncommon);
    game.settings.set(MODULE_NAME, 'spell-selector-show-rare', this.showRare);
    game.settings.set(MODULE_NAME, 'spell-selector-group-by', this.groupBy);
  }

  async _getSelectedSpellSummaries() {
    const selectedSpells = [];

    for (const spellUuid of this.currentSelections) {
      try {
        const spell = await fromUuid(spellUuid);
        if (!spell) continue;

        selectedSpells.push({
          uuid: spellUuid,
          name: spell.name,
          rank: spell.system.level?.value ?? 0,
          rankLabel: (spell.system.level?.value ?? 0) === 0 ? 'Cantrip' : `Rank ${spell.system.level?.value ?? 0}`
        });
      } catch (error) {
        debugLog('SpellSelector._getSelectedSpellSummaries', `Failed to load selected spell ${spellUuid}`, error);
      }
    }

    return selectedSpells.sort((a, b) => a.name.localeCompare(b.name));
  }

  async _prepareSpellDetails(spell) {
    if (!spell) return null;

    // Enrich description HTML for @UUID links, @Damage, @Check, etc.
    let enrichedDescription = spell.system.description?.value || '';
    if (enrichedDescription) {
      enrichedDescription = await TextEditor.enrichHTML(enrichedDescription, {
        async: true,
        relativeTo: this.actor,
        rollData: this.actor.getRollData()
      });
    }

    return {
      uuid: spell.uuid,
      name: spell.name,
      rank: spell.system.level?.value || 0,
      img: spell.img,
      description: enrichedDescription,
      traits: spell.system.traits?.value || [],
      importantTagLabels: this._getImportantSpellTags(spell).map(tag => this._getSpellTagLabel(tag)),
      traditions: spell.system.traits?.traditions || [],
      rarity: spell.system.traits?.rarity || 'common',
      importantTags: this._getImportantSpellTags(spell),
      castTime: spell.system.time?.value,
      components: spell.system.components || {},
      range: spell.system.range?.value,
      area: spell.system.area?.value,
      targets: spell.system.target?.value,
      duration: spell.system.duration?.value,
      damage: spell.system.damage?.value,
      save: spell.system.save?.value
    };
  }

  /**
   * Get CSS class for rarity badge
   */
  _getRarityClass(rarity) {
    const rarityMap = {
      'common': 'rarity-common',
      'uncommon': 'rarity-uncommon',
      'rare': 'rarity-rare',
      'unique': 'rarity-unique'
    };
    return rarityMap[rarity] || 'rarity-common';
  }

  /**
   * Update only the spell list without re-rendering the entire application
   * This preserves input focus and scroll position
   */
  async _updateSpellListOnly() {
    const element = this.element;
    if (!element) return;

    // Get filtered spells
    const spells = await this._getFilteredSpells();

    // Update spell count display
    const spellCountEl = element.querySelector('.spell-count');
    if (spellCountEl) {
      spellCountEl.textContent = spells.length;
    }

    const spellInfoEl = element.querySelector('.spell-list-info span');
    if (spellInfoEl) {
      spellInfoEl.textContent = game.i18n.format('intrinsics-pf2e-level-up-wizard.messages.info.spell-count', { count: spells.length });
    }

    // Update spell list container
    const listContainer = element.querySelector('.spell-list-container');
    if (!listContainer) return;

    // Build new HTML for spell list
    const html = this._renderSpellList(spells);

    listContainer.innerHTML = html;

    // Restore scroll position
    if (this.scrollPosition > 0) {
      listContainer.scrollTop = this.scrollPosition;
    }

    // Re-activate listeners for enriched HTML content
    listContainer.querySelectorAll('.spell-card-description').forEach(desc => {
      TextEditor.activateListeners(desc);
    });
  }

  _renderSpellList(spells) {
    if (!spells.length) {
      return `<div class="spell-list-empty">
        <i class="fas fa-search"></i>
        <p>${game.i18n.localize('intrinsics-pf2e-level-up-wizard.messages.info.no-spells-available')}</p>
      </div>`;
    }

    const groups = this._getSpellGroups(spells);
    if (!groups.length) {
      return spells.map(spell => this._renderSpellCard(spell)).join('');
    }

    return groups.map(group => this._renderSpellGroup(group)).join('');
  }

  _renderSpellGroup(group) {
    return `<div class="spell-group">
      <div class="spell-group-header">
        <button type="button" class="spell-group-toggle" data-action="toggleGroup" data-group-key="${group.key}">
          <i class="fas ${group.collapsed ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
          <span class="spell-group-title">${group.label}</span>
        </button>
        <span class="spell-group-count">${group.spells.length}</span>
      </div>
      <div class="spell-group-list ${group.collapsed ? 'collapsed' : ''}">
        ${group.spells.map(spell => this._renderSpellCard(spell)).join('')}
      </div>
    </div>`;
  }

  /**
   * Render a single spell card HTML
   */
  _renderSpellCard(spell) {
    const isActive = spell.uuid === this.activeSpell;
    const isSelected = spell.isSelected;
    const rarityClass = spell.rarityClass || '';
    const rarity = spell.rarity || 'common';

    let html = `<div class="spell-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}"
         data-action="previewSpell"
         data-spell-uuid="${spell.uuid}">`;

    html += `<div class="spell-card-header">`;
    html += `<img src="${spell.img}" alt="${spell.name}" class="spell-card-icon">`;
    html += `<div class="spell-card-info">`;
    html += `<div class="spell-card-title">${spell.name}`;
    html += `<span class="spell-card-rank">${spell.system.level.value === 0 ? 'Cantrip' : `Rank ${spell.system.level.value}`}</span>`;
    if (rarity !== 'common') {
      html += `<span class="rarity-badge ${rarityClass}">${rarity.charAt(0).toUpperCase() + rarity.slice(1)}</span>`;
    }
    html += `</div>`;
    if (spell.primaryTagLabel && spell.primaryTag !== 'other') {
      html += `<div class="spell-card-school">${spell.primaryTagLabel}</div>`;
    }
    html += `</div>`;

    if (isSelected) {
      html += `<div class="spell-card-selected"><i class="fas fa-check-circle"></i></div>`;
    }
    html += `</div>`;

    // Traits
    const traits = spell.system.traits?.value || [];
    if (traits.length > 0) {
      html += `<div class="spell-card-traits">`;
      for (const trait of traits) {
        html += `<span class="trait-badge trait-badge-small">${trait}</span>`;
      }
      html += `</div>`;
    }

    // Description snippet
    if (spell.system.description?.value) {
      const plainText = spell.system.description.value.replace(/<[^>]*>/g, '');
      const truncated = plainText.length > 150 ? `${plainText.substring(0, 150)}...` : plainText;
      html += `<div class="spell-card-description">${truncated}</div>`;
    }

    html += `<div class="spell-card-meta">`;
    if (spell.system.time?.value) {
      html += `<span><i class="fas fa-clock"></i> ${spell.system.time.value}</span>`;
    }
    if (spell.system.range?.value) {
      html += `<span><i class="fas fa-arrows-alt"></i> ${spell.system.range.value}</span>`;
    }
    html += `</div>`;

    html += `<div class="spell-card-toggle" data-action="toggleSpell" data-spell-uuid="${spell.uuid}">`;
    html += isSelected
      ? `<i class="fas fa-minus-circle"></i> Remove`
      : `<i class="fas fa-plus-circle"></i> Add`;
    html += `</div>`;

    html += `</div>`;
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  async _onToggleSpell(event, target) {
    event.stopPropagation(); // Prevent triggering preview
    event.preventDefault(); // Prevent default action

    const spellUuid = target.dataset.spellUuid;

    if (this.currentSelections.includes(spellUuid)) {
      // Remove from selections
      this.currentSelections = this.currentSelections.filter(uuid => uuid !== spellUuid);
    } else {
      // Add to selections (if not at max)
      if (this.currentSelections.length < this.maxSpells) {
        this.currentSelections.push(spellUuid);
      } else {
        ui.notifications.warn(`You can only select ${this.maxSpells} spell(s) at this rank.`);
        return;
      }
    }

    this._saveScrollPosition();
    await this.render();
  }

  async _onPreviewSpell(event, target) {
    const spellUuid = target.dataset.spellUuid;

    // Toggle preview
    if (this.activeSpell === spellUuid) {
      this.activeSpell = null;
    } else {
      this.activeSpell = spellUuid;
    }

    this._saveScrollPosition();
    await this.render();
  }

  async _onUpdateSearch(event, target) {
    this.searchQuery = target.value;

    // Debounce search - use partial update to preserve input focus
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(async () => {
      this._saveScrollPosition();
      await this._updateSpellListOnly();
    }, 300);
  }

  async _onUpdateFilters(event, target) {
    const filterType = target.dataset.filter;

    switch (filterType) {
      case 'uncommon':
        this.showUncommon = target.checked;
        this._persistPreferences();
        break;
      case 'rare':
        this.showRare = target.checked;
        this._persistPreferences();
        break;
      case 'cantrips':
        this.showCantrips = target.checked;
        break;
      case 'trait':
        this.traitFilter = target.value;
        // Debounce trait filter - use partial update to preserve input focus
        clearTimeout(this._traitFilterTimeout);
        this._traitFilterTimeout = setTimeout(async () => {
          this._saveScrollPosition();
          await this._updateSpellListOnly();
        }, 300);
        return; // Early return since we're handling render in the timeout
      case 'minLevel':
        this.minLevel = parseInt(target.value) || 0;
        break;
      case 'maxLevel':
        this.maxLevel = parseInt(target.value) || 10;
        break;
      case 'tag':
        this.tagFilter = target.value;
        break;
      case 'selectedOnly':
        this.showSelectedOnly = target.checked;
        break;
      case 'groupBy':
        this.groupBy = target.value;
        this._persistPreferences();
        break;
    }

    this._saveScrollPosition();
    this._saveFocusState();
    await this.render();
  }

  async _onChangeTradition(event, target) {
    const newTradition = target.value;

    debugLog('SpellSelector._onChangeTradition', `Called with newTradition: ${newTradition}`);
    debugLog('SpellSelector._onChangeTradition', `this is:`, this);
    debugLog('SpellSelector._onChangeTradition', `this.constructor.name: ${this.constructor.name}`);
    debugLog('SpellSelector._onChangeTradition', `Current this.selectedTradition: ${this.selectedTradition}`);
    debugLog('SpellSelector._onChangeTradition', `Current this.autoDetectedTradition: ${this.autoDetectedTradition}`);

    // Check against the currently active tradition (which might be auto-detected or manually selected)
    const currentActiveTradition = this.selectedTradition || this.autoDetectedTradition;

    // Don't do anything if tradition hasn't actually changed
    if (currentActiveTradition === newTradition) {
      debugLog('SpellSelector._onChangeTradition', `Tradition unchanged, returning`);
      return;
    }

    // Warn if user has selections that will be cleared
    if (this.currentSelections.length > 0) {
      const confirmed = await Dialog.confirm({
        title: 'Change Spell Tradition?',
        content: `<p>Changing the spell tradition will clear your current selections (${this.currentSelections.length} spell(s)).</p><p>Are you sure you want to continue?</p>`,
        defaultYes: false
      });

      if (!confirmed) {
        // User cancelled - revert the dropdown to the current tradition
        // Force a re-render to reset the dropdown
        debugLog('SpellSelector._onChangeTradition', `User cancelled, reverting`);
        await this.render();
        return;
      }
    }

    debugLog('SpellSelector._onChangeTradition', `Setting this.selectedTradition = ${newTradition}`);
    this.selectedTradition = newTradition;
    debugLog('SpellSelector._onChangeTradition', `After setting, this.selectedTradition = ${this.selectedTradition}`);

    // Clear active spell since it won't exist in the new tradition
    this.activeSpell = null;

    // Clear current selections since those spells don't exist in the new tradition
    this.currentSelections = [];

    // Reset scroll position since we're showing a completely different spell list
    this.scrollPosition = 0;

    debugLog('SpellSelector._onChangeTradition', `About to render with tradition: ${this.selectedTradition}`);

    await this.render();
  }

  async _onToggleGroup(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const groupKey = target.dataset.groupKey || target.closest('[data-group-key]')?.dataset.groupKey;
    if (!groupKey) return;

    if (this.collapsedGroups.has(groupKey)) {
      this.collapsedGroups.delete(groupKey);
    } else {
      this.collapsedGroups.add(groupKey);
    }

    this._saveScrollPosition();
    await this.render();
  }

  async _onResetFilters(event, target) {
    this.searchQuery = '';
    this.traitFilter = '';
    this.tagFilter = 'all';
    this.showSelectedOnly = false;
    this.showUncommon = game.settings.get(MODULE_NAME, 'spell-selector-show-uncommon');
    this.showRare = game.settings.get(MODULE_NAME, 'spell-selector-show-rare');
    this.showCantrips = this.rank === 0;
    this.minLevel = this.rank === 0 ? 0 : this.rank;
    this.maxLevel = this.rank === 0 ? 0 : this.rank;
    this.groupBy = game.settings.get(MODULE_NAME, 'spell-selector-group-by');
    this.collapsedGroups.clear();

    this._saveScrollPosition();
    await this.render();
  }

  async _onToggleSpellSelection(event, target) {
    event.preventDefault();
    const spellUuid = target.dataset.spellUuid;

    if (!spellUuid) {
      console.warn('Spell Selector | No spell UUID provided to toggleSpellSelection');
      return;
    }

    if (this.currentSelections.includes(spellUuid)) {
      // Remove from selections
      this.currentSelections = this.currentSelections.filter(uuid => uuid !== spellUuid);
    } else {
      // Add to selections (if not at max)
      if (this.currentSelections.length < this.maxSpells) {
        this.currentSelections.push(spellUuid);
      } else {
        ui.notifications.warn(`You can only select ${this.maxSpells} spell(s) at this rank.`);
        return;
      }
    }

    this._saveScrollPosition();
    await this.render();
  }

  async _onCompareToggle(event, target) {
    this.comparisonMode = !this.comparisonMode;

    if (!this.comparisonMode) {
      this.comparisonSpells = [];
    }

    this._saveScrollPosition();
    await this.render();
  }

  async _onAddToCompare(event, target) {
    const spellUuid = target.dataset.spellUuid;

    if (this.comparisonSpells.length >= 3) {
      ui.notifications.warn('You can only compare up to 3 spells at once.');
      return;
    }

    if (!this.comparisonSpells.includes(spellUuid)) {
      this.comparisonSpells.push(spellUuid);
      this._saveScrollPosition();
      await this.render();
    }
  }

  async _onRemoveFromCompare(event, target) {
    const spellUuid = target.dataset.spellUuid;
    const index = this.comparisonSpells.indexOf(spellUuid);

    if (index > -1) {
      this.comparisonSpells.splice(index, 1);
      this._saveScrollPosition();
      await this.render();
    }
  }

  async _onSpeakPreview(event, target) {
    event.preventDefault();
    event.stopPropagation();

    // Find the preview panel to get the TTS text
    const previewPanel = this.element.querySelector('.spell-preview-panel[data-tts]');
    if (!previewPanel) return;

    const text = previewPanel.getAttribute('data-tts');
    if (!text || text.trim() === '.' || text.trim() === '') return;

    // Import and use TTSHelper
    const { TTSHelper } = await import('./helpers/tts-helper.js');
    TTSHelper.toggle(text, target);
  }

  async _onConfirm(event, target) {
    if (this.currentSelections.length === 0) {
      ui.notifications.warn('Please select at least one spell.');
      return;
    }

    debugLog('SpellSelector._onConfirm', 'Confirming with selections:', this.currentSelections);

    // Call callback with selections
    await this.onConfirm(this.currentSelections);

    // Close modal
    await this.close();
  }

  async _onCancel(event, target) {
    await this.close();
  }
}
