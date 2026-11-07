import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { GroupBuyTab } from "./GroupBuyTab";

export const metadata: Metadata = {
  title: "공구",
  description: "자주 사는 건강식품을 묶음으로 — 관심을 모아 함께 사요",
};

export default function GroupBuyPage() {
  return (
    <Page width="default">
      <GroupBuyTab />
    </Page>
  );
}
