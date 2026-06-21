// Data Provider - Handles compendium data caching and filtering
import { MODULE_NAME, debugLog } from './module.js';

/**
 * DataProvider class - Caches and provides compendium data
 * Prevents repeated compendium loads and filters data efficiently
 */
export class DataProvider {
  constructor() {
    this.cache = {
      feats: null,
      spells: null,
      classes: null,
      ancestries: null,
      heritages: null,
      backgrounds: null,
      deities: null
    };

    // Track ongoing loads to prevent duplicate requests
    this.loading = new Map();
  }

  // ==========================================================================
  // FEAT METHODS
  // ==========================================================================

  /**
   * Get all feats from compendiums (cached)
   * @returns {Promise<Array>} Array of feat documents
   */
  async getFeats(filters = {}) {
    const allFeats = await this._loadFeats();

    // Apply filters
    let filtered = allFeats;

    // Filter by level
    if (filters.maxLevel !== undefined) {
      filtered = filtered.filter(f => f.system.level.value <= filters.maxLevel);
    }

    if (filters.minLevel !== undefined) {
      filtered = filtered.filter(f => f.system.level.value >= filters.minLevel);
    }

    // Filter by traits
    if (filters.traits && filters.traits.length > 0) {
      filtered = filtered.filter(feat => {
        const traitValues = feat.system.traits?.value || [];
        const featTraits = traitValues.filter(t => t != null).map(t => t.toLowerCase());
        return filters.traits.some(t => t && featTraits.includes(t.toLowerCase()));
      });
    }

    // Filter by category (class, ancestry, skill, general, etc.)
    if (filters.category) {
      filtered = filtered.filter(f => f.system.category === filters.category);
    }

    // Exclude already taken feats (unless maxTakable > 1)
    if (filters.existingFeats && filters.existingFeats.length > 0) {
      filtered = filtered.filter(feat => {
        const isTaken = filters.existingFeats.some(ef =>
          ef.name.toLowerCase() === feat.name.toLowerCase()
        );
        const maxTakable = feat.system.maxTakable || 1;
        return !isTaken || maxTakable > 1;
      });
    }

    debugLog('DataProvider.getFeats', `Returned ${filtered.length} feats (${allFeats.length} total)`);

    return filtered;
  }

  /**
   * Load all feats from compendiums
   * @private
   */
  async _loadFeats() {
    if (this.cache.feats) {
      return this.cache.feats;
    }

    if (this.loading.has('feats')) {
      return this.loading.get('feats');
    }

    const loadPromise = (async () => {
      let allFeats = [];

      // Load from pf2e.feats-srd
      const defaultCompendium = game.packs.get('pf2e.feats-srd');
      if (defaultCompendium) {
        debugLog('DataProvider', 'Loading feats from pf2e.feats-srd...');
        const defaultFeats = await defaultCompendium.getDocuments();
        allFeats = allFeats.concat(defaultFeats.filter(f => f.type === 'feat'));
      }

      // Load playtest class feats
      const playtestCompendium = game.packs.get('pf2e-playtest-data.impossible-playtest-class-feats');
      if (playtestCompendium) {
        debugLog('DataProvider', 'Loading feats from pf2e-playtest-data.impossible-playtest-class-feats...');
        try {
          const playtestFeats = await playtestCompendium.getDocuments();
          allFeats = allFeats.concat(playtestFeats.filter(f => f.type === 'feat'));
          debugLog('DataProvider', `Loaded ${playtestFeats.filter(f => f.type === 'feat').length} playtest feats`);
        } catch (err) {
          console.warn('DataProvider | Failed to load playtest feats:', err);
        }
      }

      // Load from additional compendiums
      const additionalCompendiums = game.settings.get(MODULE_NAME, 'additional-feat-compendiums');
      if (additionalCompendiums) {
        const compendiumKeys = additionalCompendiums
          .split(',')
          .map(key => key.trim())
          .filter(key => key.length > 0);

        for (const key of compendiumKeys) {
          const compendium = game.packs.get(key);
          if (compendium) {
            try {
              debugLog('DataProvider', `Loading feats from ${key}...`);
              const collection = await compendium.getDocuments();
              const feats = collection.filter(item => item.type === 'feat');
              allFeats = allFeats.concat(feats);
            } catch (err) {
              console.error(`${MODULE_NAME} | Failed to load feats from ${key}:`, err);
              ui.notifications.warn(`Failed to load feats from ${key}`);
            }
          } else {
            console.warn(`${MODULE_NAME} | Compendium not found: ${key}`);
          }
        }
      }

      this.cache.feats = allFeats;
      debugLog('DataProvider', `Loaded ${allFeats.length} total feats`);
      return allFeats;
    })();

    this.loading.set('feats', loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loading.delete('feats');
    }
  }

  // ==========================================================================
  // SPELL METHODS
  // ==========================================================================

