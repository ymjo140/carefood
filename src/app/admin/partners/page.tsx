"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge, Button, Card, CardActions, EmptyState, Field, Input, LinkButton, Page, PageHeader, SectionHeader, Select, Sheet,
  SkeletonList, Textarea, TextLink, timeAgo, useToast,
} from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";
import { ALLERGENS, CATEGORIES, REVIEW_LABELS, stable, type PartnerItem } from "@/lib/partner/schema";

type Partner = {
  id: string; slug: string; name: string; kind: string; status: "onboarding" | "active" | "paused"; contact_email: string | null;
  members: { email: string; role: string }[]; counts: Record<string, number>;
};
type Candidate = { id: string; name: string; manufacturer: string | null; calories: number | null; serving_size_g: number | null; why: string };
type ReviewItem = {
  id: string; partner_sku: string; data: PartnerItem; approved_data: PartnerItem | null; review_reasons: string[]; warnings: string[];
  product_id: string | null; updated_at: string; partners: { slug: string; name: string; kind: string }; candidates: Candidate[];
};
type Load<T> = { status: "loading" | "error" | "done"; data: T; error?: string };

const KIND_LABEL: Record<string, string> = { meal_service: "식단 서비스", brand: "식품 브랜드", mall: "유통·몰" };
const STATUS_LABEL: Record<Partner["status"], string> = { onboarding: "준비 중", active: "운영 중", paused: "멈춤" };
const FIELD_LABEL: Record<string, string> = {
  name: "제품명", category: "카테고리", meal_role: "먹는 역할", nutrition_basis: "영양 기준", nutrition_source: "영양 출처", nutrition: "영양 값",
  ingredients_raw: "원재료", allergens: "알레르기", cross_contact: "같은 시설 문구", description: "소개 문구", claims: "강조 표시",
  serving_size: "1회 제공량", total_weight: "총 내용량",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "요청하지 못했어요");
  return d as T;
}
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function AdminPartnersPage() {
  const toast = useToast();
  const [partners, setPartners] = useState<Load<Partner[]>>({ status: "loading", data: [] });
  const [queue, setQueue] = useState<Load<ReviewItem[]>>({ status: "loading", data: [] });

  const loadPartners = useCallback(async () => {
    try { setPartners({ status: "done", data: (await api<{ partners: Partner[] }>("/api/admin/partners")).partners }); }
    catch (e) { setPartners({ status: "error", data: [], error: (e as Error).message }); }
  }, []);
  const loadQueue = useCallback(async () => {
    try { setQueue({ status: "done", data: (await api<{ items: ReviewItem[] }>("/api/admin/partners/review")).items }); }
    catch (e) { setQueue({ status: "error", data: [], error: (e as Error).message }); }
  }, []);
  useEffect(() => { loadPartners(); loadQueue(); }, [loadPartners, loadQueue]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const done = (msg: string) => { toast.show(msg); loadQueue(); loadPartners(); };
  const fail = (what: string, e: unknown) => toast.show(`${what}하지 못했어요. ${(e as Error).message}`, { tone: "danger" });

  return (
    <Page width="wide">
      <LinkTabs items={ADMIN_TABS} current="/admin/partners" label="관리자 메뉴" className="mb-6" />
      <PageHeader title="입점 업체" description="업체가 올린 제품을 확인해 반영하고, 업체와 담당자 계정을 관리해요" />

      <SectionHeader title="검수 대기" action={queue.status === "done" ? <span className="text-caption text-ink-2"><span className="num">{queue.data.length}</span>개</span> : undefined} />
      {queue.status === "loading" ? <SkeletonList rows={3} thumb={false} />
        : queue.status === "error" ? (
          <EmptyState title="검수 대기를 불러오지 못했어요" description={queue.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setQueue({ status: "loading", data: [] }); loadQueue(); }}>다시 불러오기</Button>} />
        ) : queue.data.length === 0 ? (
          <EmptyState title="확인할 제품이 없어요" description="업체가 새 제품이나 영양·원재료 변경을 올리면 여기 모여요" />
        ) : (
          <div className="flex flex-col gap-3">
            {queue.data.map((it) => <ReviewCard key={it.id} item={it} onDone={done} onFail={fail} />)}
          </div>
        )}

      <SectionHeader title="업체" className="mt-10" />
      <NewPartner onDone={(m) => { toast.show(m); loadPartners(); }} onFail={fail} />
      {partners.status === "loading" ? <SkeletonList rows={3} thumb={false} />
        : partners.status === "error" ? (
          <EmptyState title="업체 목록을 불러오지 못했어요" description={partners.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setPartners({ status: "loading", data: [] }); loadPartners(); }}>다시 불러오기</Button>} />
        ) : partners.data.length === 0 ? (
          <EmptyState title="아직 업체가 없어요" description="위에서 업체를 만들고 담당자 계정을 연결해요" />
        ) : (
          <div className="flex flex-col gap-3 mt-3">
            {partners.data.map((p) => <PartnerRow key={p.id} p={p} onDone={(m) => { toast.show(m); loadPartners(); }} onFail={fail} />)}
          </div>
        )}
    </Page>
  );
}

