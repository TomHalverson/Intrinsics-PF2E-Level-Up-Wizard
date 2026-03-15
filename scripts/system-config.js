// System Configuration - Abstracts differences between PF2E and Starfinder 2E (SF2E)
// Both systems share the same underlying engine but use different compendiums

const MODULE_ID = "intrinsics-pf2e-level-up-wizard";

/**
 * Get the active game system ID (e.g., 'pf2e', 'sf2e')
 */
export function getSystemId() {
  return game.system.id;
}

/**
 * Check if the active system is Pathfinder 2E
 */
export function isPF2E() {
  return game.system.id === 'pf2e';
}

/**
 * Get a human-readable label for the active system
 */
export function getSystemLabel() {
  if (isPF2E()) return 'Pathfinder 2E';
  return game.system.title || 'Starfinder 2E';
}

/**
 * Get the short system abbreviation for UI display
 */
export function getSystemAbbrev() {
  if (isPF2E()) return 'PF2E';
  return game.system.id.toUpperCase();
}

/**
 * Get a compendium pack collection ID for the active system.
 * Handles naming differences between PF2E and SF2E compendiums.
 * PF2E uses 'feats-srd', 'spells-srd', 'equipment-srd' while SF2E uses 'feats', 'spells', 'equipment'.
 * @param {string} packName - The canonical pack name, e.g., 'ancestries', 'classes', 'feats-srd'
 * @returns {string} Full pack ID like 'pf2e.feats-srd' or 'sf2e.feats'
 */
export function getPackId(packName) {
  const systemId = game.system.id;

  // Pack name mapping: canonical name → system-specific name
  // PF2E uses '-srd' suffixed names; SF2E drops the suffix
  if (!isPF2E()) {
    const sf2eNameMap = {
      'feats-srd': 'feats',
      'spells-srd': 'spells',
      'equipment-srd': 'equipment',
      'classfeatures': 'class-features'
    };
    packName = sf2eNameMap[packName] || packName;
  }

  return `${systemId}.${packName}`;
}

/**
 * Get the system's game API object (e.g., game.pf2e or game.sf2e)
 */
export function getSystemAPI() {
  return game[game.system.id];
}

/**
 * Safely get a system-level setting
 * @param {string} key - The setting key (e.g., 'freeArchetypeVariant')
 * @returns {*} The setting value, or undefined if not found
 */
export function getSystemSetting(key) {
  try {
    return game.settings.get(game.system.id, key);
  } catch (e) {
    console.warn(`${MODULE_ID} | Could not get system setting '${key}':`, e);
    return undefined;
  }
}

/**
 * Get language localization key prefix for the active system
 * @returns {string} The prefix (e.g., 'PF2E' or 'SF2E')
 */
export function getLocKeyPrefix() {
  return isPF2E() ? 'PF2E' : getSystemAbbrev();
}
