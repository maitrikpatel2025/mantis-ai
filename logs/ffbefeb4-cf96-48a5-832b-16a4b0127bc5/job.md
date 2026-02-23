Open `config/CRONS.json` and modify the heartbeat cron job:
1. Change the schedule to `*/10 * * * *` (every 10 minutes)
2. Set `enabled: true` to activate it
3. Keep all other fields (name, description, etc.) unchanged

After making the changes, verify the JSON is valid and save the file.