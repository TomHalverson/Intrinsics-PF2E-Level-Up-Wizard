// Intrinsics PF2e Level Up Wizard - Main Module File
// Handles Foundry hooks, settings, and API exposure

export const MODULE_NAME = 'intrinsics-pf2e-level-up-wizard';
export const MODULE_TITLE = 'Intrinsics PF2e Level Up Wizard';

// ============================================================================
// FOUNDRY HOOKS
// ============================================================================

/**
 * Initialize module on Foundry init
 */
Hooks.once('init', async () => {
  console.log(`${MODULE_TITLE} | Initializing module`);

  // Register module settings
  registerSettings();

  // Register Handlebars helpers
  registerHandlebarsHelpers();

  // Load and register Handlebars partials
  await loadTemplates([
    'modules/intrinsics-pf2e-level-up-wizard/templates/partials/ability-boosts.hbs',
    'modules/intrinsics-pf2e-level-up-wizard/templates/partials/feat-choice.hbs',
    'modules/intrinsics-pf2e-level-up-wizard/templates/partials/plan-summary.hbs',
    'modules/intrinsics-pf2e-level-up-wizard/templates/partials/skill-selector.hbs',
    'modules/intrinsics-pf2e-level-up-wizard/templates/partials/spell-choice.hbs'
  ]);

  console.log(`${MODULE_TITLE} | Module initialized`);
});

/**
 * Module ready - set up buttons and listeners
 */
