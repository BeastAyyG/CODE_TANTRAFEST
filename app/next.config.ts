import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The repo root also has a lockfile (Hardhat); scope Turbopack to app/.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
