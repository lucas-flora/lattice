import type { NextConfig } from "next";
import { execSync } from "child_process";

const gitCommit = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.yaml': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
  },
  async headers() {
    return [
      {
        // Apply COOP/COEP headers to all routes for SharedArrayBuffer support
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
