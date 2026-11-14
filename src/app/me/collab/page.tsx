import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { CollabView } from "./CollabView";

export const metadata: Metadata = { title: "협업 제안" };

export default function MyCollabPage() {
  return (
    <Page width="narrow">
      <PageHeader title="협업 제안" description="켜 두면 입점 업체가 내 커뮤니티 활동을 보고 제품 협업을 제안할 수 있어요" />
      <CollabView />
    </Page>
  );
}
