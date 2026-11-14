"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, LinkButton, Notice, SectionHeader, Skeleton, buttonClass, timeAgo, useToast } from "@/components/ui";
import type { ConnectStatus } from "@/lib/partner/connect-status";
import { Feed } from "./Feed";
import { ApiKeys } from "./ApiKeys";

export type Batch = {
  id: string; file_name: string | null; row_count: number; ok_count: number; review_count: number; error_count: number;
  unchanged_count: number; errors: RowError[]; created_at: string;
};
type RowError = { row: number; sku?: string; field?: string; message: string };

/**
 * 연동 — 내 정보가 최신인가. 세 방식을 나란히 두고 피드·API를 권한다 (v3 7.8).
 * 엑셀 올리기는 제품 탭에서 여기로 옮겼다 — 가격·재고 갱신이 연동의 일이라서.
 */
export function Connect({ qs, batches, onChanged, onReport }: { qs: string; batches: Batch[]; onChanged: () => void; onReport?: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Batch | null>(null);
  const [tick, setTick] = useState(0); // 올리기·피드 가져오기 뒤에 연동 상태를 다시 불러온다
  const fileRef = useRef<HTMLInputElement>(null);
  const last = result || batches[0] || null;

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/partner/upload?${qs}`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult({
        id: d.batch_id, file_name: file.name, row_count: d.rows, ok_count: d.ok, review_count: d.review, error_count: d.error,
        unchanged_count: d.unchanged, errors: d.errors, created_at: new Date().toISOString(),
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.show(`${d.rows}줄을 올렸어요`);
      onChanged();
      setTick((t) => t + 1);
    } catch (e) {
      toast.show(`올리지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col gap-10">
      <Status qs={qs} refresh={tick} onReport={onReport} />

      <section>
        <SectionHeader title="연동 방식" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-body font-bold text-ink">피드 · API <span className="text-label font-medium text-brand-ink">권장</span></p>
            <p className="text-label text-ink-2 mt-1">가격이 바뀌면 바로 반영돼요. 피드에서 빠진 제품은 판매 종료로 바뀌어 추천에서 빠지지 않게 지켜요</p>
          </Card>
          <Card>
            <p className="text-body font-bold text-ink">엑셀 올리기</p>
            <p className="text-label text-ink-2 mt-1">지금 바로 시작할 수 있어요. 다시 올릴 때까지 가격이 그대로라, 확인한 지 60일이 넘은 가격은 앱에서 감춰져요</p>
          </Card>
          <Card>
            <p className="text-body font-bold text-ink">대행 연동 (유료)</p>
            <p className="text-label text-ink-2 mt-1">표시사항 사진·상품 목록만 보내 주면 케어푸드가 옮겨 적어요. 업체가 &lsquo;확인했어요&rsquo;를 누른 뒤 반영해요</p>
          </Card>
        </div>
      </section>

      <Feed qs={qs} onFetched={() => { onChanged(); setTick((t) => t + 1); }} />
      <ApiKeys qs={qs} />

      <section>
        <SectionHeader title="엑셀로 올리기"
          action={<a href="/api/partner/template" className={buttonClass({ variant: "ghost", size: "sm" })}>양식 내려받기</a>} />
        <Card className="mb-3">
          <p className="text-label text-ink-2">
            케어푸드 양식(.xlsx)의 &lsquo;제품&rsquo; 시트에 한 줄에 제품 하나씩 적어 올려요. 가격·재고·링크만 바뀐 줄은 바로 반영되고,
            새 제품과 영양·원재료·알레르기가 바뀐 줄은 케어푸드가 확인한 뒤 반영돼요.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <label className={buttonClass({ variant: "secondary" })}>
              파일 고르기
              <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <span className="text-label text-ink-2 min-w-0 truncate">{file ? file.name : "고른 파일이 없어요"}</span>
            <Button className="ml-auto" disabled={!file} loading={uploading} onClick={upload}>올리기</Button>
          </div>
        </Card>
        {last && <BatchResult batch={last} fresh={!!result} />}
      </section>

      <section>
        <SectionHeader title="연동 안내" />
        <p className="text-label text-ink-2 mb-3">양식의 칸, 피드 형식, API 요청과 구매 확정 보고 방법을 한곳에 모았어요</p>
        <LinkButton href="/partner/docs" variant="secondary" size="sm">연동 안내 보기</LinkButton>
      </section>
    </div>
  );
}

