import type { Metadata } from "next";
import { Suspense } from "react";
import { LinkButton, Page, PageLoading } from "@/components/ui";
import { SeasonDetail } from "./SeasonDetail";

export const instant = false;
export const metadata: Metadata = { title: "시즌" };

export default function SeasonPage() {
  return (
    <Page width="narrow">
      <div className="-ml-2 mb-2">
        <LinkButton href="/community/challenges" variant="ghost" size="sm" icon="chevron-left">챌린지</LinkButton>
      </div>
      <Suspense fallback={<PageLoading />}><SeasonDetail /></Suspense>
    </Page>
  );
}
