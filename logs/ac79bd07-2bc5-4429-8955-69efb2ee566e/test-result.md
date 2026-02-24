# SSE Test 4 - Live Notification Test

**Job ID:** ac79bd07-2bc5-4429-8955-69efb2ee566e  
**Test Name:** LIVE SSE TEST 4: should appear without refresh  
**Timestamp:** 2026-02-24T19:09:01Z  
**Status:** ✅ COMPLETED

## Test Objective

Verify that job completion notifications appear in the Mantis AI web UI without requiring a page refresh, using Server-Sent Events (SSE) or real-time update mechanism.

## Test Flow

1. ✅ Job created via event handler
2. ✅ GitHub Actions triggered `run-job.yml`
3. ✅ Docker agent container started
4. ✅ Agent executed task successfully
5. ⏳ Job PR will be auto-merged (if `AUTO_MERGE` enabled)
6. ⏳ `notify-pr-complete.yml` will fire
7. ⏳ Notification will be sent to `/api/github/webhook`
8. ⏳ UI should display notification without refresh

## Expected Behavior

The notification should appear in the web UI at:
- `/notifications` page (with unread badge)
- `/swarm` page (job status updated to completed)
- Toast/banner notification (if implemented)

## Test Data

- **Branch:** `job/ac79bd07-2bc5-4429-8955-69efb2ee566e`
- **PR Title:** Job: LIVE SSE TEST 4: should appear without refresh
- **Changed Files:** `/logs/ac79bd07-2bc5-4429-8955-69efb2ee566e/test-result.md`

## Success Criteria

- ✅ Job completes without errors
- ⏳ Notification appears in UI without manual refresh
- ⏳ Notification contains job details (ID, title, status)
- ⏳ Timestamp is accurate

## Notes

This is a minimal test job designed to verify the end-to-end notification pipeline from job completion to UI update.
