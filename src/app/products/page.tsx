import Link from "next/link";

export const metadata = {
  title: "제품 탐색 | 케어푸드",
  description: "맛 필터로 내 취향에 맞는 식품을 찾아보세요.",
};

export default function ProductsPage() {
  return (
    <>
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-primary">
            케어푸드
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/products" className="font-medium text-foreground">
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

      <main className="flex-1 max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">제품 탐색</h1>

        {/* 맛 필터 */}
        <div className="bg-card rounded-2xl border border-border p-6 mb-8">
          <h2 className="font-bold mb-4">맛 필터</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "짠맛", emoji: "🧂" },
              { label: "단맛", emoji: "🍬" },
              { label: "매운맛", emoji: "🌶️" },
              { label: "기름진맛", emoji: "🧈" },
            ].map((taste) => (
              <div key={taste.label}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{taste.emoji}</span>
                  <span className="text-sm font-medium">{taste.label}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      className="w-8 h-8 rounded-lg border border-border text-xs hover:bg-primary hover:text-white transition-colors"
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="mt-4 bg-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
            필터 적용
          </button>
        </div>

        {/* 제품 목록 placeholder */}
        <div className="text-center py-16 text-muted">
          <p className="text-lg mb-2">Supabase 연결 후 제품이 표시됩니다</p>
          <p className="text-sm">
            식약처 API 데이터를 수집하면 여기에 제품 카드가 나타나요.
          </p>
        </div>
      </main>
    </>
  );
}
