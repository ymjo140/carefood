import type { Metadata } from "next";
import ProductExplorer from "@/components/ProductExplorer";
import { Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "제품 탐색",
  description: "34만 식품 영양 DB에서 건강 목표·음식 종류·성분별로 내 몸에 맞는 식품을 검색하세요. 건강식단 서비스 5곳 비교 포함.",
  openGraph: {
    title: "제품 탐색 | 케어푸드",
    description: "34만 식품 영양 DB에서 건강 목표별 맞춤 식품 검색",
  },
};

export default function ProductsPage() {
  return (
    <Page width="wide">
      <PageHeader title="제품 탐색" />
      <ProductExplorer />
    </Page>
  );
}
