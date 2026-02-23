import { auth } from 'mantis-ai/auth';
import { redirect } from 'next/navigation';
import { DashboardPage } from 'mantis-ai/chat';
import { getDashboardData } from 'mantis-ai/chat/actions';

export default async function DashboardRoute() {
  const session = await auth();
  if (!session) redirect('/login');
  return <DashboardPage session={session} getDashboardDataAction={getDashboardData} />;
}
