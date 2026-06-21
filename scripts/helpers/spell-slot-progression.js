// Spell Slot Progression Tables
// Defines spell slots available at each level for each spellcasting class
import { debugLog } from '../module.js';

/**
 * Individual class spell slot progressions
 * Each class has its own progression table mapping level -> {rank: slots}
 */
const CLASS_PROGRESSIONS = {
  // WIZARD - Full caster (Prepared)
  'wizard': {
    spellSlots: {
      1: { 1: 2 },
      2: { 1: 3 },
      3: { 1: 3, 2: 2 },
      4: { 1: 3, 2: 3 },
      5: { 1: 3, 2: 3, 3: 2 },
      6: { 1: 3, 2: 3, 3: 3 },
      7: { 1: 3, 2: 3, 3: 3, 4: 2 },
      8: { 1: 3, 2: 3, 3: 3, 4: 3 },
      9: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 },
      10: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      11: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 },
      12: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
      13: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
      14: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 },
      15: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 },
      16: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 },
      17: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
      18: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
      19: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
      20: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }
    },
    learningRule: 'prepared'  // Learn 2 spells/level at highest rank
  },

  // SORCERER - Full caster (Spontaneous)
  'sorcerer': {
    spellSlots: {
      1: { 1: 3 },
      2: { 1: 4 },
      3: { 1: 4, 2: 3 },
      4: { 1: 4, 2: 4 },
      5: { 1: 4, 2: 4, 3: 3 },
      6: { 1: 4, 2: 4, 3: 4 },
      7: { 1: 4, 2: 4, 3: 4, 4: 3 },
      8: { 1: 4, 2: 4, 3: 4, 4: 4 },
      9: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 },
      10: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 },
      11: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 3 },
      12: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 },
      13: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 3 },
      14: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4 },
      15: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3 },
      16: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 },
      17: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 3 },
      18: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 },
      19: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 },
      20: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 }
    },
    learningRule: 'spontaneous'  // Learn 1 spell per new slot
  },

  // CLERIC - Full caster (Auto-learn)
  'cleric': {
    spellSlots: {
      1: { 1: 2 },
      2: { 1: 3 },
      3: { 1: 3, 2: 2 },
      4: { 1: 3, 2: 3 },
      5: { 1: 3, 2: 3, 3: 2 },
      6: { 1: 3, 2: 3, 3: 3 },
      7: { 1: 3, 2: 3, 3: 3, 4: 2 },
      8: { 1: 3, 2: 3, 3: 3, 4: 3 },
      9: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 },
      10: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      11: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 },
      12: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
      13: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
      14: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 },
      15: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 },
      16: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 },
      17: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
      18: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
      19: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
      20: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }
    },
    learningRule: 'auto'  // Auto-learns all common spells
  },

  // DRUID - Full caster (Auto-learn)
  'druid': {
    spellSlots: {
      1: { 1: 2 },
      2: { 1: 3 },
      3: { 1: 3, 2: 2 },
      4: { 1: 3, 2: 3 },
      5: { 1: 3, 2: 3, 3: 2 },
      6: { 1: 3, 2: 3, 3: 3 },
      7: { 1: 3, 2: 3, 3: 3, 4: 2 },
      8: { 1: 3, 2: 3, 3: 3, 4: 3 },
      9: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 },
      10: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      11: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 },
      12: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
      13: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
      14: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 },
      15: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 },
      16: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 },
      17: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
      18: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
      19: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
      20: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }
    },
    learningRule: 'auto'
  },

  // BARD - Full caster (Spontaneous)
  'bard': {
    spellSlots: {
      1: { 1: 2 },
      2: { 1: 3 },
      3: { 1: 3, 2: 2 },
      4: { 1: 3, 2: 3 },
      5: { 1: 3, 2: 3, 3: 2 },
      6: { 1: 3, 2: 3, 3: 3 },
      7: { 1: 3, 2: 3, 3: 3, 4: 2 },
      8: { 1: 3, 2: 3, 3: 3, 4: 3 },
      9: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 },
      10: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      11: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 },
      12: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
      13: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
      14: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 },
      15: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 },
      16: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 },
      17: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
      18: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
      19: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
      20: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }
    },
    learningRule: 'spontaneous'
  },

  // ORACLE - Full caster (Spontaneous)
  'oracle': {
    spellSlots: {
      1: { 1: 3 },
      2: { 1: 4 },
      3: { 1: 4, 2: 3 },
      4: { 1: 4, 2: 4 },
      5: { 1: 4, 2: 4, 3: 3 },
      6: { 1: 4, 2: 4, 3: 4 },
      7: { 1: 4, 2: 4, 3: 4, 4: 3 },
      8: { 1: 4, 2: 4, 3: 4, 4: 4 },
      9: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 },
      10: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 },
      11: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 3 },
      12: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 },
      13: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 3 },
      14: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4 },
      15: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3 },
      16: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 },
      17: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 3 },
      18: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 },
      19: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 },
      20: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 }
    },
    learningRule: 'spontaneous'
  },

  // WITCH - Full caster (Prepared)
  'witch': {
    spellSlots: {
      1: { 1: 2 },
      2: { 1: 3 },
      3: { 1: 3, 2: 2 },
      4: { 1: 3, 2: 3 },
      5: { 1: 3, 2: 3, 3: 2 },
      6: { 1: 3, 2: 3, 3: 3 },
      7: { 1: 3, 2: 3, 3: 3, 4: 2 },
      8: { 1: 3, 2: 3, 3: 3, 4: 3 },
      9: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 },
      10: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
      11: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 },
      12: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
      13: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
      14: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 },
      15: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 },
      16: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 },
      17: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
      18: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
      19: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
      20: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }
    },
    learningRule: 'prepared'
  },

  // ANIMIST - Full caster (Auto-learn) with dual spell lists
  // Format is Animist Spells + Apparition Spells (e.g., 2+1 = 2 animist, 1 apparition)
  'animist': {
    spellSlots: {
      // Animist Spell slots only (primary list)
      1: { 0: 2, 1: 1 },
      2: { 0: 2, 1: 2 },
      3: { 0: 2, 1: 2, 2: 1 },
      4: { 0: 2, 1: 2, 2: 2 },
      5: { 0: 2, 1: 2, 2: 2, 3: 1 },
      6: { 0: 2, 1: 2, 2: 2, 3: 2 },
      7: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 1 },
      8: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2 },
      9: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 1 },
      10: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
      11: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 },
      12: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
      13: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1 },
      14: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 },
      15: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1 },
      16: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 },
      17: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1 },
      18: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 },
      19: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 },
      20: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 }
    },
    // Apparition spell slots (secondary list)
    apparitionSlots: {
      1: { 0: 2, 1: 1 },
      2: { 0: 2, 1: 1 },
      3: { 0: 2, 1: 1, 2: 1 },
      4: { 0: 2, 1: 1, 2: 1 },
      5: { 0: 2, 1: 1, 2: 1, 3: 1 },
      6: { 0: 2, 1: 1, 2: 1, 3: 1 },
      7: { 0: 3, 1: 1, 2: 1, 3: 1, 4: 1 },
      8: { 0: 3, 1: 1, 2: 1, 3: 1, 4: 1 },
      9: { 0: 3, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
      10: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 1, 5: 1 },
      11: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 },
      12: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 },
      13: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1 },
      14: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1 },
      15: { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1, 8: 1 },
      16: { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1, 8: 1 },
      17: { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1, 9: 1 },
      18: { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1, 9: 1 },
      19: { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1, 10: 1 },
      20: { 0: 4, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1, 10: 1 }
    },
    learningRule: 'auto',
    hasDualSpellLists: true
  },

  // NECROMANCER - Full caster (Prepared)
  'necromancer': {
    spellSlots: {
      1: { 1: 1 },
      2: { 1: 2 },
      3: { 1: 2, 2: 1 },
      4: { 1: 2, 2: 2 },
      5: { 1: 2, 2: 2, 3: 1 },
      6: { 1: 2, 2: 2, 3: 2 },
      7: { 1: 2, 2: 2, 3: 2, 4: 1 },
      8: { 1: 2, 2: 2, 3: 2, 4: 2 },
      9: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1 },
      10: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
      11: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 },
      12: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
      13: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1 },
      14: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 },
      15: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1 },
      16: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 },
      17: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1 },
      18: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 },
      19: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 1 },
      20: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 1 }
    },
    learningRule: 'prepared'
  },

  // PSYCHIC - Full caster (Spontaneous)
  'psychic': {
    spellSlots: {
      1: { 1: 1 },
      2: { 1: 2 },
      3: { 1: 2, 2: 1 },
      4: { 1: 2, 2: 2 },
      5: { 1: 2, 2: 2, 3: 1 },
      6: { 1: 2, 2: 2, 3: 2 },
      7: { 1: 2, 2: 2, 3: 2, 4: 1 },
      8: { 1: 2, 2: 2, 3: 2, 4: 2 },
      9: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1 },
      10: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
      11: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 },
      12: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
      13: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1 },
      14: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 },
      15: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1 },
      16: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 },
      17: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1 },
      18: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 },
      19: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 1 },
      20: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 1 }
    },
    learningRule: 'spontaneous'
  },

  // MAGUS - Wave caster (Prepared) - loses lower rank slots as they level
  // Only has slots at their two highest accessible ranks
  'magus': {
    spellSlots: {
      1: { 1: 1 },
      2: { 1: 2 },
      3: { 1: 2, 2: 1 },
      4: { 1: 2, 2: 2 },
      5: { 2: 2, 3: 2 },           // Loses 1st rank slots
      6: { 2: 2, 3: 2 },
      7: { 3: 2, 4: 2 },           // Loses 2nd rank slots
      8: { 3: 2, 4: 2 },
      9: { 4: 2, 5: 2 },           // Loses 3rd rank slots
      10: { 4: 2, 5: 2 },
      11: { 5: 2, 6: 2 },          // Loses 4th rank slots
      12: { 5: 2, 6: 2 },
      13: { 6: 2, 7: 2 },          // Loses 5th rank slots
      14: { 6: 2, 7: 2 },
      15: { 7: 2, 8: 2 },          // Loses 6th rank slots
      16: { 7: 2, 8: 2 },
      17: { 8: 2, 9: 2 },          // Loses 7th rank slots
      18: { 8: 2, 9: 2 },
      19: { 8: 2, 9: 2 },
      20: { 8: 2, 9: 2 }
    },
    learningRule: 'prepared',
    isWaveCaster: true  // Flag to indicate slot loss behavior
  },

  // SUMMONER - Wave caster (Spontaneous) - loses lower rank slots as they level
  // Only has slots at their two highest accessible ranks
  'summoner': {
    spellSlots: {
      1: { 1: 1 },
      2: { 1: 2 },
      3: { 1: 2, 2: 1 },
      4: { 1: 2, 2: 2 },
      5: { 2: 2, 3: 2 },           // Loses 1st rank slots
      6: { 2: 2, 3: 2 },
      7: { 3: 2, 4: 2 },           // Loses 2nd rank slots
      8: { 3: 2, 4: 2 },
      9: { 4: 2, 5: 2 },           // Loses 3rd rank slots
      10: { 4: 2, 5: 2 },
      11: { 5: 2, 6: 2 },          // Loses 4th rank slots
      12: { 5: 2, 6: 2 },
      13: { 6: 2, 7: 2 },          // Loses 5th rank slots
      14: { 6: 2, 7: 2 },
      15: { 7: 2, 8: 2 },          // Loses 6th rank slots
      16: { 7: 2, 8: 2 },
      17: { 8: 2, 9: 2 },          // Loses 7th rank slots
      18: { 8: 2, 9: 2 },
      19: { 8: 2, 9: 2 },          // No 10th rank
      20: { 8: 2, 9: 2 }           // No 10th rank
    },
    learningRule: 'spontaneous',
    isWaveCaster: true  // Flag to indicate slot loss behavior
  }
};

