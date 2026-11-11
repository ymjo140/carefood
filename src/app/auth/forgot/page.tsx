"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/auth/actions";
import { Button, Field, Input, Notice, Page, PageHeader, TextLink } from "@/components/ui";

/** 비밀번호 찾기 — 이메일로 재설정 링크 */
export default function ForgotPage() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, { error: null });
  return (
    <Page width="narrow">
      <PageHeader title="비밀번호 찾기" description="가입한 이메일로 비밀번호를 새로 정하는 링크를 보내요" />
      {state.sent ? (
        <Notice title="메일을 보냈어요">
          가입한 이메일이면 몇 분 안에 링크가 도착해요. 메일이 없으면 스팸함도 확인해 주세요.
        </Notice>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="이메일">
            <Input name="email" type="email" autoComplete="email" required placeholder="example@email.com" />
          </Field>
          {state.error && <Notice tone="danger">{state.error}</Notice>}
          <Button type="submit" block loading={isPending}>링크 받기</Button>
        </form>
      )}
      <div className="text-center mt-6"><TextLink href="/login">로그인으로 돌아가기</TextLink></div>
    </Page>
  );
}
