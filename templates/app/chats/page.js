import { auth } from 'mantis-ai/auth';
import { ChatsPage } from 'mantis-ai/chat';

export default async function ChatsRoute() {
  const session = await auth();
  return <ChatsPage session={session} />;
}
