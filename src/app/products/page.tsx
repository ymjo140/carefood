import Link from "next/link";
import ProductExplorer from "@/components/ProductExplorer";

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
        <ProductExplorer />
      </main>
    </>
  );
}
