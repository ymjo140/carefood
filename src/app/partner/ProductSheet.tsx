"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button, Field, Icon, Input, Notice, Select, Sheet, Skeleton, TextLink, Textarea, timeAgo, useToast,
} from "@/components/ui";
import { FIELDS, REVIEW_LABELS, CHANNELS, type Field as FieldDef } from "@/lib/partner/schema";

type Claim = { phrase: string; why: string; suggest?: string };
type Offer = { channel: string; price: number; url: string; is_available: boolean; updated_at: string; age_days: number };
type Detail = {
  item: {
    id: string; partner_sku: string; name: string; status: "pending" | "approved" | "rejected" | "discontinued";
    review_reasons: string[]; warnings: string[]; reject_note: string | null; product_id: string | null;
    created_at: string; updated_at: string; approved_at: string | null;
  };
  values: Record<string, string>; offers: Offer[]; claims: Claim[]; dropped: string | null; read_only: boolean;
};
type Result = { rows: number; ok: number; review: number; error: number; unchanged: number; errors: { row: number; field?: string; message: string }[] };

/** 양식 칸을 묶음으로 — 첫 칸의 key 에서 다음 묶음 첫 칸 전까지 */
const GROUPS: { title: string; from: string }[] = [
  { title: "기본", from: "partner_sku" },
  { title: "용량", from: "total_weight" },
  { title: "영양성분", from: "nutrition_basis" },
  { title: "원재료 · 알레르기 · 보관", from: "ingredients_raw" },
  { title: "판매", from: "status" },
  { title: "식단 서비스", from: "available_from" },
  { title: "사진 · 문구", from: "image_url_1" },
];
const grouped = GROUPS.map((g, i) => {
  const a = FIELDS.findIndex((f) => f.key === g.from);
  const b = i + 1 < GROUPS.length ? FIELDS.findIndex((f) => f.key === GROUPS[i + 1].from) : FIELDS.length;
  return { title: g.title, fields: FIELDS.slice(a, b) };
});
const DROPPED_HOW: Record<string, string> = {
  "영양 값 확인 필요": "영양성분 값이 열량 검산과 맞지 않거나 비어 있어요. 영양성분 칸을 확인해 고쳐 주세요",
  "판매처 연결 확인 중": "구매 링크가 열리지 않거나 다른 상품으로 가요. 판매 칸의 구매 링크를 확인해 주세요",
  "판매 기간 밖": "판매 시작·종료일 밖이에요. 식단 서비스 칸의 날짜를 확인해 주세요",
};
const STATUS_LINE: Record<Detail["item"]["status"], string> = {
  pending: "검수 중이에요 — 케어푸드가 확인하면 앱에 보여요",
  approved: "반영됐어요 — 앱에 보이고 있어요",
  rejected: "반려됐어요 — 아래 이유를 고쳐 다시 저장하면 다시 검수해요",
  discontinued: "판매 종료예요 — 앱에서 살 수 없어요",
};
const show = (f: FieldDef, v: string | undefined) => !v ? "—" : f.enumOf ? f.enumOf[v] || v : v;

/**
 * 제품 상세 (v3 7.2) — 상태와 이유, 추천에서 빠진 이유, 표현 점검, 판매처별 가격·확인일, 양식 칸 전체.
 * "고치기"로 칸을 고쳐 저장하면 엑셀·피드와 같은 검사를 거친다: 가격·재고·링크만 바뀌면 바로 반영, 영양·원재료·문구가 바뀌면 다시 검수.
 */
