import Link from "next/link";

const TASTE_CARDS = [
  { emoji: "🧂", label: "짠맛", desc: "나트륨 기반", color: "bg-blue-50 dark:bg-blue-950" },
  { emoji: "🍬", label: "단맛", desc: "당류 기반", color: "bg-pink-50 dark:bg-pink-950" },
  { emoji: "🌶️", label: "매운맛", desc: "원재료 분석", color: "bg-red-50 dark:bg-red-950" },
  { emoji: "🧈", label: "기름진맛", desc: "지방 기반", color: "bg-yellow-50 dark:bg-yellow-950" },
];

const STEPS = [
  {
    step: "01",
    title: "맛 취향 설정",
    desc: "짠맛·단맛·매운맛·기름진맛, 1~5 슬라이더로 내 입맛을 알려주세요.",
  },
  {
    step: "02",
    title: "AI 매칭",
    desc: "식약처 영양성분 데이터 기반으로, 내 취향에 딱 맞는 제품을 찾아드려요.",
  },
  {
    step: "03",
    title: "바로 구매",
    desc: "쿠팡·마켓컬리·네이버 최저가로 비교하고 바로 구매 링크로 이동!",
  },
];

export default function HomePage() {
  return (
    <>
      {/* 헤더 */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-primary">
            케어푸드
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/products" className="text-muted hover:text-foreground transition-colors">
              제품 탐색
            </Link>
            <Link
              href="/onboarding"
              className="bg-primary text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              시작하기
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* 히어로 */}
        <section className="py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              내 입맛에 맞는
              <br />
              <span className="text-primary">건강한 한 끼</span>
            </h1>
            <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
              짠맛·단맛·매운맛·기름진맛 취향만 설정하면,
              <br />
              영양성분 데이터 기반으로 딱 맞는 식품을 추천합니다.
            </p>
            <div className="mt-8 flex gap-3 justify-center">
              <Link
                href="/onboarding"
                className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-dark transition-colors"
              >
                무료로 시작하기
              </Link>
              <Link
                href="/products"
                className="border border-border px-6 py-3 rounded-xl font-medium hover:bg-card transition-colors"
              >
                제품 둘러보기
              </Link>
            </div>
          </div>
        </section>

        {/* 맛 카드 */}
        <section className="py-16 px-4 bg-card">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8">
              4가지 맛 축으로 분석합니다
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {TASTE_CARDS.map((card) => (
                <div
                  key={card.label}
                  className={`${card.color} rounded-2xl p-6 text-center`}
                >
                  <div className="text-4xl mb-2">{card.emoji}</div>
                  <div className="font-bold text-lg">{card.label}</div>
                  <div className="text-sm text-muted mt-1">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 작동 방식 */}
        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-12">
              어떻게 작동하나요?
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {STEPS.map((s) => (
                <div key={s.step} className="text-center">
                  <div className="text-5xl font-bold text-primary/20 mb-2">
                    {s.step}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                  <p className="text-muted text-sm">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 데이터 신뢰성 */}
        <section className="py-16 px-4 bg-card">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">
              식약처 공공 데이터 기반
            </h2>
            <p className="text-muted">
              식품의약품안전처 식품영양성분 DB(I2790)의 공식 데이터를 활용합니다.
              <br />
              칼로리, 나트륨, 당류, 지방 등 핵심 영양성분을 정확하게 분석합니다.
            </p>
            <div className="mt-8 flex justify-center gap-8 text-sm text-muted">
              <div>
                <div className="text-3xl font-bold text-foreground">9+</div>
                <div>영양성분 분석</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">3</div>
                <div>쇼핑 플랫폼</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">4</div>
                <div>맛 분석 축</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">
              지금 바로 내 맛 프로필을 만들어보세요
            </h2>
            <p className="text-muted mb-6">
              무료 회원은 제품 검색과 맛 필터를 자유롭게 이용할 수 있어요.
            </p>
            <Link
              href="/onboarding"
              className="bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary-dark transition-colors inline-block"
            >
              무료로 시작하기
            </Link>
          </div>
        </section>
      </main>

      {/* 푸터 */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted">
          <div>
            <span className="font-bold text-foreground">케어푸드</span> · 맛
            취향 기반 식품 큐레이션
          </div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              개인정보처리방침
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
