import type { Metadata } from "next";
import { LinkButton, Page, PageHeader } from "@/components/ui";
import { ChallengeHome } from "./ChallengeHome";

export const metadata: Metadata = { title: "챌린지" };

export default function ChallengesPage() {
  return (
    <Page width="narrow">
      <div className="-ml-2 mb-2">
        <LinkButton href="/community" variant="ghost" size="sm" icon="chevron-left">피드</LinkButton>
      </div>
      <PageHeader title="챌린지" description="식단 기록으로 하루씩 채워요 · 시즌에 같이 하거나 직접 만들어요" />
      <ChallengeHome />
    </Page>
  );
}
