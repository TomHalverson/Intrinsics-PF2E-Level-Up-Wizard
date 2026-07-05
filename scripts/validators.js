// Validators - Validation logic for build plan and level-up choices
import { MODULE_NAME, debugLog } from './module.js';
import * as FeatHelpers from './helpers/feat-helpers.js';
import * as ClassFeaturesHelpers from './helpers/class-features-helpers.js';
import * as SkillsHelpers from './helpers/skills-helpers.js';
import * as VariantRulesHelpers from './helpers/variant-rules-helpers.js';

/**
 * Get normalized class slug from class item (handles playtest null slugs)
 */
function getClassSlug(classItem) {
  if (!classItem) return null;
  return classItem.slug || classItem.name?.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Validate choices for a specific level
 * @param {Actor} actor - The actor
 * @param {number} level - Level to validate
 * @param {Object} choices - Choices object
 * @returns {Object} Validation result { valid: boolean, errors: Array, warnings: Array }
 */
export function validateLevelChoices(actor, level, choices) {
  const errors = [];
  const warnings = [];

  if (!choices) {
    errors.push('No choices provided');
    return { valid: false, errors, warnings };
  }

  // Get feat slots for this level
  const featSlots = ClassFeaturesHelpers.getFeatSlotsForLevel(actor, level);

  // Validate class feats
  if (featSlots.class > 0 && !choices.classFeats) {
    errors.push('Class feat is required');
  }

  // Validate ancestry feats
  if (featSlots.ancestry > 0 && !choices.ancestryFeats) {
    errors.push('Ancestry feat is required');
  }

  // Validate skill feats
  if (featSlots.skill > 0 && !choices.skillFeats) {
    errors.push('Skill feat is required');
  }

  // Validate general feats
  if (featSlots.general > 0 && !choices.generalFeats) {
    errors.push('General feat is required');
  }

  // Validate free archetype feats
  if (featSlots.archetype > 0 && !choices.freeArchetypeFeats && !choices.skipArchetypeFeat) {
    warnings.push('Free archetype feat not selected');
  }

  // Validate mythic feats
  if (featSlots.mythic > 0 && !choices.mythicFeats) {
    warnings.push('Mythic feat not selected');
  }

  // Validate ancestry paragon feats
  if (featSlots.ancestryParagon > 0 && !choices.ancestryParagonFeats) {
    warnings.push('Ancestry paragon feat not selected');
  }

  // Validate dual class feats
  if (featSlots.dualClass > 0 && !choices.dualClassFeats) {
    warnings.push('Dual class feat not selected');
  }

  // Validate ability boosts
  const boostInfo = ClassFeaturesHelpers.detectAbilityBoosts(actor, level);
  if (boostInfo.hasBoosts && boostInfo.count > 0) {
    const boostCount = choices.abilityBoosts?.length || 0;

    if (boostCount < boostInfo.count) {
      errors.push(`Expected ${boostInfo.count} ability boosts, got ${boostCount}`);
    } else if (boostCount > boostInfo.count) {
      errors.push(`Too many ability boosts: expected ${boostInfo.count}, got ${boostCount}`);
    }
  }

  // Validate Runesmith runes
  const expectedRunes = ClassFeaturesHelpers.getRunesToLearnAtLevel(actor, level);
  if (expectedRunes > 0) {
    const runeCount = choices.runes?.length || 0;

    if (runeCount < expectedRunes) {
      errors.push(`Expected ${expectedRunes} rune selections, got ${runeCount}`);
    } else if (runeCount > expectedRunes) {
      errors.push(`Too many runes selected: expected ${expectedRunes}, got ${runeCount}`);
    }
  }

  // Validate skill increases
  const expectedSkillIncreases = ClassFeaturesHelpers.getSkillIncreasesForLevel(actor, level);
  if (expectedSkillIncreases > 0) {
    const skillIncreaseCount = choices.skillIncreases?.length || 0;
    const projectedSkillIncreases = {};

    if (skillIncreaseCount < expectedSkillIncreases) {
      errors.push(`Expected ${expectedSkillIncreases} skill increases, got ${skillIncreaseCount}`);
    } else if (skillIncreaseCount > expectedSkillIncreases) {
      errors.push(`Too many skill increases: expected ${expectedSkillIncreases}, got ${skillIncreaseCount}`);
    }

    for (const skillKey of choices.skillIncreases || []) {
      const eligibility = SkillsHelpers.getSkillIncreaseEligibility(actor, skillKey, level, projectedSkillIncreases);
      if (!eligibility.canIncrease) {
        errors.push(`${SkillsHelpers.getSkillTranslation(skillKey)} cannot be increased: ${eligibility.unavailableReason}`);
        continue;
      }

      projectedSkillIncreases[skillKey] = (projectedSkillIncreases[skillKey] || 0) + 1;
    }
  }

  // Validate spells (if spellcaster)
  if (ClassFeaturesHelpers.isSpellcaster(actor)) {
    const newRank = ClassFeaturesHelpers.getNewSpellRankAtLevel(actor, level);

    if (newRank && choices.spells) {
      // Check if appropriate rank has spells
      const rankKey = `rank${newRank}`;
      const spellsForRank = choices.spells[rankKey] || [];

      // Auto-learning classes don't need to select spells
      const autoLearns = ['cleric', 'druid', 'animist'].includes(
        getClassSlug(actor.items.find(i => i.type === 'class'))
      );

      if (!autoLearns && spellsForRank.length === 0) {
        warnings.push(`No spells selected for rank ${newRank}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate feat choice
 * @param {Actor} actor - The actor
 * @param {string} featUUID - Feat UUID
 * @param {string} featType - Feat type
 * @param {number} level - Level
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export async function validateFeatChoice(actor, featUUID, featType, level) {
  const errors = [];

  if (!featUUID) {
    errors.push('No feat selected');
    return { valid: false, errors };
  }

  // Get feat document
  let feat;
  try {
    feat = await fromUuid(featUUID);
  } catch (error) {
    errors.push('Invalid feat UUID');
    return { valid: false, errors };
  }

  if (!feat) {
    errors.push('Feat not found');
    return { valid: false, errors };
  }

  // Check feat level
  if (feat.system.level.value > level) {
    errors.push(`Feat level (${feat.system.level.value}) is higher than character level (${level})`);
  }

  // Check prerequisites
  const prereqCheck = FeatHelpers.checkPrerequisites(actor, feat, { effectiveLevel: level });
  if (prereqCheck.meets === false) {
    errors.push(`Missing prerequisites: ${prereqCheck.missing.join(', ')}`);
  }

  // Check archetype dedication requirements
  if (FeatHelpers.isArchetypeFeat(feat)) {
    const archetypeName = FeatHelpers.getArchetypeFromFeat(feat.slug);

    if (archetypeName && !FeatHelpers.hasArchetypeDedication(actor, archetypeName)) {
      errors.push(`Requires ${archetypeName} dedication`);
    }
  }

  // Check if feat is already taken (unless maxTakable > 1)
  const existingFeat = actor.items.find(i =>
    i.type === 'feat' && i.name.toLowerCase() === feat.name.toLowerCase()
  );

  if (existingFeat) {
    const maxTakable = feat.system.maxTakable || 1;

    if (maxTakable === 1) {
      errors.push('Feat is already taken');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate spell choice
 * @param {Actor} actor - The actor
 * @param {string} spellUUID - Spell UUID
 * @param {number} rank - Spell rank
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export async function validateSpellChoice(actor, spellUUID, rank) {
  const errors = [];

  if (!spellUUID) {
    errors.push('No spell selected');
    return { valid: false, errors };
  }

  // Get spell document
  let spell;
  try {
    spell = await fromUuid(spellUUID);
  } catch (error) {
    errors.push('Invalid spell UUID');
    return { valid: false, errors };
  }

  if (!spell) {
    errors.push('Spell not found');
    return { valid: false, errors };
  }

  // Check spell rank
  if (spell.system.level.value !== rank) {
    errors.push(`Spell rank mismatch: expected ${rank}, got ${spell.system.level.value}`);
  }

  // Check tradition
  const tradition = actor.items.find(i => i.type === 'class')?.system?.spellcasting?.tradition;

  if (tradition) {
    const spellTraditions = spell.system.traits.traditions || [];

    if (!spellTraditions.includes(tradition)) {
      errors.push(`Spell is not in ${tradition} tradition`);
    }
  }

  // Check if spell is already known
  const existingSpell = actor.items.find(i =>
    i.type === 'spell' && i.name.toLowerCase() === spell.name.toLowerCase()
  );

  if (existingSpell) {
    errors.push('Spell is already known');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate skill increase choice
 * @param {Actor} actor - The actor
 * @param {string} skillKey - Skill key
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export function validateSkillIncrease(actor, skillKey) {
  const errors = [];

  if (!skillKey) {
    errors.push('No skill selected');
    return { valid: false, errors };
  }

  const targetLevel = actor.system?.details?.level?.value ?? 1;
  const eligibility = SkillsHelpers.getSkillIncreaseEligibility(actor, skillKey, targetLevel);
  if (!eligibility.canIncrease) {
    errors.push(eligibility.unavailableReason || 'Skill cannot be increased');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate ability boost choices
 * @param {Actor} actor - The actor
 * @param {Array<string>} boosts - Array of ability keys
 * @param {number} expectedCount - Expected number of boosts
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export function validateAbilityBoosts(actor, boosts, expectedCount) {
  const errors = [];

  if (!boosts || !Array.isArray(boosts)) {
    errors.push('Invalid boosts array');
    return { valid: false, errors };
  }

  if (boosts.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} ability boosts, got ${boosts.length}`);
  }

  // Check for duplicates
  const uniqueBoosts = [...new Set(boosts)];
  if (uniqueBoosts.length !== boosts.length) {
    errors.push('Cannot boost the same ability multiple times');
  }

  // Check for valid abilities
  const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  for (const ability of boosts) {
    if (!validAbilities.includes(ability)) {
      errors.push(`Invalid ability: ${ability}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate entire build plan
 * @param {Actor} actor - The actor
 * @param {Object} plan - Build plan
 * @returns {Object} Validation result { valid: boolean, errors: Array, levelErrors: Object }
 */
export function validateBuildPlan(actor, plan) {
  const errors = [];
  const levelErrors = {};

  if (!plan) {
    errors.push('No build plan provided');
    return { valid: false, errors, levelErrors };
  }

  if (!plan.levels) {
    errors.push('Build plan has no levels');
    return { valid: false, errors, levelErrors };
  }

  // Validate variant rules
  const currentRules = VariantRulesHelpers.detectVariantRules();
  const planRules = plan.variantRules || {};

  const rulesValidation = VariantRulesHelpers.validateVariantRulesCompatibility(planRules, currentRules);

  if (!rulesValidation.compatible) {
    errors.push(...rulesValidation.warnings);
  }

  // Validate each level
  for (let level = 1; level <= 20; level++) {
    const levelChoices = plan.levels[level]?.choices;

    if (!levelChoices) {
      levelErrors[level] = ['No choices for this level'];
      continue;
    }

    const levelValidation = validateLevelChoices(actor, level, levelChoices);

    if (!levelValidation.valid) {
      levelErrors[level] = levelValidation.errors;
    }
  }

  const hasLevelErrors = Object.keys(levelErrors).length > 0;

  return {
    valid: errors.length === 0 && !hasLevelErrors,
    errors,
    levelErrors,
    warnings: rulesValidation.warnings
  };
}

/**
 * Check if level choices are complete
 * @param {Actor} actor - The actor
 * @param {number} level - Level
 * @param {Object} choices - Choices object
 * @returns {boolean} True if complete
 */
export function areLevelChoicesComplete(actor, level, choices) {
  const validation = validateLevelChoices(actor, level, choices);
  return validation.valid;
}

/**
 * Get completion percentage for build plan
 * @param {Object} plan - Build plan
 * @returns {number} Percentage (0-100)
 */
export function getBuildPlanCompletionPercentage(plan) {
  if (!plan || !plan.levels) {
    return 0;
  }

  let totalLevels = 0;
  let completeLevels = 0;

  for (let level = 1; level <= 20; level++) {
    totalLevels++;

    const levelData = plan.levels[level];

    if (levelData && levelData.applied) {
      completeLevels++;
    }
  }

  return Math.round((completeLevels / totalLevels) * 100);
}

/**
 * Get incomplete levels in build plan
 * @param {Actor} actor - The actor
 * @param {Object} plan - Build plan
 * @returns {Array<number>} Array of incomplete level numbers
 */
export function getIncompleteLevels(actor, plan) {
  const incompleteLevels = [];

  if (!plan || !plan.levels) {
    return incompleteLevels;
  }

  for (let level = 1; level <= 20; level++) {
    const choices = plan.levels[level]?.choices;

    if (!choices) {
      incompleteLevels.push(level);
      continue;
    }

    const validation = validateLevelChoices(actor, level, choices);

    if (!validation.valid) {
      incompleteLevels.push(level);
    }
  }

  return incompleteLevels;
}
