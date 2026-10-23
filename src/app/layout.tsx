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
  title: "케어푸드 | 성분으로 찾는 내 몸에 맞는 식품",
  description:
    "식약처 31만 건 영양성분 DB 기반, 건강 관심사에 맞는 식품 매칭. 장건강·피부·체중관리·활력 — 성분 분석으로 나에게 맞는 식품을 찾아보세요.",
  keywords: ["케어푸드", "이너케어", "성분분석", "식품매칭", "장건강식품", "건강식", "영양성분", "식품추천"],
  openGraph: {
    title: "케어푸드 | 성분으로 찾는 내 몸에 맞는 식품",
    description: "식약처 영양성분 DB 기반 이너케어 식품 매칭 플랫폼",
    type: "website",
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
