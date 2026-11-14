import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import FamilyInvite from "./FamilyInvite";

// 동적 라우트 — 초대마다 다름
export const instant = false;

export const metadata: Metadata = {
  title: "가족 초대",
  description: "가족이 오늘끼록에서 함께 보자고 초대했어요. 무엇을 보여 줄지 직접 골라요",
  robots: { index: false },
};

export default function FamilyInvitePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FamilyInvite />
    </Suspense>
  );
}
