import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disabled: default-on filesystem cache grows unboundedly and loads into
    // RAM at startup, causing malloc errors on macOS.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
