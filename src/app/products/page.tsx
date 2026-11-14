import type { Metadata } from "next";
import ProductExplorer from "@/components/ProductExplorer";
import { Icon, Page, PageHeader, TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "제품 찾기",
  description: "34만 식품 영양 DB에서 건강 목표·음식 종류·성분별로 내 몸에 맞는 식품을 검색하세요. 건강식단 서비스 5곳 비교 포함.",
  openGraph: {
    title: "제품 찾기 | 오늘끼록",
    description: "34만 식품 영양 DB에서 건강 목표별 맞춤 식품 검색",
  },
};

/** 검색 결과 — 홈 검색 줄·카테고리에서 들어온다. 홈의 추천 구역은 접고 목록만 */
export default function ProductsPage() {
  return (
    <Page width="wide">
      <TextLink href="/" className="mb-1 min-h-11 pr-3">
        <Icon name="chevron-left" size={16} /> 홈
      </TextLink>
      <PageHeader title="제품 찾기" />
      <ProductExplorer />
    </Page>
  );
}