/* ── 검수 카드 ── */
function ReviewCard({ item, onDone, onFail }: { item: ReviewItem; onDone: (m: string) => void; onFail: (w: string, e: unknown) => void }) {
  const d = item.data;
  const [link, setLink] = useState<string>(item.product_id ? "keep" : "new");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const per = (k: string) => {
    const v = d.per100[k];
    return v === null || v === undefined ? null : Math.round((v * d.serving_size) / 100);
  };
  const changed = item.approved_data
    ? Object.keys(FIELD_LABEL).filter((k) => stable(item.approved_data?.[k as keyof PartnerItem]) !== stable(d[k as keyof PartnerItem]))
    : [];

  const approve = async () => {
    setBusy(true);
    try {
      await api("/api/admin/partners/review", post({ item_id: item.id, action: "approve", link: link === "new" || link === "keep" ? null : link }));
      onDone(`${d.name}을(를) 반영했어요`);
    } catch (e) { onFail("반영", e); } finally { setBusy(false); }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await api("/api/admin/partners/review", post({ item_id: item.id, action: "reject", note }));
      setRejecting(false);
      onDone(`${d.name}을(를) 반려했어요`);
    } catch (e) { onFail("반려", e); } finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption text-ink-2">{item.partners.name} · <span className="num">{item.partner_sku}</span> · {timeAgo(item.updated_at)}</p>
          <h3 className="text-body font-bold text-ink">{d.name}</h3>
          <p className="text-caption text-ink-2">{d.brand} · {CATEGORIES[d.category]?.label} · {d.nutrition_source === "label" ? "포장 표시사항" : d.nutrition_source === "lab" ? "시험성적서" : "배합비 계산"}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {item.review_reasons.map((r) => <Badge key={r} tone={r === "new" || r === "content_changed" ? "neutral" : "danger"}>{REVIEW_LABELS[r] || r}</Badge>)}
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-4 text-label">
        <div><dt className="text-caption text-ink-2">1회 {d.serving_size}{d.weight_unit} 열량</dt><dd className="num text-ink">{per("calories_kcal") ?? "—"}kcal</dd></div>
        <div><dt className="text-caption text-ink-2">나트륨</dt><dd className="num text-ink">{per("sodium_mg") ?? "—"}mg</dd></div>
        <div><dt className="text-caption text-ink-2">단백질</dt><dd className="num text-ink">{per("protein_g") ?? "—"}g</dd></div>
        <div><dt className="text-caption text-ink-2">판매가 · 묶음</dt><dd className="num text-ink">{d.offers[0]?.price.toLocaleString()}원 · {d.pack_count}개</dd></div>
      </dl>
      <p className="text-label text-ink mt-3"><span className="text-ink-2">알레르기 </span>{d.allergens.length ? d.allergens.map((a) => ALLERGENS[a]).join(", ") : "없음"}</p>
      <p className="text-label text-ink-2 mt-1 line-clamp-3">{d.ingredients_raw}</p>
      {d.description && <p className="text-label text-ink mt-1">&ldquo;{d.description}&rdquo;</p>}
      {changed.length > 0 && <p className="text-label text-ink mt-2"><span className="text-ink-2">바뀐 것 </span>{changed.map((k) => FIELD_LABEL[k]).join(", ")}</p>}
      {item.warnings.length > 0 && <p className="text-caption text-ink-2 mt-1">{item.warnings.join(" · ")}</p>}
      {(d.nutrition_image_url || d.images[0]) && (
        <p className="text-label mt-2 flex gap-3">
          {d.nutrition_image_url && <TextLink href={d.nutrition_image_url} target="_blank" rel="noreferrer">영양성분표 사진</TextLink>}
          {d.images[0] && <TextLink href={d.images[0]} target="_blank" rel="noreferrer">제품 사진</TextLink>}
          <TextLink href={d.offers[0]?.url} target="_blank" rel="noreferrer">구매 링크</TextLink>
        </p>
      )}

      {!item.product_id && (
        <Field label="어느 제품으로 반영할까요" className="mt-4">
          <Select value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="new">새 제품으로 만들기</option>
            {item.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.why}: {c.name}{c.manufacturer ? ` (${c.manufacturer})` : ""} — 100g {c.calories ?? "?"}kcal
              </option>
            ))}
          </Select>
        </Field>
      )}

      <CardActions className="mt-4">
        <Button variant="secondary" icon="check" loading={busy && !rejecting} onClick={approve}>반영하기</Button>
        <Button variant="ghost" onClick={() => setRejecting(true)}>반려하기</Button>
      </CardActions>

      <Sheet open={rejecting} onClose={() => setRejecting(false)} title="반려하기" description={`${item.partners.name} · ${d.name}`}
        footer={<div className="flex gap-2"><Button variant="ghost" onClick={() => setRejecting(false)}>취소</Button><Button block loading={busy} disabled={!note.trim()} onClick={reject}>반려하기</Button></div>}>
        <Field label="반려 이유" hint="업체 화면에 그대로 보여요. 무엇을 고치면 되는지 적어 주세요">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </Sheet>
    </Card>
  );
}

