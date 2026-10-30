import Link from "next/link";
import HomePersonalized from "@/components/HomePersonalized";
import HomeSimilarUsers from "@/components/HomeSimilarUsers";
import HomeTodayWidget from "@/components/HomeTodayWidget";

/* ── 건강 목표 카드 데이터 ── */
const GOAL_CARDS = [
  { key: "balanced", emoji: "⚖️", label: "균형식단", desc: "전반적 건강 관리", href: "/onboarding?concern=balanced", accent: "#C4870A", accentBg: "rgba(196,135,10,0.08)" },
  { key: "weight_loss", emoji: "📉", label: "체중관리", desc: "건강한 다이어트", href: "/onboarding?concern=weight", accent: "#2EA860", accentBg: "rgba(46,168,96,0.08)" },
  { key: "muscle", emoji: "💪", label: "근력강화", desc: "고단백 식단", href: "/onboarding?concern=muscle", accent: "#4A8FD4", accentBg: "rgba(74,143,212,0.08)" },
  { key: "gut_health", emoji: "🫧", label: "장건강", desc: "소화가 편한 식품", href: "/onboarding?concern=gut_health", accent: "#2BA8A0", accentBg: "rgba(43,168,160,0.08)" },
  { key: "skin", emoji: "✨", label: "피부건강", desc: "속부터 관리", href: "/onboarding?concern=skin", accent: "#D46A8A", accentBg: "rgba(212,106,138,0.08)" },
  { key: "energy", emoji: "⚡", label: "활력충전", desc: "영양 골고루", href: "/onboarding?concern=energy", accent: "#D47040", accentBg: "rgba(212,112,64,0.08)" },
];

const DISEASE_GOAL_CARDS = [
  { key: "diabetes", emoji: "💧", label: "당뇨 관심", desc: "저당 식품이 궁금한 분", href: "/onboarding?concern=diabetes" },
  { key: "blood_pressure", emoji: "❤️", label: "혈압 관심", desc: "저나트륨 식품이 궁금한 분", href: "/onboarding?concern=blood_pressure" },
  { key: "kidney", emoji: "🫘", label: "신장 관심", desc: "저단백·저염 식품이 궁금한 분", href: "/onboarding?concern=kidney" },
];

/* ── 건강식단 서비스 데이터 ── */
const MEAL_SERVICES = [
  { source: "greating", name: "그리팅", count: 143, avgPrice: "10,500", tag: "현대그린푸드", emoji: "🥗" },
  { source: "yundiet", name: "윤식단", count: 39, avgPrice: "6,000", tag: "고단백 특화", emoji: "💪" },
  { source: "designmeal", name: "디자인밀", count: 37, avgPrice: "9,000", tag: "풀무원", emoji: "🍱" },
  { source: "sixmeal", name: "식스밀", count: 27, avgPrice: "11,000", tag: "체중조절", emoji: "🥩" },
  { source: "makesalad", name: "메이크샐러드", count: 14, avgPrice: "4,900", tag: "단백질 도시락", emoji: "🥙" },
];

/* ── 신뢰 배지 데이터 ── */
const TRUST_ITEMS = [
  { emoji: "🔬", label: "식약처 영양 DB", num: "341,860", unit: "건", desc: "성분 데이터 기반 분석" },
  { emoji: "📊", label: "건강 점수", num: "0~100", unit: "점", desc: "100g당 영양소 기준 자동 산출" },
  { emoji: "🏷️", label: "통합 비교", num: "5", unit: "곳", desc: "건강식단 서비스 + 쇼핑몰 가격 비교" },
];

/* ── 작동 방식 ── */
const HOW_IT_WORKS = [
  { step: "1", title: "건강 목표와 신체 정보를 알려주세요", desc: "9가지 건강 목표 + BMI/칼로리 자동 분석" },
  { step: "2", title: "AI가 34만 식품에서 매칭합니다", desc: "영양 성분 + 맛 선호 + 건강 점수 기반 개인화" },
  { step: "3", title: "주간 식단까지 자동 구성", desc: "끼니별 영양 밸런스 맞춘 7일 식단 추천" },
];

const numFont = { fontFamily: "var(--font-display)" } as const;

