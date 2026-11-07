"use client";

import { useEffect } from "react";
import { getClientActorId } from "@/lib/actor-client";

/**
 * 제품 상세 페이지에 삽입하여 조회 이력을 기록하는 컴포넌트
 * 서버 컴포넌트인 제품 페이지에서 클라이언트 사이드로 이력 전송
 */
export default function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    // 누가 봤는지는 서버가 쿠키로 안다 (쿠키가 아직 없으면 기록하지 않음)
    const trackView = async () => {
      if (!getClientActorId()) return;

      // 같은 제품을 5분 내 중복 기록 방지
      try {
        const lastViewKey = `carefood_last_view_${productId}`;
        const lastView = localStorage.getItem(lastViewKey);
        if (lastView && Date.now() - Number(lastView) < 5 * 60 * 1000) return;
        localStorage.setItem(lastViewKey, String(Date.now()));
      } catch { /* ignore */ } // ds-allow: 로컬 저장

      // 이력 기록
      try {
        await fetch("/api/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            action: "view",
          }),
        });
      } catch { /* silent fail */ } // ds-allow: 조회 추적 실패는 알리지 않음
    };

    trackView();
  }, [productId]);

  return null; // 렌더링 없음
}