/**
 * Get spell slots for a class at a specific level
 * @param {string} classSlug - Class slug (e.g., 'wizard', 'sorcerer')
 * @param {number} level - Character level (1-20)
 * @returns {Object} Spell slots by rank { 1: 2, 2: 0, ... }
 */
export function getSpellSlotsAtLevel(classSlug, level) {
  const progression = CLASS_PROGRESSIONS[classSlug];
  if (!progression) return {};

  return progression.spellSlots[level] || {};
}

/**
 * Get new spell slots gained at a specific level
 * @param {string} classSlug - Class slug
 * @param {number} level - Character level (1-20)
 * @returns {Object} New spell slots by rank { 1: 1, 2: 2, ... }
 */
export function getNewSpellSlotsAtLevel(classSlug, level) {
  if (level === 1) {
    // At level 1, all slots are "new"
    return getSpellSlotsAtLevel(classSlug, 1);
  }

  const currentSlots = getSpellSlotsAtLevel(classSlug, level);
  const previousSlots = getSpellSlotsAtLevel(classSlug, level - 1);

  const newSlots = {};

  // Calculate difference
  for (let rank = 1; rank <= 10; rank++) {
    const current = currentSlots[rank] || 0;
    const previous = previousSlots[rank] || 0;
    const gained = current - previous;

    if (gained > 0) {
      newSlots[rank] = gained;
    }
  }

  return newSlots;
}

