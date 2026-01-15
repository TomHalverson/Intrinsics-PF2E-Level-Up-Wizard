/**
 * Feat Selector Application
 * Enhanced feat selection modal with preview, comparison, and filtering
 */

import dataProvider from './data-provider.js';
import { checkPrerequisites, hasArchetypeDedication } from './helpers/feat-helpers.js';

export class FeatSelectorApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor, featType, targetLevel, currentSelection = null, options = {}) {
    super(options);
    this.actor = actor;
    this.featType = featType;
    this.targetLevel = targetLevel;
    this.currentSelection = currentSelection;

    // State
    this.searchQuery = '';
    this.selectedLevel = 'all';
    this.minLevel = 1; // Minimum feat level
    this.maxLevel = targetLevel; // Maximum feat level (defaults to target level)
    this.showUncommon = true; // Show uncommon by default
    this.showRare = false; // Don't show rare by default

    this.archetypeSearchQuery = ''; // Search by archetype/dedication name
    this.skillFilter = 'all'; // Filter skill feats by specific skill
    this.sortMethod = game.settings.get('intrinsics-pf2e-level-up-wizard', 'feat-sort-method');

    // UI state
    this.activeFeat = null; // Feat currently shown in preview
    this.comparisonMode = false;
    this.comparisonFeats = []; // Up to 3 feats for comparison
    this.scrollPosition = 0; // Store scroll position for preservation

    // Kineticist Gate filtering
    this.showGateFilter = false; // Whether to highlight elemental traits based on gates
    this.actorGates = []; // Gates the actor has (e.g., ['fire', 'metal'])
    this._initKineticistGates();

