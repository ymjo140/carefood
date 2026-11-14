"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge, Button, Card, CodeBlock, ConfirmSheet, EmptyState, Field, ListRow, Notice, SectionHeader, Sheet, SkeletonList,
  TextButton, Textarea, buttonClass, timeAgo, useToast,
} from "@/components/ui";
import type { AgencyUpload } from "@/lib/partner/agency";
import { WEB_EDIT } from "@/lib/partner/connect-status";
import { VIA, type Batch } from "./Connect";

const n = (v: number) => v.toLocaleString("ko-KR");
const BASE = "https://carefood-iota.vercel.app/api/partner/v1";

/** API 요청 예시 — 예시 엑셀의 첫 제품을 API 로 보낼 때 (가격만 바꿔 보낸 모양) */
const API_EXAMPLE = `curl -X POST "${BASE}/products/batch" \\
  -H "Authorization: Bearer cf_live_…" -H "Content-Type: application/json" \\
  -d '{"products": [{
    "partner_sku": "EX-001", "name": "닭가슴살 현미 볶음밥 도시락", "brand": "예시브랜드",
    "category": "lunchbox", "total_weight": 300, "serving_size": 300, "pack_count": 1,
    "nutrition_basis": "serving", "nutrition_source": "label",
    "calories_kcal": 420, "sodium_mg": 640, "carbs_g": 52, "sugars_g": 6, "fat_g": 11,
    "trans_fat_g": 0, "saturated_fat_g": 3, "cholesterol_mg": 55, "protein_g": 28,
    "ingredients_raw": "현미밥(국산), 닭가슴살(브라질산), 양파, 간장(대두, 밀)",
    "allergens": "닭고기, 대두, 밀", "storage": "frozen", "status": "on_sale",
    "price": 5600, "channel": "own_mall", "url": "https://shop.example.com/p/101",
    "available_from": "2026-11-08", "available_to": "2027-01-13",
    "image_url_1": "https://shop.example.com/img/101.jpg"
  }]}'`;

const API_RESPONSE = `{
  "batch_id": "…",
  "received": 1, "applied": 0, "pending_review": 1, "unchanged": 0, "rejected": 0,
  "errors": []
}`;

const PRICE_EXAMPLE = `curl -X PATCH "${BASE}/products/EX-001/offer" \\
  -H "Authorization: Bearer cf_live_…" -H "Content-Type: application/json" \\
  -d '{"price": 5600, "status": "on_sale"}'`;

/**
 * 예시로 확인하기 — 예시 엑셀·API 요청 예시, 테스트 업체는 예시로 채워 보기·지우기 (v3 10.6)
 * 채우거나 지운 뒤에는 연동 기록·대행·제품 수를 다시 불러온다(onChanged).
 */
