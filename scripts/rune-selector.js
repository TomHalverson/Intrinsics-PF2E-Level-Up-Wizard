import { debugLog } from './module.js';
import dataProvider from './data-provider.js';

export class RuneSelectorApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor, maxRunes, currentSelections = [], options = {}) {
    super();
    this.actor = actor;
    this.maxRunes = maxRunes;
    this.currentSelections = Array.isArray(currentSelections) ? currentSelections : [];
    this.knownRunes = Array.isArray(options.knownRunes) ? options.knownRunes : [];
    this.levelCap = Number.isInteger(Number(options.levelCap)) ? Number(options.levelCap) : (actor.system?.details?.level?.value ?? 20);

    this.searchQuery = '';
    this.showUncommon = true;
    this.showRare = false;
    this.showSelectedOnly = false;
    this.minLevel = this._getDefaultMinLevel();
    this.maxLevel = this.levelCap;

    this.activeRune = null;
    this.scrollPosition = 0;
    this.onConfirm = options.onConfirm || (() => {});
  }

  static DEFAULT_OPTIONS = {
    id: 'rune-selector-{id}',
    tag: 'div',
    classes: ['intrinsics-level-up-wizard', 'spell-selector-app', 'rune-selector-app'],
    window: {
      title: 'Select Runes',
      icon: 'fa-solid fa-gem',
      resizable: true
    },
    position: {
      width: 980,
      height: 760
    },
    actions: {
      toggleRuneSelection: RuneSelectorApp.prototype._onToggleRuneSelection,
      previewRune: RuneSelectorApp.prototype._onPreviewRune,
      updateFilters: RuneSelectorApp.prototype._onUpdateFilters,
      updateSearch: RuneSelectorApp.prototype._onUpdateSearch,
      resetFilters: RuneSelectorApp.prototype._onResetFilters,
      confirm: RuneSelectorApp.prototype._onConfirm,
      cancel: RuneSelectorApp.prototype._onCancel
    }
  };

  static PARTS = {
    form: {
      template: 'modules/intrinsics-pf2e-level-up-wizard/templates/rune-selector.hbs'
    }
  };

  get title() {
    return 'Select Runes';
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const runes = await this._getFilteredRunes();
    const selectedRuneSummaries = await this._getSelectedRuneSummaries();

    let activeRuneDetails = null;
    if (this.activeRune) {
      const rune = await fromUuid(this.activeRune);
      activeRuneDetails = await this._prepareRuneDetails(rune);
    }

    return {
      ...context,
      maxRunes: this.maxRunes,
      searchQuery: this.searchQuery,
      showUncommon: this.showUncommon,
      showRare: this.showRare,
      showSelectedOnly: this.showSelectedOnly,
      levelCap: this.levelCap,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      runes,
      runeCount: runes.length,
      activeRune: this.activeRune,
      activeRuneDetails,
      currentSelections: this.currentSelections,
      selectedRuneSummaries,
      hasSelectedRunes: selectedRuneSummaries.length > 0,
      hasActiveFilters: this._hasActiveFilters(),
      selectionsCount: this.currentSelections.length,
      canSelectMore: this.currentSelections.length < this.maxRunes,
      canConfirm: this.currentSelections.length > 0
    };
  }

  _saveScrollPosition() {
    const element = this.element;
    if (!element) return;
    const container = element.querySelector('.spell-list-container');
    if (container) {
      this.scrollPosition = container.scrollTop;
    }
  }

  _saveFocusState() {
    const element = this.element;
    if (!element) return;

    const activeElement = element.querySelector(':focus');
    if (!activeElement) return;

    if (activeElement.classList.contains('filter-search')) {
      this._focusedInput = {
        selector: '.filter-search',
        cursorPos: activeElement.selectionStart
      };
    } else if (activeElement.classList.contains('filter-level-input')) {
      this._focusedInput = {
        selector: `.filter-level-input[data-filter="${activeElement.dataset.filter}"]`,
        cursorPos: activeElement.selectionStart
      };
    } else {
      this._focusedInput = null;
    }
  }

  _restoreFocusState() {
    if (!this._focusedInput) return;

    const element = this.element;
    if (!element) return;

    const input = element.querySelector(this._focusedInput.selector);
    if (input) {
      setTimeout(() => {
        input.focus();
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

    const element = this.element;
    if (!element) return;

    element.querySelectorAll('.spell-preview-description').forEach(desc => {
      TextEditor.activateListeners(desc);
    });

    const listContainer = element.querySelector('.spell-list-container');
    if (listContainer) {
      if (!this._scrollListenerAdded) {
        listContainer.addEventListener('scroll', () => {
          this.scrollPosition = listContainer.scrollTop;
        });
        this._scrollListenerAdded = true;
      }

      if (this.scrollPosition > 0) {
        setTimeout(() => {
          listContainer.scrollTop = this.scrollPosition;
        }, 0);
      }
    }

    const searchInput = element.querySelector('.filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        this._onUpdateSearch(event, event.target);
      });
    }

    const runeCards = element.querySelectorAll('.spell-card[data-rune-uuid]');
    runeCards.forEach(card => {
      card.addEventListener('click', (event) => {
        const interactive = event.target.closest('button, a, input, select, textarea, label');
        if (interactive) return;
        this._onPreviewRune(event, card);
      });
    });

    const levelInputs = element.querySelectorAll('.filter-level-input');
    levelInputs.forEach(input => {
      input.addEventListener('input', (event) => {
        clearTimeout(this._levelFilterTimeout);
        this._levelFilterTimeout = setTimeout(async () => {
          this._saveScrollPosition();
          this._saveFocusState();
          await this._onUpdateFilters(event, event.target);
        }, 250);
      });
    });

    this._restoreFocusState();
  }

  async _getFilteredRunes() {
    let filtered = await dataProvider.getRunes({
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      knownRunes: this.knownRunes
    });

    filtered = filtered.filter(rune => {
      const rarity = rune.system?.traits?.rarity || 'common';
      if (rarity === 'uncommon' && !this.showUncommon) return false;
      if (rarity === 'rare' && !this.showRare) return false;
      return true;
    });

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(rune =>
        rune.name.toLowerCase().includes(query) ||
        rune.system?.description?.value?.toLowerCase().includes(query)
      );
    }

    if (this.showSelectedOnly) {
      filtered = filtered.filter(rune => this.currentSelections.includes(rune.uuid));
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    filtered = await Promise.all(filtered.map(async rune => {
      let enrichedDescription = rune.system?.description?.value || '';
      if (enrichedDescription) {
        enrichedDescription = await TextEditor.enrichHTML(enrichedDescription, {
          async: true,
          relativeTo: this.actor,
          rollData: this.actor.getRollData()
        });
      }

      return {
        ...rune,
        uuid: rune.uuid,
        isSelected: this.currentSelections.includes(rune.uuid),
        rarity: rune.system?.traits?.rarity || 'common',
        rarityClass: this._getRarityClass(rune.system?.traits?.rarity || 'common'),
        level: rune.system?.level?.value ?? 0,
        traits: rune.system?.traits?.value || [],
        enrichedDescription
      };
    }));

    debugLog('RuneSelector', `Filtered to ${filtered.length} runes`);
    return filtered;
  }

  _getRarityClass(rarity) {
    switch (rarity) {
      case 'uncommon': return 'rarity-uncommon';
      case 'rare': return 'rarity-rare';
      case 'unique': return 'rarity-unique';
      default: return 'rarity-common';
    }
  }

  _getDefaultMinLevel() {
    if (this.levelCap <= 5) return 0;
    return Math.max(0, this.levelCap - 5);
  }

  _hasActiveFilters() {
    return Boolean(
      this.searchQuery ||
      !this.showUncommon ||
      this.showRare ||
      this.showSelectedOnly ||
      this.minLevel !== 0 ||
      this.maxLevel !== 20
    );
  }

  async _getSelectedRuneSummaries() {
    const summaries = [];
    for (const runeUuid of this.currentSelections) {
      try {
        const rune = await fromUuid(runeUuid);
        if (!rune) continue;
        summaries.push({
          uuid: runeUuid,
          name: rune.name,
          levelLabel: `L${rune.system?.level?.value ?? 0}`
        });
      } catch {
        summaries.push({ uuid: runeUuid, name: runeUuid, levelLabel: '' });
      }
    }
    return summaries;
  }

  async _prepareRuneDetails(rune) {
    if (!rune) return null;

    let description = rune.system?.description?.value || '';
    if (description) {
      description = await TextEditor.enrichHTML(description, {
        async: true,
        relativeTo: this.actor,
        rollData: this.actor.getRollData()
      });
    }

    return {
      uuid: rune.uuid,
      name: rune.name,
      level: rune.system?.level?.value ?? 0,
      rarity: rune.system?.traits?.rarity || 'common',
      traits: rune.system?.traits?.value || [],
      description
    };
  }

  async _onUpdateSearch(event, target) {
    this.searchQuery = target.value;

    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(async () => {
      this._saveScrollPosition();
      this._saveFocusState();
      await this.render();
    }, 300);
  }

  async _onUpdateFilters(event, target) {
    const filterType = target.dataset.filter;

    switch (filterType) {
      case 'uncommon':
        this.showUncommon = target.checked;
        break;
      case 'rare':
        this.showRare = target.checked;
        break;
      case 'selectedOnly':
        this.showSelectedOnly = target.checked;
        break;
      case 'minLevel':
        this.minLevel = Math.max(0, Math.min(parseInt(target.value) || 0, this.levelCap));
        if (this.minLevel > this.maxLevel) {
          this.maxLevel = this.minLevel;
        }
        break;
      case 'maxLevel':
        this.maxLevel = Math.max(0, Math.min(parseInt(target.value) || this.levelCap, this.levelCap));
        if (this.maxLevel < this.minLevel) {
          this.minLevel = this.maxLevel;
        }
        break;
    }

    this._saveScrollPosition();
    this._saveFocusState();
    await this.render();
  }

  async _onPreviewRune(event, target) {
    const runeUuid = target.dataset.runeUuid;
    this.activeRune = this.activeRune === runeUuid ? null : runeUuid;
    this._saveScrollPosition();
    await this.render();
  }

  async _onToggleRuneSelection(event, target) {
    event.preventDefault();
    const runeUuid = target.dataset.runeUuid;
    if (!runeUuid) return;

    if (this.currentSelections.includes(runeUuid)) {
      this.currentSelections = this.currentSelections.filter(uuid => uuid !== runeUuid);
    } else {
      if (this.currentSelections.length >= this.maxRunes) {
        ui.notifications.warn(`You can only select ${this.maxRunes} rune(s).`);
        return;
      }
      this.currentSelections.push(runeUuid);
    }

    this._saveScrollPosition();
    await this.render();
  }

  async _onResetFilters(event, target) {
    this.searchQuery = '';
    this.showUncommon = true;
    this.showRare = false;
    this.showSelectedOnly = false;
    this.minLevel = this._getDefaultMinLevel();
    this.maxLevel = this.levelCap;
    this._saveScrollPosition();
    await this.render();
  }

  async _onConfirm(event, target) {
    await this.onConfirm([...this.currentSelections]);
    this.close();
  }

  async _onCancel(event, target) {
    this.close();
  }
}

export default RuneSelectorApp;
