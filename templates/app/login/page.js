import { getPageAuthState } from 'mantis-ai/auth';
import { AsciiLogo } from '../components/ascii-logo';
import { SetupForm } from '../components/setup-form';
import { LoginForm } from '../components/login-form';
import { ThemeToggle } from '../components/theme-toggle';

export default async function LoginPage() {
  const { needsSetup } = await getPageAuthState();

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <AsciiLogo />
      {needsSetup ? <SetupForm /> : <LoginForm />}
    </main>
  );
}
