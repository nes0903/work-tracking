import path from "node:path";
import type { NextConfig } from "next";

const backendBaseUrl = process.env.BACKEND_BASE_URL || "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
