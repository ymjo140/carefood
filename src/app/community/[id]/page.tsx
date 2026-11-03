import { Suspense } from "react";
import PostDetail from "./PostDetail";

// 동적 라우트
export const instant = false;

export default async function PostDetailPage() {
  return (
    <Suspense fallback={
      <div className="max-w-lg mx-auto flex justify-center py-24" style={{ background: "#0C1117", minHeight: "100vh" }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#252C35", borderTopColor: "#C4870A" }} />
      </div>
    }>
      <PostDetail />
    </Suspense>
  );
}
