import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@sekel/community-components", "@sekel/web-components", "@sekel/db"],
};

export default nextConfig;
