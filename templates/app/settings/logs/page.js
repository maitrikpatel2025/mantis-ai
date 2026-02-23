import { LogsPage } from 'mantis-ai/chat';
import { getLogsAction, clearLogsAction } from 'mantis-ai/chat/actions';

export default function SettingsLogsRoute() {
  return <LogsPage getLogsAction={getLogsAction} clearLogsAction={clearLogsAction} />;
}
