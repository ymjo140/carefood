"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar, Button, Card, Field, Icon, IconButton, Input, LinkButton, ListRow, PageHeader, SectionHeader, Sheet, Skeleton, useToast, type IconName,
} from "@/components/ui";
import { logout } from "@/app/auth/actions";
import { HEALTH_GOAL_LABELS, type HealthGoal } from "@/lib/nutrition";
import { ALLERGIES, readLocalProfile } from "@/lib/profile-options";
import { getOrCreateNickname, setNickname, validNickname } from "@/lib/nickname";

/**
 * 마이페이지 — 머리 줄 오른쪽 사람 아이콘
 * 내 건강 정보(관심사·목표·알레르기·건강검진)는 나만 보고, 커뮤니티에는 나오지 않는다.
 */
type Me = { email: string | null; is_admin: boolean };
type Local = { goals: HealthGoal[]; allergies: string[]; kcal: number | null; protein: number | null; hasProfile: boolean; hasHealth: boolean };

function Row({ icon, title, meta, href }: { icon: IconName; title: string; meta?: string; href: string }) {
  return (
    <li>
      <ListRow href={href} className="-mx-3 py-3"
        leading={<span className="size-9 rounded-full bg-sunken text-ink-2 flex items-center justify-center"><Icon name={icon} size={18} /></span>}
        title={title} meta={meta}
        trailing={<Icon name="chevron-right" size={18} className="text-ink-3" />} />
    </li>
  );
}

