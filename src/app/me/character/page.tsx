import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { CharacterSettings } from "./CharacterSettings";

export const metadata: Metadata = { title: "캐릭터" };

export default function CharacterPage() {
  return (
    <Page width="narrow">
      <PageHeader title="캐릭터" description="내 기록과 챌린지에 따라 표정이 바뀌어요. 내 화면에만 나와요" />
      <CharacterSettings />
    </Page>
  );
}
