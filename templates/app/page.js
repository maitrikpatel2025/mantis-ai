import { auth } from 'mantis-ai/auth';
import { ChatPage } from 'mantis-ai/chat';

export default async function Home() {
  const session = await auth();
  return <ChatPage session={session} needsSetup={false} />;
}
