import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { MeView } from "./MeView";

export const metadata: Metadata = { title: "마이페이지" };

export default function MePage() {
  return (
    <Page width="narrow">
      <MeView />
    </Page>
  );
}
