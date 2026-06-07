import { MODULE_NAME, debugLog } from './module.js';
import BuildPlanManager from './build-plan-manager.js';
import dataProvider from './data-provider.js';
import { validateLevelChoices } from './validators.js';
import * as ClassFeaturesHelpers from './helpers/class-features-helpers.js';
import * as SpellHelpers from './helpers/spell-helpers.js';
import * as SpellSlotProgression from './helpers/spell-slot-progression.js';

const FEAT_LOCATION_GROUPS = {
  classFeats: 'class',
  ancestryFeats: 'ancestry',
  skillFeats: 'skill',
  generalFeats: 'general',
  freeArchetypeFeats: 'archetype',
  ancestryParagonFeats: 'xdy_ancestryparagon',
  mythicFeats: 'mythic',
  dualClassFeats: 'xdy_dualclass'
};

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

function isPlanObject(value) {
  return value && typeof value === 'object' && value.levels && value.version;
}

function mergeUnique(target, values) {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

function notify(message, options) {
  if (options.notify === false || !ui?.notifications) return;
  ui.notifications.info(message);
}

function success(message, options) {
  if (options.notify === false || !ui?.notifications) return;
  ui.notifications.success(message);
}

function buildChoicesForValidation(choices = {}) {
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
    mergeUnique(normalized.spells[rankKey], ensureArray(normalized[flatKey]));
  }

  return normalized;
}

function getSpellSelectionSummary(normalizedChoices) {
  const spellSelections = [];

  for (const rankKey of SPELL_RANK_KEYS) {
    const uuids = ensureArray(normalizedChoices.spells?.[rankKey]);
    if (uuids.length > 0) {
      spellSelections.push({ rankKey, uuids });
    }
  }

  return spellSelections;
}

async function addAutoLearnSpells(actor, spellcastingEntry, classSlug, targetSlots, options) {
  const tradition = spellcastingEntry.system?.tradition?.value;
  if (!tradition) return [];

  let maxRank = 0;
  if (targetSlots) {
    maxRank = Math.max(0, ...Object.keys(targetSlots).map(Number));
  }

  const existingSpells = actor.items.filter(item => item.type === 'spell');
  const existingSpellNames = new Set(existingSpells.map(spell => spell.name.toLowerCase()));
  const spellsToAdd = [];

  for (let rank = 0; rank <= maxRank; rank++) {
    const spells = await dataProvider.getSpells({
      rank,
      tradition,
      rarity: 'common'
    });

    for (const spell of spells) {
      if (existingSpellNames.has(spell.name.toLowerCase())) continue;

      const spellClone = cloneData(spell.toObject());
      spellClone.system ??= {};
      spellClone.system.location ??= {};
      spellClone.system.location.value = spellcastingEntry.id;
      spellClone.flags ??= {};
      spellClone.flags.core ??= {};
      spellClone.flags.core.sourceId = spell.uuid;
      spellsToAdd.push(spellClone);
      existingSpellNames.add(spell.name.toLowerCase());
    }
  }

  if (spellsToAdd.length === 0) return [];

  const createdSpells = await actor.createEmbeddedDocuments('Item', spellsToAdd);
  notify(`Auto-learned ${createdSpells.length} ${tradition} spell(s)`, options);
  return createdSpells;
}

