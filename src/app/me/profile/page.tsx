import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { ProfileEditor } from "./ProfileEditor";

export const metadata: Metadata = { title: "관심사·건강 정보 고치기" };

export default function ProfileEditPage() {
  return (
    <Page width="narrow">
      <ProfileEditor />
    </Page>
  );
}
