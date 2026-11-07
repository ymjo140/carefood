import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, PageLoading } from "@/components/ui";
import { AuthorProfile } from "./AuthorProfile";

export const metadata: Metadata = { title: "프로필" };

// 동적 라우트
export const instant = false;

export default async function AuthorPage() {
  return (
    <Page width="narrow">
      <Suspense fallback={<PageLoading />}>
        <AuthorProfile />
      </Suspense>
    </Page>
  );
}
