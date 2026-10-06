export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SIGNALKIT_OTEL_ENABLED === 'true') {
    const { registerNextInstrumentation } = await import('@signalkit/nextjs-server');
    registerNextInstrumentation({ serviceName: 'signalkit-next-demo' });
  }
}
