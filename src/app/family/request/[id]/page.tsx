import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import FamilyRequest from "./FamilyRequest";

export const metadata: Metadata = { title: "가족 요청" };
// 동적 라우트 — 받는 사람마다 다름
export const instant = false;

export default async function FamilyRequestPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FamilyRequest />
    </Suspense>
  );
}
