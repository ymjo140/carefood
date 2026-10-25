"use client";

import { useEffect } from "react";

/**
 * 제품 상세 페이지에 삽입하여 조회 이력을 기록하는 컴포넌트
 * 서버 컴포넌트인 제품 페이지에서 클라이언트 사이드로 이력 전송
 */
export default function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    // 유저 ID 결정 (로그인 → auth id, 비로그인 → localStorage anonymous id)
    const trackView = async () => {
      let userId: string | null = null;

      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) userId = user.id;
      } catch { /* not logged in */ }

      if (!userId) {
        // anonymous 유저: localStorage에 세션 ID 생성
        try {
          userId = localStorage.getItem("carefood_anon_id");
          if (!userId) {
            userId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem("carefood_anon_id", userId);
          }
        } catch {
          return; // localStorage 사용 불가 시 스킵
        }
      }

      // 같은 제품을 5분 내 중복 기록 방지
      try {
        const lastViewKey = `carefood_last_view_${productId}`;
        const lastView = localStorage.getItem(lastViewKey);
        if (lastView && Date.now() - Number(lastView) < 5 * 60 * 1000) return;
        localStorage.setItem(lastViewKey, String(Date.now()));
      } catch { /* ignore */ }

      // 이력 기록
      try {
        await fetch("/api/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            product_id: productId,
            action: "view",
          }),
        });
      } catch { /* silent fail */ }
    };

    trackView();
  }, [productId]);

  return null; // 렌더링 없음
}
