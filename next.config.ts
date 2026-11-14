import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 영상 처리 — ffmpeg 실행 파일을 번들하지 않고 node_modules 경로 그대로 쓰고, 그 함수에만 실행 파일을 싣는다
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/community/video": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
