// Skills Helpers - Skill proficiency logic and skill increases
import { MODULE_NAME, debugLog } from '../module.js';
import * as VariantRulesHelpers from './variant-rules-helpers.js';
import { getLocKeyPrefix, isPF2E } from '../system-config.js';

// Skill proficiency ranks
export const SKILL_PROFICIENCY_RANKS = {
  UNTRAINED: 0,
  TRAINED: 1,
  EXPERT: 2,
  MASTER: 3,
  LEGENDARY: 4
};

// Core skill list (shared by PF2E and SF2E)
export const SKILLS = [
  'acrobatics', 'arcana', 'athletics', 'crafting', 'deception',
  'diplomacy', 'intimidation', 'medicine', 'nature', 'occultism',
  'performance', 'religion', 'society', 'stealth', 'survival', 'thievery'
];

// Starfinder 2E adds Computers (Int) and Piloting (Dex) to the core skill list
const SF2E_SKILLS = ['computers', 'piloting'];

/**
 * Get the skill list for the active game system.
 * SF2E extends the core PF2E skills with Computers and Piloting.
 * @returns {string[]} Array of skill keys
 */
export function getSystemSkills() {
  if (!isPF2E()) {
    return [...SKILLS, ...SF2E_SKILLS];
  }
  return SKILLS;
}

/**
 * Get the maximum skill proficiency rank a character can hold at a given level.
 * Trained -> Expert is available at any level, Master requires level 7,
 * Legendary requires level 15.
 * @param {number} level - Effective character level
 * @returns {number} Maximum allowed rank
 */
export function getMaximumSkillRankForLevel(level) {
  if (level >= 15) return SKILL_PROFICIENCY_RANKS.LEGENDARY;
  if (level >= 7) return SKILL_PROFICIENCY_RANKS.MASTER;
  return SKILL_PROFICIENCY_RANKS.EXPERT;
}

/**
 * Get the minimum level required for a given skill proficiency rank.
 * @param {number} rank - Proficiency rank
 * @returns {number} Minimum required level
 */
export function getMinimumLevelForSkillRank(rank) {
  switch (rank) {
    case SKILL_PROFICIENCY_RANKS.MASTER:
      return 7;
    case SKILL_PROFICIENCY_RANKS.LEGENDARY:
      return 15;
    case SKILL_PROFICIENCY_RANKS.TRAINED:
    case SKILL_PROFICIENCY_RANKS.EXPERT:
    case SKILL_PROFICIENCY_RANKS.UNTRAINED:
    default:
      return 1;
  }
}

/**
 * Build projected skill ranks after planned increases.
 * @param {Actor} actor - The actor
 * @param {Object} plannedSkillIncreases - Optional object mapping skill keys to number of planned increases
 * @returns {Object} Object mapping skill keys to projected rank values
 */
export function getProjectedSkillRanks(actor, plannedSkillIncreases = {}) {
  const projectedRanks = {};

  for (const skillKey of getSystemSkills()) {
    const baseRank = actor.system.skills?.[skillKey]?.rank || 0;
    const plannedIncreases = plannedSkillIncreases[skillKey] || 0;
    projectedRanks[skillKey] = Math.min(baseRank + plannedIncreases, SKILL_PROFICIENCY_RANKS.LEGENDARY);
  }

  return projectedRanks;
}

/**
 * Get detailed skill increase eligibility for a level.
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @param {number} targetLevel - Effective character level when the increase applies
 * @param {Object} plannedSkillIncreases - Optional object mapping skill keys to number of planned increases
 * @returns {Object} Eligibility details
 */
export function getSkillIncreaseEligibility(actor, skillKey, targetLevel, plannedSkillIncreases = {}) {
  const skill = actor.system.skills?.[skillKey];

  if (!skill) {
    return {
      key: skillKey,
      canIncrease: false,
      unavailableReason: 'Skill not found',
      currentRank: 0,
      nextRank: SKILL_PROFICIENCY_RANKS.TRAINED,
      maxRankForLevel: getMaximumSkillRankForLevel(targetLevel),
      minimumLevelForNextRank: 1
    };
  }

  const baseRank = skill.rank || 0;
  const plannedIncreases = plannedSkillIncreases[skillKey] || 0;
  const currentRank = Math.min(baseRank + plannedIncreases, SKILL_PROFICIENCY_RANKS.LEGENDARY);
  const nextRank = Math.min(currentRank + 1, SKILL_PROFICIENCY_RANKS.LEGENDARY);
  const maxRankForLevel = getMaximumSkillRankForLevel(targetLevel);
  const minimumLevelForNextRank = getMinimumLevelForSkillRank(nextRank);

  if (currentRank >= SKILL_PROFICIENCY_RANKS.LEGENDARY) {
    return {
      key: skillKey,
      canIncrease: false,
      unavailableReason: 'Already Legendary',
      currentRank,
      nextRank,
      maxRankForLevel,
      minimumLevelForNextRank
    };
  }

  const canIncrease = nextRank <= maxRankForLevel;
  const unavailableReason = canIncrease
    ? ''
    : `${getRankName(nextRank)} requires level ${minimumLevelForNextRank}`;

  return {
    key: skillKey,
    canIncrease,
    unavailableReason,
    currentRank,
    nextRank,
    maxRankForLevel,
    minimumLevelForNextRank,
    baseRank,
    plannedIncreases
  };
}

