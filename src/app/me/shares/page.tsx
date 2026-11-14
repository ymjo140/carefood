import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { ShareList } from "./ShareList";

export const metadata: Metadata = { title: "내 공유" };

export default function MySharesPage() {
  return (
    <Page width="narrow">
      <PageHeader title="내 공유" description="인증 카드 링크마다 몇 명이 봤고 몇 명이 같이 시작했는지 보여요. 누가 봤는지는 보이지 않아요" />
      <ShareList />
    </Page>
  );
}