    // Callback when feat is selected
    this.onSelect = options.onSelect || (() => {});
  }

  static DEFAULT_OPTIONS = {
    id: 'feat-selector-{id}',
    tag: 'div',
    classes: ['feat-selector-app'],
    window: {
      title: 'Select Feat',
      icon: 'fa-solid fa-fist-raised',
      resizable: true
    },
    position: {
      width: 900,
      height: 700
    },
    actions: {
      selectFeat: FeatSelectorApp.prototype._onSelectFeat,
      previewFeat: FeatSelectorApp.prototype._onPreviewFeat,
      compareToggle: FeatSelectorApp.prototype._onCompareToggle,
      addToCompare: FeatSelectorApp.prototype._onAddToCompare,
      removeFromCompare: FeatSelectorApp.prototype._onRemoveFromCompare,
      updateSearch: FeatSelectorApp.prototype._onUpdateSearch,
      updateFilters: FeatSelectorApp.prototype._onUpdateFilters,
      confirm: FeatSelectorApp.prototype._onConfirm,
      cancel: FeatSelectorApp.prototype._onCancel
    }
  };

  static PARTS = {
    form: {
      template: 'modules/intrinsics-pf2e-level-up-wizard/templates/feat-selector.hbs'
    }
  };

  get title() {
    // Map feat type to localization key
    const typeMap = {
      'classFeats': 'class',
      'ancestryFeats': 'ancestry',
      'skillFeats': 'skill',
      'generalFeats': 'general',
      'freeArchetypeFeats': 'archetype',
      'mythicFeats': 'mythic',
      'destinyFeats': 'destiny',
      'ancestryParagonFeats': 'ancestryParagon',
      'dualClassFeats': 'dualClass'
    };

    const typeKey = typeMap[this.featType] || this.featType;
    const type = game.i18n.localize(`intrinsics-pf2e-level-up-wizard.labels.feat-type.${typeKey}`);
    return game.i18n.format('intrinsics-pf2e-level-up-wizard.titles.feat-selector', {
      featType: type,
      level: this.targetLevel
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get all available feats
    const feats = await this._getFilteredFeats();

    // Group feats by archetype if archetype feats
    const groupedFeats = this._groupFeatsByArchetype(feats);

    // Get active feat details if one is selected
    let activeFeatDetails = null;
    if (this.activeFeat) {
      const feat = await fromUuid(this.activeFeat);
      activeFeatDetails = await this._prepareFeatDetails(feat);
    }

    // Get comparison feat details
    let comparisonDetails = [];
    if (this.comparisonMode && this.comparisonFeats.length > 0) {
      for (const featUuid of this.comparisonFeats) {
        const feat = await fromUuid(featUuid);
        const details = await this._prepareFeatDetails(feat);
        comparisonDetails.push(details);
      }
    }

    return {
      ...context,
      actor: this.actor,
      featType: this.featType,
      targetLevel: this.targetLevel,

      // Filters
      searchQuery: this.searchQuery,
      selectedLevel: this.selectedLevel,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      showUncommon: this.showUncommon,
      showRare: this.showRare,

      archetypeSearchQuery: this.archetypeSearchQuery,
      skillFilter: this.skillFilter,
      isSkillFeats: this.featType === 'skillFeats',
      availableSkills: this._getAvailableSkills(),
      sortMethod: this.sortMethod,

      // Available archetypes for dropdown (for free archetype feats)
      availableArchetypes: this.featType === 'freeArchetypeFeats' ? this._getAvailableArchetypes(feats) : [],
      isFreeArchetype: this.featType === 'freeArchetypeFeats',

      // Feats
      feats: feats,
      groupedFeats: groupedFeats,
      hasArchetypes: groupedFeats.length > 0,
      featCount: feats.length,

      // UI state
      activeFeat: this.activeFeat,
      activeFeatDetails: activeFeatDetails,
      comparisonMode: this.comparisonMode,
      comparisonFeats: this.comparisonFeats,
      comparisonDetails: comparisonDetails,
      canAddToCompare: this.comparisonFeats.length < 3,

      // Current selection
      currentSelection: this.currentSelection,

      // Kineticist Gate filtering
      isKineticist: this._isKineticist(),
      showGateFilter: this.showGateFilter,
      actorGates: this.actorGates,
      actorGatesDisplay: this.actorGates.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ') || 'None'
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Activate listeners for enriched HTML content (for @UUID links to work)
    const element = this.element;
    if (element) {
      element.querySelectorAll('.feat-preview-description, .feat-comparison-description').forEach(desc => {
        TextEditor.activateListeners(desc);
      });

      // Manually attach input listener for search (ApplicationV2 actions don't work well with input events)
      const searchInput = element.querySelector('.filter-search');
      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          this._onUpdateSearch(event, event.target);
        });
      }

      // Attach listener for archetype search input
      const archetypeSearchInput = element.querySelector('.archetype-search');
      if (archetypeSearchInput) {
        archetypeSearchInput.addEventListener('input', (event) => {
          this._onUpdateArchetypeSearch(event, event.target);
        });
      }

      // Manually attach change listener for skill filter select (select elements don't trigger data-action properly)
      const skillFilterSelect = element.querySelector('.skill-filter-group .filter-select');
      if (skillFilterSelect) {
        skillFilterSelect.addEventListener('change', (event) => {
          this.skillFilter = event.target.value;
          this._saveScrollPosition();
          this.render();
        });
      }

      // Scroll position preservation
      const featListContainer = element.querySelector('.feat-list-container');
      if (featListContainer) {
        // Add scroll listener only once (check if not already added)
        if (!this._scrollListenerAdded) {
          featListContainer.addEventListener('scroll', () => {
            this.scrollPosition = featListContainer.scrollTop;
          });
          this._scrollListenerAdded = true;
        }

        // Restore scroll position after render (use setTimeout to ensure DOM is ready)
        if (this.scrollPosition > 0) {
          setTimeout(() => {
            featListContainer.scrollTop = this.scrollPosition;
          }, 0);
        }
      }
    }
  }

  async _getFilteredFeats() {
    // Build search queries based on feat type
    let searchQueries = [];

    switch (this.featType) {
      case 'classFeats':
        const classItem = this.actor.class;
        if (!classItem) return [];
        const classSlug = classItem.slug || classItem.name?.toLowerCase().replace(/\s+/g, '-');
        searchQueries = [classSlug, 'class'];
        break;

      case 'ancestryFeats':
        const ancestryItem = this.actor.ancestry;
        if (!ancestryItem) return [];
        searchQueries = [ancestryItem.slug, 'ancestry'];
        break;

      case 'skillFeats':
        searchQueries = ['skill'];
        break;

      case 'generalFeats':
        searchQueries = ['general'];
        break;

      case 'freeArchetypeFeats':
        searchQueries = ['archetype'];
        break;

      case 'mythicFeats':
        // Level 12 (tier 3) can choose destiny OR mythic
        if (this.targetLevel === 12) {
          searchQueries = ['mythic', 'destiny'];
        } else {
          searchQueries = ['mythic'];
        }
        break;

      case 'destinyFeats':
        searchQueries = ['destiny'];
        break;

      default:
        searchQueries = [];
    }

    // Get existing feats on actor (pass the full objects, not just UUIDs)
    const existingFeats = this.actor.itemTypes.feat || [];

    // Map feat type to PF2e category
    const categoryMap = {
      'classFeats': 'class',
      'ancestryFeats': 'ancestry',
      'skillFeats': 'skill',
      'generalFeats': 'general',
      'freeArchetypeFeats': null, // Archetypes are filtered by trait, not category
      'mythicFeats': null, // Mythic filtered by trait
      'destinyFeats': null, // Destiny filtered by trait
      'ancestryParagonFeats': 'ancestry',
      'dualClassFeats': 'class'
    };

    // Get feats from data provider
    const allFeats = await dataProvider.getFeats({
      category: categoryMap[this.featType],
      maxLevel: this.targetLevel,
      traits: searchQueries,
      existingFeats: existingFeats,
      sortMethod: this.sortMethod
    });

    console.log(`Feat Selector: Loaded ${allFeats.length} feats for ${this.featType} at level ${this.targetLevel}`);

    // Apply additional filters
    let filtered = allFeats;

    // Filter out dedication feats from class feat selector (they belong in archetype/free archetype)
    if (this.featType === 'classFeats') {
      filtered = filtered.filter(feat => {
        const traits = feat.system.traits?.value || [];
        return !traits.includes('dedication');
      });
    }

    // Search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(feat =>
        feat.name.toLowerCase().includes(query) ||
        feat.system.description?.value?.toLowerCase().includes(query)
      );
    }

    // Level range filter
    // Use range if specified, otherwise use selectedLevel dropdown for backwards compatibility
    if (this.selectedLevel !== 'all') {
      const level = parseInt(this.selectedLevel);
      filtered = filtered.filter(feat => feat.system.level?.value === level);
    } else if (this.minLevel > 1 || this.maxLevel < this.targetLevel) {
      // Apply range filter if user has changed from defaults
      filtered = filtered.filter(feat => {
        const featLevel = feat.system.level?.value || 0;
        return featLevel >= this.minLevel && featLevel <= this.maxLevel;
      });
    }

    // Rarity filter
    filtered = filtered.filter(feat => {
      const rarity = feat.system.traits?.rarity || 'common';

      if (rarity === 'common') return true;
      if (rarity === 'uncommon' && this.showUncommon) return true;
      if ((rarity === 'rare' || rarity === 'unique') && this.showRare) return true;

      return false;
    });

    // Dedication search (for free archetype feats) - filter by prerequisites containing "{search} dedication"
    if (this.archetypeSearchQuery && this.featType === 'freeArchetypeFeats') {
      const dedicationQuery = this.archetypeSearchQuery.toLowerCase();
      filtered = filtered.filter(feat => {
        const prerequisites = feat.system.prerequisites?.value || [];
        // Check if any prerequisite contains both the search term AND "dedication"
        return prerequisites.some(prereq => {
          const prereqText = (prereq.value || prereq || '').toLowerCase();
          return prereqText.includes(dedicationQuery) && prereqText.includes('dedication');
        });
      });
    }

    // Skill filter (for skill feats) - filter by specific skill in prerequisites
    if (this.skillFilter && this.skillFilter !== 'all' && this.featType === 'skillFeats') {
      const skillToMatch = this.skillFilter.toLowerCase();
      filtered = filtered.filter(feat => {
        // Check prerequisites for skill requirements (e.g., "trained in Athletics", "expert in Occultism")
        const prerequisites = feat.system.prerequisites?.value || [];
        const hasSkillPrereq = prerequisites.some(prereq => {
          const prereqText = (prereq.value || prereq || '').toLowerCase();
          return prereqText.includes(skillToMatch);
        });

        // Also check traits for skill-specific traits (some feats use skill:acrobatics format)
        const traits = feat.system.traits?.value || [];
        const hasSkillTrait = traits.some(trait => {
          const traitLower = trait.toLowerCase();
          return traitLower === `skill:${skillToMatch}` || traitLower === skillToMatch;
        });

        return hasSkillPrereq || hasSkillTrait;
      });
    }

    // Check prerequisites for each feat and add display properties
    // Create new objects to avoid modifying read-only Foundry documents
    const enrichedFeats = filtered.map(feat => {
      const rarity = feat.system.traits?.rarity || 'common';
      const isArchetype = feat.system.traits?.value?.includes('archetype');
      const archetypeName = isArchetype ? this._extractArchetypeName(feat) : null;

      // Format prerequisites for display
      let prerequisitesText = '';
      const prereqs = feat.system.prerequisites?.value || [];
      if (prereqs.length > 0) {
        prerequisitesText = prereqs.map(p => {
          if (typeof p === 'string') return p;
          return p.value || p;
        }).join('; ');
      }

      // Check prerequisites and determine CSS class
      const prereqCheck = checkPrerequisites(this.actor, feat);
      let prereqClass = '';
      if (prereqCheck.meets === true) {
        prereqClass = 'prereq-met'; // Green - all prerequisites met
      } else if (prereqCheck.meets === false) {
        prereqClass = 'prereq-unmet'; // Red - prerequisites not met
      } else {
        prereqClass = 'prereq-unknown'; // Grey - can't determine
      }

      // Add gate status for each trait (for Kineticist elemental highlighting)
      const traitsWithGateStatus = (feat.system.traits?.value || []).map(trait => ({
        name: trait,
        gateStatus: this.showGateFilter ? this._getGateStatus(trait) : ''
      }));

      return {
        ...feat,
        uuid: feat.uuid, // Explicitly include uuid since it's a getter
        prerequisitesMet: prereqCheck.meets,
        prerequisitesText: prerequisitesText, // Formatted prerequisites string
        prerequisitesClass: prereqClass, // CSS class for color coding
        featTypeName: this._getFeatTypeName(feat),
        rarity: rarity,
        rarityClass: this._getRarityClass(rarity),
        traitsWithGateStatus: traitsWithGateStatus, // For Kineticist gate highlighting
        needsDedication: isArchetype &&
                        archetypeName &&
                        !feat.name.toLowerCase().includes('dedication') &&
                        !hasArchetypeDedication(this.actor, archetypeName)
      };
    });

    return enrichedFeats;
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
   * Get list of available archetypes from feats
   */
  _getAvailableArchetypes(feats) {
    const archetypeSet = new Set();
    for (const feat of feats) {
      const archetypeName = this._extractArchetypeName(feat);
      if (archetypeName) {
        archetypeSet.add(archetypeName);
      }
    }
    return Array.from(archetypeSet).sort();
  }

  /**
   * Get list of available skills for the skill filter dropdown
   */
  _getAvailableSkills() {
    // Standard PF2e skills
    const skills = [
      { key: 'acrobatics', name: 'Acrobatics' },
      { key: 'arcana', name: 'Arcana' },
      { key: 'athletics', name: 'Athletics' },
      { key: 'crafting', name: 'Crafting' },
      { key: 'deception', name: 'Deception' },
      { key: 'diplomacy', name: 'Diplomacy' },
      { key: 'intimidation', name: 'Intimidation' },
      { key: 'medicine', name: 'Medicine' },
      { key: 'nature', name: 'Nature' },
      { key: 'occultism', name: 'Occultism' },
      { key: 'performance', name: 'Performance' },
      { key: 'religion', name: 'Religion' },
      { key: 'society', name: 'Society' },
      { key: 'stealth', name: 'Stealth' },
      { key: 'survival', name: 'Survival' },
      { key: 'thievery', name: 'Thievery' }
    ];

    // Add lore as an option
    skills.push({ key: 'lore', name: 'Lore' });

    return skills;
  }

  /**
   * Check if the actor is a Kineticist
   */
  _isKineticist() {
    const classItem = this.actor.class;
    if (!classItem) return false;
    const classSlug = classItem.slug || classItem.name?.toLowerCase().replace(/\s+/g, '-');
    return classSlug === 'kineticist';
  }

  /**
   * Initialize Kineticist Gates from actor's class features
   */
  _initKineticistGates() {
    if (!this._isKineticist()) return;

    // The six elemental gates in PF2e Kineticist
    const gateElements = ['air', 'earth', 'fire', 'metal', 'water', 'wood'];

    // Look for Gate class features on the actor
    // Gates are typically named "Fire Gate", "Metal Gate", etc.
    const actorFeatures = this.actor.itemTypes.feat || [];
    const actorClassFeatures = this.actor.itemTypes.feature || [];
    const allItems = [...actorFeatures, ...actorClassFeatures];

    this.actorGates = [];

    for (const item of allItems) {
      const itemName = item.name?.toLowerCase() || '';
      for (const element of gateElements) {
        if (itemName.includes(`${element} gate`) || itemName === `${element}`) {
          if (!this.actorGates.includes(element)) {
            this.actorGates.push(element);
          }
        }
      }
    }

    console.log(`Feat Selector: Kineticist detected with gates: ${this.actorGates.join(', ')}`);
  }

  /**
   * Get the list of elemental traits for Kineticist Gate checking
   */
  static get ELEMENTAL_TRAITS() {
    return ['air', 'earth', 'fire', 'metal', 'water', 'wood'];
  }

  /**
   * Check if a trait is an elemental trait
   */
  _isElementalTrait(trait) {
    return FeatSelectorApp.ELEMENTAL_TRAITS.includes(trait.toLowerCase());
  }

  /**
   * Get gate status for an elemental trait
   * Returns 'has-gate' if player has the gate, 'missing-gate' if not, '' if not elemental
   */
  _getGateStatus(trait) {
    if (!this._isElementalTrait(trait)) return '';
    return this.actorGates.includes(trait.toLowerCase()) ? 'has-gate' : 'missing-gate';
  }

  _groupFeatsByArchetype(feats) {
    if (this.featType !== 'freeArchetypeFeats') {
      return [];
    }

    const archetypes = new Map();

    for (const feat of feats) {
      if (feat.system.traits?.value?.includes('archetype')) {
        const archetypeName = this._extractArchetypeName(feat);
        if (archetypeName) {
          if (!archetypes.has(archetypeName)) {
            archetypes.set(archetypeName, {
              name: archetypeName,
              feats: [],
              hasDedication: hasArchetypeDedication(this.actor, archetypeName)
            });
          }
          archetypes.get(archetypeName).feats.push(feat);
        }
      }
    }

    return Array.from(archetypes.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  _extractArchetypeName(feat) {
    // Extract archetype name from feat name
    // E.g., "Champion Dedication" -> "Champion"
    // E.g., "Champion's Reaction" -> "Champion"
    const name = feat.name;

    if (name.includes('Dedication')) {
      return name.replace('Dedication', '').trim();
    }

    // Check if feat has archetype trait value
    const archetypeTrait = feat.system.traits?.value?.find(t =>
      t !== 'archetype' && t.endsWith('-archetype')
    );

    if (archetypeTrait) {
      return archetypeTrait.replace('-archetype', '').replace(/-/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    // Fallback: try to extract from name
    const match = name.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    return match ? match[1] : null;
  }

  async _prepareFeatDetails(feat) {
    if (!feat) return null;

    // Format prerequisites for display
    let prerequisitesText = '';
    const prereqs = feat.system.prerequisites?.value || [];
    if (prereqs.length > 0) {
      prerequisitesText = prereqs.map(p => {
        if (typeof p === 'string') return p;
        return p.value || p;
      }).join('; ');
    }

    // Enrich description HTML for @UUID links
    let enrichedDescription = feat.system.description?.value || '';
    if (enrichedDescription) {
      enrichedDescription = await TextEditor.enrichHTML(enrichedDescription, {
        async: true,
        relativeTo: this.actor
      });
    }

    // Add gate status for traits (for Kineticist highlighting in preview)
    const traits = feat.system.traits?.value || [];
    const traitsWithGateStatus = traits.map(trait => ({
      name: trait,
      gateStatus: this.showGateFilter ? this._getGateStatus(trait) : ''
    }));

    return {
      uuid: feat.uuid,
      name: feat.name,
      level: feat.system.level?.value || 0,
      type: this._getFeatTypeName(feat),
      img: feat.img,
      description: enrichedDescription,
      traits: traits,
      traitsWithGateStatus: traitsWithGateStatus,
      rarity: feat.system.traits?.rarity || 'common',
      prerequisites: prerequisitesText,
      prerequisitesMet: checkPrerequisites(this.actor, feat),
      actions: feat.system.actionType?.value,
      frequency: feat.system.frequency?.value,
      trigger: feat.system.trigger?.value
    };
  }

  _getFeatTypeName(feat) {
    const traits = feat.system.traits?.value || [];

    if (traits.includes('class')) return 'Class Feat';
    if (traits.includes('ancestry')) return 'Ancestry Feat';
    if (traits.includes('skill')) return 'Skill Feat';
    if (traits.includes('general')) return 'General Feat';
    if (traits.includes('archetype')) return 'Archetype Feat';
    if (traits.includes('mythic')) return 'Mythic Feat';
    if (traits.includes('destiny')) return 'Destiny Feat';

    return 'Feat';
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  async _onSelectFeat(event, target) {
    event.preventDefault();
    const featUuid = target.dataset.featUuid;

    if (this.comparisonMode) {
      // In comparison mode, select for comparison
      await this._onAddToCompare(event, target);
    } else {
      // Confirm selection and close
      this.currentSelection = featUuid;
      await this._onConfirm(event, target);
    }
  }

  /**
   * Save current scroll position from the DOM
   */
  _saveScrollPosition() {
    const element = this.element;
    if (element) {
      const featListContainer = element.querySelector('.feat-list-container');
      if (featListContainer) {
        this.scrollPosition = featListContainer.scrollTop;
      }
    }
  }

  async _onPreviewFeat(event, target) {
    event.preventDefault();
    const featUuid = target.dataset.featUuid;

    // Save scroll position before render
    this._saveScrollPosition();

    // Set as current selection
    this.currentSelection = featUuid;

    // Toggle preview
    if (this.activeFeat === featUuid) {
      this.activeFeat = null;
    } else {
      this.activeFeat = featUuid;
    }

    await this.render();
  }

  async _onCompareToggle(event, target) {
    // Save scroll position before render
    this._saveScrollPosition();

    this.comparisonMode = !this.comparisonMode;

    if (!this.comparisonMode) {
      this.comparisonFeats = [];
    }

    await this.render();
  }

  async _onAddToCompare(event, target) {
    const featUuid = target.dataset.featUuid;

    if (this.comparisonFeats.length >= 3) {
      ui.notifications.warn('You can only compare up to 3 feats at once.');
      return;
    }

    if (!this.comparisonFeats.includes(featUuid)) {
      // Save scroll position before render
      this._saveScrollPosition();

      this.comparisonFeats.push(featUuid);
      await this.render();
    }
  }

  async _onRemoveFromCompare(event, target) {
    const featUuid = target.dataset.featUuid;
    const index = this.comparisonFeats.indexOf(featUuid);

    if (index > -1) {
      // Save scroll position before render
      this._saveScrollPosition();

      this.comparisonFeats.splice(index, 1);
      await this.render();
    }
  }

  async _onUpdateSearch(event, target) {
    this.searchQuery = target.value;

    // Debounce search
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(async () => {
      await this.render();
    }, 300);
  }

  async _onUpdateFilters(event, target) {
    const filterType = target.dataset.filter;

    switch (filterType) {
      case 'level':
        this.selectedLevel = target.value;
        break;
      case 'minLevel':
        this.minLevel = parseInt(target.value) || 1;
        break;
      case 'maxLevel':
        this.maxLevel = parseInt(target.value) || this.targetLevel;
        break;
      case 'uncommon':
        this.showUncommon = target.checked;
        break;
      case 'rare':
        this.showRare = target.checked;
        break;
      case 'sort':
        this.sortMethod = target.value;
        break;
      case 'gateFilter':
        this.showGateFilter = target.checked;
        break;
      case 'archetypeSearch':
        this.archetypeSearchQuery = target.value;
        break;
      case 'skillFilter':
        this.skillFilter = target.value;
        break;
    }

    // Save scroll position before render
    this._saveScrollPosition();

    await this.render();
  }

  /**
   * Handle archetype search input (with debounce)
   * Updates only the feat list without full re-render to preserve input focus
   */
  async _onUpdateArchetypeSearch(event, target) {
    this.archetypeSearchQuery = target.value;

    // Debounce search
    clearTimeout(this._archetypeSearchTimeout);
    this._archetypeSearchTimeout = setTimeout(async () => {
      this._saveScrollPosition();
      await this._updateFeatListOnly();
    }, 300);
  }

  /**
   * Update only the feat list without re-rendering the entire application
   * This preserves input focus and scroll position
   */
  async _updateFeatListOnly() {
    const element = this.element;
    if (!element) return;

    // Get filtered feats
    const feats = await this._getFilteredFeats();
    const groupedFeats = this._groupFeatsByArchetype(feats);

    // Update feat count display
    const featCountEl = element.querySelector('.feat-count');
    if (featCountEl) {
      featCountEl.textContent = feats.length;
    }

    const featInfoEl = element.querySelector('.feat-list-info span');
    if (featInfoEl) {
      featInfoEl.textContent = game.i18n.format('intrinsics-pf2e-level-up-wizard.messages.info.feat-count', { count: feats.length });
    }

    // Update feat list container
    const listContainer = element.querySelector('.feat-list-container');
    if (!listContainer) return;

    // Build new HTML for feat list
    let html = '';

    if (groupedFeats.length > 0) {
      // Grouped by archetype
      for (const archetype of groupedFeats) {
        html += `<div class="archetype-section">`;
        html += `<div class="archetype-header">`;
        html += `<span class="archetype-name">${archetype.name}</span>`;
        html += `<span class="archetype-dedication ${archetype.hasDedication ? 'has-dedication' : 'no-dedication'}">`;
        if (archetype.hasDedication) {
          html += `<i class="fas fa-check"></i> Dedication Taken`;
        } else {
          html += `<i class="fas fa-exclamation-triangle"></i> No Dedication`;
        }
        html += `</span></div>`;

        for (const feat of archetype.feats) {
          html += this._renderFeatCard(feat);
        }
        html += `</div>`;
      }
    } else if (feats.length > 0) {
      // Flat list
      for (const feat of feats) {
        html += this._renderFeatCard(feat);
      }
    } else {
      // Empty state
      html = `<div class="feat-list-empty">
        <i class="fas fa-search"></i>
        <p>${game.i18n.localize('intrinsics-pf2e-level-up-wizard.messages.info.no-feats-available')}</p>
      </div>`;
    }

    listContainer.innerHTML = html;

    // Restore scroll position
    if (this.scrollPosition > 0) {
      listContainer.scrollTop = this.scrollPosition;
    }
  }

  /**
   * Render a single feat card HTML
   */
  _renderFeatCard(feat) {
    const isActive = feat.uuid === this.activeFeat;
    const isSelected = feat.uuid === this.currentSelection;
    const rarityClass = feat.rarityClass || '';
    const rarity = feat.rarity || 'common';

    let html = `<div class="feat-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}"
         data-action="previewFeat"
         data-feat-uuid="${feat.uuid}">`;

    html += `<div class="feat-card-header">`;
    html += `<img src="${feat.img}" alt="${feat.name}" class="feat-card-icon">`;
    html += `<div class="feat-card-info">`;
    html += `<div class="feat-card-title">${feat.name}`;
    html += `<span class="feat-card-level">Lv. ${feat.system.level.value}</span>`;
    if (rarity !== 'common') {
      html += `<span class="rarity-badge ${rarityClass}">${rarity.charAt(0).toUpperCase() + rarity.slice(1)}</span>`;
    }
    html += `</div>`;
    html += `<div class="feat-card-type">${feat.featTypeName || 'Feat'}</div>`;
    html += `</div></div>`;

    // Traits
    const traits = feat.traitsWithGateStatus || (feat.system.traits?.value || []).map(t => ({ name: t, gateStatus: '' }));
    if (traits.length > 0) {
      html += `<div class="feat-card-traits">`;
      for (const traitObj of traits) {
        html += `<span class="trait-badge trait-badge-small ${traitObj.gateStatus}">${traitObj.name}</span>`;
      }
      html += `</div>`;
    }

    // Description snippet
    if (feat.system.description?.value) {
      const plainText = feat.system.description.value.replace(/<[^>]*>/g, '').substring(0, 150);
      html += `<div class="feat-card-description">${plainText}...</div>`;
    }

    // Prerequisites
    if (feat.prerequisitesText) {
      html += `<div class="feat-card-prerequisites ${feat.prerequisitesClass || ''}">`;
      html += `<i class="fas fa-list-check"></i>`;
      html += `<span>${feat.prerequisitesText}</span>`;
      html += `</div>`;
    }

    // Needs dedication warning
    if (feat.needsDedication) {
      html += `<div class="feat-card-prerequisites unmet">`;
      html += `<i class="fas fa-exclamation-triangle"></i>`;
      html += `<span>Requires dedication feat</span>`;
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  async _onConfirm(event, target) {
    if (!this.currentSelection) {
      ui.notifications.warn('Please select a feat first.');
      return;
    }

    // Call callback with selection
    await this.onSelect(this.currentSelection);

    // Close modal
    await this.close();
  }

  async _onCancel(event, target) {
    await this.close();
  }
}
