import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { BuddyChat } from "./BuddyChat";

export const metadata: Metadata = { title: "캐릭터와 이야기" };

export default function BuddyPage() {
  return (
    <Page width="narrow">
      <BuddyChat />
    </Page>
  );
}
