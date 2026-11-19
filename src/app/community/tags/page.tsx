"use client";

import { useEffect, useRef, useState } from "react";
import {
  BackButton, Button, ChoiceList, ConfirmSheet, EmptyState, Icon, PageHeader, Page, SectionHeader, Skeleton, SkeletonList, Switch, TextLink, useToast,
} from "@/components/ui";
import { timeAgo } from "@/components/ui/FeedPost";

/**
 * /community/tags — 나를 태그한 글 (태그된 사람만)
 *   설정: 누가 나를 태그할 수 있나(누구나 · 내가 팔로우한 사람만 · 아무도) · 승인한 태그만 글에 보이기
 *   스토리: 다른 사람이 내 글을 스토리에 올리기 허락(리그램)
 *   승인 기다림: 승인하기 · 지우기 / 태그된 글: 내 식단에도 기록하기(같이 먹은 끼니, 7일 안) · 내 스토리에 올리기 · 식단 리스트에 담기 · 태그 지우기
 *   어느 것이든 '이 사람 태그 받지 않기' 
 *   태그 받지 않는 사람: 다시 받기
 */
type Allow = "all" | "following" | "none";
type Item = {
  id: string; post_id: string; who: string; who_id: string; status: "shown" | "pending"; at: string; excerpt: string; has_meal: boolean;
  can_record?: boolean; recorded?: boolean; can_regram?: boolean;
};
type Data = { settings: { tag_allow: Allow; tag_review: "auto" | "manual"; allow_regram?: boolean }; items: Item[]; mutes: { id: string; nickname: string }[] };
const MEAL_KO: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

const ALLOW: { value: Allow; label: string }[] = [
  { value: "all", label: "누구나 — 팔로우하지 않은 사람도" },
  { value: "following", label: "내가 팔로우한 사람만" },
  { value: "none", label: "아무도 태그할 수 없어요" },
];

