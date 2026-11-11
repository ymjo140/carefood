"use client";

import { useEffect } from "react";
import { Button, EmptyState, Page } from "@/components/ui";
import { reportClientError } from "@/components/ErrorReporter";

/** 화면을 그리다 오류가 나면 — 이유 한 줄 + 다시 불러오기, 오류는 관리자에게 남긴다 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error.message || "화면 오류", error.stack, error.digest ? `render:${error.digest}` : "render"); }, [error]);
  return (
    <Page width="narrow">
      <EmptyState className="mt-8" title="화면을 불러오지 못했어요" description="잠깐 문제가 생겼어요. 다시 불러와 보세요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={reset}>다시 불러오기</Button>} />
    </Page>
  );
}
