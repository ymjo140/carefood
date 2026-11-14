import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR, Outfit } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SessionSync from "@/components/SessionSync";
import ErrorReporter from "@/components/ErrorReporter";
import { BottomNav, ToastProvider } from "@/components/ui";
import "./globals.css";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";

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

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://carefood-iota.vercel.app"),
  title: {
    default: `${BRAND} | ${BRAND_TAGLINE}`,
    template: `%s | ${BRAND}`,
  },
  description:
    "34만 식품 영양 DB · 5개 건강식단 서비스 비교 · AI 맞춤 추천. 장건강·피부·체중관리·활력 — 매끼 달라지는 영양 최적 해를 풀어주는 식단 인텔리전스.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  keywords: [
    BRAND, "건강식품", "영양성분", "식품매칭", "건강식단",
    "그리팅", "윤식단", "디자인밀", "식단추천", "AI식단",
    "장건강식품", "다이어트식단", "고단백식품", "저당식품",
  ],
  openGraph: {
    title: `${BRAND} | ${BRAND_TAGLINE}`,
    description: "34만 식품 영양 DB 기반 AI 맞춤 식단 인텔리전스 플랫폼",
    type: "website",
    siteName: BRAND,
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND} | ${BRAND_TAGLINE}`,
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
      className={`${notoSansKR.variable} ${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="theme-color" content="#FBF8F3" media="(prefers-color-scheme: light)" />{/* ds-allow: 브라우저 theme-color 메타 */}
        <meta name="theme-color" content="#141210" media="(prefers-color-scheme: dark)" />{/* ds-allow: 브라우저 theme-color 메타 */}
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <ToastProvider>
        <Header />
        <SessionSync />
        <ErrorReporter />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`, // ds-allow: 서비스 워커 등록 실패는 화면에 영향 없음
          }}
        />
        <main className="flex-1">{children}</main>
        <Footer />
        <BottomNav />
        </ToastProvider>
      </body>
    </html>
  );
}