/* ── 업체 만들기 ── */
function NewPartner({ onDone, onFail }: { onDone: (m: string) => void; onFail: (w: string, e: unknown) => void }) {
  const [f, setF] = useState({ name: "", slug: "", kind: "meal_service", contact_email: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/partners", post(f));
      setF({ name: "", slug: "", kind: "meal_service", contact_email: "" });
      onDone(`${f.name}을(를) 만들었어요`);
    } catch (err) { onFail("업체를 만들", err); } finally { setBusy(false); }
  };
  return (
    <Card tone="sunken">
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <Field label="업체 이름"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="그리팅" required /></Field>
        <Field label="영문 이름" hint="가격 출처 이름"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="greating" required /></Field>
        <Field label="유형">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="연락 이메일"><Input type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></Field>
        <Button type="submit" variant="secondary" loading={busy}>업체 만들기</Button>
      </form>
    </Card>
  );
}

/* ── 업체 한 줄 ── */
function PartnerRow({ p, onDone, onFail }: { p: Partner; onDone: (m: string) => void; onFail: (w: string, e: unknown) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const setStatus = async (status: string) => {
    try { await api("/api/admin/partners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, status }) }); onDone(`${p.name}을(를) ${STATUS_LABEL[status as Partner["status"]]}(으)로 바꿨어요`); }
    catch (e) { onFail("상태를 바꾸", e); }
  };
  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api("/api/admin/partners/members", post({ partner_id: p.id, email })); setEmail(""); onDone(`${email} 계정을 연결했어요`); }
    catch (err) { onFail("담당자를 연결", err); } finally { setBusy(false); }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-bold text-ink">{p.name} <span className="text-label font-regular text-ink-2">{p.slug} · {KIND_LABEL[p.kind]}</span></h3>
          <p className="text-caption text-ink-2 mt-0.5">
            반영 <span className="num">{p.counts.approved || 0}</span> · 검수 중 <span className="num">{p.counts.pending || 0}</span> · 반려 <span className="num">{p.counts.rejected || 0}</span>
            {p.members.length > 0 && <> · 담당자 {p.members.map((m) => m.email).join(", ")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select aria-label={`${p.name} 상태`} value={p.status} onChange={(e) => setStatus(e.target.value)} className="w-32">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <LinkButton href={`/partner?as=${p.slug}`} size="sm" variant="ghost">업체 화면</LinkButton>
        </div>
      </div>
      <form onSubmit={addMember} className="flex flex-wrap gap-2 mt-3">
        <Input type="email" aria-label="담당자 이메일" placeholder="담당자 이메일 (먼저 케어푸드에 가입)" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 min-w-48" />
        <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={!email.includes("@")}>담당자 연결하기</Button>
      </form>
    </Card>
  );
}
