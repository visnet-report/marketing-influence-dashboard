import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the imports/ CSV directory with the serverless sync function so
  // LinkedIn Company Engagement Reports committed to the repo are readable
  // at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/cron/sync": ["./imports/**/*"],
  },
};

export default nextConfig;
