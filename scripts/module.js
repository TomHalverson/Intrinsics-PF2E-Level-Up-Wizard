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
Hooks.once('ready', () => {
  console.log(`${MODULE_TITLE} | Module ready`);

  // Initialize global API
  initializeAPI();

  // Register hooks for character sheet buttons
  Hooks.on('getActorSheetHeaderButtons', onGetActorSheetHeaderButtons);

  // Register hook for level-up detection
  Hooks.on('updateActor', onActorUpdate);
});

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

  // Debug mode
  game.settings.register(MODULE_NAME, 'debug-mode', {
    name: 'Debug Mode',
    hint: 'Enable debug logging to console',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
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

    // Managers (will be set when classes are imported)
    BuildPlanManager: null,
    DataProvider: null,

    // Helpers
    helpers: {},

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
