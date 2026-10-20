import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
  title: "케어푸드 | 상황에 맞는 건강한 한 끼",
  description:
    "어르신, 환자, 산모 등 상황별 맞춤 식품 추천. 식약처 영양성분 데이터 기반 안전한 큐레이션.",
  keywords: ["케어푸드", "환자식", "어르신식사", "산모식단", "맞춤식품", "건강식"],
  openGraph: {
    title: "케어푸드 | 상황에 맞는 건강한 한 끼",
    description: "상황 맞춤 식품 큐레이션 플랫폼",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
