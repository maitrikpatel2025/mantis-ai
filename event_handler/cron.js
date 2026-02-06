const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);
const { createJob } = require('./tools/create-job');
const CRON_DIR = path.join(__dirname, 'cron');

/**
 * Load and schedule crons from CRONS.json
 * @returns {Array} - Array of scheduled cron tasks
 */
function loadCrons() {
  const cronFile = path.join(__dirname, '..', 'operating_system', 'CRONS.json');

  console.log('\n--- Cron Jobs ---');

  if (!fs.existsSync(cronFile)) {
    console.log('No CRONS.json found');
    console.log('-----------------\n');
    return [];
  }

  const crons = JSON.parse(fs.readFileSync(cronFile, 'utf8'));
  const tasks = [];

  for (const { name, schedule, job, command, type = 'agent', enabled } of crons) {
    if (enabled === false) continue;

    if (!cron.validate(schedule)) {
      console.error(`Invalid schedule for "${name}": ${schedule}`);
      continue;
    }

    const task = cron.schedule(schedule, async () => {
      try {
        if (type === 'command') {
          const { stdout, stderr } = await execAsync(command, { cwd: CRON_DIR });
          const output = (stdout || stderr || '').trim();
          console.log(`[CRON] ${name}: ${output || 'ran'}`);
        } else {
          const result = await createJob(job);
          console.log(`[CRON] ${name}: job ${result.job_id}`);
        }
        console.log(`[CRON] ${name}: completed!`);
      } catch (err) {
        console.error(`[CRON] ${name}: error - ${err.message}`);
      }
    });

    tasks.push({ name, schedule, type, task });
  }

  if (tasks.length === 0) {
    console.log('No active cron jobs');
  } else {
    for (const { name, schedule, type } of tasks) {
      console.log(`  ${name}: ${schedule} (${type})`);
    }
  }

  console.log('-----------------\n');

  return tasks;
}

// Run if executed directly
if (require.main === module) {
  console.log('Starting cron scheduler...');
  loadCrons();
}

module.exports = { loadCrons };
