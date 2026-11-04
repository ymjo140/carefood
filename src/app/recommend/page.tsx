"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

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
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
      <Spinner />
      <p className="text-label text-ink-2">제품 페이지로 이동하고 있어요</p>
    </div>
  );
}
