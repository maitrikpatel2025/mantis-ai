import { auth } from 'mantis-ai/auth';
import { ChatPage } from 'mantis-ai/chat';

export default async function ChatRoute({ params }) {
  const { chatId } = await params;
  const session = await auth();
  return <ChatPage session={session} needsSetup={false} chatId={chatId} />;
}
