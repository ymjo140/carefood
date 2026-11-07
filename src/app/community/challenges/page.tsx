import type { Metadata } from "next";
import { LinkButton, Page, PageHeader } from "@/components/ui";
import { ChallengeList } from "./ChallengeList";

export const metadata: Metadata = { title: "챌린지" };

export default function ChallengesPage() {
  return (
    <Page width="narrow">
      <div className="-ml-2 mb-2">
        <LinkButton href="/community" variant="ghost" size="sm" icon="chevron-left">피드</LinkButton>
      </div>
      <PageHeader title="챌린지" description="식단 기록의 성분 숫자로 하루씩 채워요" />
      <ChallengeList />
    </Page>
  );
}
