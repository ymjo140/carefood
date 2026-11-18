"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button, Card, Checkbox, ConfirmSheet, EmptyState, Field, IconButton, Input, LinkButton, ListRow, Page, PageHeader, SectionHeader, Sheet, Skeleton,
  SkeletonList, Switch, TextButton, TextLink, useToast,
} from "@/components/ui";
import { josa } from "@/lib/buddy";

/**
 * /friends — 내 친구. 가족 연결과 같은 표를 쓰지만 서로 보는 사이(친구 한 명 = 두 줄).
 *  - 친구가 보여 주는 것: 끼니 기록 여부(기본) · 친구가 켜면 먹은 음식·숫자. 식단 탭 사람 칩에서 하루를 보고 '같이 먹기'를 보낸다
 *  - 내가 친구에게 보여 주는 것: 끼니 기록 여부 · 먹은 음식(한 번 더 묻기) · 숫자 · 콕 찌르기 받기 — 나만 바꾼다
 *  - 고른 제품·약 체크·대신 기록하기·저녁 자동 알림은 친구에게 없다(가족만)
 *  - 친구 끊기는 어느 쪽이 눌러도 두 줄이 함께 끝난다
 */
type Scopes = { meals: boolean; products: boolean; meds: boolean; numbers: boolean; foods: boolean; proxy: boolean };
type Friend = { id: string; back: string | null; label: string; scopes: Scopes; mine: Scopes | null; allow_nudge: boolean | null };
type Invite = { id: string; kind: string; label: string; url: string; expires_at: string };
type State = { kind: "loading" } | { kind: "login" } | { kind: "error" } | { kind: "ready"; friends: Friend[]; invites: Invite[] };

