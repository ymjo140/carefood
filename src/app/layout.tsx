import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "케어푸드 | 내 입맛에 맞는 건강한 한 끼",
  description:
    "짠맛·단맛·매운맛·기름진맛 취향을 설정하면, 영양성분 데이터 기반으로 딱 맞는 식품을 추천합니다.",
  keywords: ["케어푸드", "맛 추천", "영양성분", "건강식", "간편식"],
  openGraph: {
    title: "케어푸드 | 내 입맛에 맞는 건강한 한 끼",
    description: "맛 취향 기반 식품 큐레이션 플랫폼",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
