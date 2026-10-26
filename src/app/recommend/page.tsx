"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /recommend → /products 리다이렉트
 * 제품 탐색과 추천이 통합되어 /products 하나로 운영
 */
export default function RecommendRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/products");
  }, [router]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted">제품 페이지로 이동 중...</p>
      </div>
    </div>
  );
}
