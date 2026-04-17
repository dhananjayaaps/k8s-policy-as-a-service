import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/artifacthub/:path*',
        destination: 'https://artifacthub.io/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