const MINE: { key: "meals" | "foods" | "numbers"; title: string; hint: string }[] = [
  { key: "meals", title: "끼니를 기록했는지", hint: "아침·점심·저녁 기록 여부와 시각" },
  { key: "foods", title: "먹은 음식", hint: "끼니마다 음식 이름과 양 · 담아 둔 예정" },
  { key: "numbers", title: "열량·영양 숫자", hint: "하루 열량과 단백질·나트륨" },
];
const theirs = (s: Scopes) => MINE.filter((m) => s[m.key]).map((m) => m.title).join(" · ") || "보여 주는 것이 없어요";
const ga = (w: string) => `${w}${josa(w, "이", "가")}`;
const until = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일까지 받을 수 있어요`;

async function copy(text: string, toast: ReturnType<typeof useToast>) {
  try { await navigator.clipboard.writeText(text); toast.show("초대 링크를 복사했어요. 카톡으로 보내 주세요"); }
  catch { toast.show("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요", { tone: "danger" }); }
}

export default function FriendsPage() {
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [inviting, setInviting] = useState(false);
  const [label, setLabel] = useState("");
  const [agree, setAgree] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ending, setEnding] = useState<Friend | null>(null);
  const [foodsOn, setFoodsOn] = useState<Friend | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    fetch("/api/family/links")
      .then(async (r) => {
        if (r.status === 401) return { kind: "login" } as State;
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || String(r.status));
        return { kind: "ready", friends: d.friends || [], invites: ((d.invites || []) as Invite[]).filter((i) => i.kind === "friend") } as State;
      })
      .then((s) => { if (my === seq.current) setState(s); })
      .catch((e) => { console.error(e); if (my === seq.current) setState({ kind: "error" }); });
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const createInvite = async () => {
    setBusy("invite");
    try {
      const r = await fetch("/api/family/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, kind: "friend", agree }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "초대 링크를 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      setMade(d.url);
      reload();
    } catch {
      toast.show("초대 링크를 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const remove = async (id: string, done: string) => {
    setBusy(id);
    try {
      const r = await fetch("/api/family/links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "끊지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      setEnding(null);
      toast.show(done);
      reload();
    } catch {
      toast.show("끊지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  // 내가 친구에게 보여 줄 것 — 친구가 나를 보는 줄(back)을 바꾼다
  const patch = async (f: Friend, body: Record<string, unknown>, done: string) => {
    if (!f.back) return false;
    setBusy(f.back);
    try {
      const r = await fetch("/api/family/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.back, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return false; }
      setState((s) => (s.kind === "ready" ? { ...s, friends: s.friends.map((x) => (x.id === f.id
        ? { ...x, mine: d.scopes ?? x.mine, allow_nudge: typeof d.allow_nudge === "boolean" ? d.allow_nudge : x.allow_nudge } : x)) } : s));
      toast.show(done);
      return true;
    } catch {
      toast.show("바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return false;
    } finally { setBusy(null); }
  };
  const setMine = (f: Friend, key: "meals" | "foods" | "numbers", v: boolean) => {
    if (!f.mine) return;
    if (v && key === "foods") { setFoodsOn(f); return; }
    patch(f, { scopes: { ...f.mine, [key]: v } }, "보여 줄 것을 바꿨어요");
  };

  const header = (
    <PageHeader title="내 친구" description="친구와 서로 끼니 기록을 보고, 오늘 같이 먹을 음식을 골라요"
      actions={state.kind === "ready" && state.friends.length > 0 ? <Button size="sm" icon="plus" onClick={() => { setLabel(""); setAgree(false); setMade(null); setInviting(true); }}>친구 초대하기</Button> : undefined} />
  );

  if (state.kind === "loading") {
    return <Page width="narrow">{header}<div className="flex flex-col gap-4"><Skeleton className="h-40 rounded-lg" /><SkeletonList rows={2} thumb={false} /></div></Page>;
  }
  if (state.kind === "login") {
    return (
      <Page width="narrow">{header}
        <EmptyState title="친구와 연결하려면 로그인이 필요해요" description="로그인하면 친구를 초대해 서로 끼니 기록을 보고 같이 먹을 음식을 고를 수 있어요"
          action={<LinkButton href="/login?returnTo=/friends">로그인하기</LinkButton>} />
      </Page>
    );
  }
  if (state.kind === "error") {
    return (
      <Page width="narrow">{header}
        <EmptyState title="친구 목록을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button variant="secondary" icon="refresh" onClick={() => { setState({ kind: "loading" }); reload(); }}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const { friends, invites } = state;
  return (
    <Page width="narrow">
      {header}
      <div className="flex flex-col gap-8 pb-10">
        {friends.length === 0 ? (
          <EmptyState title="아직 연결한 친구가 없어요" description="초대 링크를 보내면 친구가 보여 줄 것을 골라 받은 뒤 서로 연결돼요"
            action={<Button onClick={() => { setLabel(""); setAgree(false); setMade(null); setInviting(true); }}>친구 초대하기</Button>} />
        ) : (
          <section aria-labelledby="friends-h" className="flex flex-col gap-3">
            <SectionHeader title={<span id="friends-h">친구 {friends.length}명</span>} />
            {friends.map((f) => (
              <Card key={f.id} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-body font-bold text-ink">{f.label}</h2>
                  <p className="text-label text-ink-2">{ga(f.label)} 보여 주는 것 · {theirs(f.scopes)}</p>
                </div>
                <LinkButton variant="secondary" icon="notebook" href={`/diary?who=${f.id}`}>{f.label} 하루 보기 · 같이 먹기</LinkButton>
                {f.mine ? (
                  <div className="flex flex-col gap-1 border-t border-line pt-3">
                    <h3 className="text-label font-bold text-ink">내가 {f.label}에게 보여 주는 것</h3>
                    {MINE.map((m) => (
                      <Switch key={m.key} checked={f.mine![m.key]} disabled={busy === f.back} label={m.title} description={m.hint}
                        onChange={(v) => setMine(f, m.key, v)} />
                    ))}
                    <Switch checked={f.allow_nudge !== false} disabled={busy === f.back} label="콕 찌르기 받기"
                      description="아직 기록하지 않은 끼니를 끼니마다 하루 한 번 알려 줄 수 있어요 · 밤 10시~아침 8시에는 오지 않아요"
                      onChange={(v) => patch(f, { allow_nudge: v }, v ? "콕 찌르기를 받기로 했어요" : "콕 찌르기를 받지 않기로 했어요")} />
                    <p className="text-caption text-ink-2">체중·건강 목표·약 체크·고른 제품은 친구에게 보이지 않아요</p>
                  </div>
                ) : (
                  <p className="text-caption text-ink-2">{ga(f.label)} 나를 보는 연결은 끝났어요 · 다시 보여 주려면 새 초대가 필요해요</p>
                )}
                <TextButton className="self-start text-danger" onClick={() => setEnding(f)}>친구 끊기</TextButton>
              </Card>
            ))}
          </section>
        )}

        {invites.length > 0 && (
          <section aria-labelledby="inv-h">
            <SectionHeader title={<span id="inv-h">보낸 초대</span>} />
            <ul className="flex flex-col">
              {invites.map((i) => (
                <ListRow key={i.id} title={`${i.label} · 받기를 기다리는 중`} meta={until(i.expires_at)}
                  trailing={<span className="flex items-center gap-1">
                    <TextButton onClick={() => copy(i.url, toast)}>링크 복사하기</TextButton>
                    <IconButton icon="trash" label={`${i.label} 초대 지우기`} size="sm" disabled={busy === i.id} onClick={() => remove(i.id, "초대를 지웠어요")} />
                  </span>} />
              ))}
            </ul>
          </section>
        )}

        <p className="text-caption text-ink-2">약 체크·대신 기록하기까지 함께하려면 <TextLink href="/family">내 가족</TextLink>에서 초대해요</p>
      </div>

      <Sheet open={inviting} onClose={() => setInviting(false)} title="친구 초대하기" size="sm"
        description="링크를 받은 친구가 로그인하고 보여 줄 것을 고르면 서로 연결돼요. 링크는 7일 동안 쓸 수 있어요"
        footer={made
          ? <Button block icon="copy" onClick={() => copy(made, toast)}>링크 복사하기</Button>
          : <Button block loading={busy === "invite"} disabled={!label.trim() || !agree} onClick={createInvite}>초대 링크 만들기</Button>}>
        {made ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-ink">초대 링크를 만들었어요</p>
            <p className="rounded-md bg-sunken px-3 py-2 text-label text-ink break-all select-all">{made}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="부르는 이름" hint="10자까지 · 식단 탭에서 이 이름으로 보여요">
              <Input value={label} maxLength={10} name="friend_label" placeholder="예: 민지" onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} className="items-start"
              label={<span className="text-label text-ink">친구가 받으면 내 끼니 기록 여부(아침·점심·저녁 기록했는지·시각)도 친구에게 보여요. 먹은 음식·숫자는 나중에 내가 켤 때만 보여요</span>} />
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!foodsOn} onClose={() => setFoodsOn(null)} loading={!!foodsOn && busy === foodsOn.back}
        title={foodsOn ? `${foodsOn.label}에게 먹은 음식을 보여 줄까요?` : ""}
        description="끼니마다 음식 이름과 양이 보여요. 먹은 음식은 건강과 관련된 정보예요. 언제든 여기서 끌 수 있어요"
        confirmLabel="보여 주기"
        onConfirm={async () => { if (foodsOn?.mine && await patch(foodsOn, { scopes: { ...foodsOn.mine, foods: true } }, "먹은 음식을 보여 주기로 했어요")) setFoodsOn(null); }} />

      <ConfirmSheet open={!!ending} onClose={() => setEnding(null)} loading={!!ending && busy === ending.id}
        title={ending ? `${ending.label}${josa(ending.label, "과", "와")} 친구를 끊을까요?` : ""}
        description="끊으면 서로의 끼니 기록이 더는 보이지 않아요. 다시 연결하려면 새 초대가 필요해요"
        confirmLabel="친구 끊기" onConfirm={() => ending && remove(ending.id, "친구를 끊었어요")} />
    </Page>
  );
}
