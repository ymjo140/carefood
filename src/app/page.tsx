import HomeTop from "@/components/HomeTop";
import ProductExplorer from "@/components/ProductExplorer";
import { Page } from "@/components/ui";

/**
 * 홈 = 내 추천 + 아래 탐색 (배민·쿠팡이츠처럼 한 화면에서 이어진다)
 * - 위: 검색 줄 · 카테고리 · 오늘 한 줄 · 내 추천 (처음 온 사람은 '시작하기' 한 칸)
 * - 아래: 전체 제품 — 정렬·필터가 위에 붙는 목록. 검색하면 /products 검색 결과로 간다
 *
 * 예전 소개 구역(목표 카드·서비스 비교·신뢰 수치·3단계·더 알아보기)은 뺐다.
 * ds-wiring-drop: /onboarding?concern=balanced — 목표 고르기는 온보딩 첫 질문이 맡는다 (시작하기)
 * ds-wiring-drop: /onboarding?concern=weight — 같은 이유
 * ds-wiring-drop: /onboarding?concern=muscle — 같은 이유
 * ds-wiring-drop: /onboarding?concern=gut_health — 같은 이유
 * ds-wiring-drop: /onboarding?concern=skin — 같은 이유
 * ds-wiring-drop: /onboarding?concern=energy — 같은 이유
 * ds-wiring-drop: /onboarding?concern=diabetes — 같은 이유
 * ds-wiring-drop: /onboarding?concern=blood_pressure — 같은 이유
 * ds-wiring-drop: /onboarding?concern=kidney — 같은 이유
 * ds-wiring-drop: /weekly-box — 탭 바·푸터에 있다
 * ds-wiring-drop: /community — 탭 바·푸터에 있다
 * ds-wiring-drop: /vendor/apply — 푸터 '입점 문의'에 있다
 */
export default function HomePage() {
  return (
    <Page width="wide">
      <HomeTop />
      <div className="mt-10">
        <ProductExplorer variant="home" />
      </div>
    </Page>
  );
}
