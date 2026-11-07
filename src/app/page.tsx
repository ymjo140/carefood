import Link from "next/link";
import HomePersonalized from "@/components/HomePersonalized";
import HomeSimilarUsers from "@/components/HomeSimilarUsers";
import HomeTodayWidget from "@/components/HomeTodayWidget";
import { Badge, Card, Icon, LinkButton, Page, SectionHeader, Stat } from "@/components/ui";

/* ── 건강 목표 카드 데이터 ── */
const GOAL_CARDS = [
  { key: "balanced", label: "균형식단", desc: "전반적 건강 관리", href: "/onboarding?concern=balanced" },
  { key: "weight_loss", label: "체중관리", desc: "건강한 다이어트", href: "/onboarding?concern=weight" },
  { key: "muscle", label: "근력강화", desc: "고단백 식단", href: "/onboarding?concern=muscle" },
  { key: "gut_health", label: "장건강", desc: "소화가 편한 식품", href: "/onboarding?concern=gut_health" },
  { key: "skin", label: "피부건강", desc: "속부터 관리", href: "/onboarding?concern=skin" },
  { key: "energy", label: "활력충전", desc: "영양 골고루", href: "/onboarding?concern=energy" },
];

const DISEASE_GOAL_CARDS = [
  { key: "diabetes", label: "당뇨 관심", desc: "저당 식품이 궁금한 분", href: "/onboarding?concern=diabetes" },
  { key: "blood_pressure", label: "혈압 관심", desc: "저나트륨 식품이 궁금한 분", href: "/onboarding?concern=blood_pressure" },
  { key: "kidney", label: "신장 관심", desc: "저단백·저염 식품이 궁금한 분", href: "/onboarding?concern=kidney" },
];

/* ── 건강식단 서비스 데이터 ── */
const MEAL_SERVICES = [
  { source: "greating", name: "그리팅", count: 143, avgPrice: "10,500", tag: "현대그린푸드" },
  { source: "yundiet", name: "윤식단", count: 39, avgPrice: "6,000", tag: "고단백 특화" },
  { source: "designmeal", name: "디자인밀", count: 37, avgPrice: "9,000", tag: "풀무원" },
  { source: "sixmeal", name: "식스밀", count: 27, avgPrice: "11,000", tag: "체중조절" },
  { source: "makesalad", name: "메이크샐러드", count: 14, avgPrice: "4,900", tag: "단백질 도시락" },
];

/* ── 신뢰 수치 ── */
const TRUST_ITEMS = [
  { label: "식약처 영양 DB", num: "341,860", unit: "건", desc: "성분 데이터 기반 분석" },
  { label: "건강 점수", num: "0~100", unit: "점", desc: "100g당 영양소 기준 자동 산출" },
  { label: "통합 비교", num: "5", unit: "곳", desc: "건강식단 서비스 + 쇼핑몰 가격 비교" },
];

/* ── 작동 방식 ── */
const HOW_IT_WORKS = [
  { step: "1", title: "건강 목표와 신체 정보를 알려주세요", desc: "9가지 건강 목표 + BMI/칼로리 자동 분석" },
  { step: "2", title: "AI가 34만 식품에서 매칭합니다", desc: "영양 성분 + 맛 선호 + 건강 점수 기반 개인화" },
  { step: "3", title: "주간 식단까지 자동 구성", desc: "끼니별 영양 밸런스 맞춘 7일 식단 추천" },
];

const MORE_LINKS = [
  { href: "/weekly-box", title: "식단 리스트", desc: "AI 추천 · 따라하기 식단 모아보기" },
  { href: "/products", title: "건강식단 비교", desc: "5곳 서비스 한눈에 비교" },
  { href: "/community", title: "커뮤니티", desc: "식단 공유 · 따라하기" },
  { href: "/vendor/apply", title: "업체 입점", desc: "34만 DB에 제품 등록" },
];

