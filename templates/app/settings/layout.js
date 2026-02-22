import { auth } from 'mantis-ai/auth';
import { SettingsLayout } from 'mantis-ai/chat';

export default async function Layout({ children }) {
  const session = await auth();
  return <SettingsLayout session={session}>{children}</SettingsLayout>;
}
