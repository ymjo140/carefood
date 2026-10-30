import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "케어푸드",
    short_name: "케어푸드",
    description: "내 몸에 맞는 식품, 성분으로 찾다 — 34만 식품 영양 DB 기반 AI 맞춤 추천",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F4F0",
    theme_color: "#C4870A",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
