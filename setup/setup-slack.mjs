#!/usr/bin/env node

import * as clack from '@clack/prompts';
import { checkPrerequisites } from './lib/prerequisites.mjs';
import { setSecret, setVariables } from './lib/github.mjs';
import { updateEnvVariable } from './lib/auth.mjs';
import { loadEnvFile } from './lib/env.mjs';

async function main() {
  clack.intro('Slack Channel Setup');
  clack.log.info('Configure a Slack bot for your Mantis AI agent.');

  const prereqs = await checkPrerequisites();
  if (!prereqs.git.remoteInfo) {
    clack.log.error('Could not detect GitHub repository from git remote.');
    process.exit(1);
  }

  const { owner, repo } = prereqs.git.remoteInfo;
  const env = loadEnvFile();

  // Step 1: Bot Token
  let botToken = env?.SLACK_BOT_TOKEN;
  if (botToken) {
    clack.log.info('Found SLACK_BOT_TOKEN in .env');
    const useExisting = await clack.confirm({ message: 'Use existing token?' });
    if (clack.isCancel(useExisting) || !useExisting) botToken = null;
  }

  if (!botToken) {
    clack.log.step('Create a Slack app at https://api.slack.com/apps');
    clack.log.step('Enable Event Subscriptions and subscribe to message.channels, message.im');
    clack.log.step('Add bot scopes: chat:write, channels:history, im:history, files:read, reactions:write');

    botToken = await clack.password({
      message: 'Slack Bot Token (xoxb-...):',
      validate: (input) => {
        if (!input) return 'Token is required';
        if (!input.startsWith('xoxb-')) return 'Must start with xoxb-';
      },
    });
    if (clack.isCancel(botToken)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Step 2: Signing Secret
  let signingSecret = env?.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    clack.log.info('Found SLACK_SIGNING_SECRET in .env');
    const useExisting = await clack.confirm({ message: 'Use existing signing secret?' });
    if (clack.isCancel(useExisting) || !useExisting) signingSecret = null;
  }

  if (!signingSecret) {
    signingSecret = await clack.password({
      message: 'Slack Signing Secret:',
      validate: (input) => {
        if (!input) return 'Signing secret is required';
      },
    });
    if (clack.isCancel(signingSecret)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Save to .env
  updateEnvVariable('SLACK_BOT_TOKEN', botToken);
  updateEnvVariable('SLACK_SIGNING_SECRET', signingSecret);
  clack.log.success('Slack credentials saved to .env');

  // Set GitHub secrets
  const s = clack.spinner();
  s.start('Setting GitHub secrets...');
  await setSecret(owner, repo, 'AGENT_SLACK_BOT_TOKEN', botToken);
  await setSecret(owner, repo, 'AGENT_SLACK_SIGNING_SECRET', signingSecret);
  s.stop('GitHub secrets set');

  // Show webhook URL
  const appUrl = env?.APP_URL || '<your-app-url>';
  clack.log.step(`Set your Slack Event Subscriptions URL to:`);
  clack.log.step(`  ${appUrl}/api/slack/webhook`);

  clack.outro('Slack setup complete! Enable the channel in config/CHANNELS.json.');
}

main().catch((error) => {
  clack.log.error(`Failed: ${error.message}`);
  process.exit(1);
});
