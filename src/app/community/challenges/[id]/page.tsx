import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import ChallengeDetail from "./ChallengeDetail";

export const metadata: Metadata = { title: "챌린지" };
// 동적 라우트 — 보는 사람마다 다름
export const instant = false;

export default async function ChallengeDetailPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ChallengeDetail />
    </Suspense>
  );
}