export default function CommunityTagsPage() {
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [muting, setMuting] = useState<Item | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    fetch("/api/community/tags")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || String(r.status)); return d as Data; })
      .then((data) => { if (my === seq.current) setState({ kind: "ready", data }); })
      .catch((e) => { console.error(e); if (my === seq.current) setState({ kind: "error" }); });
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);
  const update = (fn: (d: Data) => Data) => setState((s) => (s.kind === "ready" ? { kind: "ready", data: fn(s.data) } : s));

  const saveSettings = async (patch: Partial<Data["settings"]>, done: string) => {
    setBusy("settings");
    try {
      const r = await fetch("/api/community/tags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "설정을 바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      update((x) => ({ ...x, settings: { ...x.settings, ...d.settings } }));
      toast.show(done);
    } catch {
      toast.show("설정을 바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const answer = async (it: Item, action: "approve" | "remove") => {
    setBusy(it.id);
    try {
      const r = await fetch(`/api/community/tags/${it.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" }); if (r.status === 409) reload(); return; }
      update((x) => ({ ...x, items: action === "remove" ? x.items.filter((i) => i.id !== it.id) : x.items.map((i) => (i.id === it.id ? { ...i, status: "shown" } : i)) }));
      toast.show(action === "approve" ? "승인했어요. 이제 글에 내 이름이 보여요" : "글에서 내 태그를 지웠어요");
    } catch {
      toast.show("바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const record = async (it: Item) => {
    setBusy(`rec-${it.id}`);
    try {
      const r = await fetch(`/api/community/tags/${it.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "record" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "내 식단에 기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); if (r.status === 409) reload(); return; }
      update((x) => ({ ...x, items: x.items.map((i) => (i.id === it.id ? { ...i, recorded: true, status: "shown" } : i)) }));
      toast.show(`${d.date ? `${Number(String(d.date).slice(5, 7))}월 ${Number(String(d.date).slice(8, 10))}일 ` : ""}${MEAL_KO[d.meal] || "끼니"}에 기록했어요. 식단 탭에서 볼 수 있어요`);
    } catch {
      toast.show("내 식단에 기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const regram = async (it: Item) => {
    setBusy(`rg-${it.id}`);
    try {
      const r = await fetch("/api/community/regram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: it.post_id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.show(d.error || "스토리에 올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
        if (r.status === 409) update((x) => ({ ...x, items: x.items.map((i) => (i.post_id === it.post_id ? { ...i, can_regram: false } : i)) }));
        return;
      }
      update((x) => ({ ...x, items: x.items.map((i) => (i.post_id === it.post_id ? { ...i, can_regram: false } : i)) }));
      toast.show(`내 스토리에 올렸어요. ${it.who} 님에게 알려요`);
    } catch {
      toast.show("스토리에 올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const copy = async (it: Item) => {
    setBusy(`copy-${it.id}`);
    try {
      const r = await fetch("/api/community/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: it.post_id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error === "식단 데이터 없음" ? "담을 식단이 없는 글이에요" : "식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      toast.show(`"${d.title || "식단"}" 식단 리스트에 담았어요`);
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const mute = async (id: string, on: boolean, nickname: string) => {
    setBusy(`mute-${id}`);
    try {
      const r = await fetch("/api/community/tags/mute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, mute: on }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      setMuting(null);
      toast.show(on ? `${nickname} 님 태그를 받지 않기로 했어요` : `${nickname} 님 태그를 다시 받아요`);
      reload(); // 기다리던 태그가 지워지고 받지 않는 사람 목록이 바뀐다
    } catch {
      toast.show("바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const header = <><BackButton fallback="/me" /><PageHeader title="나를 태그한 글" description="누가 나를 태그할 수 있는지 정하고, 태그된 글을 승인하거나 지워요" className="mt-2" /></>;
  if (state.kind === "loading") {
    return <Page width="narrow">{header}<div className="flex flex-col gap-4"><Skeleton className="h-44 rounded-lg" /><SkeletonList rows={3} thumb={false} /></div></Page>;
  }
  if (state.kind === "error") {
    return (
      <Page width="narrow">{header}
        <EmptyState title="태그를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button variant="secondary" icon="refresh" onClick={() => { setState({ kind: "loading" }); reload(); }}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const { settings, items, mutes } = state.data;
  const pending = items.filter((i) => i.status === "pending");
  const shown = items.filter((i) => i.status === "shown");
  const row = (it: Item) => (
    <li key={it.id} className="flex flex-col gap-2 py-3 border-b border-line">
      <div className="flex flex-wrap items-center gap-x-1.5">
        <TextLink href={`/community/${it.post_id}`}>{it.who} 님의 글</TextLink>
        <span className="text-caption text-ink-3">· {timeAgo(it.at)}</span>
      </div>
      <p className="text-label text-ink-2 line-clamp-2">{it.excerpt}</p>
      <div className="flex flex-wrap gap-2">
        {it.status === "pending" ? (
          <>
            <Button size="sm" variant="secondary" icon="check" loading={busy === it.id} disabled={!!busy} onClick={() => answer(it, "approve")}>승인하기</Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => answer(it, "remove")}>지우기</Button>
          </>
        ) : (
          <>
            {it.can_record && (it.recorded
              ? <span className="inline-flex items-center gap-1 min-h-11 text-label text-positive"><Icon name="check" size={16} />내 식단에 기록했어요</span>
              : <Button size="sm" variant="secondary" icon="notebook" loading={busy === `rec-${it.id}`} disabled={!!busy} onClick={() => record(it)}>내 식단에도 기록하기</Button>)}
            {it.can_regram && <Button size="sm" variant="secondary" icon="repost" loading={busy === `rg-${it.id}`} disabled={!!busy} onClick={() => regram(it)}>내 스토리에 올리기</Button>}
            {it.has_meal && <Button size="sm" variant="ghost" icon="copy" loading={busy === `copy-${it.id}`} disabled={!!busy} onClick={() => copy(it)}>식단 리스트에 담기</Button>}
            <Button size="sm" variant="ghost" loading={busy === it.id} disabled={!!busy} onClick={() => answer(it, "remove")}>태그 지우기</Button>
          </>
        )}
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setMuting(it)}>이 사람 태그 받지 않기</Button>
      </div>
    </li>
  );

  return (
    <Page width="narrow">
      {header}
      <div className="flex flex-col gap-8 pb-10">
        <section aria-labelledby="set-h" className="flex flex-col gap-3">
          <SectionHeader title={<span id="set-h">태그·스토리 설정</span>} />
          <ChoiceList label="누가 나를 태그할 수 있나요" options={ALLOW} value={settings.tag_allow}
            onChange={(v) => { if (busy !== "settings" && v !== settings.tag_allow) saveSettings({ tag_allow: v }, "태그 설정을 바꿨어요"); }} />
          <Switch checked={settings.tag_review === "manual"} disabled={busy === "settings" || settings.tag_allow === "none"}
            label="승인한 태그만 글에 보이기" description="켜면 내가 승인하기 전까지 글에 내 이름이 보이지 않아요"
            onChange={(v) => saveSettings({ tag_review: v ? "manual" : "auto" }, v ? "승인한 태그만 보이게 했어요" : "태그가 바로 보이게 했어요")} />
          <Switch checked={settings.allow_regram !== false} disabled={busy === "settings"}
            label="다른 사람이 내 글을 스토리에 올리기" description="끄면 이미 올린 스토리도 보이지 않아요 · 사진·영상이 있는 글만 올릴 수 있어요"
            onChange={(v) => saveSettings({ allow_regram: v }, v ? "내 글을 스토리에 올릴 수 있게 했어요" : "내 글을 스토리에 올리지 못하게 했어요")} />
        </section>

        {pending.length > 0 && (
          <section aria-labelledby="pend-h">
            <SectionHeader title={<span id="pend-h">승인 기다림 <span className="num text-ink-2">{pending.length}</span></span>} />
            <ul className="flex flex-col">{pending.map(row)}</ul>
          </section>
        )}

        <section aria-labelledby="shown-h">
          <SectionHeader title={<span id="shown-h">태그된 글</span>} />
          {shown.length === 0
            ? <EmptyState title="아직 나를 태그한 글이 없어요" description="다른 사람이 글에 나를 태그하면 여기와 알림에서 알려 드려요" />
            : <ul className="flex flex-col">{shown.map(row)}</ul>}
        </section>

        {mutes.length > 0 && (
          <section aria-labelledby="mute-h">
            <SectionHeader title={<span id="mute-h">태그를 받지 않는 사람</span>} />
            <ul className="flex flex-col">
              {mutes.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-line">
                  <span className="text-label text-ink truncate">{m.nickname}</span>
                  <Button size="sm" variant="ghost" loading={busy === `mute-${m.id}`} disabled={!!busy} onClick={() => mute(m.id, false, m.nickname)}>다시 받기</Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ConfirmSheet open={!!muting} onClose={() => setMuting(null)} loading={!!muting && busy === `mute-${muting.who_id}`}
        title={muting ? `${muting.who} 님 태그를 받지 않을까요?` : ""}
        description="앞으로 이 사람은 나를 태그할 수 없어요. 승인 기다리던 태그는 지우고, 이미 글에 보이는 태그는 그대로예요"
        confirmLabel="받지 않기" onConfirm={() => muting && mute(muting.who_id, true, muting.who)} />
    </Page>
  );
}
