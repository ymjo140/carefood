import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { NotificationList } from "./NotificationList";

export const metadata: Metadata = { title: "알림" };

export default function NotificationsPage() {
  return (
    <Page width="narrow">
      <PageHeader title="알림" />
      <NotificationList />
    </Page>
  );
}
