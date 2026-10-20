import Link from "next/link";
import HomePersonalized from "@/components/HomePersonalized";

/* ── SVG 아이콘 컴포넌트 (이모지 대체) ── */
function IconHeart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function IconShield({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
    </svg>
  );
}

function IconLeaf({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66C7.72 17.14 9.23 12 17 10V8z" />
      <path d="M20.08 3.47L18.5 5.06C14.83 8.72 12.05 12.21 10.29 16.13l1.83.79C13.77 13.35 16.38 10.05 19.87 6.58l1.59-1.59-1.38-1.52z" />
    </svg>
  );
}

function IconBowl({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 12c0 3.87 3.13 7 7 7h6c3.87 0 7-3.13 7-7H2zM12 4C7.58 4 4 6.69 4 10h16c0-3.31-3.58-6-8-6z" />
    </svg>
  );
}

const PERSONA_CARDS = [
  {
    icon: IconHeart,
    label: "어르신",
    desc: "부드러운 식단",
    color: "bg-amber-500",
    href: "/onboarding?persona=elderly",
  },
  {
    icon: IconShield,
    label: "환자",
    desc: "질환별 안전",
    color: "bg-blue-500",
    href: "/onboarding?persona=patient",
  },
  {
    icon: IconLeaf,
    label: "산모",
    desc: "시기별 영양",
    color: "bg-pink-500",
    href: "/onboarding?persona=pregnant",
  },
  {
    icon: IconBowl,
    label: "일반",
    desc: "건강 목표",
    color: "bg-violet-500",
    href: "/onboarding?persona=general",
  },
];

const TRUST_ITEMS = [
  { label: "식약처 공식 DB", desc: "31만 건 영양성분 데이터 기반" },
  { label: "금기 자동 차단", desc: "질환별 위험 성분 필터링" },
  { label: "4곳 최저가", desc: "컬리·오아시스·홈플러스·11번가" },
];

export default function HomePage() {
  return (
    <>
      {/* 히어로 */}
      <section className="py-12 sm:py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-primary-light text-primary text-xs font-bold mb-5">
            가입 없이 체험 가능
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-snug">
            상황에 맞는 식품,
            <br />
            안전하게 추천합니다
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted max-w-md">
            식약처 DB + 4개 쇼핑몰 최저가 비교
          </p>
        </div>
      </section>

      {/* 재방문 사용자 개인화 추천 (클라이언트) */}
      <HomePersonalized />

      {/* 페르소나 선택 — 4열 그리드 */}
      <section className="px-4 pb-12">
        <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PERSONA_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                href={card.href}
                aria-label={`${card.label} 맞춤 추천 시작`}
                className="bg-card rounded-2xl p-4 sm:p-5 text-center hover:-translate-y-0.5 transition-transform shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div
                  className={`${card.color} w-11 h-11 rounded-[14px] flex items-center justify-center mx-auto mb-3`}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-bold">{card.label}</h3>
                <p className="text-[11px] text-muted mt-0.5">{card.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 신뢰 배지 */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-extrabold mb-6">
            데이터 기반 안전한 추천
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TRUST_ITEMS.map((item) => (
              <div
                key={item.label}
                className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="w-2 h-2 rounded-full bg-primary mb-3" />
                <h3 className="font-bold text-sm mb-1">{item.label}</h3>
                <p className="text-xs text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 작동 방식 */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-extrabold mb-8">
            3단계로 시작하세요
          </h2>
          <div className="space-y-6">
            {[
              {
                step: "1",
                title: "상황을 알려주세요",
                desc: "누구를 위한 식품인지, 어떤 건강 상태인지 간단히 선택합니다.",
              },
              {
                step: "2",
                title: "안전 필터가 작동합니다",
                desc: "질환별 금기 성분을 자동으로 걸러내고, 영양 기준에 맞는 식품만 남깁니다.",
              },
              {
                step: "3",
                title: "적합도 기반 추천",
                desc: "건강 상태와 맛 선호도에 따른 적합도 점수로 최적의 식품을 추천합니다.",
              },
            ].map((s) => (
              <div key={s.step} className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="text-muted text-sm mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto bg-card rounded-2xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-extrabold mb-2">
            지금 바로 추천을 받아보세요
          </h2>
          <p className="text-sm text-muted mb-5">
            가입 없이도 추천을 체험할 수 있어요. 30초면 충분합니다.
          </p>
          <Link
            href="/onboarding"
            className="bg-primary text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-primary-dark transition-colors inline-block"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>
    </>
  );
}
