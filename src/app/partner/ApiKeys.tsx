"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmSheet, EmptyState, Field, Input, LinkButton, ListRow, Notice, SectionHeader, SkeletonList, timeAgo, useToast } from "@/components/ui";

type KeyInfo = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null };
type Data = { keys: KeyInfo[]; can_manage: boolean; max: number };

/** API 키 — 만들 때 한 번만 원문을 보여 준다 */
export function ApiKeys({ qs }: { qs: string }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<KeyInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/keys?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/keys?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setFresh(d.key);
      setName("");
      toast.show("API 키를 만들었어요");
      load();
    } catch (err) { toast.show(`키를 만들지 못했어요. ${(err as Error).message}`, { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh); toast.show("키를 복사했어요"); }
    catch { toast.show("복사하지 못했어요. 키를 길게 눌러 직접 복사해 주세요", { tone: "danger" }); }
  };
  const doRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/keys?id=${revoke.id}&${qs}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.show(`${revoke.name} 키를 폐기했어요`);
      setRevoke(null);
      load();
    } catch (err) { toast.show(`폐기하지 못했어요. ${(err as Error).message}`, { tone: "danger" }); }
    finally { setBusy(false); }
  };

  const d = state.data;
  return (
    <section>
      <SectionHeader title="API" action={<LinkButton href="/partner/docs" size="sm" variant="ghost" iconRight="arrow-right">연동 문서</LinkButton>} />
      <p className="text-label text-ink-2 mb-3">
        제품·가격·재고·주문을 업체 서버에서 바로 보낼 수 있어요. 키는 서버에만 두고, 앱이나 웹 화면 코드에 넣지 마세요.
      </p>
      {fresh && (
        <Notice tone="brand" title="새 키예요. 지금만 볼 수 있어요" className="mb-3">
          <p className="num break-all text-ink select-all" data-ds-allow-break>{fresh}</p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="secondary" icon="copy" onClick={copy}>복사하기</Button>
            <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>저장했어요</Button>
          </div>
        </Notice>
      )}
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" || !d ? (
          <EmptyState title="키 목록을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : (
          <>
            {d.keys.length === 0 ? (
              <EmptyState title="아직 만든 키가 없어요" description={d.can_manage ? "아래에서 키를 만들면 연동 문서의 주소로 바로 보낼 수 있어요" : "업체 관리자 계정이 키를 만들 수 있어요"} />
            ) : (
              <Card padding="none" className="divide-y divide-line">
                {d.keys.map((k) => (
                  <ListRow key={k.id} title={k.name}
                    meta={<><span className="num">{k.key_prefix}…</span> · {timeAgo(k.created_at)} 만듦 · {k.last_used_at ? `${timeAgo(k.last_used_at)} 사용` : "아직 쓰지 않음"}</>}
                    trailing={d.can_manage ? <Button size="sm" variant="ghost" onClick={() => setRevoke(k)}>폐기하기</Button> : undefined} />
                ))}
              </Card>
            )}
            {d.can_manage && d.keys.length < d.max && (
              <Card tone="sunken" className="mt-3">
                <form onSubmit={create} className="flex flex-wrap items-end gap-2">
                  <Field label="키 이름" hint="어디에 쓰는지 (예: 쇼핑몰 서버)" className="flex-1 min-w-48">
                    <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
                  </Field>
                  <Button type="submit" variant="secondary" loading={busy} disabled={!name.trim()}>키 만들기</Button>
                </form>
              </Card>
            )}
          </>
        )}
      <ConfirmSheet open={!!revoke} onClose={() => setRevoke(null)} onConfirm={doRevoke} loading={busy}
        title={`${revoke?.name || ""} 키를 폐기할까요?`} description="이 키로 보내는 요청은 바로 거절돼요. 되돌릴 수 없어요" confirmLabel="폐기하기" />
    </section>
  );
}
