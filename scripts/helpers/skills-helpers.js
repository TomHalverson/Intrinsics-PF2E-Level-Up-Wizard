// Skills Helpers - Skill proficiency logic and skill increases
import { MODULE_NAME, debugLog } from '../module.js';

// Skill proficiency ranks
export const SKILL_PROFICIENCY_RANKS = {
  UNTRAINED: 0,
  TRAINED: 1,
  EXPERT: 2,
  MASTER: 3,
  LEGENDARY: 4
};

// Skill list
export const SKILLS = [
  'acrobatics', 'arcana', 'athletics', 'crafting', 'deception',
  'diplomacy', 'intimidation', 'medicine', 'nature', 'occultism',
  'performance', 'religion', 'society', 'stealth', 'survival', 'thievery'
];

/**
 * Get available skills for increase at level
 * @param {Actor} actor - The actor
 * @param {number} targetLevel - Target level
 * @returns {Array} Array of skill objects { key, name, currentRank, canIncrease }
 */
export function getSkillsForLevel(actor, targetLevel) {
  const skills = [];

  for (const skillKey of SKILLS) {
    const skill = actor.system.skills[skillKey];

    if (!skill) continue;

    const currentRank = skill.rank || 0;
    const canIncrease = currentRank < SKILL_PROFICIENCY_RANKS.LEGENDARY;

    skills.push({
      key: skillKey,
      name: getSkillTranslation(skillKey),
      currentRank,
      currentRankName: getRankName(currentRank),
      nextRank: currentRank + 1,
      nextRankName: getRankName(currentRank + 1),
      canIncrease
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
  // Try to get translation from game
  const translation = game.i18n.localize(`PF2E.Skill${capitalize(skillKey)}`);

  // If translation not found, use capitalized key
  if (translation.startsWith('PF2E.')) {
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
export function canIncreaseSkill(actor, skillKey) {
  const skill = actor.system.skills[skillKey];

  if (!skill) {
    return false;
  }

  const currentRank = skill.rank || 0;
  return currentRank < SKILL_PROFICIENCY_RANKS.LEGENDARY;
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

  if (currentRank >= SKILL_PROFICIENCY_RANKS.LEGENDARY) {
    throw new Error(`Skill ${skillKey} is already legendary`);
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
  const abpVariant = game.settings.get('pf2e', 'automaticBonusVariant');

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

  for (const skillKey of SKILLS) {
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

  for (const skillKey of SKILLS) {
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
    'thievery': 'dex'
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
