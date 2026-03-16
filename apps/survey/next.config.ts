import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sekel/web-components", "@sekel/db", "@sekel/survey-components"],
};

export default nextConfig;
