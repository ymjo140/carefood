"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeader, Select, Sheet, SkeletonList, Switch, Textarea, useToast } from "@/components/ui";
import { CLAIM_KIND_LABEL, checkClaimsWith, patternError, type ClaimKind } from "@/lib/partner/claims";

type Term = { id: string; pattern: string; kind: ClaimKind; suggest: string | null; note: string | null; is_active: boolean; updated_at: string };
type Draft = { id?: string; pattern: string; kind: ClaimKind; suggest: string; note: string };
const EMPTY: Draft = { pattern: "", kind: "disease", suggest: "", note: "" };

/**
 * 관리자 — 금지 표현 사전 (v3 9장: 우리가 관리, 식약처 고시가 바뀌면 바로, 그 밖엔 분기마다 점검)
 * 업체의 제품 표현 점검, 고객층 메시지 점검과 검수에 같은 사전을 쓴다. 끈 줄은 점검에서 빠진다.
 */
export function ClaimTerms() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; terms?: Term[]; ready?: boolean; error?: string }>({ status: "loading" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sample, setSample] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/partners/claims");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", terms: d.terms, ready: d.ready });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const active = useMemo(() => (state.terms || []).filter((t) => t.is_active), [state.terms]);
  const hits = sample.trim() ? checkClaimsWith(active.length ? active : null, sample) : [];
  const draftError = draft ? patternError(draft.pattern) : null;

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin/partners/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
  };
  const save = async () => {
    if (!draft || draftError) return;
    setSaving(true);
    try {
      await post({ action: draft.id ? "update" : "create", ...draft });
      toast.show(draft.id ? "표현을 고쳤어요" : "표현을 더했어요");
      setDraft(null);
      await load();
    } catch (e) { toast.show(`저장하지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
    finally { setSaving(false); }
  };
  const toggle = async (t: Term, next: boolean) => {
    setBusy(t.id);
    try {
      await post({ action: "toggle", id: t.id, is_active: next });
      toast.show(next ? "점검에 다시 넣었어요" : "점검에서 뺐어요");
      await load();
    } catch (e) { toast.show(`바꾸지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };

  return (
    <section className="mt-10">
      <SectionHeader title="금지 표현 사전" action={state.status === "done" && state.ready ? <Button size="sm" variant="secondary" icon="plus" onClick={() => setDraft(EMPTY)}>표현 더하기</Button> : undefined} />
      <p className="text-label text-ink-2 mb-3">업체 제품의 표현 점검과 고객층 메시지 점검·검수에 같이 써요. 식약처 고시가 바뀌면 바로, 그 밖에는 분기마다 살펴 주세요. 바꾼 내용은 1분 안에 반영돼요.</p>
      {state.status === "loading" ? <SkeletonList rows={4} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="사전을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : !state.ready ? (
          <Notice title="사전 표를 준비하고 있어요">DB에 사전 표가 만들어지면 여기서 고칠 수 있어요. 그 전에는 코드에 있는 기본 사전으로 점검해요.</Notice>
        ) : (
          <>
            <Card className="mb-3">
              <Field label="시험해 보기" hint="문구를 넣으면 켜진 표현 중 걸리는 것을 보여 줘요">
                <Textarea rows={2} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="예: 혈당 관리에 좋은 도시락" />
              </Field>
              {sample.trim() && (
                <p className="text-label mt-3">
                  {hits.length === 0 ? <span className="text-ink-2">걸리는 표현이 없어요</span>
                    : hits.map((h) => <span key={h.phrase} className="mr-3 text-danger">&lsquo;{h.phrase}&rsquo;{h.suggest && <span className="text-ink-2"> → {h.suggest}</span>}</span>)}
                </p>
              )}
            </Card>
            {(state.terms || []).length === 0 ? (
              <EmptyState title="사전이 비어 있어요" description="비어 있는 동안은 코드에 있는 기본 사전으로 점검해요"
                action={<Button size="sm" onClick={() => setDraft(EMPTY)}>표현 더하기</Button>} />
            ) : (
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {(state.terms || []).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-label break-all ${t.is_active ? "text-ink" : "text-ink-3"}`}><code>{t.pattern}</code></p>
                        <p className="text-caption text-ink-2 mt-0.5">
                          {CLAIM_KIND_LABEL[t.kind]}{t.suggest && <> · 바꿀 말 {t.suggest}</>}{t.note && <> · {t.note}</>}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setDraft({ id: t.id, pattern: t.pattern, kind: t.kind, suggest: t.suggest || "", note: t.note || "" })}>고치기</Button>
                      <div className="w-36">
                        <Switch checked={t.is_active} disabled={busy === t.id} onChange={(v) => toggle(t, v)} label={t.is_active ? "점검 중" : "꺼 둠"} className="min-h-0 py-0" />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "표현 고치기" : "표현 더하기"}
        footer={<Button className="w-full" loading={saving} disabled={!!draftError} onClick={save}>{draft?.id ? "고치기" : "더하기"}</Button>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Field label="찾을 표현" error={draft.pattern ? draftError : undefined} hint="여러 표현은 |로 잇고, 띄어쓰기가 있어도 찾으려면 \s* 를 넣어요. 예: 혈당\s*(관리|조절)">
              <Input value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
            </Field>
            <Field label="분류" hint="분류가 업체에 보이는 이유 문구를 정해요">
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ClaimKind })}>
                {(Object.keys(CLAIM_KIND_LABEL) as ClaimKind[]).map((k) => <option key={k} value={k}>{CLAIM_KIND_LABEL[k]}</option>)}
              </Select>
            </Field>
            <Field label="바꿀 말 (선택)" hint="예: 저당 · 당류 ○g">
              <Input value={draft.suggest} maxLength={60} onChange={(e) => setDraft({ ...draft, suggest: e.target.value })} />
            </Field>
            <Field label="메모 (선택)" hint="근거 고시·날짜 등 — 업체에는 보이지 않아요">
              <Input value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </section>
  );
}