Hooks.once('ready', async () => {
  console.log(`${MODULE_TITLE} | Module ready`);

  // Initialize global API
  initializeAPI();

  // Register hooks for character sheet buttons
  // V14: PF2E character sheets are ApplicationV2 → use getHeaderControlsApplicationV2.
  // Keep the V1 hook registered too as a no-op safety net for any V1 sheets.
  Hooks.on('getActorSheetHeaderButtons', onGetActorSheetHeaderButtons);
  Hooks.on('getHeaderControlsApplicationV2', onGetHeaderControlsApplicationV2);

  // Register hook for level-up detection
  Hooks.on('updateActor', onActorUpdate);
  
  // Register hook to apply accessibility settings when any app renders
  Hooks.on('renderApplication', onRenderApplication);
  Hooks.on('renderApplicationV2', onRenderApplicationV2);

  try {
    // Initialize TTS system
    const { TTSHelper } = await import('./helpers/tts-helper.js');
    await TTSHelper.initialize();
  } catch (error) {
    console.warn(`${MODULE_TITLE} | TTS initialization failed:`, error);
  }

  try {
    // Apply accessibility settings to document
    applyAccessibilitySettings();
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Failed to apply accessibility settings:`, error);
  }

  try {
    await game.intrinsicsLevelUpWizard.registerQueryHandlers();
  } catch (error) {
    console.warn(`${MODULE_TITLE} | MCP query registration failed:`, error);
  }
});

/**
 * Apply accessibility settings when apps render
 */
function onRenderApplication(app, html, data) {
  // Check if this is one of our apps
  if (html.hasClass && html.hasClass('intrinsics-level-up-wizard')) {
    applyAccessibilityToElement(html[0] || html);
  }
}

function onRenderApplicationV2(app, element, options) {
  // Check if this is one of our apps
  if (element.classList && element.classList.contains('intrinsics-level-up-wizard')) {
    applyAccessibilityToElement(element);
  }
}

/**
 * Apply accessibility settings to a specific element
 */
async function applyAccessibilityToElement(element) {
  const useDyslexiaFont = game.settings.get(MODULE_NAME, 'dyslexia-friendly-font');
  const useEnhancedReadability = game.settings.get(MODULE_NAME, 'enhanced-readability');
  const useHighContrast = game.settings.get(MODULE_NAME, 'high-contrast');
  const useTTS = game.settings.get(MODULE_NAME, 'text-to-speech');

  element.classList.toggle('dyslexia-font', useDyslexiaFont);
  element.classList.toggle('enhanced-readability', useEnhancedReadability);
  element.classList.toggle('high-contrast', useHighContrast);
  element.classList.toggle('tts-enabled', useTTS);
  
  // Add TTS buttons if enabled
  if (useTTS) {
    const { TTSHelper } = await import('./helpers/tts-helper.js');
    TTSHelper.addButtonsToContainer(element);
  }
}

// ============================================================================
// SETTINGS REGISTRATION
// ============================================================================

/**
 * Register module settings
 */
function registerSettings() {
  // Show build planner button on character sheet
  game.settings.register(MODULE_NAME, 'show-build-planner-button', {
    name: 'Show Build Planner Button',
    hint: 'Show the Build Planner button on character sheets',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Show level-up wizard button on character sheet
  game.settings.register(MODULE_NAME, 'show-level-up-button', {
    name: 'Show Level Up Button',
    hint: 'Show the Level Up Wizard button on character sheets',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Auto-prompt on level up
  game.settings.register(MODULE_NAME, 'auto-prompt-on-level-up', {
    name: 'Auto-prompt on Level Up',
    hint: 'Automatically show level-up wizard when character levels up',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Apply build plan by default
  game.settings.register(MODULE_NAME, 'default-apply-plan', {
    name: 'Default to Applying Build Plan',
    hint: 'When leveling up, default to applying the build plan if one exists',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  // Additional feat compendiums
  game.settings.register(MODULE_NAME, 'additional-feat-compendiums', {
    name: 'Additional Feat Compendiums',
    hint: 'Comma-separated list of additional compendium IDs to load feats from (e.g., "world.custom-feats, module.homebrew-feats")',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  // Additional spell compendiums
  game.settings.register(MODULE_NAME, 'additional-spell-compendiums', {
    name: 'Additional Spell Compendiums',
    hint: 'Comma-separated list of additional compendium IDs to load spells from',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  // Feat sort method
  game.settings.register(MODULE_NAME, 'feat-sort-method', {
    name: 'Feat Sort Method',
    hint: 'Default sorting method for feats in selector',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      'LEVEL_DESC': 'Level (High to Low)',
      'LEVEL_ASC': 'Level (Low to High)',
      'ALPHABETICAL': 'Alphabetical'
    },
    default: 'LEVEL_DESC'
  });

  game.settings.register(MODULE_NAME, 'spell-selector-group-by', {
    name: 'Spell Selector Grouping',
    hint: 'Default grouping mode for spells in the selector',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      'rank': 'Group by Rank',
      'tag': 'Group by Tag',
      'none': 'No Grouping'
    },
    default: 'rank'
  });

  game.settings.register(MODULE_NAME, 'spell-selector-show-uncommon', {
    name: 'Spell Selector Shows Uncommon',
    hint: 'Remember whether uncommon spells are shown in the spell selector',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_NAME, 'spell-selector-show-rare', {
    name: 'Spell Selector Shows Rare',
    hint: 'Remember whether rare spells are shown in the spell selector',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });

  // Debug mode
  game.settings.register(MODULE_NAME, 'debug-mode', {
    name: 'Debug Mode',
    hint: 'Enable debug logging to console',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  // ============================================================================
  // ACCESSIBILITY SETTINGS
  // ============================================================================

  // Dyslexia-friendly font
  game.settings.register(MODULE_NAME, 'dyslexia-friendly-font', {
    name: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.dyslexia-friendly-font.name'),
    hint: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.dyslexia-friendly-font.hint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: () => applyAccessibilitySettings()
  });

  // Text-to-speech
  game.settings.register(MODULE_NAME, 'text-to-speech', {
    name: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.text-to-speech.name'),
    hint: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.text-to-speech.hint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: () => applyAccessibilitySettings()
  });

  // TTS voice selection
  game.settings.register(MODULE_NAME, 'tts-voice', {
    name: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.tts-voice.name'),
    hint: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.tts-voice.hint'),
    scope: 'client',
    config: true,
    type: String,
    choices: getTTSVoiceChoices(),
    default: ''
  });

  // TTS speech rate
  game.settings.register(MODULE_NAME, 'tts-rate', {
    name: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.tts-rate.name'),
    hint: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.tts-rate.hint'),
    scope: 'client',
    config: true,
    type: Number,
    range: {
      min: 0.5,
      max: 2,
      step: 0.1
    },
    default: 1
  });

  // Enhanced readability (larger text, more spacing)
  game.settings.register(MODULE_NAME, 'enhanced-readability', {
    name: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.enhanced-readability.name'),
    hint: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.enhanced-readability.hint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: () => applyAccessibilitySettings()
  });

  // High contrast mode
  game.settings.register(MODULE_NAME, 'high-contrast', {
    name: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.high-contrast.name'),
    hint: game.i18n.localize('intrinsics-pf2e-level-up-wizard.settings.high-contrast.hint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: () => applyAccessibilitySettings()
  });
}

/**
 * Get available TTS voices as choices for settings
 */
function getTTSVoiceChoices() {
  const choices = { '': 'Default' };
  if ('speechSynthesis' in window) {
    // Note: voices may not be loaded immediately, but settings will use default
    const voices = speechSynthesis.getVoices();
    voices.forEach((voice, index) => {
      choices[index.toString()] = `${voice.name} (${voice.lang})`;
    });
  }
  return choices;
}

/**
 * Apply accessibility settings to all open wizard windows
 */
export function applyAccessibilitySettings() {
  const useDyslexiaFont = game.settings.get(MODULE_NAME, 'dyslexia-friendly-font');
  const useEnhancedReadability = game.settings.get(MODULE_NAME, 'enhanced-readability');
  const useHighContrast = game.settings.get(MODULE_NAME, 'high-contrast');
  const useTTS = game.settings.get(MODULE_NAME, 'text-to-speech');

  // Apply to all intrinsics wizard elements
  document.querySelectorAll('.intrinsics-level-up-wizard').forEach(el => {
    el.classList.toggle('dyslexia-font', useDyslexiaFont);
    el.classList.toggle('enhanced-readability', useEnhancedReadability);
    el.classList.toggle('high-contrast', useHighContrast);
    el.classList.toggle('tts-enabled', useTTS);
  });
}

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

/**
 * Register Handlebars helpers for templates
 */
function registerHandlebarsHelpers() {
  // Equality check
  Handlebars.registerHelper('eq', (a, b) => a === b);

  // Not equal check
  Handlebars.registerHelper('notEqual', (a, b) => a !== b);

  // Greater than
  Handlebars.registerHelper('gt', (a, b) => a > b);

  // Greater than or equal
  Handlebars.registerHelper('gte', (a, b) => a >= b);

  // Less than
  Handlebars.registerHelper('lt', (a, b) => a < b);

  // Less than or equal
  Handlebars.registerHelper('lte', (a, b) => a <= b);

  // OR logic
  Handlebars.registerHelper('or', (...args) => {
    const options = args.pop();
    return args.some(Boolean);
  });

  // AND logic
  Handlebars.registerHelper('and', (...args) => {
    const options = args.pop();
    return args.every(Boolean);
  });

  // NOT logic
  Handlebars.registerHelper('not', (value) => !value);

  // Array includes
  Handlebars.registerHelper('includes', (array, value) => {
    return Array.isArray(array) && array.includes(value);
  });

  // JSON stringify
  Handlebars.registerHelper('json', (context) => {
    return JSON.stringify(context);
  });

  // Capitalize first letter
  Handlebars.registerHelper('capitalize', (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  // Add numbers
  Handlebars.registerHelper('add', (a, b) => {
    return Number(a) + Number(b);
  });

  // Subtract numbers
  Handlebars.registerHelper('subtract', (a, b) => {
    return Number(a) - Number(b);
  });

  // Generate a range of numbers
  Handlebars.registerHelper('range', (start, end) => {
    const result = [];
    for (let i = start; i < end; i++) {
      result.push(i);
    }
    return result;
  });

  // Strip HTML tags for plain text
  Handlebars.registerHelper('plainText', (html) => {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  });

  // Join array elements with separator
  Handlebars.registerHelper('join', (array, separator = ', ') => {
    if (!Array.isArray(array)) return '';
    return array.join(separator);
  });
}

// ============================================================================
// API INITIALIZATION
// ============================================================================

/**
 * Initialize global API for module
 */
function initializeAPI() {
  // Create global namespace
  game.intrinsicsLevelUpWizard = {
    // Version info
    version: '1.0.0',

    // Module name
    moduleName: MODULE_NAME,

    // Applications (will be set when classes are imported)
    BuildPlannerApp: null,
    LevelUpWizardApp: null,
    FeatSelector: null,
    SpellSelector: null,
    RetrainingWizardApp: null,

    // Managers (will be set when classes are imported)
    BuildPlanManager: null,
    DataProvider: null,
    Service: null,

    // Helpers
    helpers: {},

    // Bridge / query integration
    queryPrefix: MODULE_NAME,

    getService: async () => {
      if (!game.intrinsicsLevelUpWizard.Service) {
        const serviceModule = await import('./mcp-service.js');
        game.intrinsicsLevelUpWizard.Service = serviceModule.default;
      }

      return game.intrinsicsLevelUpWizard.Service;
    },

    registerQueryHandlers: async () => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.registerQueryHandlers();
    },

    getRegisteredQueryMethods: async () => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.getRegisteredQueryMethods();
    },

    // API methods
    openBuildPlanner: async (actor) => {
      if (!game.intrinsicsLevelUpWizard.BuildPlannerApp) {
        const { BuildPlannerApp } = await import('./build-planner-app.js');
        game.intrinsicsLevelUpWizard.BuildPlannerApp = BuildPlannerApp;
      }
      const app = new game.intrinsicsLevelUpWizard.BuildPlannerApp(actor);
      app.render(true);
      return app;
    },

    openLevelUpWizard: async (actor, level) => {
      if (!game.intrinsicsLevelUpWizard.LevelUpWizardApp) {
        const { LevelUpWizardApp } = await import('./level-up-wizard-app.js');
        game.intrinsicsLevelUpWizard.LevelUpWizardApp = LevelUpWizardApp;
      }
      const app = new game.intrinsicsLevelUpWizard.LevelUpWizardApp(actor, level);
      app.render(true);
      return app;
    },

    openRetrainingWizard: async (actor, options = {}) => {
      if (!game.intrinsicsLevelUpWizard.RetrainingWizardApp) {
        const { RetrainingWizardApp } = await import('./retraining-wizard-app.js');
        game.intrinsicsLevelUpWizard.RetrainingWizardApp = RetrainingWizardApp;
      }
      const app = new game.intrinsicsLevelUpWizard.RetrainingWizardApp(actor, options);
      app.render(true);
      return app;
    },

    getActorSummary: async (actor) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.getActorSummary(actor);
    },

    getBuildPlan: async (actor, options = {}) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.getBuildPlan(actor, options);
    },

    createBuildPlan: async (actor, options = {}) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.createBuildPlan(actor, options);
    },

    saveBuildPlan: async (actor, plan) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.saveBuildPlan(actor, plan);
    },

    setLevelChoices: async (actor, level, choices, options = {}) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.setLevelChoices(actor, level, choices, options);
    },

    validateLevelChoices: async (actor, level, choices) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.validateLevelChoices(actor, level, choices);
    },

    validateBuildPlan: async (actor, plan = null) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.validateBuildPlan(actor, plan);
    },

    previewLevelUp: async (actor, level, choices = null) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.previewLevelUp(actor, level, choices);
    },

    applyLevelUp: async (actor, level, choices = null, options = {}) => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.applyLevelUp(actor, level, choices, options);
    },

    listRetrainingOptions: async (actor, category = 'all') => {
      const service = await game.intrinsicsLevelUpWizard.getService();
      return service.listRetrainingOptions(actor, category);
    }
  };

  console.log(`${MODULE_TITLE} | API initialized at game.intrinsicsLevelUpWizard`);
}

// ============================================================================
// CHARACTER SHEET BUTTONS
// ============================================================================

/**
 * Add buttons to character sheet header
 */
function onGetActorSheetHeaderButtons(sheet, buttons) {
  // Only add buttons to character sheets
  if (sheet.actor.type !== 'character') return;

  // Only add buttons for owned characters
  if (!sheet.actor.isOwner) return;

  const actor = sheet.actor;

  // Add Build Planner button
  if (game.settings.get(MODULE_NAME, 'show-build-planner-button')) {
    buttons.unshift({
      label: 'Build Planner',
      class: 'intrinsics-build-planner',
      icon: 'fas fa-list-ol',
      onclick: async () => {
        await game.intrinsicsLevelUpWizard.openBuildPlanner(actor);
      }
    });
  }

  // Add Level Up Wizard button
  if (game.settings.get(MODULE_NAME, 'show-level-up-button')) {
    buttons.unshift({
      label: 'Level Up',
      class: 'intrinsics-level-up-wizard',
      icon: 'fas fa-arrow-up',
      onclick: async () => {
        // Read current level when button is clicked (not when button is created)
        const currentLevel = actor.system.details.level.value;
        const targetLevel = currentLevel + 1;

        if (targetLevel > 20) {
          ui.notifications.warn('Character is already at maximum level (20)');
          return;
        }
        await game.intrinsicsLevelUpWizard.openLevelUpWizard(actor, targetLevel);
      }
    });
  }

  // Add Retraining button
  buttons.unshift({
    label: 'Retrain',
    class: 'intrinsics-retraining-wizard',
    icon: 'fas fa-rotate',
    onclick: async () => {
      await game.intrinsicsLevelUpWizard.openRetrainingWizard(actor);
    }
  });
}

/**
 * V14: ApplicationV2 header controls hook. PF2E character sheets use V2 in
 * V14, so getActorSheetHeaderButtons no longer fires for them. Same buttons
 * as the V1 hook above, V2-shaped.
 */
function onGetHeaderControlsApplicationV2(app, controls) {
  // Identify a character actor sheet — V2 sheets expose `actor` via the
  // ActorSheetV2 mixin, or fall back to app.document for raw DocumentSheetV2.
  const actor = app?.actor ?? app?.document;
  if (!actor || actor.documentName !== 'Actor') return;
  if (actor.type !== 'character') return;
  if (!actor.isOwner) return;

  if (game.settings.get(MODULE_NAME, 'show-build-planner-button')) {
    controls.unshift({
      action: 'intrinsics-build-planner',
      icon: 'fas fa-list-ol',
      label: 'Build Planner',
      onClick: async () => {
        await game.intrinsicsLevelUpWizard.openBuildPlanner(actor);
      }
    });
  }

  if (game.settings.get(MODULE_NAME, 'show-level-up-button')) {
    controls.unshift({
      action: 'intrinsics-level-up-wizard',
      icon: 'fas fa-arrow-up',
      label: 'Level Up',
      onClick: async () => {
        const currentLevel = actor.system.details.level.value;
        const targetLevel = currentLevel + 1;
        if (targetLevel > 20) {
          ui.notifications.warn('Character is already at maximum level (20)');
          return;
        }
        await game.intrinsicsLevelUpWizard.openLevelUpWizard(actor, targetLevel);
      }
    });
  }

  controls.unshift({
    action: 'intrinsics-retraining-wizard',
    icon: 'fas fa-rotate',
    label: 'Retrain',
    onClick: async () => {
      await game.intrinsicsLevelUpWizard.openRetrainingWizard(actor);
    }
  });
}

// ============================================================================
// LEVEL-UP DETECTION
// ============================================================================

/**
 * Detect when actor levels up and show prompt
 */
async function onActorUpdate(actor, changes, options, userId) {
  // Only for owned characters
  if (!actor.isOwner || actor.type !== 'character') return;

  // Only trigger for the user who made the change
  if (userId !== game.user.id) return;

  // Check if auto-prompt is enabled
  if (!game.settings.get(MODULE_NAME, 'auto-prompt-on-level-up')) return;

  // Check if level changed
  const newLevel = changes.system?.details?.level?.value;
  if (!newLevel) return;

  const oldLevel = foundry.utils.getProperty(actor, 'system.details.level.value');

  // Level increased
  if (newLevel > oldLevel) {
    console.log(`${MODULE_TITLE} | Detected level up: ${actor.name} reached level ${newLevel}`);

    // Check if build plan exists
    const { BuildPlanManager } = await import('./build-plan-manager.js');
    const plan = BuildPlanManager.loadPlan(actor);

    if (plan && plan.levels[newLevel]) {
      // Build plan exists for this level - show prompt dialog
      showLevelUpPrompt(actor, newLevel, plan);
    } else {
      // No plan exists - open wizard directly
      await game.intrinsicsLevelUpWizard.openLevelUpWizard(actor, newLevel);
    }
  }
}

/**
 * Show level-up prompt dialog
 */
function showLevelUpPrompt(actor, level, plan) {
  const levelChoices = plan.levels[level]?.choices || {};
  const defaultToPlan = game.settings.get(MODULE_NAME, 'default-apply-plan');

  // Build summary of what's in the plan
  const planSummary = [];
  if (levelChoices.classFeats) planSummary.push('Class Feat');
  if (levelChoices.ancestryFeats) planSummary.push('Ancestry Feat');
  if (levelChoices.skillFeats) planSummary.push('Skill Feat');
  if (levelChoices.generalFeats) planSummary.push('General Feat');
  if (levelChoices.freeArchetypeFeats) planSummary.push('Free Archetype Feat');
  if (levelChoices.mythicFeats) planSummary.push('Mythic Feat');
  if (levelChoices.skillIncreases?.length) planSummary.push(`Skill Increase (${levelChoices.skillIncreases.length})`);
  if (levelChoices.abilityBoosts?.length) planSummary.push(`Ability Boosts (${levelChoices.abilityBoosts.length})`);
  if (levelChoices.runes?.length) planSummary.push(`Runes (${levelChoices.runes.length})`);
  if (levelChoices.spells?.cantrips?.length) planSummary.push(`Cantrips (${levelChoices.spells.cantrips.length})`);
  if (levelChoices.spells?.rank1?.length) planSummary.push(`Spells (${levelChoices.spells.rank1.length})`);

  const summaryText = planSummary.length > 0
    ? `<p><strong>Build plan includes:</strong></p><ul><li>${planSummary.join('</li><li>')}</li></ul>`
    : '<p><em>Build plan is incomplete for this level.</em></p>';

  new Dialog({
    title: `Level Up to ${level}`,
    content: `
      <h2>Congratulations, ${actor.name}!</h2>
      <p>You've reached <strong>level ${level}</strong>!</p>
      <hr>
      <p>A build plan exists for this level.</p>
      ${summaryText}
      <p>Would you like to apply the build plan or manually level up?</p>
    `,
    buttons: {
      applyPlan: {
        icon: '<i class="fas fa-check-circle"></i>',
        label: 'Apply Build Plan',
        callback: async () => {
          await applyBuildPlanForLevel(actor, plan, level);
        }
      },
      manual: {
        icon: '<i class="fas fa-hand-pointer"></i>',
        label: 'Manual Level Up',
        callback: async () => {
          await game.intrinsicsLevelUpWizard.openLevelUpWizard(actor, level);
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Cancel'
      }
    },
    default: defaultToPlan ? 'applyPlan' : 'manual'
  }).render(true);
}

/**
 * Apply build plan for specific level
 */
async function applyBuildPlanForLevel(actor, plan, level) {
  try {
    const { BuildPlanApplicator } = await import('./build-plan-applicator.js');

    ui.notifications.info(`Applying build plan for level ${level}...`);

    await BuildPlanApplicator.applyLevel(actor, plan, level);

    ui.notifications.success(`Successfully applied build plan for level ${level}!`);
  } catch (error) {
    console.error(`${MODULE_TITLE} | Error applying build plan:`, error);
    ui.notifications.error(`Failed to apply build plan: ${error.message}`);
  }
}

// ============================================================================
// DEBUG LOGGING
// ============================================================================

/**
 * Debug log - only logs if debug mode is enabled
 */
export function debugLog(...args) {
  if (game.settings.get(MODULE_NAME, 'debug-mode')) {
    console.log(`${MODULE_TITLE} | DEBUG |`, ...args);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { registerSettings, registerHandlebarsHelpers };
