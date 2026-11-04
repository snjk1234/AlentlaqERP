import type { NextConfig } from "next";

const isElectronBuild = process.env.BUILD_TARGET === 'electron';
const isHostBuild = process.env.BUILD_TARGET === 'host';

const nextConfig: NextConfig = {
  output: isElectronBuild ? 'export' : isHostBuild ? 'standalone' : undefined,
  ...(isHostBuild ? {
    distDir: '.next-host',
    outputFileTracingIncludes: {
      '/*': ['./node_modules/odbc/**/*', './node_modules/dotenv/**/*']
    }
  } : {}),
  // The desktop export includes TSX pages, not TS API routes or the API proxy.
  pageExtensions: isElectronBuild ? ['tsx'] : ['tsx', 'ts', 'jsx', 'js'],
  serverExternalPackages: ['odbc'],
  images: {
    unoptimized: true
  }
};

export default nextConfig;
