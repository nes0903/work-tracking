import path from "node:path";
import type { NextConfig } from "next";

const configuredBackendBaseUrl = process.env.BACKEND_BASE_URL;
if (process.env.VERCEL && !configuredBackendBaseUrl) {
  throw new Error("BACKEND_BASE_URL must be configured for Vercel deployments");
}
const backendBaseUrl = configuredBackendBaseUrl || "http://127.0.0.1:3001";

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
