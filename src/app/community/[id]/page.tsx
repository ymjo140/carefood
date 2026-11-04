import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import PostDetail from "./PostDetail";

// 동적 라우트
export const instant = false;

export default async function PostDetailPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostDetail />
    </Suspense>
  );
}
