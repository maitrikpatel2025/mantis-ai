import { auth } from 'mantis-ai/auth';
import { JobsPage } from 'mantis-ai/chat';

export default async function Page() {
  const session = await auth();
  return <JobsPage session={session} />;
}
