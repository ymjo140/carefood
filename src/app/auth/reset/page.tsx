"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/auth/actions";
import { Button, Field, Input, Notice, Page, PageHeader, TextLink } from "@/components/ui";

/** 새 비밀번호 — 메일의 링크(/auth/callback → 여기)로 들어온다 */
export default function ResetPage() {
  const [state, formAction, isPending] = useActionState(updatePassword, { error: null });
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
