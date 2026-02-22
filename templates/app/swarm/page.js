import { auth } from 'mantis-ai/auth';
import { SwarmPage } from 'mantis-ai/chat';

export default async function SwarmRoute() {
  const session = await auth();
  return <SwarmPage session={session} />;
}
