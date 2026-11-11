import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@madeye/ui", "@madeye/api-client"],
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
