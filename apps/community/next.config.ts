import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sekel/community-components", "@sekel/web-components"],
};

export default nextConfig;