/**
 * Calculate how many spells to learn at a specific level
 * @param {Actor} actor - The actor
 * @param {number} level - Character level (1-20)
 * @returns {Object} Spells to learn by rank { rank: count, highestRank: number, totalSpells: number }
 */
export function getSpellsToLearnAtLevel(actor, level) {
  const classItem = actor.items.find(i => i.type === 'class');
  if (!classItem) return { totalSpells: 0, byRank: {}, highestRank: 0 };

  // Use slug if available, otherwise normalize the class name (for playtest classes)
  const classSlug = classItem.slug || classItem.name?.toLowerCase().replace(/\s+/g, '-');
  const progression = CLASS_PROGRESSIONS[classSlug];
  
  // Debug logging to help identify unknown class slugs
  debugLog('getSpellsToLearnAtLevel', `Class slug: "${classSlug}", Name: "${classItem.name}", Has progression: ${!!progression}`);
  if (!progression) {
    console.warn(`SpellSlotProgression | No spell progression found for class slug "${classSlug}". If this is a spellcaster, the slug may need to be added to CLASS_PROGRESSIONS.`);
    return { totalSpells: 0, byRank: {}, highestRank: 0 };
  }

  const learningRule = progression.learningRule;

  // Auto-learning classes don't select spells
  if (learningRule === 'auto') {
    return { totalSpells: 0, byRank: {}, highestRank: 0, learningRule };
  }

  const newSlots = getNewSpellSlotsAtLevel(classSlug, level);
  const spellsToLearn = {};
  let totalSpells = 0;
  let highestRank = 0;

  if (learningRule === 'prepared') {
    // Prepared casters (Wizard, Witch, Magus, Necromancer) learn 2 spells per level
    // at the highest rank they can cast
    const slots = getSpellSlotsAtLevel(classSlug, level);
    for (let rank = 10; rank >= 1; rank--) {
      if (slots[rank] && slots[rank] > 0) {
        highestRank = rank;
        spellsToLearn[rank] = 2;
        totalSpells = 2;
        break;
      }
    }
  } else if (learningRule === 'spontaneous') {
    // Spontaneous casters learn 1 spell for each NEW spell slot gained
    for (let rank = 1; rank <= 10; rank++) {
      if (newSlots[rank] && newSlots[rank] > 0) {
        spellsToLearn[rank] = newSlots[rank]; // Learn 1 spell per new slot
        totalSpells += newSlots[rank];
        highestRank = Math.max(highestRank, rank);
      }
    }
  }

  return {
    totalSpells,
    byRank: spellsToLearn,
    highestRank,
    learningRule
  };
}

