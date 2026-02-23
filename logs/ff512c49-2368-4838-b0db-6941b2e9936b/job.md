Open `config/CRONS.json` and update the "heartbeat" cron job:
1. Change the schedule from the current value to `*/10 * * * *` (every 10 minutes)
2. Set "enabled" to true
3. Keep all other fields unchanged

If the heartbeat cron doesn't exist, create it with:
- name: "heartbeat"
- schedule: "*/10 * * * *" 
- enabled: true
- command: appropriate heartbeat command based on existing system patterns