export function ProductSheet({ qs, id, onClose, onSaved }: { qs: string; id: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Detail; error?: string }>({ status: "loading" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const seq = useRef(0); // 다른 제품을 빨리 열어도 마지막 것만 보인다

  const load = useCallback(async (itemId: string) => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/items/${itemId}?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) { setState({ status: "done", data: d }); setDraft(d.values); }
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => {
    if (!id) return;
    setState({ status: "loading" }); setEditing(false); setResult(null); // eslint-disable-line react-hooks/set-state-in-effect -- 다른 제품을 열면 처음부터
    load(id);
  }, [id, load]);

  const d = state.data;
  const changed = d ? Object.keys(draft).filter((k) => (draft[k] ?? "") !== (d.values[k] ?? "")).concat(Object.keys(d.values).filter((k) => !(k in draft))) : [];
  const fieldError = (key: string) => result?.errors.find((e) => e.field === key)?.message;

  const save = async (values: Record<string, string>, done: string) => {
    if (!id) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/partner/items/${id}?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setResult(j);
      if (j.error > 0) { toast.show("저장하지 못했어요. 빨간 칸을 고쳐 주세요", { tone: "danger" }); return; }
      toast.show(j.review > 0 ? "저장했어요. 바뀐 내용을 케어푸드가 확인한 뒤 반영해요" : j.unchanged > 0 ? "바뀐 내용이 없어요" : done);
      setEditing(false);
      onSaved();
      await load(id);
    } catch (e) { toast.show(`저장하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" }); }
    finally { setSaving(false); }
  };

  const footer = !d || d.read_only ? undefined : editing ? (
    <div className="flex gap-2">
      <Button variant="secondary" className="flex-1" onClick={() => { setEditing(false); setDraft(d.values); setResult(null); }}>취소</Button>
      <Button className="flex-1" loading={saving} disabled={changed.length === 0}
        onClick={() => save(Object.fromEntries(changed.map((k) => [k, draft[k] ?? ""])), "저장했어요")}>저장하기</Button>
    </div>
  ) : (
    <div className="flex gap-2">
      {d.item.status === "discontinued" && (
        <Button variant="secondary" className="flex-1" loading={saving} onClick={() => save({ status: "on_sale" }, "다시 판매하도록 바꿨어요")}>다시 판매하기</Button>
      )}
      <Button className="flex-1" icon="edit" onClick={() => setEditing(true)}>고치기</Button>
    </div>
  );

  return (
    <Sheet open={!!id} onClose={onClose} size="lg" title={d?.item.name || "제품"}
      description={d ? <><span className="num">{d.item.partner_sku}</span> · {timeAgo(d.item.updated_at)} 바뀜</> : undefined} footer={footer}>
      {state.status === "loading" ? (
        <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : state.status === "error" || !d ? (
        <Notice tone="danger" title="제품을 불러오지 못했어요">
          {state.error}
          <Button size="sm" variant="secondary" icon="refresh" className="mt-3" onClick={() => { if (id) { setState({ status: "loading" }); load(id); } }}>다시 불러오기</Button>
        </Notice>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <p className="text-label text-ink">{STATUS_LINE[d.item.status]}</p>
            {d.item.status === "pending" && d.item.review_reasons.length > 0 && (
              <p className="text-label text-ink-2">확인할 것: {d.item.review_reasons.map((r) => REVIEW_LABELS[r] || r).join(" · ")}</p>
            )}
            {d.item.reject_note && <Notice tone="danger" title="반려 이유">{d.item.reject_note}</Notice>}
            {d.dropped && (
              <Notice tone="caution" title={`추천에서 빠졌어요 · ${d.dropped}`}>{DROPPED_HOW[d.dropped] || "고칠 칸을 확인해 주세요"}</Notice>
            )}
            {d.item.product_id && d.item.status === "approved" && <TextLink href={`/products/${d.item.product_id}`}>앱에서 보기</TextLink>}
            {d.read_only && <p className="text-caption text-ink-2">관리자 보기라 고칠 수 없어요</p>}
          </section>

          {d.claims.length > 0 && (
            <section>
              <h3 className="text-label font-bold text-ink mb-2">확인이 필요한 표현</h3>
              <ul className="flex flex-col gap-2">
                {d.claims.map((c) => (
                  <li key={c.phrase} className="flex items-start gap-1.5 text-label">
                    <Icon name="alert" size={16} className="text-danger shrink-0 mt-0.5" />
                    <span><span className="text-ink">&lsquo;{c.phrase}&rsquo;</span> <span className="text-ink-2">— {c.why}{c.suggest ? ` · 바꿀 말: ${c.suggest}` : ""}</span></span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-ink-2 mt-2">법적 판단이 아니라 먼저 알려 드리는 안내예요. 고치기에서 상품명·소개 문구·강조 표시를 바꿀 수 있어요</p>
            </section>
          )}

          <section>
            <h3 className="text-label font-bold text-ink mb-2">판매처 · 가격</h3>
            {d.offers.length === 0 ? <p className="text-label text-ink-2">반영된 판매처가 아직 없어요</p> : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {d.offers.map((o) => {
                  const age = o.age_days;
                  return (
                    <li key={o.channel} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                      <span className="text-label text-ink">{CHANNELS[o.channel as keyof typeof CHANNELS] || o.channel}{!o.is_available && <span className="text-ink-2"> · 품절</span>}</span>
                      <span className="text-label text-ink-2 whitespace-nowrap">
                        <span className="num font-bold text-ink">{o.price.toLocaleString("ko-KR")}</span>원 · 확인 <span className="num">{age}</span>일 전
                        {age >= 60 ? <span className="text-danger"> · 앱에서 감춰졌어요</span> : age >= 50 ? " · 곧 감춰져요" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {result && result.error > 0 && (
            <Notice tone="danger" title="저장하지 못한 칸">
              <ul className="flex flex-col gap-1">{result.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </Notice>
          )}

          {grouped.map((g) => (
            <section key={g.title}>
              <h3 className="text-label font-bold text-ink mb-2">{g.title}</h3>
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {g.fields.map((f) => (
                    <FieldInput key={f.key} f={f} value={draft[f.key] ?? ""} error={fieldError(f.key)}
                      disabled={f.key === "partner_sku"} onChange={(v) => setDraft((x) => ({ ...x, [f.key]: v }))} />
                  ))}
                </div>
              ) : (
                <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {g.fields.filter((f) => d.values[f.key] || f.need === "필수").map((f) => (
                    <div key={f.key} className="min-w-0">
                      <dt className="text-caption text-ink-2">{f.label}</dt>
                      <dd className={`text-label break-words ${d.values[f.key] ? "text-ink" : "text-ink-3"}`}>{show(f, d.values[f.key])}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
          {editing && (
            <p className="text-caption text-ink-2">
              가격·재고·링크·배송만 바꾸면 바로 반영돼요. 이름·영양·원재료·알레르기·소개 문구를 바꾸면 케어푸드가 확인한 뒤 반영돼요.
              엑셀이나 피드로 다시 올리면 그 값이 이 화면에서 고친 값을 덮어요
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** 양식 칸 하나 — 칸 종류에 맞는 입력 */
function FieldInput({ f, value, error, disabled, onChange }: { f: FieldDef; value: string; error?: string; disabled?: boolean; onChange: (v: string) => void }) {
  const label = <>{f.label}{f.need !== "선택" && <span className="text-ink-2 font-regular"> · {f.need}</span>}</>;
  const long = f.key === "ingredients_raw" || f.key === "description" || f.key === "cross_contact";
  return (
    <Field label={label} hint={f.help || undefined} error={error} className={long ? "sm:col-span-2" : undefined}>
      {f.type === "enum" && f.enumOf ? (
        <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">{f.need === "선택" || f.need === "권장" ? "고르지 않음" : "골라 주세요"}</option>
          {Object.entries(f.enumOf).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      ) : long ? (
        <Textarea rows={f.key === "ingredients_raw" ? 4 : 2} value={value} maxLength={f.max} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} disabled={disabled} maxLength={f.max}
          type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
          inputMode={f.type === "int" || f.type === "num" ? "decimal" : undefined}
          className={f.type === "int" || f.type === "num" ? "num" : undefined}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}
