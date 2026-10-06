import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: [
    '@techinject/nextjs',
    '@techinject/browser',
    '@techinject/core',
    '@techinject/contracts',
  ],
};
export default config;
