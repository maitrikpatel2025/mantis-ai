import { auth } from 'mantis-ai/auth';
import { NotificationsPage } from 'mantis-ai/chat';

export default async function NotificationsRoute() {
  const session = await auth();
  return <NotificationsPage session={session} />;
}
