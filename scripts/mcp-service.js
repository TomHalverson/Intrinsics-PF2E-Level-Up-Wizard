import { MODULE_NAME, MODULE_TITLE, debugLog } from './module.js';
import BuildPlanManager from './build-plan-manager.js';
import BuildPlanApplicator from './build-plan-applicator.js';
import {
  validateBuildPlan,
  validateLevelChoices,
  getBuildPlanCompletionPercentage,
  getIncompleteLevels
} from './validators.js';
import * as ClassFeaturesHelpers from './helpers/class-features-helpers.js';
import { RetrainingWizardApp } from './retraining-wizard-app.js';

const SPELL_RANK_KEYS = [
  'cantrips',
  'rank1',
  'rank2',
  'rank3',
  'rank4',
  'rank5',
  'rank6',
  'rank7',
  'rank8',
  'rank9',
  'rank10'
];

const FLAT_SPELL_MAPPINGS = {
  cantrips: 'cantrips',
  rank1Spells: 'rank1',
  rank2Spells: 'rank2',
  rank3Spells: 'rank3',
  rank4Spells: 'rank4',
  rank5Spells: 'rank5',
  rank6Spells: 'rank6',
  rank7Spells: 'rank7',
  rank8Spells: 'rank8',
  rank9Spells: 'rank9',
  rank10Spells: 'rank10',
  additionalRank1Spells: 'rank1',
  additionalRank2Spells: 'rank2',
  additionalRank3Spells: 'rank3',
  additionalRank4Spells: 'rank4',
  additionalRank5Spells: 'rank5',
  additionalRank6Spells: 'rank6',
  additionalRank7Spells: 'rank7',
  additionalRank8Spells: 'rank8',
  additionalRank9Spells: 'rank9',
  additionalRank10Spells: 'rank10'
};