/**
 * Get available skills for increase at level
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @param {Object} plannedSkillIncreases - Optional object mapping skill keys to number of planned increases from earlier levels
 * @returns {Array} Array of skill objects { key, name, currentRank, canIncrease }
 */
export function getSkillsForLevel(actor, targetLevel, plannedSkillIncreases = {}) {
  const skills = [];

  for (const skillKey of getSystemSkills()) {
    const skill = actor.system.skills[skillKey];

    if (!skill) continue;

    const eligibility = getSkillIncreaseEligibility(actor, skillKey, targetLevel, plannedSkillIncreases);
    const effectiveRank = eligibility.currentRank;
    const nextRank = eligibility.currentRank >= SKILL_PROFICIENCY_RANKS.LEGENDARY
      ? SKILL_PROFICIENCY_RANKS.LEGENDARY
      : eligibility.nextRank;

    skills.push({
      key: skillKey,
      name: getSkillTranslation(skillKey),
      currentRank: effectiveRank,
      baseRank: eligibility.baseRank,
      plannedIncreases: eligibility.plannedIncreases,
      currentRankName: getRankName(effectiveRank),
      nextRank: nextRank,
      nextRankName: getRankName(nextRank),
      canIncrease: eligibility.canIncrease,
      unavailableReason: eligibility.unavailableReason,
      minimumLevelForNextRank: eligibility.minimumLevelForNextRank,
      maxRankForLevel: eligibility.maxRankForLevel
    });
  }

  // Sort by name
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

/**
 * Get skill translation/name
 * @param {string} skillKey - Skill key
 * @returns {string} Translated skill name
 */
export function getSkillTranslation(skillKey) {
  // Try to get translation from game using system-appropriate prefix
  const prefix = getLocKeyPrefix();
  const translation = game.i18n.localize(`${prefix}.Skill${capitalize(skillKey)}`);

  // If translation not found, use capitalized key
  if (translation.startsWith(`${prefix}.`)) {
    return capitalize(skillKey);
  }

  return translation;
}

/**
 * Get rank name
 * @param {number} rank - Proficiency rank
 * @returns {string} Rank name
 */
export function getRankName(rank) {
  const rankNames = {
    [SKILL_PROFICIENCY_RANKS.UNTRAINED]: 'Untrained',
    [SKILL_PROFICIENCY_RANKS.TRAINED]: 'Trained',
    [SKILL_PROFICIENCY_RANKS.EXPERT]: 'Expert',
    [SKILL_PROFICIENCY_RANKS.MASTER]: 'Master',
    [SKILL_PROFICIENCY_RANKS.LEGENDARY]: 'Legendary'
  };

  return rankNames[rank] || 'Unknown';
}

/**
 * Get CSS class for rank
 * @param {number} rank - Proficiency rank
 * @returns {string} CSS class name
 */
export function getRankClass(rank) {
  const rankClasses = {
    [SKILL_PROFICIENCY_RANKS.UNTRAINED]: 'skill-rank-untrained',
    [SKILL_PROFICIENCY_RANKS.TRAINED]: 'skill-rank-trained',
    [SKILL_PROFICIENCY_RANKS.EXPERT]: 'skill-rank-expert',
    [SKILL_PROFICIENCY_RANKS.MASTER]: 'skill-rank-master',
    [SKILL_PROFICIENCY_RANKS.LEGENDARY]: 'skill-rank-legendary'
  };

  return rankClasses[rank] || '';
}

/**
 * Get color for rank
 * @param {number} rank - Proficiency rank
 * @returns {string} Color hex code
 */
export function getRankColor(rank) {
  const rankColors = {
    [SKILL_PROFICIENCY_RANKS.UNTRAINED]: '#666666',
    [SKILL_PROFICIENCY_RANKS.TRAINED]: '#5e0000',
    [SKILL_PROFICIENCY_RANKS.EXPERT]: '#000080',
    [SKILL_PROFICIENCY_RANKS.MASTER]: '#008000',
    [SKILL_PROFICIENCY_RANKS.LEGENDARY]: '#ff8c00'
  };

  return rankColors[rank] || '#666666';
}

/**
 * Check if skill can be increased
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @returns {boolean} True if can be increased
 */
export function canIncreaseSkill(actor, skillKey, targetLevel = actor.system?.details?.level?.value ?? 1, plannedSkillIncreases = {}) {
  return getSkillIncreaseEligibility(actor, skillKey, targetLevel, plannedSkillIncreases).canIncrease;
}

/**
 * Increase skill proficiency
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @returns {Promise<void>}
 */
export async function increaseSkillProficiency(actor, skillKey) {
  const skill = actor.system.skills[skillKey];

  if (!skill) {
    throw new Error(`Skill not found: ${skillKey}`);
  }

  const currentRank = skill.rank || 0;

  const targetLevel = actor.system?.details?.level?.value ?? 1;
  const eligibility = getSkillIncreaseEligibility(actor, skillKey, targetLevel);
  if (!eligibility.canIncrease) {
    throw new Error(eligibility.unavailableReason || `Skill ${skillKey} cannot be increased at level ${targetLevel}`);
  }

  const newRank = currentRank + 1;

  await actor.update({
    [`system.skills.${skillKey}.rank`]: newRank
  });

  debugLog('increaseSkillProficiency', `Increased ${skillKey} from ${currentRank} to ${newRank}`);
}

/**
 * Get skill potency for level (ABP variant)
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {Object|null} Potency info or null
 */
export function getSkillPotencyForLevel(actor, targetLevel) {
  const abpVariant = VariantRulesHelpers.getABPSetting();

  if (abpVariant === 'noABP') {
    return null;
  }

  // ABP grants skill potency increases at certain levels
  // Level 3: +1, Level 9: +2, Level 17: +3

  let potency = 0;
  let grantedAtThisLevel = false;

  if (targetLevel >= 3) potency = 1;
  if (targetLevel >= 9) potency = 2;
  if (targetLevel >= 17) potency = 3;

  if (targetLevel === 3 || targetLevel === 9 || targetLevel === 17) {
    grantedAtThisLevel = true;
  }

  if (potency === 0) {
    return null;
  }

  return {
    potency,
    grantedAtThisLevel
  };
}

/**
 * Build skill potency modifier item
 * @param {number} potency - Potency value
 * @returns {Object} Item data for potency modifier
 */
export function buildSkillPotencyModifier(potency) {
  return {
    type: 'effect',
    name: `Skill Potency +${potency}`,
    system: {
      slug: `skill-potency-${potency}`,
      badge: {
        value: potency
      },
      rules: [
        {
          key: 'FlatModifier',
          selector: 'skill-check',
          value: potency,
          type: 'item'
        }
      ]
    }
  };
}

/**
 * Get skills that are trained or higher
 * @param {Actor} actor - The actor
 * @returns {Array} Array of trained skill keys
 */
export function getTrainedSkills(actor) {
  const trainedSkills = [];

  for (const skillKey of getSystemSkills()) {
    const skill = actor.system.skills[skillKey];

    if (skill && skill.rank >= SKILL_PROFICIENCY_RANKS.TRAINED) {
      trainedSkills.push(skillKey);
    }
  }

  return trainedSkills;
}

/**
 * Get skills at specific rank
 * @param {Actor} actor - The actor
 * @param {number} rank - Proficiency rank
 * @returns {Array} Array of skill keys
 */
export function getSkillsAtRank(actor, rank) {
  const skills = [];

  for (const skillKey of getSystemSkills()) {
    const skill = actor.system.skills[skillKey];

    if (skill && skill.rank === rank) {
      skills.push(skillKey);
    }
  }

  return skills;
}

/**
 * Get skill modifier
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @returns {number} Total skill modifier
 */
export function getSkillModifier(actor, skillKey) {
  const skill = actor.system.skills[skillKey];

  if (!skill) {
    return 0;
  }

  return skill.mod || 0;
}

/**
 * Get skill ability key
 * @param {string} skillKey - Skill key
 * @returns {string} Ability key (str, dex, etc.)
 */
export function getSkillAbility(skillKey) {
  const skillAbilities = {
    'acrobatics': 'dex',
    'arcana': 'int',
    'athletics': 'str',
    'crafting': 'int',
    'deception': 'cha',
    'diplomacy': 'cha',
    'intimidation': 'cha',
    'medicine': 'wis',
    'nature': 'wis',
    'occultism': 'int',
    'performance': 'cha',
    'religion': 'wis',
    'society': 'int',
    'stealth': 'dex',
    'survival': 'wis',
    'thievery': 'dex',
    // SF2E skills
    'computers': 'int',
    'piloting': 'dex'
  };

  return skillAbilities[skillKey] || '';
}

/**
 * Get skill DC
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @returns {number} Skill DC
 */
export function getSkillDC(actor, skillKey) {
  const modifier = getSkillModifier(actor, skillKey);
  return 10 + modifier;
}

/**
 * Format skill display
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @returns {Object} Formatted skill info
 */
export function formatSkillDisplay(actor, skillKey) {
  const skill = actor.system.skills[skillKey];

  if (!skill) {
    return null;
  }

  const currentRank = skill.rank || 0;
  const modifier = skill.mod || 0;
  const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  return {
    key: skillKey,
    name: getSkillTranslation(skillKey),
    rank: currentRank,
    rankName: getRankName(currentRank),
    rankClass: getRankClass(currentRank),
    rankColor: getRankColor(currentRank),
    modifier: modifier,
    modifierStr: modifierStr,
    dc: getSkillDC(actor, skillKey),
    ability: getSkillAbility(skillKey),
    canIncrease: canIncreaseSkill(actor, skillKey)
  };
}

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
