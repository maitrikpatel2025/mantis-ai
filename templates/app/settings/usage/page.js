import { UsagePage } from 'mantis-ai/chat';
import { getUsageStatsAction, getUsageByModelAction, getUsageByDayAction, getTokenBreakdownByDayAction, getUsageBySourceAction } from 'mantis-ai/chat/actions';

export default function SettingsUsageRoute() {
  return <UsagePage getUsageStatsAction={getUsageStatsAction} getUsageByModelAction={getUsageByModelAction} getUsageByDayAction={getUsageByDayAction} getTokenBreakdownByDayAction={getTokenBreakdownByDayAction} getUsageBySourceAction={getUsageBySourceAction} />;
}
