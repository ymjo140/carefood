"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, EmptyState, Notice, Page, PageHeader, SkeletonList, useToast } from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";

/** 신고 검토 — 글·답글마다 묶어서. 3건 이상이면 이미 모두에게서 가려져 있다 */
const REASON: Record<string, string> = {
  spam: "스팸·도배", ad: "광고·홍보", abuse: "욕설·비방", medical: "근거 없는 의료·효능 주장", privacy: "개인정보 노출", other: "기타",
};
type Item = {
  kind: "post" | "comment"; id: string; count: number; reasons: Record<string, number>; details: string[]; last_at: string;
  target: { author_nickname?: string; content?: string | null; image_url?: string | null; hidden_by_reports?: boolean; is_active?: boolean; post_id?: string } | null;
};

export default function ReportsPage() {
  const toast = useToast();
  const [data, setData] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/reports")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "불러오지 못했어요"); setData(d.items || []); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (it: Item, action: "keep" | "remove") => {
    setBusy(`${it.id}:${action}`);
    try {
      const r = await fetch("/api/admin/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: it.kind, id: it.id, action }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData((cur) => (cur || []).filter((x) => x.id !== it.id));
      toast.show(action === "keep" ? "그대로 두고 다시 보이게 했어요" : "내렸어요");
    } catch {
      toast.show("처리하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  return (
    <Page width="wide">
      <PageHeader title="신고" description="글·답글마다 묶음 · 3건이 모이면 검토 전까지 모두에게서 가려져요" />
      <LinkTabs items={ADMIN_TABS} current="/admin/reports" label="관리자 메뉴" className="mb-6" />

      {!data && !error && <SkeletonList rows={3} thumb={false} />}
      {error && (
        <Notice tone="danger" title="신고를 불러오지 못했어요">
          <p>{error}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => { setError(null); setData(null); load(); }}>다시 불러오기</Button>
        </Notice>
      )}
      {data && data.length === 0 && <EmptyState title="검토할 신고가 없어요" description="새 신고가 들어오면 여기에 모여요" />}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((it) => {
            const t = it.target;
            const postId = it.kind === "post" ? it.id : t?.post_id;
            return (
              <Card key={it.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-label text-ink">
                    <b className="font-bold">{it.kind === "post" ? "글" : "답글"}</b> · {t?.author_nickname || "알 수 없음"}
                    {t?.hidden_by_reports && <span className="text-ink-2"> · 가려짐</span>}
                    {t?.is_active === false && <span className="text-ink-2"> · 이미 내려감</span>}
                  </p>
                  <p className="text-label text-ink-2">신고 <span className="num font-bold text-ink">{it.count}</span>건</p>
                </div>
                <p className="text-body text-ink whitespace-pre-line line-clamp-4">{t?.content || (t?.image_url ? "(사진만 있는 글)" : "(내용 없음)")}</p>
                <p className="text-caption text-ink-2">
                  {Object.entries(it.reasons).map(([k, n]) => `${REASON[k] || k} ${n}`).join(" · ")}
                </p>
                {it.details.length > 0 && <ul className="text-caption text-ink-2 list-disc pl-4">{it.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
                <div className="flex flex-wrap gap-2 items-center">
                  <Button size="sm" variant="secondary" loading={busy === `${it.id}:keep`} disabled={!!busy} onClick={() => act(it, "keep")}>그대로 두기</Button>
                  <Button size="sm" variant="danger" loading={busy === `${it.id}:remove`} disabled={!!busy} onClick={() => act(it, "remove")}>내리기</Button>
                  {postId && <Link href={`/community/${postId}`} className="text-label text-brand-ink hover:underline underline-offset-4 ml-auto">글 열기</Link>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
