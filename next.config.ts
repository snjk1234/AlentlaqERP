import type { NextConfig } from "next";

const isElectronBuild = process.env.BUILD_TARGET === 'electron';

const nextConfig: NextConfig = {
  output: isElectronBuild ? 'export' : undefined,
  // The desktop export includes TSX pages, not TS API routes or the API proxy.
  pageExtensions: isElectronBuild ? ['tsx'] : ['tsx', 'ts', 'jsx', 'js'],
  serverExternalPackages: ['odbc'],
  images: {
    unoptimized: true
  }
};

export default nextConfig;
