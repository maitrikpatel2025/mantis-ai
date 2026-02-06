import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * Run the chat ID verification flow
 * @param {string} verificationCode - The code user should send to bot
 * @returns {Promise<string|null>} - The chat ID or null if skipped/failed
 */
export async function runVerificationFlow(verificationCode) {
  console.log(chalk.bold.yellow('\n  Chat ID Verification\n'));
  console.log(chalk.dim('  To lock the bot to your chat, send the verification code.\n'));
  console.log(chalk.cyan('  Send this message to your bot: ') + chalk.bold(verificationCode));
  console.log(chalk.dim('\n  The bot will reply with your chat ID. Paste it below.\n'));

  const { chatId } = await inquirer.prompt([{
    type: 'input',
    name: 'chatId',
    message: 'Paste your chat ID from the bot (or press Enter to skip):',
    validate: (input) => {
      if (!input) return true; // Allow empty to skip
      if (!/^-?\d+$/.test(input.trim())) {
        return 'Chat ID should be a number (can be negative for groups)';
      }
      return true;
    }
  }]);

  return chatId.trim() || null;
}

/**
 * Wait for server to pick up .env changes and verify it's running
 * @param {string} ngrokUrl - The ngrok URL
 * @param {string} apiKey - The API key for authentication
 * @returns {Promise<boolean>} - True if verified successfully
 */
export async function verifyRestart(ngrokUrl, apiKey) {
  console.log(chalk.dim('\n  Waiting for server to pick up changes...\n'));
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Verify server is up
  try {
    const response = await fetch(`${ngrokUrl}/ping`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.log(chalk.red('  ✗ Could not reach server.\n'));
      return false;
    }

    const data = await response.json();
    if (data.message !== 'Pong!') {
      console.log(chalk.red('  ✗ Unexpected server response.\n'));
      return false;
    }
  } catch (err) {
    console.log(chalk.red(`  ✗ Server not reachable: ${err.message}\n`));
    return false;
  }

  console.log(chalk.green('  ✓ Server is running\n'));
  return true;
}