  /**
   * Get spells from compendiums (cached and filtered)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of spell documents
   */
  async getSpells(filters = {}) {
    const allSpells = await this._loadSpells();

    // Apply filters
    let filtered = allSpells;

    // Filter by rank
    if (filters.rank !== undefined) {
      filtered = filtered.filter(s => s.system.level.value === filters.rank);
    }

    // Filter by tradition
    if (filters.tradition) {
      filtered = filtered.filter(spell => {
        const traditions = spell.system.traits.traditions || [];
        return traditions.includes(filters.tradition);
      });
    }

    // Filter by rarity
    if (filters.rarity) {
      filtered = filtered.filter(s => s.system.traits.rarity === filters.rarity);
    }

    // Filter by school
    if (filters.school) {
      filtered = filtered.filter(spell => {
        const traits = spell.system.traits.value || [];
        return traits.includes(filters.school);
      });
    }

    // Exclude already known spells
    if (filters.knownSpells && filters.knownSpells.length > 0) {
      filtered = filtered.filter(spell => {
        return !filters.knownSpells.some(ks =>
          ks.name.toLowerCase() === spell.name.toLowerCase()
        );
      });
    }

    debugLog('DataProvider.getSpells', `Returned ${filtered.length} spells (${allSpells.length} total)`);

    return filtered;
  }

  /**
   * Load all spells from compendiums
   * @private
   */
  async _loadSpells() {
    if (this.cache.spells) {
      return this.cache.spells;
    }

    if (this.loading.has('spells')) {
      return this.loading.get('spells');
    }

    const loadPromise = (async () => {
      let allSpells = [];

      // Load from pf2e.spells-srd
      const defaultCompendium = game.packs.get('pf2e.spells-srd');
      if (defaultCompendium) {
        debugLog('DataProvider', 'Loading spells from pf2e.spells-srd...');
        const defaultSpells = await defaultCompendium.getDocuments();
        allSpells = allSpells.concat(defaultSpells.filter(s => s.type === 'spell'));
      }

      // Load from additional compendiums
      const additionalCompendiums = game.settings.get(MODULE_NAME, 'additional-spell-compendiums');
      if (additionalCompendiums) {
        const compendiumKeys = additionalCompendiums
          .split(',')
          .map(key => key.trim())
          .filter(key => key.length > 0);

        for (const key of compendiumKeys) {
          const compendium = game.packs.get(key);
          if (compendium) {
            try {
              debugLog('DataProvider', `Loading spells from ${key}...`);
              const collection = await compendium.getDocuments();
              const spells = collection.filter(item => item.type === 'spell');
              allSpells = allSpells.concat(spells);
            } catch (err) {
              console.error(`${MODULE_NAME} | Failed to load spells from ${key}:`, err);
              ui.notifications.warn(`Failed to load spells from ${key}`);
            }
          } else {
            console.warn(`${MODULE_NAME} | Compendium not found: ${key}`);
          }
        }
      }

      this.cache.spells = allSpells;
      debugLog('DataProvider', `Loaded ${allSpells.length} total spells`);
      return allSpells;
    })();

    this.loading.set('spells', loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loading.delete('spells');
    }
  }

  // ==========================================================================
  // CLASS METHODS
  // ==========================================================================

  /**
   * Get all classes from compendium
   * @returns {Promise<Array>} Array of class documents
   */
  async getClasses() {
    if (this.cache.classes) {
      return this.cache.classes;
    }

    if (this.loading.has('classes')) {
      return this.loading.get('classes');
    }

    const loadPromise = (async () => {
      const compendium = game.packs.get('pf2e.classes');
      if (!compendium) {
        console.error(`${MODULE_NAME} | Classes compendium not found`);
        return [];
      }

      debugLog('DataProvider', 'Loading classes from pf2e.classes...');
      const classes = await compendium.getDocuments();
      this.cache.classes = classes;
      return classes;
    })();

    this.loading.set('classes', loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loading.delete('classes');
    }
  }

  /**
   * Get class features for a specific class at a specific level
   */
  async getClassFeatures(classSlug, level) {
    const classes = await this.getClasses();
    const classItem = classes.find(c => c.slug === classSlug);

    if (!classItem) {
      return [];
    }

    // Get features from class.system.items
    const features = classItem.system.items || [];

    // Filter by level
    return features.filter(f => {
      const featureLevel = f.level || f.system?.level?.value || 0;
      return featureLevel === level;
    });
  }

  // ==========================================================================
  // ANCESTRY METHODS
  // ==========================================================================

  /**
   * Get all ancestries from compendium
   */
  async getAncestries() {
    if (this.cache.ancestries) {
      return this.cache.ancestries;
    }

    if (this.loading.has('ancestries')) {
      return this.loading.get('ancestries');
    }

    const loadPromise = (async () => {
      const compendium = game.packs.get('pf2e.ancestries');
      if (!compendium) {
        console.error(`${MODULE_NAME} | Ancestries compendium not found`);
        return [];
      }

      debugLog('DataProvider', 'Loading ancestries from pf2e.ancestries...');
      const ancestries = await compendium.getDocuments();
      this.cache.ancestries = ancestries;
      return ancestries;
    })();

    this.loading.set('ancestries', loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loading.delete('ancestries');
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Clear all cached data
   */
  clearCache() {
    debugLog('DataProvider', 'Clearing cache...');
    this.cache = {
      feats: null,
      spells: null,
      classes: null,
      ancestries: null,
      heritages: null,
      backgrounds: null,
      deities: null
    };
  }

  /**
   * Clear specific cache entry
   */
  clearCacheFor(type) {
    if (this.cache.hasOwnProperty(type)) {
      debugLog('DataProvider', `Clearing cache for ${type}...`);
      this.cache[type] = null;
    }
  }
}

// Create singleton instance
const dataProvider = new DataProvider();

export default dataProvider;
