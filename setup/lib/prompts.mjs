import inquirer from 'inquirer';
import open from 'open';
import { PROVIDERS } from './providers.mjs';

/**
 * Mask a secret, showing only last 4 characters
 */
export function maskSecret(secret) {
  if (!secret || secret.length < 8) return '****';
  return '****' + secret.slice(-4);
}

/**
 * Prompt for GitHub PAT
 */
export async function promptForPAT() {
  const { pat } = await inquirer.prompt([
    {
      type: 'password',
      name: 'pat',
      message: 'Paste your GitHub Personal Access Token:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'PAT is required';
        if (!input.startsWith('ghp_') && !input.startsWith('github_pat_')) {
          return 'Invalid PAT format. Should start with ghp_ or github_pat_';
        }
        return true;
      },
    },
  ]);
  return pat;
}

/**
 * Prompt for LLM provider selection
 */
export async function promptForProvider() {
  const choices = Object.entries(PROVIDERS).map(([key, p]) => ({
    name: p.label,
    value: key,
  }));
  choices.push({ name: 'Local (OpenAI Compatible API)', value: 'custom' });

  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Which LLM for your agent?',
      choices,
    },
  ]);
  return provider;
}

/**
 * Prompt for model selection from a provider's model list
 */
export async function promptForModel(providerKey) {
  const provider = PROVIDERS[providerKey];
  const choices = provider.models.map((m) => ({
    name: m.default ? `${m.name} (recommended)` : m.name,
    value: m.id,
  }));
  choices.push({ name: 'Custom (enter model ID)', value: '__custom__' });

  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Which model?',
      choices,
    },
  ]);

  if (model === '__custom__') {
    const { customModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customModel',
        message: `Enter ${provider.name} model ID:`,
        validate: (input) => input ? true : 'Model ID is required',
      },
    ]);
    return customModel;
  }

  return model;
}

/**
 * Prompt for an API key for a known provider
 */
export async function promptForApiKey(providerKey) {
  const provider = PROVIDERS[providerKey];

  const { openPage } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openPage',
      message: `Open ${provider.name} API key page in browser?`,
      default: true,
    },
  ]);
  if (openPage) {
    await open(provider.keyPage);
  }

  const { key } = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      message: `Enter your ${provider.name} API key:`,
      mask: '*',
      validate: (input) => {
        if (!input) return `${provider.name} API key is required`;
        if (provider.keyPrefix && !input.startsWith(provider.keyPrefix)) {
          return `Invalid format. Should start with ${provider.keyPrefix}`;
        }
        return true;
      },
    },
  ]);
  return key;
}

/**
 * Prompt for an optional API key with a purpose description
 */
export async function promptForOptionalKey(providerKey, purpose) {
  const provider = PROVIDERS[providerKey];

  const { addKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addKey',
      message: `Add ${provider.name} API key for ${purpose}? (optional)`,
      default: false,
    },
  ]);

  if (!addKey) return null;

  const { openPage } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openPage',
      message: `Open ${provider.name} API key page in browser?`,
      default: true,
    },
  ]);
  if (openPage) {
    await open(provider.keyPage);
  }

  const { key } = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      message: `Enter your ${provider.name} API key:`,
      mask: '*',
      validate: (input) => {
        if (!input) return 'Key is required if adding';
        if (provider.keyPrefix && !input.startsWith(provider.keyPrefix)) {
          return `Invalid format. Should start with ${provider.keyPrefix}`;
        }
        return true;
      },
    },
  ]);
  return key;
}

/**
 * Prompt for custom/local LLM provider details
 */
export async function promptForCustomProvider() {
  const { baseUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'API base URL (e.g., http://myhost.ddns.net:11434/v1):',
      validate: (input) => {
        if (!input) return 'Base URL is required';
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return true;
      },
    },
  ]);

  const { model } = await inquirer.prompt([
    {
      type: 'input',
      name: 'model',
      message: 'Model ID (e.g., llama3.3:70b):',
      validate: (input) => input ? true : 'Model ID is required',
    },
  ]);

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'API key (leave blank if not needed):',
      mask: '*',
    },
  ]);

  return { baseUrl, model, apiKey };
}

/**
 * Prompt for optional Brave Search API key
 */
export async function promptForBraveKey() {
  const { addKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addKey',
      message: 'Add Brave Search API key? (free tier, greatly improves agent)',
      default: true,
    },
  ]);

  if (!addKey) return null;

  console.log('\n  To get a free Brave Search API key:');
  console.log('  1. Go to https://api-dashboard.search.brave.com/app/keys');
  console.log('  2. Click "Get Started"');
  console.log('  3. Create an account (or sign in)');
  console.log('  4. Subscribe to the "Free" plan (2,000 queries/month)');
  console.log('  5. Copy your API key\n');

  const { openPage } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openPage',
      message: 'Open Brave Search API page in browser?',
      default: true,
    },
  ]);
  if (openPage) {
    await open('https://api-dashboard.search.brave.com/app/keys');
  }

  const { key } = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      message: 'Enter your Brave Search API key:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'Key is required if adding';
        return true;
      },
    },
  ]);
  return key;
}

/**
 * Prompt for Telegram bot token
 */
export async function promptForTelegramToken() {
  const { addTelegram } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addTelegram',
      message: 'Set up Telegram bot?',
      default: true,
    },
  ]);

  if (!addTelegram) return null;

  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your Telegram bot token from @BotFather:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'Token is required';
        if (!/^\d+:[A-Za-z0-9_-]+$/.test(input)) {
          return 'Invalid format. Should be like 123456789:ABC-DEF...';
        }
        return true;
      },
    },
  ]);
  return token;
}

/**
 * Generate a Telegram webhook secret
 */
export async function generateTelegramWebhookSecret() {
  const { randomBytes } = await import('crypto');
  return randomBytes(32).toString('hex');
}

/**
 * Prompt for deployment method
 */
export async function promptForDeployMethod() {
  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'How would you like to deploy the event handler?',
      choices: [
        { name: 'Deploy to Vercel via CLI (recommended)', value: 'vercel' },
        { name: 'Open Vercel Deploy Button in browser', value: 'button' },
        { name: 'Skip - I\'ll deploy manually later', value: 'skip' },
      ],
    },
  ]);
  return method;
}

/**
 * Prompt for confirmation
 */
export async function confirm(message, defaultValue = true) {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

/**
 * Press enter to continue (no Y/n)
 */
export async function pressEnter(message = 'Press enter to continue') {
  await inquirer.prompt([
    {
      type: 'input',
      name: '_',
      message,
    },
  ]);
}

/**
 * Prompt for text input
 */
export async function promptText(message, defaultValue = '') {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);
  return value;
}