/**
 * Get the learning rule for a class
 * @param {string} classSlug - Class slug
 * @returns {string} Learning rule ('prepared', 'spontaneous', 'auto')
 */
export function getClassLearningRule(classSlug) {
  const progression = CLASS_PROGRESSIONS[classSlug];
  return progression ? progression.learningRule : 'auto';
}

/**
 * Check if a class requires spell selection
 * @param {string} classSlug - Class slug
 * @returns {boolean} True if class requires spell selection
 */
export function requiresSpellSelection(classSlug) {
  const rule = getClassLearningRule(classSlug);
  return rule === 'prepared' || rule === 'spontaneous';
}

/**
 * Check if a class is a wave caster (loses spell slots as they level)
 * @param {string} classSlug - Class slug
 * @returns {boolean} True if class is a wave caster
 */
export function isWaveCaster(classSlug) {
  const progression = CLASS_PROGRESSIONS[classSlug];
  return progression?.isWaveCaster === true;
}

/**
 * Check if a class has dual spell lists (like Animist)
 * @param {string} classSlug - Class slug
 * @returns {boolean} True if class has dual spell lists
 */
export function hasDualSpellLists(classSlug) {
  const progression = CLASS_PROGRESSIONS[classSlug];
  return progression?.hasDualSpellLists === true;
}

