import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { NotificationSettings } from "./NotificationSettings";

export const metadata: Metadata = { title: "알림 설정" };

export default function NotificationSettingsPage() {
  return (
    <Page width="narrow">
      <PageHeader title="알림 설정" description="기록할 때를 놓치지 않게 알려 드려요. 밤 10시부터 아침 8시까지는 보내지 않아요" />
      <NotificationSettings />
    </Page>
  );
}
