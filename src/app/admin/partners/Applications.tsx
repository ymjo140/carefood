"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardActions, Chip, ChipRow, EmptyState, Field, SectionHeader, Sheet, SkeletonList, Textarea, TextLink, timeAgo, useToast } from "@/components/ui";
import { APPLICATION_STATUS_LABEL, APPLY_KIND_LABEL, NEXT_STATUS, slugHint, type ApplicationStatus } from "@/lib/partner/apply";

export type VendorApplication = {
  id: string; company_name: string; representative: string; email: string; phone: string | null; website: string | null;
  business_number: string | null; business_type: string; product_count: number | null; message: string | null;
  status: ApplicationStatus; review_note: string | null; reviewed_at: string | null; created_at: string;
};
/** '업체로 만들기' 를 누르면 아래 업체 만들기 칸을 이 값으로 채운다 */
export type PartnerPrefill = { application_id: string; name: string; slug: string; kind: string; contact_email: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "요청하지 못했어요");
  return d as T;
}

/**
 * 관리 > 입점 맨 위 — 입점 신청(vendor_applications). 처리할 것(새 신청·연락함)은 오래된 것부터, 끝난 것은 최근 50개.
 * 새 신청 → 연락함 → 업체로 만듦(아래 업체 만들기 칸을 채워 만들면 '업체로 만듦'으로 바뀐다) | 입점하지 않음(이유)
 */
export function AdminApplications({ refresh, onMake }: { refresh: number; onMake: (p: PartnerPrefill) => void }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: VendorApplication[]; error?: string }>({ status: "loading", data: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VendorApplication | null>(null);
  const [note, setNote] = useState("");
  const seq = useRef(0);

  const load = useCallback(async (d: boolean) => {
    const my = ++seq.current; // 보기를 빨리 바꾸면 마지막 응답만
    try {
      const r = await api<{ applications: VendorApplication[] }>(`/api/admin/partners/applications${d ? "?done=1" : ""}`);
      if (my === seq.current) setState({ status: "done", data: r.applications });
    } catch (e) { if (my === seq.current) setState({ status: "error", data: [], error: (e as Error).message }); }
  }, []);
  useEffect(() => { load(done); }, [load, done, refresh]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const move = async (a: VendorApplication, status: ApplicationStatus, reason?: string) => {
    setBusy(a.id);
    try {
      await api("/api/admin/partners/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, status, note: reason }) });
      toast.show(status === "contacted" ? `${a.company_name}을(를) 연락함으로 바꿨어요` : `${a.company_name} 신청을 입점하지 않음으로 닫았어요`);
      setRejecting(null); setNote("");
      await load(done);
    } catch (e) { toast.show(`바꾸지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };

  const pick = (d: boolean) => { setState({ status: "loading", data: [] }); setDone(d); };
  const open = state.status === "done" && !done ? state.data.length : null;

  return (
    <section className="mb-10">
      <SectionHeader title="입점 신청" action={open !== null ? <span className="text-caption text-ink-2"><span className="num">{open}</span>건 처리할 것</span> : undefined} />
      <ChipRow className="mb-3">
        <Chip selected={!done} onClick={() => pick(false)}>처리할 신청</Chip>
        <Chip selected={done} onClick={() => pick(true)}>끝난 신청</Chip>
      </ChipRow>
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="입점 신청을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: [] }); load(done); }}>다시 불러오기</Button>} />
        ) : state.data.length === 0 ? (
          done ? <EmptyState title="끝난 신청이 없어요" description="업체로 만들었거나 입점하지 않기로 한 신청이 여기 남아요" />
            : <EmptyState title="처리할 입점 신청이 없어요" description="입점 신청 화면(/vendor/apply)에서 신청이 들어오면 여기 모여요" />
        ) : (
          <div className="flex flex-col gap-3">
            {state.data.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-body font-bold text-ink">{a.company_name} <span className="text-label font-regular text-ink-2">{APPLY_KIND_LABEL[a.business_type] || a.business_type}</span></h3>
                    <p className="text-caption text-ink-2 mt-0.5">{timeAgo(a.created_at)} 신청{a.product_count ? <> · 제품 <span className="num">{a.product_count}</span>개 예정</> : null}</p>
                  </div>
                  <Badge tone={a.status === "approved" ? "positive" : a.status === "rejected" ? "neutral" : a.status === "pending" ? "brand" : "neutral"}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-label">
                  <div className="flex gap-2"><dt className="text-ink-2 shrink-0">담당자</dt><dd className="text-ink min-w-0">{a.representative}</dd></div>
                  <div className="flex gap-2 min-w-0"><dt className="text-ink-2 shrink-0">이메일</dt><dd className="min-w-0 truncate"><TextLink href={`mailto:${a.email}`}>{a.email}</TextLink></dd></div>
                  {a.phone && <div className="flex gap-2"><dt className="text-ink-2 shrink-0">연락처</dt><dd className="text-ink num">{a.phone}</dd></div>}
                  {a.business_number && <div className="flex gap-2"><dt className="text-ink-2 shrink-0">사업자 번호</dt><dd className="text-ink num">{a.business_number}</dd></div>}
                  {a.website && <div className="flex gap-2 min-w-0"><dt className="text-ink-2 shrink-0">웹사이트</dt><dd className="min-w-0 truncate"><TextLink href={a.website} target="_blank" rel="noopener noreferrer">{a.website}</TextLink></dd></div>}
                </dl>
                {a.message && <p className="text-label text-ink mt-3 whitespace-pre-line">{a.message}</p>}
                {a.review_note && <p className="text-caption text-ink-2 mt-3">메모 · {a.review_note}{a.reviewed_at && <> · {timeAgo(a.reviewed_at)}</>}</p>}
                {NEXT_STATUS[a.status].length > 0 && (
                  <CardActions className="mt-3 flex-wrap">
                    <Button variant="secondary" onClick={() => onMake({ application_id: a.id, name: a.company_name, slug: slugHint(a.website), kind: a.business_type, contact_email: a.email })}>업체로 만들기</Button>
                    {a.status === "pending" && <Button variant="ghost" loading={busy === a.id} onClick={() => move(a, "contacted")}>연락함으로 바꾸기</Button>}
                    <Button variant="ghost" onClick={() => { setNote(""); setRejecting(a); }}>입점하지 않기</Button>
                  </CardActions>
                )}
              </Card>
            ))}
          </div>
        )}

      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title="입점하지 않기" description={rejecting ? `${rejecting.company_name} · 이유는 신청한 업체에 안내할 때 써요` : undefined}
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setRejecting(null)}>취소</Button>
          <Button block variant="danger" loading={!!rejecting && busy === rejecting.id} disabled={!note.trim()} onClick={() => rejecting && move(rejecting, "rejected", note)}>입점하지 않기</Button>
        </div>}>
        <Field label="이유">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="예: 지금은 식품이 아닌 제품만 팔고 있어요" />
        </Field>
      </Sheet>
    </section>
  );
}
