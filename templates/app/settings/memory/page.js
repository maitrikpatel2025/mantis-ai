import { auth } from 'mantis-ai/auth';
import { MemoriesPage } from 'mantis-ai/chat';

export default async function Page() {
  const session = await auth();
  return <MemoriesPage session={session} />;
}