export function Examples({ qs, isDemo, readOnly, onChanged }: { qs: string; isDemo: boolean; readOnly: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [api, setApi] = useState(false);
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const seed = async () => {
    setBusy("seed");
    try {
      const r = await fetch(`/api/partner/demo?${qs}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`예시를 채웠어요. 엑셀 ${d.excel.rows}줄 · API ${d.api.rows}줄 · 대행 1건 · 예시 주문 ${d.orders}건(고객 ${d.customers}명)`);
      onChanged();
    } catch (e) {
      toast.show(`${(e as Error).message || "예시를 채우지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };
  const clear = async () => {
    setBusy("clear");
    try {
      const r = await fetch(`/api/partner/demo?${qs}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`예시를 지웠어요. 주문 ${d.orders}건 · 제품 ${d.items}개`);
      setConfirmClear(false);
      onChanged();
    } catch (e) {
      toast.show(`${(e as Error).message || "예시를 지우지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  return (
    <section>
      <SectionHeader title="예시로 확인하기" />
      <Card>
        <p className="text-label text-ink-2">
          엑셀·API·대행이 어떤 모양인지 예시로 볼 수 있어요. 예시 엑셀은 &lsquo;제품&rsquo; 시트에 예시 제품 6개가 채워져 있어 그대로 올려 볼 수 있어요
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <a href="/api/partner/template?kind=example" className={buttonClass({ variant: "secondary", size: "sm" })}>예시 엑셀 내려받기</a>
          <Button variant="secondary" size="sm" onClick={() => setApi(true)}>API 요청 예시 보기</Button>
        </div>
        {isDemo && (
          <div className="mt-6 pt-4 border-t border-line">
            <p className="text-label font-medium text-ink">테스트 업체용 예시 채우기</p>
            <p className="text-label text-ink-2 mt-1">
              예시 제품을 엑셀(6개)·API(가격·품절 2줄)로 보내고, 케어푸드가 대신 올린 파일 1건과 예시 고객 18명의 주문을 만들어요.
              예시 제품은 검수 대기로만 두고 실제 제품 목록에는 넣지 않아요. 다시 채우면 예시 주문은 새로 만들어요
            </p>
            {readOnly ? (
              <p className="text-label text-ink-2 mt-3">관리자 보기에서는 채울 수 없어요</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <Button size="sm" variant="secondary" loading={busy === "seed"} disabled={busy !== null} onClick={seed}>예시로 채워 보기</Button>
                <TextButton disabled={busy !== null} onClick={() => setConfirmClear(true)}>예시 지우기</TextButton>
              </div>
            )}
          </div>
        )}
      </Card>

      <Sheet open={api} onClose={() => setApi(false)} title="API 요청 예시" description="API 키는 아래 'API 키'에서 만들어요. 키는 서버에만 두세요" size="lg">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-label font-medium text-ink mb-2">제품 보내기 (한 번에 500개까지)</p>
            <CodeBlock>{API_EXAMPLE}</CodeBlock>
          </div>
          <div>
            <p className="text-label font-medium text-ink mb-2">받는 답</p>
            <CodeBlock>{API_RESPONSE}</CodeBlock>
            <p className="text-caption text-ink-2 mt-2">새 제품과 영양·원재료가 바뀐 제품은 검수 대기(pending_review)로, 가격·재고만 바뀐 제품은 바로 반영(applied)돼요</p>
          </div>
          <div>
            <p className="text-label font-medium text-ink mb-2">가격·판매 상태만 바꾸기</p>
            <CodeBlock>{PRICE_EXAMPLE}</CodeBlock>
          </div>
        </div>
      </Sheet>

      <ConfirmSheet open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={clear} loading={busy === "clear"}
        title="채운 예시를 지울까요?" description="예시 주문과 검수 대기 중인 예시 제품(EX-), 기다리는 예시 대행 파일을 지워요. 받은 기록은 남아요"
        confirmLabel="지우기" />
    </section>
  );
}

const AGENCY_STATUS: Record<AgencyUpload["status"], string> = { waiting: "확인 기다림", confirmed: "반영함", returned: "돌려보냄", canceled: "거둬들임" };

/**
 * 케어푸드가 대신 올린 파일 — 업체가 미리보기를 보고 반영하거나 돌려보낸다.
 * 반영·돌려보내기 뒤에는 이 목록과 연동 기록·제품 수를 다시 불러온다.
 */
export function Agency({ qs, refresh, onChanged }: { qs: string; refresh: number; onChanged: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; uploads?: AgencyUpload[]; readOnly?: boolean; ready?: boolean; error?: string }>({ status: "loading" });
  const [open, setOpen] = useState<AgencyUpload | null>(null);
  const [mode, setMode] = useState<"view" | "return">("view");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/agency?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", uploads: d.uploads, readOnly: d.read_only, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load, refresh]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const close = () => { setOpen(null); setMode("view"); setNote(""); };
  const decide = async (action: "confirm" | "return") => {
    if (!open) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/agency/${open.id}?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (action === "confirm") {
        const x = d.result;
        toast.show(x ? `반영했어요. 바로 반영 ${x.ok} · 검수 중 ${x.review} · 반려 ${x.error}` : "반영했어요");
      } else toast.show("돌려보냈어요. 케어푸드가 고쳐서 다시 올려요");
      close();
      load();
      onChanged();
    } catch (e) {
      toast.show(`${(e as Error).message || "처리하지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
      load(); // 그새 다른 사람이 처리했을 수 있다
    } finally { setBusy(false); }
  };

  const ups = state.uploads || [];
  const waiting = ups.filter((u) => u.status === "waiting").length;
  return (
    <section>
      <SectionHeader title="케어푸드가 대신 올린 파일"
        description={waiting > 0 ? `확인을 기다리는 파일 ${waiting}개 — 미리보기를 보고 반영하기를 눌러야 들어가요` : "대행 연동을 신청하면 케어푸드가 옮겨 적은 파일이 여기에 와요"} />
      {state.status === "loading" ? <SkeletonList rows={2} /> : state.status === "error" ? (
        <EmptyState title="대신 올린 파일을 불러오지 못했어요" description={state.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
      ) : !state.ready ? (
        <EmptyState title="대행 연동을 준비하고 있어요" description="준비가 끝나면 여기에서 대신 올린 파일을 확인할 수 있어요" />
      ) : ups.length === 0 ? (
        <EmptyState title="대신 올린 파일이 없어요" description="표시사항 사진과 상품 목록을 보내 주시면 케어푸드가 양식에 옮겨 적어 여기에 올려요" />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {ups.map((u) => (
              <li key={u.id}>
                <ListRow onClick={() => setOpen(u)}
                  title={<span className="flex flex-wrap items-center gap-2">{u.file_name || "대신 올린 파일"}<Badge tone={u.status === "waiting" ? "brand" : "neutral"}>{AGENCY_STATUS[u.status]}</Badge></span>}
                  meta={<>{timeAgo(u.created_at)} · <span className="num">{n(u.row_count)}</span>줄 · 바로 반영 <span className="num">{u.preview.ok ?? 0}</span> · 검수 <span className="num">{u.preview.review ?? 0}</span> · 오류 <span className="num">{u.preview.error ?? 0}</span></>} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet open={!!open} onClose={close} title={open?.file_name || "대신 올린 파일"}
        description={open ? `${timeAgo(open.created_at)} 케어푸드가 올림 · ${AGENCY_STATUS[open.status]}` : undefined}
        footer={open?.status === "waiting" && !state.readOnly ? (mode === "view" ? (
          <>
            <Button variant="secondary" block onClick={() => setMode("return")}>돌려보내기</Button>
            <Button block loading={busy} onClick={() => decide("confirm")}>반영하기</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" block onClick={() => setMode("view")}>취소</Button>
            <Button variant="danger" block loading={busy} disabled={note.trim().length < 2} onClick={() => decide("return")}>돌려보내기</Button>
          </>
        )) : undefined}>
        {open && (
          <div className="flex flex-col gap-4">
            {open.note && <Notice title="케어푸드가 남긴 말">{open.note}</Notice>}
            <p className="text-label text-ink-2">
              <span className="num">{n(open.row_count)}</span>줄 — 반영하면 바로 반영 <span className="num">{open.preview.ok ?? 0}</span> ·
              검수 <span className="num">{open.preview.review ?? 0}</span> · 오류 <span className="num">{open.preview.error ?? 0}</span>로 들어가요.
              이미 있는 제품은 바뀐 칸만 반영돼요
            </p>
            {(open.preview.errors || []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-label">
                  <thead><tr className="text-left text-ink-2"><th className="py-1 pr-3 font-medium whitespace-nowrap">줄</th><th className="py-1 pr-3 font-medium whitespace-nowrap">제품 코드</th><th className="py-1 font-medium">고칠 것</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {open.preview.errors.map((e, i) => (
                      <tr key={i}><td className="py-1.5 pr-3 num align-top">{e.row}</td><td className="py-1.5 pr-3 num align-top whitespace-nowrap">{e.sku || "—"}</td><td className="py-1.5 text-ink">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-caption text-ink-2 mt-2">오류 줄은 반영해도 들어가지 않아요. 고쳐 달라면 돌려보내기를 눌러 주세요</p>
              </div>
            )}
            {open.decided_note && <p className="text-label text-ink-2">돌려보낸 이유: {open.decided_note}</p>}
            {mode === "return" && (
              <Field label="돌려보내는 이유">
                <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="예: 두부 덮밥 가격이 5,900원이에요" />
              </Field>
            )}
            {open.status === "waiting" && state.readOnly && <p className="text-label text-ink-2">관리자 보기에서는 반영할 수 없어요</p>}
          </div>
        )}
      </Sheet>
    </section>
  );
}

/** 받은 기록 — 엑셀·피드·API·대행 모두 (최근 10개) */
export function History({ batches }: { batches: Batch[] }) {
  return (
    <section>
      <SectionHeader title="받은 기록" description="최근 10번 — 어떤 길로 몇 줄을 받았는지" />
      {batches.length === 0 ? (
        <EmptyState title="아직 받은 기록이 없어요" description="엑셀을 올리거나 피드·API를 연결하면 여기에 쌓여요" />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {batches.map((b) => {
              const via = b.channel === "api" && b.file_name === WEB_EDIT ? "web" : b.channel || "excel";
              return (
                <li key={b.id}>
                  <ListRow
                    title={<span className="flex flex-wrap items-center gap-2"><Badge tone="neutral">{VIA[via] || via}</Badge>{via === "web" ? "제품 화면에서 고침" : b.file_name || (via === "api" ? "API 요청" : "받은 정보")}</span>}
                    meta={<>{timeAgo(b.created_at)} · <span className="num">{n(b.row_count)}</span>줄 · 바로 반영 <span className="num">{b.ok_count}</span> · 검수 <span className="num">{b.review_count}</span> · 바뀐 것 없음 <span className="num">{b.unchanged_count}</span> · 반려 <span className="num">{b.error_count}</span></>} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
