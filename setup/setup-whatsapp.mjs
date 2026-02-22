#!/usr/bin/env node

import * as clack from '@clack/prompts';
import { checkPrerequisites } from './lib/prerequisites.mjs';
import { setSecret } from './lib/github.mjs';
import { updateEnvVariable } from './lib/auth.mjs';
import { loadEnvFile } from './lib/env.mjs';
import { randomBytes } from 'crypto';

async function main() {
  clack.intro('WhatsApp Channel Setup');
  clack.log.info('Configure a WhatsApp Business bot for your Mantis AI agent.');

  const prereqs = await checkPrerequisites();
  if (!prereqs.git.remoteInfo) {
    clack.log.error('Could not detect GitHub repository from git remote.');
    process.exit(1);
  }

  const { owner, repo } = prereqs.git.remoteInfo;
  const env = loadEnvFile();

  // Step 1: Phone Number ID
  let phoneNumberId = env?.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    clack.log.step('Go to https://developers.facebook.com/apps and create a WhatsApp Business app');
    clack.log.step('Find your Phone Number ID in the WhatsApp > API Setup section');

    phoneNumberId = await clack.text({
      message: 'WhatsApp Phone Number ID:',
      validate: (input) => {
        if (!input) return 'Phone Number ID is required';
      },
    });
    if (clack.isCancel(phoneNumberId)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Step 2: Access Token
  let accessToken = env?.WHATSAPP_ACCESS_TOKEN;
  if (accessToken) {
    clack.log.info('Found WHATSAPP_ACCESS_TOKEN in .env');
    const useExisting = await clack.confirm({ message: 'Use existing access token?' });
    if (clack.isCancel(useExisting) || !useExisting) accessToken = null;
  }

  if (!accessToken) {
    accessToken = await clack.password({
      message: 'WhatsApp Access Token:',
      validate: (input) => {
        if (!input) return 'Access token is required';
      },
    });
    if (clack.isCancel(accessToken)) {
      clack.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Step 3: Verify Token (for webhook registration)
  let verifyToken = env?.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    verifyToken = randomBytes(16).toString('hex');
    clack.log.info(`Generated verify token: ${verifyToken}`);
  }

  // Step 4: App Secret (optional, for signature verification)
  let appSecret = env?.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    appSecret = await clack.password({
      message: 'WhatsApp App Secret (optional, for webhook verification):',
    });
    if (clack.isCancel(appSecret)) appSecret = '';
  }

  // Save to .env
  updateEnvVariable('WHATSAPP_PHONE_NUMBER_ID', phoneNumberId);
  updateEnvVariable('WHATSAPP_ACCESS_TOKEN', accessToken);
  updateEnvVariable('WHATSAPP_VERIFY_TOKEN', verifyToken);
  if (appSecret) updateEnvVariable('WHATSAPP_APP_SECRET', appSecret);
  clack.log.success('WhatsApp credentials saved to .env');

  // Set GitHub secrets
  const s = clack.spinner();
  s.start('Setting GitHub secrets...');
  await setSecret(owner, repo, 'AGENT_WHATSAPP_ACCESS_TOKEN', accessToken);
  if (appSecret) await setSecret(owner, repo, 'AGENT_WHATSAPP_APP_SECRET', appSecret);
  s.stop('GitHub secrets set');

  // Show webhook URL
  const appUrl = env?.APP_URL || '<your-app-url>';
  clack.log.step('Set your WhatsApp webhook configuration to:');
  clack.log.step(`  Callback URL: ${appUrl}/api/whatsapp/webhook`);
  clack.log.step(`  Verify Token: ${verifyToken}`);

  clack.outro('WhatsApp setup complete! Enable the channel in config/CHANNELS.json.');
}

main().catch((error) => {
  clack.log.error(`Failed: ${error.message}`);
  process.exit(1);
});
