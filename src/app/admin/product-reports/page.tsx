"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/ui/AppLink";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Notice, Page, PageHeader, SkeletonList, Tabs, UnitInput, useToast } from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";
import { platformLabel } from "@/lib/platforms";
import { FIX_FIELDS, REPORT_KIND_SHORT, REPORT_STATUS_LABEL, type ReportKind, type ReportStatus } from "@/lib/product-reports";

/**
 * 관리 › 정보 신고 — 제품·종류마다 묶어 건수 순으로. 신고한 맞는 값·메모·라벨 사진을 보고 그 자리에서 제품 값을 고친다.
 * 서버: /api/admin/product-reports (GET 목록 · PATCH 처리). 고친 값은 product_fixes 에 전·후가 남는다.
 * '고침'으로 바꾸면 신고한 사람 알림함에 "알려 주신 … 정보를 고쳤어요"가 뜬다.
 */
type Product = { id: string; name: string; manufacturer: string | null; serving_g: number | null; serving_kcal: number | null } & Record<string, number | string | null>;
type Item = {
  product_id: string; kind: ReportKind; count: number; status: ReportStatus; last_at: string;
  claims: Record<string, number>[]; notes: string[]; photos: string[];
  product: Product | null; links: { platform: string; url: string; price: number; is_available: boolean | null }[];
};
type View = "open" | "fixed" | "rejected";
const CLAIM_LABEL: Record<string, string> = { kcal: "열량", protein_g: "단백질", carbs_g: "탄수화물", sodium_mg: "나트륨", serving_g: "1회 제공량" };
const CLAIM_UNIT: Record<string, string> = { kcal: "kcal", protein_g: "g", carbs_g: "g", sodium_mg: "mg", serving_g: "g" };
const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(iso));