function cloneData(data) {
  return foundry.utils.deepClone(data);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLevel(level) {
  const numericLevel = Number(level);
  if (!Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 20) {
    throw new Error(`Invalid level: ${level}`);
  }
  return numericLevel;
}

function isActorDocument(value) {
  return value?.documentName === 'Actor' || value?.constructor?.name === 'Actor';
}

function uniquePush(list, values) {
  for (const value of values) {
    if (!list.includes(value)) {
      list.push(value);
    }
  }
}

function getSkillLocalizationKey(skillKey) {
  return `PF2E.Skill.${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`;
}

function summarizeDocument(document) {
  if (!document) return null;

  return {
    uuid: document.uuid,
    id: document.id,
    name: document.name,
    type: document.type,
    img: document.img,
    level: document.system?.level?.value ?? null,
    slug: document.slug ?? null,
    rarity: document.system?.traits?.rarity ?? null
  };
}

async function resolveDocuments(uuids) {
  const summaries = [];

  for (const uuid of ensureArray(uuids)) {
    if (!uuid || typeof uuid !== 'string') continue;

    try {
      const document = await fromUuid(uuid);
      summaries.push(summarizeDocument(document) ?? { uuid, name: uuid, missing: true });
    } catch (error) {
      summaries.push({ uuid, name: uuid, missing: true, error: error.message });
    }
  }

  return summaries;
}

function normalizeChoicesForValidation(choices = {}) {
  const normalized = cloneData(choices ?? {});

  normalized.skillIncreases = ensureArray(normalized.skillIncreases);
  normalized.abilityBoosts = ensureArray(normalized.abilityBoosts);
  normalized.runes = ensureArray(normalized.runes);
  normalized.spells = normalized.spells && typeof normalized.spells === 'object'
    ? cloneData(normalized.spells)
    : {};

  for (const rankKey of SPELL_RANK_KEYS) {
    normalized.spells[rankKey] = ensureArray(normalized.spells[rankKey]);
  }

  for (const [flatKey, rankKey] of Object.entries(FLAT_SPELL_MAPPINGS)) {
    uniquePush(normalized.spells[rankKey], ensureArray(normalized[flatKey]));
  }

  return normalized;
}

async function resolveActor(actorRef) {
  if (!actorRef) {
    throw new Error('Actor reference is required');
  }

  if (isActorDocument(actorRef)) {
    return actorRef;
  }

  if (typeof actorRef === 'object' && actorRef.id && game.actors?.get(actorRef.id)) {
    return game.actors.get(actorRef.id);
  }

  if (typeof actorRef === 'string') {
    const actorById = game.actors?.get(actorRef);
    if (actorById) return actorById;

    const lowerRef = actorRef.toLowerCase();
    const actorByName = game.actors?.find(actor => actor.name?.toLowerCase() === lowerRef);
    if (actorByName) return actorByName;

    try {
      const actorByUuid = await fromUuid(actorRef);
      if (isActorDocument(actorByUuid)) return actorByUuid;
    } catch {
      // Ignore UUID resolution failures and continue to final error.
    }
  }

  throw new Error(`Actor not found: ${String(actorRef)}`);
}

function getActorSummary(actor) {
  const classItem = actor.items.find(item => item.type === 'class');
  const ancestryItem = actor.items.find(item => item.type === 'ancestry');

  return {
    id: actor.id,
    uuid: actor.uuid,
    name: actor.name,
    type: actor.type,
    level: actor.system?.details?.level?.value ?? null,
    class: classItem ? summarizeDocument(classItem) : null,
    ancestry: ancestryItem ? summarizeDocument(ancestryItem) : null
  };
}

function getPlanDiagnostics(actor, plan) {
  return {
    completionPercentage: getBuildPlanCompletionPercentage(plan),
    incompleteLevels: getIncompleteLevels(actor, plan)
  };
}

function getLevelRequirements(actor, level) {
  return {
    featSlots: ClassFeaturesHelpers.getFeatSlotsForLevel(actor, level),
    abilityBoostInfo: ClassFeaturesHelpers.detectAbilityBoosts(actor, level),
    skillIncreaseCount: ClassFeaturesHelpers.getSkillIncreasesForLevel(actor, level),
    runesToLearn: ClassFeaturesHelpers.getRunesToLearnAtLevel(actor, level),
    isSpellcaster: ClassFeaturesHelpers.isSpellcaster(actor),
    newSpellRank: ClassFeaturesHelpers.getNewSpellRankAtLevel(actor, level)
  };
}

function getSelectedChoicesSource(choices, planChoices) {
  if (choices) return 'provided';
  if (planChoices) return 'build-plan';
  return 'empty';
}

function assertGMAccess() {
  if (!game.user?.isGM) {
    throw new Error('Access denied: GM permissions required');
  }
}

export class IntrinsicsMCPService {
  constructor() {
    this.queryPrefix = MODULE_NAME;
    this._registeredQueries = [];
  }

  async getActorSummary(actorRef) {
    const actor = await resolveActor(actorRef);
    return getActorSummary(actor);
  }

  async getBuildPlan(actorRef, options = {}) {
    const actor = await resolveActor(actorRef);
    let plan = BuildPlanManager.loadPlan(actor);

    if (!plan && options.createIfMissing) {
      plan = BuildPlanManager.createNewPlan(actor);
      if (options.save) {
        await BuildPlanManager.savePlan(actor, plan);
      }
    }

    return {
      actor: getActorSummary(actor),
      plan: plan ? cloneData(plan) : null,
      diagnostics: plan ? getPlanDiagnostics(actor, plan) : null
    };
  }

  async createBuildPlan(actorRef, options = {}) {
    assertGMAccess();

    const actor = await resolveActor(actorRef);
    const plan = BuildPlanManager.createNewPlan(actor);

    if (options.save !== false) {
      await BuildPlanManager.savePlan(actor, plan);
    }

    return {
      actor: getActorSummary(actor),
      plan: cloneData(plan),
      diagnostics: getPlanDiagnostics(actor, plan),
      saved: options.save !== false
    };
  }

  async saveBuildPlan(actorRef, plan) {
    assertGMAccess();

    const actor = await resolveActor(actorRef);
    await BuildPlanManager.savePlan(actor, cloneData(plan));

    const savedPlan = BuildPlanManager.loadPlan(actor);
    return {
      actor: getActorSummary(actor),
      plan: cloneData(savedPlan),
      diagnostics: getPlanDiagnostics(actor, savedPlan)
    };
  }

  async setLevelChoices(actorRef, level, choices, options = {}) {
    assertGMAccess();

    const actor = await resolveActor(actorRef);
    const numericLevel = normalizeLevel(level);
    const createPlanIfMissing = options.createPlanIfMissing !== false;
    let plan = BuildPlanManager.loadPlan(actor);

    if (!plan) {
      if (!createPlanIfMissing) {
        throw new Error(`No build plan found for ${actor.name}`);
      }
      plan = BuildPlanManager.createNewPlan(actor);
    }

    const choiceData = cloneData(choices ?? {});
    const normalizedChoices = normalizeChoicesForValidation(choiceData);
    const validation = validateLevelChoices(actor, numericLevel, normalizedChoices);

    BuildPlanManager.setLevelChoices(plan, numericLevel, choiceData);

    if (options.markApplied === true) {
      BuildPlanManager.markLevelApplied(plan, numericLevel);
    }

    if (options.save !== false) {
      await BuildPlanManager.savePlan(actor, plan);
    }

    return {
      actor: getActorSummary(actor),
      level: numericLevel,
      saved: options.save !== false,
      validation,
      choices: choiceData,
      normalizedChoices,
      plan: cloneData(plan),
      diagnostics: getPlanDiagnostics(actor, plan)
    };
  }

  async validateLevelChoices(actorRef, level, choices) {
    const actor = await resolveActor(actorRef);
    const numericLevel = normalizeLevel(level);
    const normalizedChoices = normalizeChoicesForValidation(choices);

    return {
      actor: getActorSummary(actor),
      level: numericLevel,
      validation: validateLevelChoices(actor, numericLevel, normalizedChoices),
      requirements: getLevelRequirements(actor, numericLevel),
      normalizedChoices
    };
  }

  async validateBuildPlan(actorRef, plan = null) {
    const actor = await resolveActor(actorRef);
    const targetPlan = plan ? cloneData(plan) : BuildPlanManager.loadPlan(actor);

    if (!targetPlan) {
      throw new Error(`No build plan found for ${actor.name}`);
    }

    return {
      actor: getActorSummary(actor),
      validation: validateBuildPlan(actor, targetPlan),
      diagnostics: getPlanDiagnostics(actor, targetPlan),
      plan: targetPlan
    };
  }

  async previewLevelUp(actorRef, targetLevel, choices = null) {
    const actor = await resolveActor(actorRef);
    const numericLevel = normalizeLevel(targetLevel);
    const plan = BuildPlanManager.loadPlan(actor);
    const planChoices = plan ? BuildPlanManager.getLevelChoices(plan, numericLevel) : null;
    const selectedChoices = choices ?? planChoices ?? {};
    const normalizedChoices = normalizeChoicesForValidation(selectedChoices);

    const featSelections = {};
    for (const featKey of [
      'classFeats',
      'ancestryFeats',
      'skillFeats',
      'generalFeats',
      'freeArchetypeFeats',
      'ancestryParagonFeats',
      'mythicFeats',
      'dualClassFeats'
    ]) {
      featSelections[featKey] = selectedChoices[featKey]
        ? await resolveDocuments([selectedChoices[featKey]])
        : [];
    }

    const skillSelections = ensureArray(selectedChoices.skillIncreases).map(skillKey => ({
      key: skillKey,
      name: game.i18n.localize(getSkillLocalizationKey(skillKey)),
      currentRank: actor.system?.skills?.[skillKey]?.rank ?? 0,
      newRank: (actor.system?.skills?.[skillKey]?.rank ?? 0) + 1
    }));

    const abilitySelections = ensureArray(selectedChoices.abilityBoosts).map(abilityKey => ({
      key: abilityKey,
      label: abilityKey.toUpperCase(),
      currentScore: actor.system?.abilities?.[abilityKey]?.value ?? null,
      currentModifier: actor.system?.abilities?.[abilityKey]?.mod ?? null
    }));

    const runeSelections = await resolveDocuments(selectedChoices.runes);

    const spellSelections = {};
    for (const rankKey of SPELL_RANK_KEYS) {
      const docs = await resolveDocuments(normalizedChoices.spells[rankKey]);
      if (docs.length > 0) {
        spellSelections[rankKey] = docs;
      }
    }

    return {
      actor: getActorSummary(actor),
      currentLevel: actor.system?.details?.level?.value ?? null,
      targetLevel: numericLevel,
      wouldIncreaseLevel: (actor.system?.details?.level?.value ?? 0) < numericLevel,
      source: getSelectedChoicesSource(choices, planChoices),
      requirements: getLevelRequirements(actor, numericLevel),
      validation: validateLevelChoices(actor, numericLevel, normalizedChoices),
      selections: {
        feats: featSelections,
        skills: skillSelections,
        abilityBoosts: abilitySelections,
        runes: runeSelections,
        spells: spellSelections,
        rawChoices: cloneData(selectedChoices),
        normalizedChoices
      }
    };
  }

  async applyLevelUp(actorRef, targetLevel, choices = null, options = {}) {
    assertGMAccess();

    const actor = await resolveActor(actorRef);
    const numericLevel = normalizeLevel(targetLevel);
    let plan = BuildPlanManager.loadPlan(actor);
    let source = plan;

    if (choices) {
      if (options.saveChoices === true || options.markApplied === true) {
        if (!plan) {
          plan = BuildPlanManager.createNewPlan(actor);
        }

        BuildPlanManager.setLevelChoices(plan, numericLevel, cloneData(choices));
        source = plan;
      } else {
        source = cloneData(choices);
      }
    } else if (!plan) {
      throw new Error(`No build plan found for ${actor.name}`);
    }

    const result = await BuildPlanApplicator.applyLevel(actor, source, numericLevel, {
      notify: options.notify ?? false,
      createChatMessage: options.createChatMessage ?? false,
      allowInvalid: options.allowInvalid ?? false,
      updatePlan: plan ? options.markApplied !== false : false,
      savePlan: plan ? options.savePlan !== false : false
    });

    const currentPlan = BuildPlanManager.loadPlan(actor);

    return {
      actor: getActorSummary(actor),
      result,
      plan: currentPlan ? cloneData(currentPlan) : null,
      diagnostics: currentPlan ? getPlanDiagnostics(actor, currentPlan) : null
    };
  }

  async listRetrainingOptions(actorRef, category = 'all') {
    const actor = await resolveActor(actorRef);
    const app = new RetrainingWizardApp(actor);

    const result = {
      actor: getActorSummary(actor),
      categories: {}
    };

    if (category === 'all' || category === 'feats') {
      result.categories.feats = await app._getRetrainableFeats();
    }

    if (category === 'all' || category === 'skills') {
      result.categories.skills = app._getRetrainableSkills();
    }

    if (category === 'all' || category === 'spells') {
      result.categories.spells = await app._getRetrainableSpells();
    }

    return result;
  }

  registerQueryHandlers() {
    CONFIG.queries ??= {};

    const handlers = {
      [`${this.queryPrefix}.ping`]: async () => ({
        ok: true,
        module: MODULE_NAME,
        title: MODULE_TITLE,
        version: game.intrinsicsLevelUpWizard?.version ?? '1.0.0'
      }),
      [`${this.queryPrefix}.listQueries`]: async () => ({
        methods: this.getRegisteredQueryMethods(),
        queryPrefix: this.queryPrefix
      }),
      [`${this.queryPrefix}.getActorSummary`]: async data => this.getActorSummary(data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid),
      [`${this.queryPrefix}.getBuildPlan`]: async data => this.getBuildPlan(data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid, data.options ?? {}),
      [`${this.queryPrefix}.createBuildPlan`]: async data => this.createBuildPlan(data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid, data.options ?? {}),
      [`${this.queryPrefix}.saveBuildPlan`]: async data => this.saveBuildPlan(data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid, data.plan),
      [`${this.queryPrefix}.setLevelChoices`]: async data => this.setLevelChoices(
        data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid,
        data.level,
        data.choices,
        data.options ?? {}
      ),
      [`${this.queryPrefix}.validateLevelChoices`]: async data => this.validateLevelChoices(
        data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid,
        data.level,
        data.choices
      ),
      [`${this.queryPrefix}.validateBuildPlan`]: async data => this.validateBuildPlan(
        data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid,
        data.plan ?? null
      ),
      [`${this.queryPrefix}.previewLevelUp`]: async data => this.previewLevelUp(
        data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid,
        data.targetLevel ?? data.level,
        data.choices ?? null
      ),
      [`${this.queryPrefix}.applyLevelUp`]: async data => this.applyLevelUp(
        data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid,
        data.targetLevel ?? data.level,
        data.choices ?? null,
        data.options ?? {}
      ),
      [`${this.queryPrefix}.listRetrainingOptions`]: async data => this.listRetrainingOptions(
        data.actor ?? data.actorId ?? data.actorName ?? data.actorUuid,
        data.category ?? 'all'
      )
    };

    for (const [key, handler] of Object.entries(handlers)) {
      CONFIG.queries[key] = handler;
    }

    this._registeredQueries = Object.keys(handlers);
    debugLog('IntrinsicsMCPService', 'Registered query handlers', this._registeredQueries);

    return cloneData(this._registeredQueries);
  }

  getRegisteredQueryMethods() {
    return cloneData(this._registeredQueries);
  }
}

const intrinsicsMCPService = new IntrinsicsMCPService();

export default intrinsicsMCPService;
