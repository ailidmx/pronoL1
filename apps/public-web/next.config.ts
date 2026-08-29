import type { NextConfig } from "next";
import path from "node:path";

function buildVersion(date = new Date()) {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}.${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: process.env.NEXT_PUBLIC_BUILD_VERSION ?? buildVersion(),
  },
  experimental: {
    typedRoutes: true,
  },
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(process.cwd(), "src");
    return config;
  },
};

export default nextConfig;
