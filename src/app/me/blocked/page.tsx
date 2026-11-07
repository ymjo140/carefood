import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { BlockedList } from "./BlockedList";

export const metadata: Metadata = { title: "차단한 사람" };

export default function BlockedPage() {
  return (
    <Page width="narrow">
      <PageHeader title="차단한 사람" description="차단한 사람의 글과 답글은 나에게 보이지 않아요" />
      <BlockedList />
    </Page>
  );
}
