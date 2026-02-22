export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { register } = await import('mantis-ai/instrumentation');
    await register();
  }
}
