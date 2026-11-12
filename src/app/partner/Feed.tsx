"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmSheet, EmptyState, Field, Input, Notice, SectionHeader, SkeletonList, buttonClass, timeAgo, useToast } from "@/components/ui";

type Summary = { rows?: number; ok?: number; review?: number; rejected?: number; unchanged?: number; retired?: number; retire_skipped?: number };
type FeedInfo = {
  url: string; is_active: boolean; last_fetched_at: string | null; last_status: "ok" | "unchanged" | "failed" | null;
  last_error: string | null; last_summary: Summary | null; failures: number;
};

/** 상품 피드 — 같은 양식의 CSV·JSON 주소를 저장해 두면 하루 두 번 가져간다 */
export function Feed({ qs, onFetched }: { qs: string; onFetched: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; feed?: FeedInfo | null; error?: string }>({ status: "loading" });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "fetch" | "off" | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/feed?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", feed: d.feed });
      setUrl(d.feed?.url || "");
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    try {
      const r = await fetch(`/api/partner/feed?${qs}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", feed: d.feed });
      toast.show("피드 주소를 저장했어요");
    } catch (err) { toast.show(`저장하지 못했어요. ${(err as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };
  const fetchNow = async () => {
    setBusy("fetch");
    try {
      const r = await fetch(`/api/partner/feed?${qs}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.outcome.status === "failed") toast.show(`가져오지 못했어요. ${d.outcome.error}`, { tone: "danger" });
      else toast.show(d.outcome.status === "unchanged" ? "피드를 가져왔어요. 바뀐 내용이 없어요" : `피드에서 ${d.outcome.rows}줄을 가져왔어요`);
      await load();
      onFetched();
    } catch (err) { toast.show(`가져오지 못했어요. ${(err as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };
  const turnOff = async () => {
    setBusy("off");
    try {
      const r = await fetch(`/api/partner/feed?${qs}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      setConfirmOff(false);
      setState({ status: "done", feed: null });
      setUrl("");
      toast.show("피드를 껐어요");
    } catch (err) { toast.show(`끄지 못했어요. ${(err as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };

  const feed = state.feed;
  const s = feed?.last_summary;
  return (
    <section>
      <SectionHeader title="상품 피드"
        action={<a href="/api/partner/template?kind=feed" className={buttonClass({ variant: "ghost", size: "sm" })}>예시 피드 내려받기</a>} />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="피드 설정을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : (
          <>
            <Card>
              <p className="text-label text-ink-2">
                엑셀 양식과 같은 칸의 CSV나 JSON을 주소 하나에 계속 올려 두면 케어푸드가 하루 두 번 가져가요.
                피드에는 지금 파는 제품을 모두 넣어 주세요. 피드에서 빠진 제품은 판매 종료로 내려요.
              </p>
              <form onSubmit={save} className="flex flex-wrap items-end gap-2 mt-4">
                <Field label="피드 주소" className="flex-1 min-w-56">
                  <Input type="url" inputMode="url" placeholder="https://shop.example.com/feeds/carefood.csv" value={url} onChange={(e) => setUrl(e.target.value)} required />
                </Field>
                <Button type="submit" variant="secondary" loading={busy === "save"} disabled={!url.trim() || url.trim() === feed?.url}>저장하기</Button>
              </form>
              {feed && (
                <div className="flex flex-wrap gap-1 mt-3 -ml-3">
                  <Button size="sm" variant="ghost" icon="refresh" loading={busy === "fetch"} onClick={fetchNow}>지금 가져오기</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmOff(true)}>피드 끄기</Button>
                </div>
              )}
            </Card>
            {feed?.last_fetched_at && (
              <Notice className="mt-3" tone={feed.last_status === "failed" ? "danger" : "neutral"}
                title={`${timeAgo(feed.last_fetched_at)} ${feed.last_status === "failed" ? "가져오지 못했어요" : "가져왔어요"}`}>
                {feed.last_status === "failed" ? (
                  <p>{feed.last_error}{feed.failures > 1 && <> · 잇따라 <span className="num">{feed.failures}</span>번째예요</>}. 반영된 제품은 그대로 두었어요</p>
                ) : feed.last_status === "unchanged" ? (
                  <p>지난번과 내용이 같아 바꾼 것이 없어요</p>
                ) : s ? (
                  <>
                    <p>
                      <span className="num">{s.rows}</span>줄 중 바로 반영 <span className="num">{s.ok}</span> · 검수 중 <span className="num">{s.review}</span> ·
                      바뀐 것 없음 <span className="num">{s.unchanged}</span> · 반려 <span className="num">{s.rejected}</span>
                      {!!s.retired && <> · 판매 종료 <span className="num">{s.retired}</span></>}
                    </p>
                    {!!s.retire_skipped && (
                      <p className="mt-1 text-danger">
                        피드에서 <span className="num">{s.retire_skipped}</span>개가 한꺼번에 빠져서 내리지 않고 두었어요. 일부러 뺀 것이면 판매 상태를 &lsquo;판매 종료&rsquo;로 적어 보내 주세요
                      </p>
                    )}
                  </>
                ) : null}
              </Notice>
            )}
          </>
        )}
      <ConfirmSheet open={confirmOff} onClose={() => setConfirmOff(false)} onConfirm={turnOff} loading={busy === "off"}
        title="피드를 끌까요?" description="더는 가져가지 않아요. 이미 받은 제품은 그대로 남고, 엑셀로 계속 고칠 수 있어요" confirmLabel="피드 끄기" />
    </section>
  );
}
