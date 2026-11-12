import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@filamentiq/shared"],
  experimental: { externalDir: true },
};

export default nextConfig;
