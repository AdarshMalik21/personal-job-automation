import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.trim();
    if (!target) return [];
    return [
      {
        source: "/api/backend/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
