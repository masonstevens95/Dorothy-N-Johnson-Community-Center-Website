import type { NextConfig } from "next";

/**
 * Image handling is deliberately constrained.
 *
 * Vercel's Hobby tier caps image transformations per month and *pauses the
 * project* when a ceiling is tripped. Every distinct rendered size is a
 * separate transformation, so we pin a small fixed set of widths rather than
 * letting Next.js generate a variant per viewport. See lib/images.ts for the
 * matching ingest-side caps.
 */
const nextConfig: NextConfig = {
  images: {
    // Fixed variants keep the monthly transformation count bounded.
    deviceSizes: [640, 828, 1080, 1600],
    imageSizes: [256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
