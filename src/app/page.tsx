import Link from "next/link";

const PERSONA_CARDS = [
  {
    emoji: "👴",
    label: "어르신",
    desc: "고령의 부모님을 위한 부드럽고 영양 균형 잡힌 식단",
    color: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
    href: "/onboarding?persona=elderly",
  },
  {
    emoji: "🏥",
    label: "환자",
    desc: "당뇨·고혈압·신장질환 등 건강 상태에 맞는 안전한 식품",
    color: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
    href: "/onboarding?persona=patient",
  },
  {
    emoji: "🤰",
    label: "산모",
    desc: "임신·산후 시기별 필요한 영양소를 채워주는 식품",
    color: "bg-pink-50 dark:bg-pink-950 border-pink-200 dark:border-pink-800",
    href: "/onboarding?persona=pregnant",
  },
  {
    emoji: "🥗",
    label: "일반 건강식",
    desc: "체중 관리, 근육 증가 등 건강 목표에 맞는 식품",
    color: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    href: "/onboarding?persona=general",
  },
];

const TRUST_BADGES = [
  { icon: "🏛️", label: "식약처 MFDS", desc: "공식 영양성분 DB 기반" },
  { icon: "🔒", label: "안전 필터", desc: "질환별 금기 자동 차단" },
  { icon: "💰", label: "최저가 비교", desc: "4개 쇼핑몰 실시간 가격" },
];

export default function HomePage() {
  return (
    <>
      {/* 히어로 */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            가입 없이 추천 체험 가능
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
            누구를 위해
            <br />
            <span className="text-primary">식품을 찾으시나요?</span>
          </h1>
          <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
            어르신, 환자, 산모 등 상황에 따라
            <br className="sm:hidden" />
            {" "}안전하고 맞춤화된 식품을 추천합니다.
          </p>
        </div>
      </section>

      {/* 페르소나 카드 */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PERSONA_CARDS.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className={`${card.color} border rounded-2xl p-6 hover:scale-[1.02] transition-transform`}
            >
              <div className="text-4xl mb-3">{card.emoji}</div>
              <h3 className="text-lg font-bold mb-1">{card.label}</h3>
              <p className="text-sm text-muted">{card.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 신뢰 배지 */}
      <section className="py-16 px-4 bg-card">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">
            데이터 기반 안전한 추천
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {TRUST_BADGES.map((badge) => (
              <div
                key={badge.label}
                className="text-center p-6 rounded-xl border border-border bg-background"
              >
                <div className="text-3xl mb-3">{badge.icon}</div>
                <h3 className="font-bold mb-1">{badge.label}</h3>
                <p className="text-sm text-muted">{badge.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 작동 방식 */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">
            3단계로 시작하세요
          </h2>
          <div className="space-y-8">
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
                title: "맞춤 추천을 받으세요",
                desc: "상황에 맞는 큐레이션 패키지와 최저가 구매 링크를 제공합니다.",
              },
            ].map((s) => (
              <div key={s.step} className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg shrink-0">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{s.title}</h3>
                  <p className="text-muted text-sm mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-card">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">
            지금 바로 맞춤 추천을 받아보세요
          </h2>
          <p className="text-muted mb-6">
            가입 없이도 추천을 체험할 수 있어요. 30초면 충분합니다.
          </p>
          <Link
            href="/onboarding"
            className="bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary-dark transition-colors inline-block"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>
    </>
  );
}