export function MeView() {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState<{ status: "loading" | "error" | "done"; data?: Me }>({ status: "loading" });
  const [local, setLocal] = useState<Local | null>(null);
  const [nick, setNick] = useState("");
  const [nickOpen, setNickOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const p = readLocalProfile() || {};
    const g = (p.nutrition_goals || {}) as { dailyCalories?: number; dailyProteinG?: number };
    let hasHealth = false;
    try { hasHealth = !!localStorage.getItem("carefood_health"); } catch { /* 건강검진 기록 없음으로 본다 */ } // ds-allow: 보조 표시
    /* eslint-disable react-hooks/set-state-in-effect -- 이 기기 저장소는 화면을 그린 뒤에만 읽을 수 있다 */
    setLocal({
      goals: (p.goals as HealthGoal[]) || [],
      allergies: (p.allergies as string[]) || [],
      kcal: g.dailyCalories ?? null,
      protein: g.dailyProteinG ?? null,
      hasProfile: Array.isArray(p.goals) && (p.goals as string[]).length > 0,
      hasHealth,
    });
    setNick(getOrCreateNickname());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setMe({ status: "done", data: d }); })
      .catch(() => { if (alive) setMe({ status: "error" }); });
    return () => { alive = false; };
  }, [attempt]);

  const saveNick = () => {
    if (!validNickname(nickDraft)) return;
    setNickname(nickDraft);
    setNick(nickDraft.trim());
    setNickOpen(false);
    toast.show("이름을 바꿨어요. 다음에 쓰는 글부터 이 이름으로 보여요");
  };

  const doLogout = () => startTransition(async () => {
    try {
      await logout();
    } catch (e) {
      // redirect() 는 예외로 끝난다 — 그 밖의 실패만 알린다
      if (!(e instanceof Error && e.message.includes("NEXT_REDIRECT"))) {
        toast.show("로그아웃하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
        return;
      }
    }
    router.refresh();
  });

  const goalText = local?.goals.length ? local.goals.map((g) => HEALTH_GOAL_LABELS[g]?.label || g).join(" · ") : "아직 정하지 않았어요";
  const allergyText = local?.allergies.length
    ? local.allergies.map((a) => ALLERGIES.find((x) => x.key === a)?.label || a).join(", ")
    : "없음";
  const targetText = local?.kcal ? `하루 ${local.kcal.toLocaleString("ko-KR")}kcal${local.protein ? ` · 단백질 ${local.protein}g` : ""}` : undefined;

  return (
    <>
      <PageHeader title="마이페이지" />

      {/* ── 나 ── */}
      <section className="flex items-center gap-3 mb-6">
        <Avatar name={nick} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {nick ? <p className="text-title font-bold text-ink truncate">{nick}</p> : <Skeleton className="h-6 w-32" />}
            <IconButton icon="edit" size="sm" label="이름 바꾸기" onClick={() => { setNickDraft(nick); setNickOpen(true); }} />
          </div>
          {me.status === "loading" && <Skeleton className="h-4 w-40 mt-1" />}
          {me.status === "error" && (
            <p className="text-caption text-ink-2">로그인 정보를 불러오지 못했어요 · <button type="button" className="text-brand-ink font-medium underline-offset-4 hover:underline" onClick={() => { setMe({ status: "loading" }); setAttempt((n) => n + 1); }}>다시 불러오기</button></p>
          )}
          {me.status === "done" && (me.data?.email
            ? <p className="text-caption text-ink-2 truncate">{me.data.email}</p>
            : <p className="text-caption text-ink-2">로그인하면 다른 기기에서도 같은 기록을 봐요</p>)}
        </div>
        {me.status === "done" && !me.data?.email && <LinkButton href="/login?returnTo=/me" variant="secondary" size="sm">로그인</LinkButton>}
      </section>

      {local && !local.hasProfile && (
        <Card className="mb-6 flex flex-col gap-3">
          <div>
            <h2 className="text-body font-bold text-ink">목표를 알려 주면 맞춰 골라 드려요</h2>
            <p className="text-label text-ink-2 mt-0.5">관심사·신체 정보·알레르기를 한 번에 정해요</p>
          </div>
          <LinkButton href="/onboarding" block>목표 알려 주기</LinkButton>
        </Card>
      )}

      {/* ── 내 건강 정보 ── */}
      <section className="mb-6">
        <SectionHeader title="내 건강 정보" />
        <ul className="flex flex-col">
          <Row icon="edit" title="관심사·목표·신체 정보" meta={local ? [goalText, targetText].filter(Boolean).join(" · ") : undefined} href="/me/profile" />
          <Row icon="alert" title="알레르기·맛 선호" meta={local ? `알레르기 ${allergyText}` : undefined} href="/me/profile#allergies" />
          <Row icon="info" title="건강검진 정보" meta={local ? (local.hasHealth ? "입력했어요" : "혈당·혈압을 넣으면 더 정확하게 골라요") : undefined} href="/health" />
          <Row icon="list" title="영양 리포트" href="/health/report" />
        </ul>
        <p className="flex items-center gap-1.5 text-caption text-ink-2 mt-2">
          <Icon name="lock" size={14} className="shrink-0" />건강 정보는 나만 봐요. 커뮤니티 글에는 나오지 않아요
        </p>
      </section>

      {/* ── 내 활동 ── */}
      <section className="mb-6">
        <SectionHeader title="내 활동" />
        <ul className="flex flex-col">
          <Row icon="feed" title="내가 쓴 글" href="/community?tab=mine" />
          <Row icon="bell" title="알림" href="/notifications" />
          <Row icon="user" title="차단한 사람" meta="차단을 풀 수 있어요" href="/me/blocked" />
          <Row icon="users" title="관심 표시한 공구" href="/group-buy?view=mine" />
          <Row icon="notebook" title="주간 식단 리포트" href="/diary/report" />
          <Row icon="users" title="가족 건강 관리" meta="로그인하면 가족 프로필을 함께 관리해요" href="/family" />
        </ul>
      </section>

      {/* ── 정보 ── */}
      <section className="mb-6">
        <SectionHeader title="정보" />
        <ul className="flex flex-col">
          <Row icon="external" title="입점 문의" href="/vendor/apply" />
          <Row icon="info" title="이용약관" href="/terms" />
          <Row icon="lock" title="개인정보처리방침" href="/privacy" />
        </ul>
      </section>

      {me.status === "done" && me.data?.is_admin && (
        <section className="mb-6">
          <SectionHeader title="관리자" />
          <ul className="flex flex-col">
            <Row icon="alert" title="신고 검토" href="/admin/reports" />
            <Row icon="list" title="데이터 현황" href="/admin" />
            <Row icon="cart" title="발주 관리" href="/admin/orders" />
            <Row icon="info" title="시장 인사이트" href="/admin/insights" />
            <Row icon="grid" title="ODM 수요 분석" href="/admin/odm" />
            <Row icon="edit" title="디자인 시스템" href="/design-system" />
          </ul>
        </section>
      )}

      {me.status === "done" && me.data?.email && (
        <Button variant="ghost" icon="logout" loading={pending} onClick={doLogout} className="-ml-3">로그아웃하기</Button>
      )}

      <Sheet open={nickOpen} onClose={() => setNickOpen(false)} title="이름 바꾸기"
        description="커뮤니티에 보이는 이름이에요. 이미 쓴 글의 이름은 그대로예요"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setNickOpen(false)}>취소</Button>
            <Button block disabled={!validNickname(nickDraft)} onClick={saveNick}>저장하기</Button>
          </>
        }>
        <Field label="이름" hint="2~12자 · 한글·영문·숫자·밑줄"
          error={nickDraft && !validNickname(nickDraft) ? "2~12자의 한글·영문·숫자·밑줄만 쓸 수 있어요" : undefined}>
          <Input value={nickDraft} name="nickname" maxLength={12} onChange={(e) => setNickDraft(e.target.value)} />
        </Field>
      </Sheet>
    </>
  );
}