export default function ProductReportsPage() {
  const [view, setView] = useState<View>("open");
  const [data, setData] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  const load = useCallback(() => {
    const n = ++req.current; // 보기를 빨리 바꿔도 마지막 응답만
    setData(null); setError(null);
    fetch(`/api/admin/product-reports?status=${view}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "불러오지 못했어요"); if (n === req.current) setData(d.items || []); })
      .catch((e: Error) => { if (n === req.current) setError(e.message); });
  }, [view]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 보기를 바꾸면 다시 불러온다

  return (
    <Page width="wide">
      <PageHeader title="정보 신고" description="제품 정보가 포장과 다르다는 신고 · 같은 제품·종류는 한 줄로 모아 건수 순" />
      <LinkTabs items={ADMIN_TABS} current="/admin/product-reports" label="관리자 메뉴" className="mb-4" />
      <Tabs label="신고 상태" className="mb-5" value={view} onChange={setView}
        items={[{ value: "open", label: "처리할 것" }, { value: "fixed", label: "고침" }, { value: "rejected", label: "반려" }]} />

      {!data && !error && <SkeletonList rows={3} thumb={false} />}
      {error && (
        <Notice tone="danger" title="신고를 불러오지 못했어요">
          <p>{error}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={load}>다시 불러오기</Button>
        </Notice>
      )}
      {data && data.length === 0 && (
        <EmptyState title={view === "open" ? "처리할 신고가 없어요" : "아직 없어요"} description="제품 상세의 '정보 오류 신고하기'로 들어온 신고가 여기에 모여요" />
      )}
      {data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((it) => <ReportCard key={`${it.product_id}:${it.kind}`} it={it} editable={view === "open"} onDone={load} />)}
        </div>
      )}
    </Page>
  );
}

function ReportCard({ it, editable, onDone }: { it: Item; editable: boolean; onDone: () => void }) {
  const toast = useToast();
  const p = it.product;
  const [fix, setFix] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(FIX_FIELDS).map((k) => [k, p?.[k] == null ? "" : String(p[k])])));
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState<ReportStatus | null>(null);
  const linkOnly = it.kind === "wrong_page" || it.kind === "price"; // 판매 링크 문제 — 영양 칸 대신 링크 숨기기만

  async function act(status: ReportStatus) {
    if (busy) return;
    setBusy(status);
    try {
      const changed = status === "fixed" && !linkOnly
        ? Object.fromEntries(Object.entries(fix).filter(([k, v]) => v !== "" && String(p?.[k] ?? "") !== v))
        : undefined;
      const r = await fetch("/api/admin/product-reports", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: it.product_id, kind: it.kind, status, fix: changed, hide_links: status === "fixed" && hide }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "처리하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      toast.show(status === "fixed" ? "고쳤어요. 신고한 사람에게 알렸어요" : status === "rejected" ? "반려했어요" : "확인 중으로 바꿨어요");
      onDone();
    } catch (e) {
      console.error("정보 신고 처리:", e);
      toast.show("처리하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {p ? <Link href={`/products/${p.id}`} className="text-body font-bold text-ink hover:underline underline-offset-4">{p.name}</Link>
            : <span className="text-body font-bold text-ink-2">지워진 제품</span>}
          <p className="text-caption text-ink-2 mt-0.5">{p?.manufacturer || "제조사 없음"} · 마지막 신고 {day(it.last_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{REPORT_KIND_SHORT[it.kind]}</Badge>
          <span className="text-label text-ink-2"><span className="num font-bold text-ink">{it.count}</span>건 · {REPORT_STATUS_LABEL[it.status]}</span>
        </div>
      </div>

      {(it.claims.length > 0 || it.notes.length > 0) && (
        <ul className="flex flex-col gap-1 text-label text-ink">
          {it.claims.map((c, i) => (
            <li key={`c${i}`} className="num">
              {Object.entries(c).map(([k, v]) => `${CLAIM_LABEL[k] || k} ${v.toLocaleString()}${CLAIM_UNIT[k] || ""}`).join(" · ")}
            </li>
          ))}
          {it.notes.map((n, i) => <li key={`n${i}`} className="text-ink-2">“{n}”</li>)}
        </ul>
      )}
      {it.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {it.photos.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="text-label text-brand-ink underline underline-offset-4">라벨 사진 {i + 1} 열기</a>)}
        </div>
      )}
      {it.links.length > 0 && (
        <p className="flex flex-wrap gap-x-3 text-caption text-ink-2">
          {it.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              {platformLabel(l.platform)} {l.price ? `${l.price.toLocaleString()}원` : ""}{l.is_available === false ? " (숨김)" : ""}
            </a>
          ))}
        </p>
      )}

      {p && (
        <p className="text-caption text-ink-2 num">
          지금 앱 1회분: {p.serving_g ?? "–"}g · {p.serving_kcal ?? "–"}kcal
        </p>
      )}

      {editable && p && (
        <div className="flex flex-col gap-3 pt-3 border-t border-line">
          {!linkOnly && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(FIX_FIELDS).map(([k, f]) => (
              <Field key={k} label={f.label}>
                <UnitInput unit={f.unit} value={fix[k]} aria-label={`${f.label} (${f.unit})`}
                  onChange={(e) => setFix((x) => ({ ...x, [k]: e.target.value.replace(/[^\d.]/g, "") }))} />
              </Field>
            ))}
          </div>}
          {linkOnly && (
            <Checkbox label="이 제품의 판매 링크 숨기기" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          )}
          {!linkOnly && <p className="text-caption text-ink-2">영양 값은 기준량당 값이에요. 고치면 1회분·100g당 값은 자동으로 다시 계산돼요</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy === "fixed"} disabled={!!busy && busy !== "fixed"} onClick={() => act("fixed")}>고침으로 저장하기</Button>
            {it.status !== "checking" && <Button size="sm" variant="secondary" loading={busy === "checking"} disabled={!!busy && busy !== "checking"} onClick={() => act("checking")}>확인 중으로 두기</Button>}
            <Button size="sm" variant="ghost" loading={busy === "rejected"} disabled={!!busy && busy !== "rejected"} onClick={() => act("rejected")}>반려하기</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
