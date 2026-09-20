/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "**.fal.ai" },
    ],
  },
  // These two resolve their binary's path from __dirname at runtime; left
  // to Next's webpack bundling for API routes, that path gets rewritten
  // and the binary can't be found. Keeping them external (loaded via plain
  // require, not bundled) is what the shorts pipeline's ffmpeg wrapper
  // (pipeline/ffmpeg.ts) relies on.
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  },
};

export default nextConfig;