/**
 * Get apparition spell slots for Animist at a specific level
 * @param {number} level - Character level (1-20)
 * @returns {Object} Apparition spell slots by rank { 0: 2, 1: 1, ... }
 */
export function getApparitionSlotsAtLevel(level) {
  const progression = CLASS_PROGRESSIONS['animist'];
  if (!progression?.apparitionSlots) return {};
  return progression.apparitionSlots[level] || {};
}

/**
 * Get spell slots that are LOST at a specific level (for wave casters)
 * @param {string} classSlug - Class slug
 * @param {number} level - Character level (1-20)
 * @returns {Object} Lost spell slots by rank { 1: 2, ... }
 */
export function getLostSpellSlotsAtLevel(classSlug, level) {
  if (level === 1) return {};  // Can't lose slots at level 1

  const progression = CLASS_PROGRESSIONS[classSlug];
  if (!progression?.isWaveCaster) return {};

  const currentSlots = getSpellSlotsAtLevel(classSlug, level);
  const previousSlots = getSpellSlotsAtLevel(classSlug, level - 1);

  const lostSlots = {};

  // Calculate lost slots (where previous > current)
  for (let rank = 1; rank <= 10; rank++) {
    const current = currentSlots[rank] || 0;
    const previous = previousSlots[rank] || 0;
    const lost = previous - current;

    if (lost > 0) {
      lostSlots[rank] = lost;
    }
  }

  return lostSlots;
}

/**
 * Get complete spell slot changes at a level (gains and losses)
 * @param {string} classSlug - Class slug
 * @param {number} level - Character level (1-20)
 * @returns {Object} { gained: { rank: count }, lost: { rank: count } }
 */
export function getSpellSlotChangesAtLevel(classSlug, level) {
  return {
    gained: getNewSpellSlotsAtLevel(classSlug, level),
    lost: getLostSpellSlotsAtLevel(classSlug, level)
  };
}

/**
 * Get complete spell information for Animist including both spell lists
 * @param {number} level - Character level (1-20)
 * @returns {Object} { animistSlots: {...}, apparitionSlots: {...} }
 */
export function getAnimistSpellSlotsAtLevel(level) {
  return {
    animistSlots: getSpellSlotsAtLevel('animist', level),
    apparitionSlots: getApparitionSlotsAtLevel(level)
  };
}
