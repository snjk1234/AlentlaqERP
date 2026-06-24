import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.BUILD_TARGET === 'electron' ? 'export' : undefined,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
