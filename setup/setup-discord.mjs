#!/usr/bin/env node

import * as clack from '@clack/prompts';
import { checkPrerequisites } from './lib/prerequisites.mjs';
import { setSecret, setVariables } from './lib/github.mjs';
import { updateEnvVariable } from './lib/auth.mjs';
import { loadEnvFile } from './lib/env.mjs';

async function main() {
  clack.intro('Discord Channel Setup');
  clack.log.info('Configure a Discord bot for your Mantis AI agent.');

  const prereqs = await checkPrerequisites();
  if (!prereqs.git.remoteInfo) {
    clack.log.error('Could not detect GitHub repository from git remote.');
    process.exit(1);
  }

  const { owner, repo } = prereqs.git.remoteInfo;
  const env = loadEnvFile();

  // Step 1: Bot Token
  let botToken = env?.DISCORD_BOT_TOKEN;
  if (botToken) {
    clack.log.info('Found DISCORD_BOT_TOKEN in .env');
    const useExisting = await clack.confirm({ message: 'Use existing token?' });
    if (clack.isCancel(useExisting) || !useExisting) botToken = null;
  }

  if (!botToken) {
    clack.log.step('Create a Discord app at https://discord.com/developers/applications');
    clack.log.step('Create a bot and copy its token');
    clack.log.step('Enable MESSAGE CONTENT intent under Privileged Gateway Intents');

    botToken = await clack.password({
      message: 'Discord Bot Token:',
      validate: (input) => {
        if (!input) return 'Token is required';
      },
    });
    if (clack.isCancel(botToken)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Step 2: Application ID
  let applicationId = env?.DISCORD_APPLICATION_ID;
  if (!applicationId) {
    applicationId = await clack.text({
      message: 'Discord Application ID:',
      validate: (input) => {
        if (!input) return 'Application ID is required';
        if (!/^\d+$/.test(input)) return 'Must be a numeric ID';
      },
    });
    if (clack.isCancel(applicationId)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Step 3: Public Key
  let publicKey = env?.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    publicKey = await clack.text({
      message: 'Discord Public Key:',
      validate: (input) => {
        if (!input) return 'Public key is required';
      },
    });
    if (clack.isCancel(publicKey)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Save to .env
  updateEnvVariable('DISCORD_BOT_TOKEN', botToken);
  updateEnvVariable('DISCORD_APPLICATION_ID', applicationId);
  updateEnvVariable('DISCORD_PUBLIC_KEY', publicKey);
  clack.log.success('Discord credentials saved to .env');

  // Set GitHub secrets
  const s = clack.spinner();
  s.start('Setting GitHub secrets...');
  await setSecret(owner, repo, 'AGENT_DISCORD_BOT_TOKEN', botToken);
  s.stop('GitHub secrets set');

  // Show webhook URL
  const appUrl = env?.APP_URL || '<your-app-url>';
  clack.log.step(`Set your Discord Interactions Endpoint URL to:`);
  clack.log.step(`  ${appUrl}/api/discord/webhook`);

  clack.outro('Discord setup complete! Enable the channel in config/CHANNELS.json.');
}

main().catch((error) => {
  clack.log.error(`Failed: ${error.message}`);
  process.exit(1);
});
