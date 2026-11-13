"use client";

import { useActionState, useEffect, useState } from "react";
import { updatePassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, Field, Input, LinkButton, Notice, Page, PageHeader, Skeleton, TextLink } from "@/components/ui";

/**
 * 새 비밀번호 — 메일의 링크(/auth/callback → 여기)로 들어온다.
 * 링크는 주소 # 뒤에 토큰을 싣고 온다(어느 기기에서 열어도 되게) — 여기서 세션으로 바꾼 뒤 비밀번호를 받는다.
 */
export default function ResetPage() {
  const [state, formAction, isPending] = useActionState(updatePassword, { error: null });
  const [link, setLink] = useState<"checking" | "ready" | "expired">("checking");

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const access_token = h.get("access_token"), refresh_token = h.get("refresh_token");
    const supabase = createClient();
    (async () => {
      if (h.get("error") || h.get("error_code")) return setLink("expired");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", "/auth/reset"); // 토큰을 주소에 남기지 않는다
        return setLink(error ? "expired" : "ready");
      }
      // 이미 세션이 있으면(같은 브라우저에서 다시 연 경우) 그대로
      const { data } = await supabase.auth.getUser();
      setLink(data.user ? "ready" : "expired");
    })();
  }, []);

  if (link === "checking") {
    return (
      <Page width="narrow">
        <PageHeader title="새 비밀번호" />
        <Skeleton className="h-40 rounded-lg" />
      </Page>
    );
  }
  if (link === "expired") {
    return (
      <Page width="narrow">
        <PageHeader title="새 비밀번호" />
        <EmptyState title="링크가 만료됐거나 이미 쓰였어요" description="메일 링크는 한 번만 쓸 수 있어요. 새 링크를 받아 주세요"
          action={<LinkButton href="/auth/forgot">링크 다시 받기</LinkButton>} />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader title="새 비밀번호" description="앞으로 로그인할 때 쓸 비밀번호를 정해 주세요" />
      <form action={formAction} className="flex flex-col gap-4">
        <Field label="새 비밀번호" hint="6자 이상">
          <Input name="password" type="password" autoComplete="new-password" required minLength={6} />
        </Field>
        <Field label="한 번 더">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={6} />
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" block loading={isPending}>저장하기</Button>
      </form>
      <div className="text-center mt-6"><TextLink href="/auth/forgot">링크 다시 받기</TextLink></div>
    </Page>
  );
}
