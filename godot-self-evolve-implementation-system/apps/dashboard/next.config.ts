import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@zombie-farm/shared'],
};

export default nextConfig;
