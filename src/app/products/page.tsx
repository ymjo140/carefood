import ProductExplorer from "@/components/ProductExplorer";

export const metadata = {
  title: "제품 탐색 | 케어푸드",
  description: "맛 필터로 내 취향에 맞는 식품을 찾아보세요.",
};

export default function ProductsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold mb-6">제품 탐색</h1>
      <ProductExplorer />
    </div>
  );
}
