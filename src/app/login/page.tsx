"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login, signup } from "@/app/auth/actions";

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "";
  const [mode, setMode] = useState<"login" | "signup">("login");

  const action = mode === "login" ? login : signup;
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold mb-2">
            {mode === "login" ? "로그인" : "회원가입"}
          </h1>
          <p className="text-sm text-muted">
            {mode === "login"
              ? "추천 결과와 프로필을 저장하세요"
              : "간편하게 가입하고 추천을 받으세요"}
          </p>
        </div>

        {/* 폼 */}
        <form action={formAction} className="space-y-4">
          {returnTo && (
            <input type="hidden" name="returnTo" value={returnTo} />
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder={mode === "signup" ? "6자 이상" : ""}
            />
          </div>

          {/* 에러 메시지 */}
          {state?.error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-primary text-white py-3 rounded-full font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {isPending
              ? "처리 중..."
              : mode === "login"
                ? "로그인"
                : "가입하기"}
          </button>
        </form>

        {/* 모드 전환 */}
        <div className="text-center mt-6">
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-sm text-muted hover:text-primary transition-colors"
          >
            {mode === "login"
              ? "계정이 없으신가요? 회원가입"
              : "이미 계정이 있으신가요? 로그인"}
          </button>
        </div>

        {/* 비로그인 체험 유도 (토스 원칙: 가입 전 추천 체험) */}
        <div className="text-center mt-8 pt-6 border-t border-border">
          <p className="text-xs text-muted mb-2">가입 없이도 추천을 체험할 수 있어요</p>
          <Link
            href="/onboarding"
            className="text-sm text-primary font-medium hover:underline"
          >
            바로 추천 받기 →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
