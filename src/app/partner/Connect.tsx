"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, LinkButton, Notice, SectionHeader, Skeleton, FilePick, buttonClass, timeAgo, useToast } from "@/components/ui";
import type { ConnectStatus } from "@/lib/partner/connect-status";
import { AGENCY_PRICE_PER_ITEM } from "@/lib/partner/rates";
import { Feed } from "./Feed";
import { ApiKeys } from "./ApiKeys";
import { Agency, Examples, History } from "./ConnectExtras";

export type Batch = {
  id: string; channel?: "excel" | "feed" | "api" | "agency"; file_name: string | null; row_count: number; ok_count: number; review_count: number; error_count: number;
  unchanged_count: number; errors: RowError[]; created_at: string;
};
type RowError = { row: number; sku?: string; field?: string; message: string };

/**
 * 설정 > 연동 — 가격·재고를 자동으로 맞추는 연결(피드·API)과 상태, 구매 링크 판매 보고 (v3 7.8 → 11/14 구조 진단: 설정 메뉴로).
 * 제품을 올리는 일(엑셀·대행·예시·받은 기록)은 제품 > 올리기(ProductUpload)로 옮겼다 — 올리기와 고치기를 한 메뉴에서.
 */
export function Connect({ qs, onChanged, linkSales }: { qs: string; onChanged: () => void; linkSales?: React.ReactNode }) {
  const [tick, setTick] = useState(0); // 피드 가져오기 뒤에 연동 상태를 다시 불러온다
  const toSales = () => document.getElementById("link-sales")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex flex-col gap-10">
      <Status qs={qs} refresh={tick} onReport={linkSales ? toSales : undefined} />

      <section>
        <SectionHeader title="연동 방식" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-body font-bold text-ink">피드 · API <span className="text-label font-medium text-brand-ink">권장</span></p>
            <p className="text-label text-ink-2 mt-1">가격이 바뀌면 바로 반영돼요. 피드에서 빠진 제품은 판매 종료로 바뀌어 추천에서 빠지지 않게 지켜요</p>
          </Card>
          <Card>
            <p className="text-body font-bold text-ink">엑셀 올리기</p>
            <p className="text-label text-ink-2 mt-1">제품 &gt; 올리기에서 바로 시작할 수 있어요. 다시 올릴 때까지 가격이 그대로라, 확인한 지 60일이 넘은 가격은 앱에서 감춰져요</p>
          </Card>
          <Card>
            <p className="text-body font-bold text-ink">대행 연동 <span className="text-label font-medium text-ink-2">상품당 <span className="num">{AGENCY_PRICE_PER_ITEM}</span>원</span></p>
            <p className="text-label text-ink-2 mt-1">표시사항 사진·상품 목록만 보내 주면 오늘끼록이 옮겨 적어요. 제품 &gt; 올리기에서 미리보기를 보고 &lsquo;반영하기&rsquo;를 눌러야 들어가요</p>
          </Card>
        </div>
      </section>

      <Feed qs={qs} onFetched={() => { onChanged(); setTick((t) => t + 1); }} />
      <ApiKeys qs={qs} />
      {linkSales && <div id="link-sales" className="scroll-mt-4">{linkSales}</div>}

      <section>
        <SectionHeader title="연동 안내" />
        <p className="text-label text-ink-2 mb-3">양식의 칸, 피드 형식, API 요청과 구매 링크 판매 보고 방법을 한곳에 모았어요</p>
        <LinkButton href="/partner/docs" variant="secondary" size="sm">연동 안내 보기</LinkButton>
      </section>
    </div>
  );
}

/** 제품 > 올리기 — 엑셀 올리기 · 오늘끼록이 대신 올린 파일 · 예시 · 받은 기록 */
export function ProductUpload({ qs, batches, isDemo = false, readOnly = false, onChanged }: {
  qs: string; batches: Batch[]; isDemo?: boolean; readOnly?: boolean; onChanged: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Batch | null>(null);
  const [tick, setTick] = useState(0);
  const last = result || batches.find((b) => b.channel === "excel") || null;

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
      toast.show(`${d.rows}줄을 올렸어요`);
      onChanged();
      setTick((t) => t + 1);
    } catch (e) {
      toast.show(`올리지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionHeader title="엑셀로 올리기"
          action={<a href="/api/partner/template" className={buttonClass({ variant: "ghost", size: "sm" })}>양식 내려받기</a>} />
        <Card className="mb-3">
          <p className="text-label text-ink-2">
            오늘끼록 양식(.xlsx)의 &lsquo;제품&rsquo; 시트에 한 줄에 제품 하나씩 적어 올려요. 가격·재고·링크만 바뀐 줄은 바로 반영되고,
            새 제품과 영양·원재료·알레르기가 바뀐 줄은 오늘끼록이 확인한 뒤 반영돼요. 자동으로 맞추려면 설정 &gt; 연동에서 피드·API를 연결해요.
          </p>
          {readOnly ? <p className="text-label text-ink-2 mt-4">관리자 보기에서는 올릴 수 없어요</p> : (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <FilePick accept=".xlsx" file={file} onChange={setFile} />
              <Button className="ml-auto" disabled={!file} loading={uploading} onClick={upload}>올리기</Button>
            </div>
          )}
        </Card>
        {last && <BatchResult batch={last} fresh={!!result} />}
      </section>
      <Agency qs={qs} refresh={tick} onChanged={() => { onChanged(); setTick((t) => t + 1); }} />
      <Examples qs={qs} isDemo={isDemo} readOnly={readOnly} onChanged={() => { onChanged(); setTick((t) => t + 1); }} />
      <History batches={batches} />
    </div>
  );
}

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

export const VIA: Record<string, string> = { excel: "엑셀", feed: "피드", api: "API", agency: "대행", web: "화면에서 고침" };
const n = (v: number) => v.toLocaleString("ko-KR");

/** 연동 상태 — 마지막 수신 · 오래된 가격 · 구매 링크 판매 보고. 문제가 있는 줄에는 경고 아이콘과 할 일 */
function Status({ qs, refresh, onReport }: { qs: string; refresh: number; onReport?: () => void }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: ConnectStatus; error?: string }>({ status: "loading" });
  const seq = useRef(0); // 다시 불러오기가 겹치면 마지막 응답만 쓴다
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/status?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (my === seq.current) setState({ status: "done", data: j });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
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
              title="구매 링크 판매 보고"
              problem={d.reports.clicks_28 > 0 && (d.reports.gap_days === null || d.reports.gap_days > 3)}
              detail={
                <>
                  {d.reports.last_at ? <>마지막 보고 {timeAgo(d.reports.last_at)}</> : "아직 보고가 없어요"}
                  {" · "}지난 28일 구매 링크 클릭 <span className="num">{n(d.reports.clicks_28)}</span>번 · 보고 <span className="num">{n(d.reports.reports_28)}</span>건
                </>
              }
              action={onReport && d.reports.clicks_28 > 0 ? <Button size="sm" variant="secondary" onClick={onReport}>판매 보고 올리기</Button> : null}
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
