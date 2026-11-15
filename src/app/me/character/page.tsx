import type { Metadata } from "next";
import { BackButton, Page, PageHeader } from "@/components/ui";
import { CharacterSettings } from "./CharacterSettings";

export const metadata: Metadata = { title: "캐릭터" };

export default function CharacterPage() {
  return (
    <Page width="narrow">
      <BackButton fallback="/diary" />
      <PageHeader title="캐릭터" description="같이 먹고, 기록한 날만큼 자라요. 내 화면에만 나와요" />
      <CharacterSettings />
    </Page>
  );
}
