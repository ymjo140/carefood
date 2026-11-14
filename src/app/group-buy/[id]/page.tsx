import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import GroupBuyView from "./GroupBuyView";

// 동적 라우트
export const instant = false;

export default async function GroupBuyViewPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <GroupBuyView />
    </Suspense>
  );
}
