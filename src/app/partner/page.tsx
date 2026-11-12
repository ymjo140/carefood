"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Badge, Button, Card, EmptyState, LinkButton, ListRow, Notice, Page, PageHeader, PageLoading, SectionHeader,
  SkeletonList, Stat, Tabs, buttonClass, timeAgo, useToast,
} from "@/components/ui";
import { REVIEW_LABELS } from "@/lib/partner/schema";
import { Commission } from "./Commission";
import { Feed } from "./Feed";

type Partner = { id: string; slug: string; name: string; kind: string; status: string };
type Batch = {
  id: string; file_name: string | null; row_count: number; ok_count: number; review_count: number; error_count: number;
  unchanged_count: number; errors: RowError[]; created_at: string;
};
type RowError = { row: number; sku?: string; field?: string; message: string };
type Item = {
  id: string; partner_sku: string; status: "pending" | "approved" | "rejected" | "discontinued"; review_reasons: string[];
  warnings: string[]; reject_note: string | null; product_id: string | null; updated_at: string; name: string;
};
type Me = { partner: Partner; role: string; counts: Record<string, number>; batches: Batch[] };
type Load<T> = { status: "loading" | "error" | "done" | "login" | "not_member"; data?: T; error?: string };

const STATUS_LABEL: Record<Item["status"], string> = { pending: "검수 중", approved: "반영", rejected: "반려", discontinued: "판매 종료" };
const STATUS_TONE = { pending: "neutral", approved: "positive", rejected: "danger", discontinued: "neutral" } as const;
type Filter = "all" | "pending" | "approved" | "rejected";

function PartnerHome() {
  const as = useSearchParams().get("as");
  const qs = as ? `as=${encodeURIComponent(as)}` : "";
  const toast = useToast();
  const [me, setMe] = useState<Load<Me>>({ status: "loading" });
  const [items, setItems] = useState<Load<Item[]>>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Batch | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMe = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/me?${qs}`);
      const d = await r.json();
      if (d.state === "login") return setMe({ status: "login" });
      if (d.state === "not_member") return setMe({ status: "not_member" });
      if (!r.ok) throw new Error(d.error);
      setMe({ status: "done", data: d });
    } catch (e) { setMe({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);

  const loadItems = useCallback(async (f: Filter) => {
    try {
      const r = await fetch(`/api/partner/items?${qs}${f === "all" ? "" : `&status=${f}`}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItems({ status: "done", data: d.items });
    } catch (e) { setItems({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);

  useEffect(() => { loadMe(); }, [loadMe]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  useEffect(() => { if (me.status === "done") loadItems(filter); }, [me.status, filter, loadItems]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

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
      loadMe();
      setItems({ status: "loading" });
      loadItems(filter);
    } catch (e) {
      toast.show(`올리지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setUploading(false); }
  };

  if (me.status === "loading") return <PageLoading />;
  if (me.status === "login") {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="입점 업체 화면은 로그인해야 볼 수 있어요"
          description="케어푸드에 연결된 담당자 계정으로 로그인해 주세요"
          action={<LinkButton href="/login?returnTo=/partner" size="sm">로그인하기</LinkButton>} />
      </Page>
    );
  }
  if (me.status === "not_member") {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="이 계정은 아직 입점 업체에 연결되지 않았어요"
          description="입점을 신청하면 케어푸드가 확인한 뒤 이 계정을 업체에 연결해 드려요"
          action={<LinkButton href="/vendor/apply" size="sm" variant="secondary">입점 신청하기</LinkButton>} />
      </Page>
    );
  }
  if (me.status === "error" || !me.data) {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="업체 정보를 불러오지 못했어요" description={me.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setMe({ status: "loading" }); loadMe(); }}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const { partner, counts, batches } = me.data;
  const last = result || batches[0] || null;

  return (
    <Page>
      <PageHeader
        title={partner.name}
        description={partner.status === "active" ? "입점 업체 · 반영된 제품이 앱에 보이고 있어요" : "입점 준비 중 · 반영된 제품은 운영을 시작하면 앱에 보여요"}
        actions={<a href="/api/partner/template" className={buttonClass({ variant: "secondary", size: "sm" })}>양식 내려받기</a>}
      />

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card><Stat label="반영" value={(counts.approved || 0).toLocaleString()} /></Card>
        <Card><Stat label="검수 중" value={(counts.pending || 0).toLocaleString()} /></Card>
        <Card><Stat label="반려" value={(counts.rejected || 0).toLocaleString()} /></Card>
      </div>

      <SectionHeader title="제품 올리기" />
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

      <SectionHeader title="제품" className="mt-8" />
      <Tabs value={filter} onChange={(f) => { setFilter(f); setItems({ status: "loading" }); }} label="제품 상태" className="mb-3"
        items={[
          { value: "all", label: "전체" },
          { value: "pending", label: "검수 중", count: counts.pending || 0 },
          { value: "approved", label: "반영", count: counts.approved || 0 },
          { value: "rejected", label: "반려", count: counts.rejected || 0 },
        ]} />
      {items.status === "loading" ? <SkeletonList rows={4} thumb={false} />
        : items.status === "error" ? (
          <EmptyState title="제품 목록을 불러오지 못했어요" description={items.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setItems({ status: "loading" }); loadItems(filter); }}>다시 불러오기</Button>} />
        ) : !items.data?.length ? (
          <EmptyState title={filter === "all" ? "아직 올린 제품이 없어요" : `${STATUS_LABEL[filter as Item["status"]]} 제품이 없어요`}
            description={filter === "all" ? "양식을 내려받아 제품을 적고 위에서 올려 주세요" : undefined} />
        ) : (
          <Card padding="none" className="divide-y divide-line">
            {items.data.map((it) => (
              <ListRow key={it.id}
                href={it.product_id && it.status === "approved" ? `/products/${it.product_id}` : undefined}
                title={it.name}
                meta={
                  <span className="flex flex-col gap-0.5">
                    <span><span className="num">{it.partner_sku}</span> · {timeAgo(it.updated_at)}</span>
                    {it.status === "pending" && it.review_reasons.length > 0 && <span>{it.review_reasons.map((r) => REVIEW_LABELS[r] || r).join(" · ")}</span>}
                    {it.reject_note && <span className="text-danger">반려 이유: {it.reject_note}</span>}
                  </span>
                }
                trailing={<Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>}
              />
            ))}
          </Card>
        )}

      <Feed qs={qs} onFetched={() => { loadMe(); loadItems(filter); }} />
      <Commission qs={qs} />
    </Page>
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

export default function PartnerPage() {
  return <Suspense fallback={<PageLoading />}><PartnerHome /></Suspense>;
}
