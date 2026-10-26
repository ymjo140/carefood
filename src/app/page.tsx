import Link from "next/link";
import HomePersonalized from "@/components/HomePersonalized";
import HomeSimilarUsers from "@/components/HomeSimilarUsers";

/* ── SVG 아이콘 컴포넌트 ── */
function IconGut({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm4 0h-2v-2h2v2zm1-4H8c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h8c.55 0 1 .45 1 1v3c0 .55-.45 1-1 1z" />
    </svg>
  );
}

function IconLeaf({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.05 8.05a7.001 7.001 0 0 0 .02 9.88c1.47-3.4 4.09-6.24 7.36-7.93A15.95 15.95 0 0 0 8.54 16c-1-1.8-1.6-3.82-1.6-5.99l-.89-1.96zM17 1c-1.52 4.7-3.34 7.83-6.93 11.07 1.72-.37 3.5-.53 5.3-.47a8.004 8.004 0 0 0 1.36-10.17L17 1z" />
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66C7.72 17.14 9.23 12 17 10V8z" />
    </svg>
  );
}

function IconScale({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z" />
    </svg>
  );
}

function IconBolt({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
    </svg>
  );
}

function IconSearch({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

function IconTag({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
    </svg>
  );
}

function IconPrice({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
    </svg>
  );
}

const CONCERN_CARDS = [
  {
    icon: IconGut,
    label: "장건강",
    desc: "예민한 속, 편안하게",
    color: "bg-emerald-500",
    href: "/onboarding?concern=gut_health",
  },
  {
    icon: IconLeaf,
    label: "피부건강",
    desc: "속부터 맑게",
    color: "bg-pink-500",
    href: "/onboarding?concern=skin",
  },
  {
    icon: IconScale,
    label: "체중관리",
    desc: "가볍고 든든하게",
    color: "bg-blue-500",
    href: "/onboarding?concern=weight",
  },
  {
    icon: IconBolt,
    label: "활력충전",
    desc: "하루를 채우는 영양",
    color: "bg-amber-500",
    href: "/onboarding?concern=energy",
  },
];

const TRUST_ITEMS = [
  {
    icon: IconSearch,
    label: "식약처 영양 DB",
    desc: "31만 건 성분 데이터 기반 분석",
  },
  {
    icon: IconTag,
    label: "성분 분석 태그",
    desc: "소화편의·첨가물·자극성 자동 분류",
  },
  {
    icon: IconPrice,
    label: "4곳 최저가",
    desc: "컬리·오아시스·홈플러스·11번가",
  },
];

export default function HomePage() {
  return (
    <>
      {/* 히어로 */}
      <section className="py-12 sm:py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-primary-light text-primary text-xs font-bold mb-5">
            가입 없이 체험 가능
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-snug">
            성분으로 찾는,
            <br />
            내 몸에 맞는 식품
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted max-w-md">
            식약처 영양성분 DB 기반 · 4개 쇼핑몰 최저가 비교
          </p>
        </div>
      </section>

      {/* 재방문 사용자 개인화 추천 (클라이언트) */}
      <HomePersonalized />

      {/* 비슷한 프로필 사용자 추천 */}
      <HomeSimilarUsers />

      {/* 건강 관심사 선택 — 4열 그리드 */}
      <section className="px-4 pb-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-4">
            어떤 건강이 궁금하세요?
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CONCERN_CARDS.map((card) => {
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
        </div>
      </section>

      {/* 신뢰 배지 */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-6">
            데이터로 분석하는 식품 성분
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TRUST_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-bold text-sm mb-1">{item.label}</h3>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 작동 방식 */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-8">
            3단계로 시작하세요
          </h2>
          <div className="space-y-6">
            {[
              {
                step: "1",
                title: "관심사를 알려주세요",
                desc: "장건강, 피부, 체중관리 등 건강 관심사와 민감도를 선택합니다.",
              },
              {
                step: "2",
                title: "성분을 분석합니다",
                desc: "31만 건 영양성분 DB에서 관심사에 맞는 성분 프로필을 매칭합니다.",
              },
              {
                step: "3",
                title: "맞춤 식품 추천",
                desc: "성분 매칭 + 맛 선호도로 최적의 식품을 추천합니다.",
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

      {/* 더 많은 기능 */}
      <section className="px-4 pb-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-4">
            더 알아보기
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/weekly-box"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">📦</p>
              <h3 className="font-bold text-sm mb-1">주간 추천 박스</h3>
              <p className="text-xs text-muted">7일 맞춤 식단을 자동으로 구성해드려요</p>
            </Link>
            <Link
              href="/health"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">📊</p>
              <h3 className="font-bold text-sm mb-1">영양 리포트</h3>
              <p className="text-xs text-muted">건강검진 수치 입력하면 맞춤 분석해줘요</p>
            </Link>
            <Link
              href="/family"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">👨‍👩‍👧</p>
              <h3 className="font-bold text-sm mb-1">가족 건강 관리</h3>
              <p className="text-xs text-muted">부모님 건강까지 한 번에 관리하세요</p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto bg-card rounded-2xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-extrabold mb-2">
            내 몸에 맞는 식품, 지금 찾아보세요
          </h2>
          <p className="text-sm text-muted mb-5">
            가입 없이도 체험할 수 있어요. 30초면 충분합니다.
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