/** 마지막으로 올린 결과 — 줄별 오류까지 */
function BatchResult({ batch, fresh }: { batch: Batch; fresh: boolean }) {
  const failed = batch.error_count > 0;
  return (
    <Notice tone={failed ? "danger" : "neutral"} title={`${fresh ? "방금" : timeAgo(batch.created_at)} 올린 ${batch.file_name || "파일"}`}>
      <p>
        <span className="num">{batch.row_count}</span>줄 중 바로 반영 <span className="num">{batch.ok_count}</span> ·
        검수 중 <span className="num">{batch.review_count}</span> · 바뀐 것 없음 <span className="num">{batch.unchanged_count}</span> ·
        반려 <span className="num">{batch.error_count}</span>
      </p>
      {batch.errors.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-label">
            <thead>
              <tr className="text-left text-ink-2"><th className="py-1 pr-3 font-medium whitespace-nowrap">줄</th><th className="py-1 pr-3 font-medium whitespace-nowrap">제품 코드</th><th className="py-1 font-medium">고칠 것</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batch.errors.slice(0, 100).map((e, i) => (
                <tr key={i}><td className="py-1.5 pr-3 num align-top">{e.row}</td><td className="py-1.5 pr-3 num align-top whitespace-nowrap">{e.sku || "—"}</td><td className="py-1.5 text-ink">{e.message}</td></tr>
              ))}
            </tbody>
          </table>
          {batch.errors.length > 100 && <p className="mt-2">앞의 100개만 보여요. 고쳐서 다시 올리면 나머지도 보여요</p>}
        </div>
      )}
    </Notice>
  );
}

const VIA: Record<string, string> = { excel: "엑셀", feed: "피드", api: "API" };
const n = (v: number) => v.toLocaleString("ko-KR");

/** 연동 상태 — 마지막 수신 · 오래된 가격 · 구매 확정 보고. 문제가 있는 줄에는 경고 아이콘과 할 일 */
function Status({ qs, refresh, onReport }: { qs: string; refresh: number; onReport?: () => void }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: ConnectStatus; error?: string }>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/status?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setState({ status: "done", data: j });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load, refresh]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const d = state.data;
  return (
    <section>
      <SectionHeader title="연동 상태" />
      {state.status === "loading" ? (
        <Card padding="none"><div className="flex flex-col gap-4 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div></Card>
      ) : state.status === "error" || !d ? (
        <EmptyState title="연동 상태를 불러오지 못했어요" description={state.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            <Row
              title="마지막으로 받은 정보"
              problem={(!!d.last && d.last.failed > 0) || (!!d.feed?.active && d.feed.status === "failed")}
              detail={!d.last ? "아직 받은 정보가 없어요. 아래에서 방식을 골라 제품을 올려 주세요" : (
                <>
                  {timeAgo(d.last.at)} · {VIA[d.last.via] || d.last.via} · <span className="num">{n(d.last.rows)}</span>줄
                  {d.last.failed > 0 && <> 중 반려 <span className="num">{n(d.last.failed)}</span>줄 — 아래 결과에서 고칠 칸을 볼 수 있어요</>}
                  {d.feed?.active && d.feed.status === "failed" && <> · 피드를 <span className="num">{d.feed.failures}</span>번 연속 가져오지 못했어요</>}
                </>
              )}
            />
            <Row
              title="가격 확인"
              problem={d.prices.stale60 > 0}
              detail={d.prices.total === 0 ? "판매 중인 가격이 아직 없어요" : (
                <>
                  판매 중 가격 <span className="num">{n(d.prices.total)}</span>개
                  {d.prices.stale60 > 0 && <> · 60일 넘어 감춰진 가격 <span className="num">{n(d.prices.stale60)}</span>개</>}
                  {d.prices.stale50 > 0 && <> · 곧 감춰질 가격(50일 넘음) <span className="num">{n(d.prices.stale50)}</span>개</>}
                  {d.prices.stale60 === 0 && d.prices.stale50 === 0 && <> · 모두 50일 안에 확인했어요</>}
                </>
              )}
            />
            <Row
              title="구매 확정 보고"
              problem={d.reports.clicks_28 > 0 && (d.reports.gap_days === null || d.reports.gap_days > 3)}
              detail={
                <>
                  {d.reports.last_at ? <>마지막 보고 {timeAgo(d.reports.last_at)}</> : "아직 보고가 없어요"}
                  {" · "}지난 28일 구매 링크 클릭 <span className="num">{n(d.reports.clicks_28)}</span>번 · 보고 <span className="num">{n(d.reports.reports_28)}</span>건
                </>
              }
              action={onReport && d.reports.clicks_28 > 0 ? <Button size="sm" variant="secondary" onClick={onReport}>주문 올리기</Button> : null}
            />
          </ul>
        </Card>
      )}
    </section>
  );
}

function Row({ title, detail, problem, action }: { title: string; detail: React.ReactNode; problem?: boolean | null; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-label font-medium text-ink">
          {problem && <Icon name="alert" size={16} className="text-danger shrink-0" aria-label="확인이 필요해요" />}
          {title}
        </p>
        <p className="text-label text-ink-2 mt-0.5">{detail}</p>
      </div>
      {action}
    </li>
  );
}
