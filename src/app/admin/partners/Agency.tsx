"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, ListRow, SectionHeader, Select, SkeletonList, TextButton, Textarea, FilePick, buttonClass, timeAgo, useToast } from "@/components/ui";
import { AGENCY_PRICE_PER_ITEM } from "@/lib/partner/rates";

type Upload = {
  id: string; file_name: string | null; row_count: number; note: string | null; status: "waiting" | "confirmed" | "returned" | "canceled";
  preview: { ok?: number; review?: number; error?: number }; created_at: string; decided_at: string | null; decided_note: string | null;
  partners: { name: string; slug: string } | null;
};
const STATUS: Record<Upload["status"], string> = { waiting: "업체 확인 기다림", confirmed: "업체가 반영함", returned: "업체가 돌려보냄", canceled: "거둬들임" };

/**
 * 관리자 — 대행 연동 (v3 10.6). 업체가 보낸 상품 목록을 양식에 옮겨 적어 업체 대신 올린다.
 * 바로 반영하지 않는다 — 업체 화면 '오늘끼록이 대신 올린 파일'에서 업체가 반영하기를 눌러야 들어간다.
 */
export function AdminAgency({ partners }: { partners: { slug: string; name: string }[] }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; uploads?: Upload[]; ready?: boolean; error?: string }>({ status: "loading" });
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0); // 올리기·거둬들이기 뒤 다시 불러오기가 겹치면 마지막 응답만 쓴다

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch("/api/admin/partners/agency");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", uploads: d.uploads, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !slug) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("slug", slug); fd.append("note", note); fd.append("file", file);
      const r = await fetch("/api/admin/partners/agency", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`대신 올렸어요. ${d.rows}줄 — 업체가 반영하기를 누르면 들어가요`);
      setFile(null); setNote("");
      load();
    } catch (e2) {
      toast.show(`올리지 못했어요. ${(e2 as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/partners/agency/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show("거둬들였어요");
    } catch (e) {
      toast.show(`${(e as Error).message || "거둬들이지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); load(); }
  };

  const ups = state.uploads || [];
  return (
    <section className="mt-10">
      <SectionHeader title="대행 연동" description={`업체 대신 엑셀을 올려요. 업체가 미리보기를 보고 반영하기를 눌러야 들어가고, 그때 바로 반영·검수 상품당 ${AGENCY_PRICE_PER_ITEM}원이 업체 충전금에서 빠져요`}
        action={<a href="/api/partner/template" className={buttonClass({ variant: "ghost", size: "sm" })}>양식 내려받기</a>} />
      <Card className="mb-3">
        <form onSubmit={upload} className="flex flex-col gap-3">
          <Field label="업체">
            <Select value={slug} onChange={(e) => setSlug(e.target.value)} required>
              <option value="">업체 고르기</option>
              {partners.map((p) => <option key={p.slug} value={p.slug}>{p.name} ({p.slug})</option>)}
            </Select>
          </Field>
          <Field label="업체에 남길 말" hint="옮겨 적다가 비워 둔 칸·확인할 것을 적어요">
            <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <FilePick accept=".xlsx" file={file} onChange={setFile} />
            <Button type="submit" className="ml-auto" disabled={!file || !slug} loading={busy === "upload"}>대신 올리기</Button>
          </div>
        </form>
      </Card>
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} /> : state.status === "error" ? (
        <EmptyState title="대행 기록을 불러오지 못했어요" description={state.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
      ) : !state.ready ? (
        <EmptyState title="대행 표가 아직 없어요" description="마이그레이션 20261115_partner_agency_demo 를 적용하면 쓸 수 있어요" />
      ) : ups.length === 0 ? (
        <EmptyState title="대신 올린 파일이 없어요" description="업체가 보낸 상품 목록을 양식에 옮겨 적어 위에서 올려요" />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {ups.map((u) => (
              <li key={u.id}>
                <ListRow
                  title={<span className="flex flex-wrap items-center gap-2">{u.partners?.name || "업체"} · {u.file_name || "파일"}<Badge tone={u.status === "waiting" ? "brand" : "neutral"}>{STATUS[u.status]}</Badge></span>}
                  meta={<>{timeAgo(u.created_at)} · <span className="num">{u.row_count}</span>줄 · 바로 반영 <span className="num">{u.preview.ok ?? 0}</span> · 검수 <span className="num">{u.preview.review ?? 0}</span> · 오류 <span className="num">{u.preview.error ?? 0}</span>{u.decided_note ? ` · ${u.decided_note}` : ""}</>}
                  trailing={u.status === "waiting" ? <TextButton disabled={busy === u.id} onClick={() => cancel(u.id)}>거둬들이기</TextButton> : undefined} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
