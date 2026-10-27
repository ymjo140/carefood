import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://carefood-iota.vercel.app"),
  title: {
    default: "케어푸드 | 성분으로 찾는 내 몸에 맞는 식품",
    template: "%s | 케어푸드",
  },
  description:
    "34만 식품 영양 DB · 5개 건강식단 서비스 비교 · AI 맞춤 추천. 장건강·피부·체중관리·활력 — 매끼 달라지는 영양 최적 해를 풀어주는 식단 인텔리전스.",
  keywords: [
    "케어푸드", "건강식품", "영양성분", "식품매칭", "건강식단",
    "그리팅", "윤식단", "디자인밀", "식단추천", "AI식단",
    "장건강식품", "다이어트식단", "고단백식품", "저당식품",
  ],
  openGraph: {
    title: "케어푸드 | 성분으로 찾는 내 몸에 맞는 식품",
    description: "34만 식품 영양 DB 기반 AI 맞춤 식단 인텔리전스 플랫폼",
    type: "website",
    siteName: "케어푸드",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "케어푸드 | 성분으로 찾는 내 몸에 맞는 식품",
    description: "34만 식품 영양 DB 기반 AI 맞춤 식단 인텔리전스 플랫폼",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://carefood-iota.vercel.app",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