async function createSummaryChatMessage(actor, targetLevel, result, options) {
  if (options.createChatMessage === false) return null;

  const summaryParts = [];
  if (result.createdFeats.length > 0) summaryParts.push(`${result.createdFeats.length} feat(s)`);
  if (result.skillIncreases.length > 0) summaryParts.push(`${result.skillIncreases.length} skill increase(s)`);
  if (result.abilityBoosts.length > 0) summaryParts.push(`${result.abilityBoosts.length} ability boost(s)`);
  if (result.createdSpells.length > 0) summaryParts.push(`${result.createdSpells.length} spell(s)`);
  if (result.createdRunes.length > 0) summaryParts.push(`${result.createdRunes.length} rune(s)`);

  const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : 'No new selections applied';

  return await ChatMessage.create({
    user: game.user?.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<h3>Level Up Complete!</h3><p><strong>${actor.name}</strong> is now <strong>Level ${targetLevel}</strong>.</p><p>${summaryText}</p>`
  });
}

export class BuildPlanApplicator {
  static normalizeChoices(choices = {}) {
    return buildChoicesForValidation(choices);
  }

  static getChoicesFromSource(source, level) {
    if (isPlanObject(source)) {
      return BuildPlanManager.getLevelChoices(source, level);
    }

    return source ?? null;
  }

  static async applyLevel(actor, source, level, options = {}) {
    const numericLevel = normalizeLevel(level);
    const plan = isPlanObject(source) ? source : null;
    const rawChoices = this.getChoicesFromSource(source, numericLevel);

    if (!rawChoices) {
      throw new Error(`No choices found for level ${numericLevel}`);
    }

    const choices = cloneData(rawChoices);
    const normalizedChoices = this.normalizeChoices(choices);
    const validation = validateLevelChoices(actor, numericLevel, normalizedChoices);

    if (!validation.valid && options.allowInvalid !== true) {
      throw new Error(`Invalid level choices: ${validation.errors.join('; ')}`);
    }

    const result = {
      actorId: actor.id,
      actorName: actor.name,
      targetLevel: numericLevel,
      previousLevel: actor.system?.details?.level?.value ?? null,
      validation,
      levelUpdated: false,
      createdFeats: [],
      skippedFeats: [],
      skillIncreases: [],
      abilityBoosts: [],
      createdSpells: [],
      skippedSpells: [],
      createdRunes: [],
      skippedRunes: [],
      autoLearnedSpells: [],
      spellSlotUpdates: null,
      planUpdated: false,
      chatMessageId: null
    };

    if (options.dryRun === true) {
      return result;
    }

    notify(`Applying level ${numericLevel} selections...`, options);

    const currentLevel = actor.system?.details?.level?.value ?? 0;
    if (currentLevel < numericLevel) {
      await actor.update({ 'system.details.level.value': numericLevel });
      result.levelUpdated = true;
    }

    const featsToCreate = [];
    for (const [featType, locationGroup] of Object.entries(FEAT_LOCATION_GROUPS)) {
      const featUuid = choices[featType];
      if (!featUuid) continue;

      try {
        const feat = await fromUuid(featUuid);
        if (!feat) {
          result.skippedFeats.push({ featType, uuid: featUuid, reason: 'Not found' });
          continue;
        }

        const targetLocation = `${locationGroup}-${numericLevel}`;
        const existingFeat = actor.items.find(item =>
          item.type === 'feat' && (
            item.sourceId === featUuid ||
            item.uuid === featUuid ||
            item.flags?.core?.sourceId === featUuid ||
            (item.name === feat.name && item.system.location === targetLocation)
          )
        );

        if (existingFeat) {
          result.skippedFeats.push({ featType, uuid: featUuid, name: feat.name, reason: 'Already exists' });
          continue;
        }

        const featClone = cloneData(feat.toObject());
        featClone.system ??= {};
        featClone.system.location = targetLocation;
        featClone.system.level = {
          ...featClone.system.level,
          taken: numericLevel
        };
        featClone.flags ??= {};
        featClone.flags.core ??= {};
        featClone.flags.core.sourceId = featUuid;
        featsToCreate.push(featClone);
      } catch (error) {
        result.skippedFeats.push({ featType, uuid: featUuid, reason: error.message });
      }
    }

    if (featsToCreate.length > 0) {
      const createdFeats = await actor.createEmbeddedDocuments('Item', featsToCreate);
      result.createdFeats = createdFeats.map(item => ({ id: item.id, uuid: item.uuid, name: item.name }));
      notify(`Added ${createdFeats.length} feat(s)`, options);
    }

    if (normalizedChoices.skillIncreases.length > 0) {
      const skillUpdates = {};
      const rankChanges = {};

      for (const skillKey of normalizedChoices.skillIncreases) {
        const currentRankValue = rankChanges[skillKey] ?? actor.system.skills[skillKey]?.rank ?? 0;
        rankChanges[skillKey] = currentRankValue + 1;
        skillUpdates[`system.skills.${skillKey}.rank`] = rankChanges[skillKey];
        result.skillIncreases.push({
          key: skillKey,
          from: currentRankValue,
          to: rankChanges[skillKey]
        });
      }

      await actor.update(skillUpdates);
      notify(`Increased ${normalizedChoices.skillIncreases.length} skill(s)`, options);
    }

    if (normalizedChoices.abilityBoosts.length > 0) {
      const boostSet = ClassFeaturesHelpers.getCurrentBoostSet(actor, numericLevel);
      if (boostSet !== null) {
        const boostPath = `system.build.attributes.boosts.${boostSet}`;
        await actor.update({ [boostPath]: normalizedChoices.abilityBoosts });
        result.abilityBoosts = normalizedChoices.abilityBoosts.map(ability => ({ key: ability }));
        notify(`Applied ${normalizedChoices.abilityBoosts.length} ability boost(s)`, options);
      } else {
        debugLog('BuildPlanApplicator.applyLevel', `No boost set found for level ${numericLevel}`);
      }
    }

    const spellSelections = getSpellSelectionSummary(normalizedChoices);
    let spellcastingEntry = null;
    if (spellSelections.length > 0 || ClassFeaturesHelpers.isSpellcaster(actor)) {
      spellcastingEntry = SpellHelpers.getClassSpellcastingEntry(actor);
    }

    const spellsToCreate = [];
    for (const selection of spellSelections) {
      for (const spellUuid of selection.uuids) {
        try {
          const spell = await fromUuid(spellUuid);
          if (!spell) {
            result.skippedSpells.push({ rankKey: selection.rankKey, uuid: spellUuid, reason: 'Not found' });
            continue;
          }

          const existingSpell = actor.items.find(item =>
            item.type === 'spell' && (
              item.sourceId === spellUuid ||
              item.uuid === spellUuid ||
              item.flags?.core?.sourceId === spellUuid ||
              item.name === spell.name
            )
          );

          if (existingSpell) {
            result.skippedSpells.push({ rankKey: selection.rankKey, uuid: spellUuid, name: spell.name, reason: 'Already exists' });
            continue;
          }

          const spellClone = cloneData(spell.toObject());
          spellClone.flags ??= {};
          spellClone.flags.core ??= {};
          spellClone.flags.core.sourceId = spellUuid;

          if (spellcastingEntry) {
            spellClone.system ??= {};
            spellClone.system.location ??= {};
            spellClone.system.location.value = spellcastingEntry.id;
          }

          spellsToCreate.push(spellClone);
        } catch (error) {
          result.skippedSpells.push({ rankKey: selection.rankKey, uuid: spellUuid, reason: error.message });
        }
      }
    }

    if (spellsToCreate.length > 0) {
      const createdSpells = await actor.createEmbeddedDocuments('Item', spellsToCreate);
      result.createdSpells = createdSpells.map(item => ({ id: item.id, uuid: item.uuid, name: item.name }));
      notify(`Added ${createdSpells.length} spell(s) to your character`, options);
    }

    const runesToCreate = [];
    for (const runeUuid of normalizedChoices.runes) {
      try {
        const rune = await fromUuid(runeUuid);
        if (!rune) {
          result.skippedRunes.push({ uuid: runeUuid, reason: 'Not found' });
          continue;
        }

        const existingRune = actor.items.find(item =>
          item.sourceId === runeUuid ||
          item.uuid === runeUuid ||
          item.flags?.core?.sourceId === runeUuid ||
          item.name === rune.name
        );

        if (existingRune) {
          result.skippedRunes.push({ uuid: runeUuid, name: rune.name, reason: 'Already exists' });
          continue;
        }

        const runeClone = cloneData(rune.toObject());
        runeClone.flags ??= {};
        runeClone.flags.core ??= {};
        runeClone.flags.core.sourceId = runeUuid;
        runesToCreate.push(runeClone);
      } catch (error) {
        result.skippedRunes.push({ uuid: runeUuid, reason: error.message });
      }
    }

    if (runesToCreate.length > 0) {
      const createdRunes = await actor.createEmbeddedDocuments('Item', runesToCreate);
      result.createdRunes = createdRunes.map(item => ({ id: item.id, uuid: item.uuid, name: item.name }));
      notify(`Added ${createdRunes.length} rune(s) to your character`, options);
    }

    if (spellcastingEntry) {
      const classItem = actor.items.find(item => item.type === 'class');
      if (classItem) {
        const classSlug = classItem.slug || classItem.name?.toLowerCase().replace(/\s+/g, '-');
        const targetSlots = SpellSlotProgression.getSpellSlotsAtLevel(classSlug, numericLevel);

        if (targetSlots || SpellSlotProgression.isWaveCaster(classSlug)) {
          const slotUpdates = {};
          for (let rank = 1; rank <= 10; rank++) {
            const slotCount = (targetSlots && targetSlots[rank]) || 0;
            slotUpdates[`system.slots.slot${rank}`] = {
              max: slotCount,
              value: slotCount
            };
          }

          await spellcastingEntry.update(slotUpdates);
          result.spellSlotUpdates = slotUpdates;
        }

        if (SpellHelpers.autoLearnsCommonSpells(actor)) {
          const autoLearned = await addAutoLearnSpells(actor, spellcastingEntry, classSlug, targetSlots, options);
          result.autoLearnedSpells = autoLearned.map(item => ({ id: item.id, uuid: item.uuid, name: item.name }));
        }
      }
    }

    if (plan && options.updatePlan !== false) {
      BuildPlanManager.markLevelApplied(plan, numericLevel);
      if (options.savePlan !== false) {
        await BuildPlanManager.savePlan(actor, plan);
      }
      result.planUpdated = true;
    }

    const chatMessage = await createSummaryChatMessage(actor, numericLevel, result, options);
    result.chatMessageId = chatMessage?.id ?? null;

    success(`Successfully leveled up to ${numericLevel}!`, options);

    return result;
  }
}

export default BuildPlanApplicator;
