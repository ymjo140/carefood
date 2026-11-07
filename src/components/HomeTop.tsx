"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HomePersonalized from "@/components/HomePersonalized";
import HomeTodayWidget from "@/components/HomeTodayWidget";
import { Card, Icon, LinkButton, Skeleton } from "@/components/ui";
import { categoryHref, HOME_CATEGORIES } from "@/lib/home-categories";

/**
 * 홈 위쪽 — 검색 줄 · 카테고리 · (프로필 있으면) 오늘 한 줄 + 내 추천 / (없으면) 시작하기 한 칸.
 * 아래쪽 '전체 제품' 목록은 page.tsx 가 ProductExplorer(variant="home") 로 붙인다.
 */
export default function HomeTop() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHasProfile(!!localStorage.getItem("carefood_profile")); // eslint-disable-line react-hooks/set-state-in-effect -- 저장소는 화면을 그린 뒤에만 읽을 수 있다
    } catch {
      setHasProfile(false); // ds-allow: 저장소를 못 읽으면 처음 온 사람으로 본다
    }
  }, []);

  return (
    <>
      <h1 className="sr-only">케어푸드 — 성분으로 찾는 내 몸에 맞는 식품</h1>

      <Link href="/products?focus=1"
        className="flex items-center gap-2 h-12 px-4 rounded-md border border-line-strong bg-surface text-body text-ink-3 transition-colors hover:border-ink-3">
        <Icon name="search" size={20} className="text-ink-2" />
        제품·성분 검색
      </Link>

      <nav aria-label="카테고리" className="grid grid-cols-4 sm:grid-cols-8 gap-y-4 mt-5">
        {HOME_CATEGORIES.map((c) => (
          <Link key={c.key} href={categoryHref(c.query)}
            className="press flex flex-col items-center gap-1.5 text-caption text-ink rounded-md py-1">
            <span className="size-13 rounded-lg bg-sunken flex items-center justify-center text-ink-2">
              <Icon name={c.icon} size={24} />
            </span>
            {c.label}
          </Link>
        ))}
      </nav>

      {hasProfile === null ? (
        <Skeleton className="h-40 rounded-lg mt-6" />
      ) : hasProfile ? (
        <>
          <HomeTodayWidget />
          <HomePersonalized />
        </>
      ) : (
        <Card className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-title font-bold text-ink text-balance">목표를 알려 주면 맞춰 골라 드려요</h2>
            <p className="text-label text-ink-2 mt-1">
              <span className="num font-bold text-ink">341,860</span>개 식품의 영양 성분으로 골라요. 질문 몇 개면 돼요
            </p>
          </div>
          <LinkButton href="/onboarding" className="sm:shrink-0">목표 알려 주기</LinkButton>
        </Card>
      )}
    </>
  );
}
