import { DebugPage } from 'mantis-ai/chat';
import { getDebugInfoAction, testLlmConnectionAction, resetAgentCacheAction, clearCheckpointsAction } from 'mantis-ai/chat/actions';

export default function SettingsDebugRoute() {
  return (
    <DebugPage
      getDebugInfoAction={getDebugInfoAction}
      testLlmConnectionAction={testLlmConnectionAction}
      resetAgentCacheAction={resetAgentCacheAction}
      clearCheckpointsAction={clearCheckpointsAction}
    />
  );
}