export default function HomePage() {
  return (
    <>
      {/* ── 히어로 ── */}
      <section className="py-16 sm:py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            내 몸에 맞는 식품,
            <br />
            <span className="text-primary">성분으로 찾다</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-muted max-w-lg">
            <span style={numFont} className="font-semibold text-foreground">341,860</span>개 식품 영양 DB ·{" "}
            <span style={numFont} className="font-semibold text-foreground">5</span>개 건강식단 서비스 비교 · AI 맞춤 추천
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link
              href="/onboarding"
              className="bg-primary text-white px-7 py-3.5 rounded-full text-sm font-bold hover:bg-primary-dark transition-colors"
            >
              무료로 시작하기
            </Link>
            <Link
              href="/products"
              className="border border-border px-7 py-3.5 rounded-full text-sm font-medium hover:bg-card transition-colors"
            >
              제품 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* ── 재방문 사용자: 오늘의 상태 ── */}
      <HomeTodayWidget />

      {/* ── 재방문 사용자 개인화 추천 ── */}
      <HomePersonalized />
      <HomeSimilarUsers />

      {/* ── 건강 목표 선택 ── */}
      <section className="px-4 pb-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-5">어떤 건강 목표가 있으세요?</h2>

          {/* 메인 목표 3x2 — 카드별 악센트 색상 */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-3">
            {GOAL_CARDS.map((card) => (
              <Link
                key={card.key}
                href={card.href}
                className="rounded-2xl p-3 sm:p-4 text-center hover:-translate-y-0.5 transition-transform shadow-[0_1px_4px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-primary overflow-hidden relative"
                style={{ background: card.accentBg }}
              >
                {/* 상단 컬러 바 */}
                <div
                  className="absolute top-0 left-0 right-0 h-[3px]"
                  style={{ background: card.accent }}
                />
                <div className="text-2xl mb-1.5">{card.emoji}</div>
                <h3 className="text-sm font-bold">{card.label}</h3>
                <p className="text-[10px] sm:text-[11px] text-muted mt-0.5">{card.desc}</p>
              </Link>
            ))}
          </div>

          {/* 질환 관심 3열 */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {DISEASE_GOAL_CARDS.map((card) => (
              <Link
                key={card.key}
                href={card.href}
                className="bg-surface border border-border/50 rounded-2xl p-3 sm:p-4 text-center hover:-translate-y-0.5 transition-transform focus-visible:ring-2 focus-visible:ring-primary relative"
              >
                <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  관심
                </span>
                <div className="text-2xl mb-1.5">{card.emoji}</div>
                <h3 className="text-sm font-bold">{card.label}</h3>
                <p className="text-[10px] sm:text-[11px] text-muted mt-0.5">{card.desc}</p>
              </Link>
            ))}
          </div>

          <p className="text-[10px] text-muted mt-3 text-center">
            의료 행위가 아닌, 성분 정보 기반 참고용입니다
          </p>
        </div>
      </section>

      {/* ── 건강식단 서비스 비교 ── */}
      <section className="px-4 pb-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-2">건강식단 서비스 한눈에 비교</h2>
          <p className="text-sm text-muted mb-5">
            <span style={numFont} className="font-semibold text-foreground">260</span>개 개별 메뉴, 영양성분까지 분석
          </p>

          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar sm:grid sm:grid-cols-5 sm:overflow-visible">
            {MEAL_SERVICES.map((svc) => (
              <Link
                key={svc.source}
                href={`/products?q=${encodeURIComponent(svc.name)}`}
                className="min-w-[160px] sm:min-w-0 bg-card border border-border rounded-2xl p-4 hover:-translate-y-0.5 transition-transform shrink-0"
              >
                <div className="text-3xl mb-2">{svc.emoji}</div>
                <h3 className="font-bold text-sm">{svc.name}</h3>
                <p className="text-[10px] text-primary font-medium mt-0.5">{svc.tag}</p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">메뉴</span>
                    <span className="font-semibold" style={numFont}>{svc.count}<span className="font-normal text-muted">개</span></span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">끼니당</span>
                    <span className="font-semibold" style={numFont}>~{svc.avgPrice}<span className="font-normal text-muted">원</span></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 신뢰 배지 ── */}
      <section className="py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-5">데이터로 분석하는 식품 성분</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TRUST_ITEMS.map((item) => (
              <div
                key={item.label}
                className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-2xl">{item.emoji}</div>
                  <div>
                    <span className="text-xl font-bold" style={numFont}>{item.num}</span>
                    <span className="text-xs text-muted ml-0.5">{item.unit}</span>
                  </div>
                </div>
                <h3 className="font-bold text-sm mb-1">{item.label}</h3>
                <p className="text-xs text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 작동 방식 ── */}
      <section className="py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-8">3단계로 시작하세요</h2>
          <div className="relative">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.step} className="flex gap-5 items-start relative pb-8 last:pb-0">
                {/* 세로 연결선 */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="absolute left-[18px] top-[44px] bottom-0 w-[2px] bg-border" />
                )}
                {/* 원형 번호 */}
                <div
                  className="w-[38px] h-[38px] rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0 relative z-[1]"
                  style={numFont}
                >
                  {s.step}
                </div>
                <div className="pt-1.5">
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="text-muted text-sm mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 더 알아보기 ── */}
      <section className="px-4 pb-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-extrabold mb-4">더 알아보기</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/weekly-box"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">📦</p>
              <h3 className="font-bold text-sm mb-1">주간 식단 박스</h3>
              <p className="text-xs text-muted">AI가 7일 식단을 자동 구성</p>
            </Link>
            <Link
              href="/products"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">🏷️</p>
              <h3 className="font-bold text-sm mb-1">건강식단 비교</h3>
              <p className="text-xs text-muted">5곳 서비스 한눈에 비교</p>
            </Link>
            <Link
              href="/community"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">💬</p>
              <h3 className="font-bold text-sm mb-1">커뮤니티</h3>
              <p className="text-xs text-muted">식단 공유 & 공구</p>
            </Link>
            <Link
              href="/vendor/apply"
              className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-2xl mb-2">🤝</p>
              <h3 className="font-bold text-sm mb-1">업체 입점</h3>
              <p className="text-xs text-muted">34만 DB에 제품 등록</p>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto bg-card rounded-2xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-extrabold mb-2">
            지금 바로 내 건강 목표에 맞는 식품을 찾아보세요
          </h2>
          <p className="text-sm text-muted mb-5">
            가입 없이도 체험할 수 있어요. <span style={numFont} className="font-semibold text-foreground">90</span>초면 충분합니다.
          </p>
          <Link
            href="/onboarding"
            className="bg-primary text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-primary-dark transition-colors inline-block"
          >
            시작하기
          </Link>
        </div>
      </section>
    </>
  );
}
