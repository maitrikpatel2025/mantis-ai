import { SessionsPage } from 'mantis-ai/chat';
import { getActiveSessions } from 'mantis-ai/chat/actions';

export default function SettingsSessionsRoute() {
  return <SessionsPage getActiveSessionsAction={getActiveSessions} />;
}