export default function HomePage() {
  return (
    <Page width="wide">
      {/* ── 히어로 ── */}
      <section className="py-10 sm:py-20">
        <h1 className="text-display font-bold text-ink text-balance">
          내 몸에 맞는 식품,
          <br />
          <span className="text-brand-ink">성분으로 찾다</span>
        </h1>
        <p className="mt-4 text-body text-ink-2 max-w-lg">
          <span className="num font-bold text-ink">341,860</span>개 식품 영양 DB ·{" "}
          <span className="num font-bold text-ink">5</span>개 건강식단 서비스 비교 · AI 맞춤 추천
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <LinkButton href="/onboarding">무료로 시작하기</LinkButton>
          <LinkButton href="/products" variant="secondary">제품 둘러보기</LinkButton>
        </div>
      </section>

      {/* ── 재방문 사용자: 오늘의 상태 ── */}
      <HomeTodayWidget />

      {/* ── 재방문 사용자 개인화 추천 ── */}
      <HomePersonalized />
      <HomeSimilarUsers />

      {/* ── 건강 목표 선택 ── */}
      <section className="py-8">
        <SectionHeader title="어떤 건강 목표가 있으세요?" />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {GOAL_CARDS.map((card) => (
            <Link key={card.key} href={card.href} className="block rounded-lg">
              <Card interactive className="h-full">
                <h3 className="text-body font-bold text-ink">{card.label}</h3>
                <p className="text-caption text-ink-2 mt-0.5">{card.desc}</p>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DISEASE_GOAL_CARDS.map((card) => (
            <Link key={card.key} href={card.href} className="block rounded-lg">
              <Card tone="sunken" interactive className="h-full">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-body font-bold text-ink">{card.label}</h3>
                  <Badge tone="brand">관심</Badge>
                </div>
                <p className="text-caption text-ink-2 mt-0.5">{card.desc}</p>
              </Card>
            </Link>
          ))}
        </div>

        <p className="text-caption text-ink-2 mt-3 text-center">
          의료 행위가 아닌, 성분 정보 기반 참고용입니다
        </p>
      </section>

      {/* ── 건강식단 서비스 비교 ── */}
      <section className="py-8">
        <SectionHeader
          title="건강식단 서비스 한눈에 비교"
          description={<><span className="num font-bold text-ink">260</span>개 개별 메뉴, 영양성분까지 분석</>}
        />

        <div className="flex gap-3 scroll-row -mx-4 px-4 pb-2 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-5">
          {MEAL_SERVICES.map((svc) => (
            <Link key={svc.source} href={`/products?q=${encodeURIComponent(svc.name)}`} className="block rounded-lg w-40 shrink-0 sm:w-auto">
              <Card interactive className="h-full">
                <h3 className="text-body font-bold text-ink">{svc.name}</h3>
                <p className="text-caption text-brand-ink font-medium mt-0.5">{svc.tag}</p>
                <dl className="mt-3 flex flex-col gap-1.5 text-label">
                  <div className="flex justify-between">
                    <dt className="text-ink-2">메뉴</dt>
                    <dd className="num font-bold text-ink">{svc.count}<span className="font-regular text-ink-2">개</span></dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-2">끼니당</dt>
                    <dd className="num font-bold text-ink">~{svc.avgPrice}<span className="font-regular text-ink-2">원</span></dd>
                  </div>
                </dl>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 신뢰 수치 ── */}
      <section className="py-8">
        <SectionHeader title="데이터로 분석하는 식품 성분" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TRUST_ITEMS.map((item) => (
            <Card key={item.label}>
              <Stat label={item.label} value={item.num} unit={item.unit} />
              <p className="text-caption text-ink-2 mt-2">{item.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 작동 방식 ── */}
      <section className="py-8">
        <SectionHeader title="3단계로 시작하세요" />
        <ol className="flex flex-col">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.step} className="flex gap-4 items-start relative pb-8 last:pb-0">
              {i < HOW_IT_WORKS.length - 1 && (
                <span aria-hidden="true" className="absolute left-5 top-11 bottom-1 w-0.5 -translate-x-1/2 bg-line" />
              )}
              <span className="size-10 rounded-full bg-brand text-on-brand num font-bold text-label flex items-center justify-center shrink-0 relative">
                {s.step}
              </span>
              <div className="pt-2 min-w-0">
                <h3 className="text-body font-bold text-ink">{s.title}</h3>
                <p className="text-label text-ink-2 mt-0.5">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 더 알아보기 ── */}
      <section className="py-8">
        <SectionHeader title="더 알아보기" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MORE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-lg">
              <Card interactive className="h-full">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-body font-bold text-ink">{l.title}</h3>
                  <Icon name="chevron-right" size={18} className="text-ink-3 shrink-0" />
                </div>
                <p className="text-caption text-ink-2 mt-1">{l.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-8">
        <Card tone="brand" padding="none" className="p-8 text-center">
          <h2 className="text-title font-bold text-ink text-balance">
            지금 바로 내 건강 목표에 맞는 식품을 찾아보세요
          </h2>
          <p className="text-label text-ink-2 mt-2 mb-5">
            가입 없이도 체험할 수 있어요. <span className="num font-bold text-ink">90</span>초면 충분합니다.
          </p>
          <LinkButton href="/onboarding">시작하기</LinkButton>
        </Card>
      </section>
    </Page>
  );
}
