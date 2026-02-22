import { auth } from 'mantis-ai/auth';
import { AgentsPage } from 'mantis-ai/chat';
import { getAgentsList } from 'mantis-ai/chat/actions';

export default async function Page() {
  const session = await auth();
  return <AgentsPage session={session} getAgentsList={getAgentsList} />;
}
