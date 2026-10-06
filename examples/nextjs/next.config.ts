import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: [
    '@signalkit/nextjs',
    '@signalkit/browser',
    '@signalkit/core',
    '@signalkit/contracts',
  ],
};
export default config;
