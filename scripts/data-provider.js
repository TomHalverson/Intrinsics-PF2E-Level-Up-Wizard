// Data Provider - Handles compendium data caching and filtering
import { MODULE_NAME, debugLog } from './module.js';
import { getPackId, getSystemId, isPF2E } from './system-config.js';

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

      // Load from system feats compendium (pf2e.feats-srd or sf2e.feats)
      const defaultPackId = getPackId('feats-srd');
      const defaultCompendium = game.packs.get(defaultPackId);
      if (defaultCompendium) {
        debugLog('DataProvider', `Loading feats from ${defaultPackId}...`);
        const defaultFeats = await defaultCompendium.getDocuments();
        allFeats = allFeats.concat(defaultFeats.filter(f => f.type === 'feat'));
      } else {
        // Fallback: search by label
        const fallbackPack = game.packs.find(p =>
          p.metadata.label.toLowerCase() === 'feats' &&
          p.metadata.packageName === getSystemId()
        );
        if (fallbackPack) {
          debugLog('DataProvider', `Loading feats from fallback pack ${fallbackPack.collection}...`);
          const fallbackFeats = await fallbackPack.getDocuments();
          allFeats = allFeats.concat(fallbackFeats.filter(f => f.type === 'feat'));
        }
      }

      // Load playtest class feats (PF2E)
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

      // Load RR playtest class feats (PF2E)
      const rrPlaytestCompendium = game.packs.get('pf2e-playtest-data.rr-playtest-class-features');
      if (rrPlaytestCompendium) {
        debugLog('DataProvider', 'Loading feats from pf2e-playtest-data.rr-playtest-class-features...');
        try {
          const rrFeats = await rrPlaytestCompendium.getDocuments();
          allFeats = allFeats.concat(rrFeats.filter(f => f.type === 'feat'));
          debugLog('DataProvider', `Loaded ${rrFeats.filter(f => f.type === 'feat').length} RR playtest feats`);
        } catch (err) {
          console.warn('DataProvider | Failed to load RR playtest feats:', err);
        }
      }

      // Load SF2E playtest feats (starfinder-field-test-for-pf2e module)
      let sf2eFeatsPack = game.packs.get('starfinder-field-test-for-pf2e.sf2e-feats');
      if (!sf2eFeatsPack) {
        // Fallback: search for SF2E feats pack by module name
        sf2eFeatsPack = game.packs.find(p =>
          p.metadata.packageName === 'starfinder-field-test-for-pf2e' &&
          (p.metadata.name === 'sf2e-feats' || p.metadata.label.toLowerCase().includes('feat'))
        );
      }
      if (sf2eFeatsPack) {
        debugLog('DataProvider', `Loading SF2E playtest feats from ${sf2eFeatsPack.collection}...`);
        try {
          const sf2eFeats = await sf2eFeatsPack.getDocuments();
          allFeats = allFeats.concat(sf2eFeats.filter(f => f.type === 'feat'));
          debugLog('DataProvider', `Loaded ${sf2eFeats.filter(f => f.type === 'feat').length} SF2E playtest feats`);
        } catch (err) {
          console.warn('DataProvider | Failed to load SF2E playtest feats:', err);
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

      // Load from system spells compendium (pf2e.spells-srd or sf2e.spells)
      const defaultPackId = getPackId('spells-srd');
      const defaultCompendium = game.packs.get(defaultPackId);
      if (defaultCompendium) {
        debugLog('DataProvider', `Loading spells from ${defaultPackId}...`);
        const defaultSpells = await defaultCompendium.getDocuments();
        allSpells = allSpells.concat(defaultSpells.filter(s => s.type === 'spell'));
      } else {
        // Fallback: search by label
        const fallbackPack = game.packs.find(p =>
          p.metadata.label.toLowerCase() === 'spells' &&
          p.metadata.packageName === getSystemId()
        );
        if (fallbackPack) {
          debugLog('DataProvider', `Loading spells from fallback pack ${fallbackPack.collection}...`);
          const fallbackSpells = await fallbackPack.getDocuments();
          allSpells = allSpells.concat(fallbackSpells.filter(s => s.type === 'spell'));
        }
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
      const classPackId = getPackId('classes');
      let compendium = game.packs.get(classPackId);
      if (!compendium) {
        // Fallback: search by label
        compendium = game.packs.find(p =>
          p.metadata.label.toLowerCase() === 'classes' &&
          p.metadata.packageName === getSystemId()
        );
      }
      if (!compendium) {
        console.error(`${MODULE_NAME} | Classes compendium not found (tried ${classPackId})`);
        return [];
      }

      debugLog('DataProvider', `Loading classes from ${compendium.collection}...`);
      const classes = await compendium.getDocuments();

      // Load playtest classes (PF2E)
      const playtestPack = game.packs.get('pf2e-playtest-data.impossible-playtest-classes');
      if (playtestPack) {
        debugLog('DataProvider', 'Loading PF2E playtest classes...');
        const playtestDocs = await playtestPack.getDocuments();
        const wrappedPlaytest = playtestDocs.map(doc => {
          if (!doc.slug || doc.slug === null) {
            const generatedSlug = doc.name.toLowerCase().replace(/\s+/g, '-');
            return new Proxy(doc, {
              get(target, prop) {
                if (prop === 'slug') return generatedSlug;
                return target[prop];
              }
            });
          }
          return doc;
        });
        classes.push(...wrappedPlaytest);
        debugLog('DataProvider', `Loaded ${playtestDocs.length} PF2E playtest classes`);
      }

      // Load RR playtest classes (PF2E)
      const rrPlaytestPack = game.packs.get('pf2e-playtest-data.rr-playtest-classes');
      if (rrPlaytestPack) {
        debugLog('DataProvider', 'Loading RR playtest classes...');
        const rrPlaytestDocs = await rrPlaytestPack.getDocuments();
        const wrappedRRPlaytest = rrPlaytestDocs.map(doc => {
          if (!doc.slug || doc.slug === null) {
            const generatedSlug = doc.name.toLowerCase().replace(/\s+/g, '-');
            return new Proxy(doc, {
              get(target, prop) {
                if (prop === 'slug') return generatedSlug;
                return target[prop];
              }
            });
          }
          return doc;
        });
        classes.push(...wrappedRRPlaytest);
        debugLog('DataProvider', `Loaded ${rrPlaytestDocs.length} RR playtest classes`);
      }

      // Load SF2E playtest classes (starfinder-field-test-for-pf2e module)
      const sf2ePlaytestPack = game.packs.get('starfinder-field-test-for-pf2e.sf2e-classes');
      if (sf2ePlaytestPack) {
        debugLog('DataProvider', 'Loading SF2E playtest classes...');
        const sf2ePlaytestDocs = await sf2ePlaytestPack.getDocuments();
        const wrappedSF2EPlaytest = sf2ePlaytestDocs.map(doc => {
          if (!doc.slug || doc.slug === null) {
            const generatedSlug = doc.name.toLowerCase().replace(/\s+/g, '-');
            return new Proxy(doc, {
              get(target, prop) {
                if (prop === 'slug') return generatedSlug;
                return target[prop];
              }
            });
          }
          return doc;
        });
        // Only add classes that aren't already loaded
        const existingSlugs = new Set(classes.map(d => d.slug));
        const newClasses = wrappedSF2EPlaytest.filter(d => !existingSlugs.has(d.slug));
        classes.push(...newClasses);
        debugLog('DataProvider', `Loaded ${newClasses.length} SF2E playtest classes`);
      }

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
      const ancestryPackId = getPackId('ancestries');
      let compendium = game.packs.get(ancestryPackId);
      if (!compendium) {
        compendium = game.packs.find(p =>
          p.metadata.label.toLowerCase() === 'ancestries' &&
          p.metadata.packageName === getSystemId()
        );
      }
      if (!compendium) {
        console.error(`${MODULE_NAME} | Ancestries compendium not found (tried ${ancestryPackId})`);
        return [];
      }

      debugLog('DataProvider', `Loading ancestries from ${compendium.collection}...`);
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
