"use client";

import { useActionState, useState, Suspense, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import { login, signup } from "@/app/auth/actions";
import { Button, Field, Input, Notice, Page, PageLoading, TextLink } from "@/components/ui";

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "";
  const [mode, setMode] = useState<"login" | "signup">("login");

  const action = mode === "login" ? login : signup;
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <Page width="narrow">
      <div className="min-h-[60vh] flex flex-col justify-center">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-title font-bold text-ink mb-1">
            {mode === "login" ? "로그인" : "회원가입"}
          </h1>
          <p className="text-label text-ink-2">
            {mode === "login"
              ? "추천 결과와 프로필을 저장하세요"
              : "간편하게 가입하고 추천을 받으세요"}
          </p>
        </div>

        {/* 폼 */}
        {/* action 대신 onSubmit — form action 은 끝나면 입력 칸을 비워서, 비밀번호가 틀리면 이메일까지 다시 쳐야 했다 */}
        <form className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}>
          {returnTo && (
            <input type="hidden" name="returnTo" value={returnTo} />
          )}

          <Field label="이메일">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="example@email.com"
            />
          </Field>

          <Field label="비밀번호" hint={mode === "signup" ? "6자 이상으로 정해 주세요" : undefined}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              placeholder={mode === "signup" ? "6자 이상" : ""}
            />
          </Field>

          {mode === "login" && (
            <TextLink href="/auth/forgot" className="self-end -mt-2">비밀번호를 잊었어요</TextLink>
          )}

          {/* 에러 메시지 */}
          {state?.error && <Notice tone="danger">{state.error}</Notice>}

          <Button type="submit" block loading={isPending}>
            {isPending ? "처리하고 있어요" : mode === "login" ? "로그인하기" : "가입하기"}
          </Button>
        </form>

        {/* 모드 전환 */}
        <div className="text-center mt-4">
          <Button variant="ghost" size="sm" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login"
              ? "계정이 없으신가요? 회원가입"
              : "이미 계정이 있으신가요? 로그인"}
          </Button>
        </div>

        {/* 비로그인 체험 유도 (토스 원칙: 가입 전 추천 체험) */}
        <div className="text-center mt-8 pt-6 border-t border-line flex flex-col items-center gap-1">
          <p className="text-caption text-ink-2">가입 없이도 추천을 체험할 수 있어요</p>
          <TextLink href="/onboarding">바로 추천 받기 →</TextLink>
        </div>
      </div>
    </Page>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LoginContent />
    </Suspense>
  );
}
