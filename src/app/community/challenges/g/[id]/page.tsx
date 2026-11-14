import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import GroupBoard from "./GroupBoard";

export const metadata: Metadata = { title: "같이 하는 챌린지" };
// 동적 라우트 — 보는 사람마다 다름
export const instant = false;

export default async function GroupBoardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <GroupBoard />
    </Suspense>
  );
}
