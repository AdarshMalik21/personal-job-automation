import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.API_PROXY_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
