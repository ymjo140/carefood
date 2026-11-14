"use client";

import { Chip, Field, Icon, IconButton, Input, RangeInput, TextButton, UnitInput } from "@/components/ui";
import {
  DAY_OPTIONS, GROUP_TARGET_MAX, GROUP_TARGET_MIN, OFFER_MAX_OPTIONS, PER_PERSON_MAX,
  discountOf, priceFromDiscount, shippingFee, unitOf, type Shipping,
} from "@/lib/group-buy";

/**
 * 공구 조건표 입력 — 진행자가 숫자를 정한다.
 * 구성마다 묶음 수량 · 공구가 · 할인율(지금 최저 1개 값 기준). 공구가와 할인율은 어느 쪽을 넣어도 다른 쪽이 채워진다.
 * 배송 · 증정 · 1인 최대 · 목표 인원 · 모으는 기간. 검사는 lib/group-buy parseOffer (서버와 같은 규칙).
 */
export type DraftOption = { packs: string; price: string; pct: string };
export type OfferDraft = {
  options: DraftOption[];
  ship: Shipping["type"]; fee: string; over: string;
  gift: "none" | "plus" | "first"; giftN: string; giftItem: string;
  perMax: string; target: number; days: number;
};

const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 9);
const won = (n: number) => n.toLocaleString("ko-KR");

export function newOption(packs: number, lowestUnit: number | null, pct = 15): DraftOption {
  return lowestUnit
    ? { packs: String(packs), price: String(priceFromDiscount(packs, pct, lowestUnit)), pct: String(pct) }
    : { packs: String(packs), price: "", pct: "" };
}

/** 서버로 보낼 모양 */
export function draftToOffer(d: OfferDraft) {
  return {
    options: d.options.map((o) => ({ packs: o.packs, price: o.price })),
    shipping: d.ship === "free" ? { type: "free" } : d.ship === "fee" ? { type: "fee", fee: d.fee } : { type: "free_over", fee: d.fee, over: d.over },
    gift: d.gift === "plus" ? { type: "plus", n: d.giftN } : d.gift === "first" ? { type: "first", n: d.giftN, item: d.giftItem } : { type: "none" },
    per_person_max: d.perMax || null,
  };
}

export function OfferEditor({ draft, onChange, lowestUnit, lowestChecked, error }: {
  draft: OfferDraft; onChange: (d: OfferDraft) => void;
  /** 지금 최저 1개 값 — 없으면 할인율 칸 없이 공구가만 */
  lowestUnit: number | null; lowestChecked?: string | null;
  error: string | null;
}) {
  const set = (patch: Partial<OfferDraft>) => onChange({ ...draft, ...patch });
  const setOption = (i: number, patch: Partial<DraftOption>, from: "packs" | "price" | "pct") => {
    const options = draft.options.map((o, j) => {
      if (j !== i) return o;
      const next = { ...o, ...patch };
      const packs = Number(next.packs) || 0;
      if (lowestUnit && packs > 0) {
        if (from === "pct" && next.pct !== "") next.price = String(priceFromDiscount(packs, Number(next.pct), lowestUnit));
        else if (from === "packs" && o.pct !== "" && next.price === o.price) next.price = String(priceFromDiscount(packs, Number(next.pct), lowestUnit));
        if ((from === "price" || from === "packs") && next.price !== "") next.pct = String(discountOf({ packs, price: Number(next.price) }, lowestUnit) ?? "");
      }
      return next;
    });
    set({ options });
  };
  const ship: Shipping = draft.ship === "free" ? { type: "free" } : draft.ship === "fee" ? { type: "fee", fee: Number(draft.fee) || 0 } : { type: "free_over", fee: Number(draft.fee) || 0, over: Number(draft.over) || 0 };
  const checked = lowestChecked ? new Date(lowestChecked).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── 구성 ── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-label font-medium text-ink mb-1">구성 · 희망 공구가</legend>
        <p className="text-caption text-ink-2">
          {lowestUnit
            ? <>지금 최저 1개 <span className="num font-bold text-ink">{won(lowestUnit)}</span>원{checked && ` (${checked} 확인)`} · 이보다 낮아야 해요</>
            : "판매처 가격이 없어 할인율 없이 공구가만 넣어요"}
        </p>
        {draft.options.map((o, i) => {
          const packs = Number(o.packs) || 0, price = Number(o.price) || 0;
          const unit = packs && price ? unitOf({ packs, price }) : null;
          const pct = packs && price ? discountOf({ packs, price }, lowestUnit) : null;
          const fee = price ? shippingFee(ship, price) : 0;
          return (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="flex items-end gap-2">
                <Field label="묶음" className="w-24 shrink-0">
                  <UnitInput unit="개" value={o.packs} aria-label={`${i + 1}번째 구성 묶음 수량`} name={`offer_packs_${i}`}
                    onChange={(e) => setOption(i, { packs: digits(e.target.value) }, "packs")} />
                </Field>
                <Field label="공구가" className="flex-1 min-w-0">
                  <UnitInput unit="원" value={o.price} aria-label={`${i + 1}번째 구성 공구가`} name={`offer_price_${i}`}
                    onChange={(e) => setOption(i, { price: digits(e.target.value) }, "price")} />
                </Field>
                {lowestUnit && (
                  <Field label="할인" className="w-20 shrink-0">
                    <UnitInput unit="%" value={o.pct} aria-label={`${i + 1}번째 구성 할인율`} name={`offer_pct_${i}`}
                      onChange={(e) => setOption(i, { pct: digits(e.target.value).slice(0, 2) }, "pct")} />
                  </Field>
                )}
                {draft.options.length > 1 && (
                  <IconButton icon="close" size="sm" label={`${i + 1}번째 구성 빼기`} className="mb-1"
                    onClick={() => set({ options: draft.options.filter((_, j) => j !== i) })} />
                )}
              </div>
              {unit != null && (
                <p className="text-caption text-ink-2">
                  1개 <span className="num text-ink">{won(unit)}</span>원
                  {pct != null && pct > 0 && <> · 최저가보다 <span className="num font-bold text-brand-ink">{pct}</span>% 싸요</>}
                  {pct != null && pct < 0 && <span className="text-danger"> · 최저가보다 비싸요</span>}
                  {" · "}배송비 포함 <span className="num text-ink">{won(price + fee)}</span>원
                </p>
              )}
            </div>
          );
        })}
        {draft.options.length < OFFER_MAX_OPTIONS && (
          <TextButton className="self-start" onClick={() => {
            const last = Number(draft.options[draft.options.length - 1]?.packs) || 5;
            set({ options: [...draft.options, newOption(Math.min(100, last * 2), lowestUnit, 20)] });
          }}>
            <Icon name="plus" size={16} />구성 더하기 (최대 {OFFER_MAX_OPTIONS}개)
          </TextButton>
        )}
      </fieldset>

      {/* ── 배송 ── */}
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-ink">배송</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="배송">
          {([["free", "무료배송"], ["fee", "배송비"], ["free_over", "얼마 이상 무료"]] as const).map(([k, l]) => (
            <Chip key={k} role="radio" aria-checked={draft.ship === k} selected={draft.ship === k} onClick={() => set({ ship: k })}>{l}</Chip>
          ))}
        </div>
        {draft.ship !== "free" && (
          <div className="flex gap-2">
            {draft.ship === "free_over" && (
              <Field label="무료 기준" className="flex-1">
                <UnitInput unit="원" value={draft.over} name="offer_ship_over" onChange={(e) => set({ over: digits(e.target.value) })} />
              </Field>
            )}
            <Field label={draft.ship === "free_over" ? "아니면 배송비" : "배송비"} className="flex-1">
              <UnitInput unit="원" value={draft.fee} name="offer_ship_fee" onChange={(e) => set({ fee: digits(e.target.value) })} />
            </Field>
          </div>
        )}
      </div>

      {/* ── 증정 ── */}
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-ink">증정 <span className="font-regular text-ink-2">· 선택</span></span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="증정">
          {([["none", "없음"], ["plus", "몇 개 사면 1개 더"], ["first", "선착순 증정"]] as const).map(([k, l]) => (
            <Chip key={k} role="radio" aria-checked={draft.gift === k} selected={draft.gift === k} onClick={() => set({ gift: k })}>{l}</Chip>
          ))}
        </div>
        {draft.gift === "plus" && (
          <Field label="몇 개 사면 1개 더" className="w-40">
            <UnitInput unit="개" value={draft.giftN} name="offer_gift_n" onChange={(e) => set({ giftN: digits(e.target.value).slice(0, 2) })} />
          </Field>
        )}
        {draft.gift === "first" && (
          <div className="flex gap-2">
            <Field label="선착순" className="w-28 shrink-0">
              <UnitInput unit="명" value={draft.giftN} name="offer_gift_n" onChange={(e) => set({ giftN: digits(e.target.value).slice(0, 3) })} />
            </Field>
            <Field label="증정품" className="flex-1 min-w-0">
              <Input value={draft.giftItem} maxLength={30} name="offer_gift_item" placeholder="예: 소스 1개" onChange={(e) => set({ giftItem: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      {/* ── 1인 최대 · 목표 인원 · 기간 ── */}
      <Field label={<>1인 최대 구매 <span className="font-regular text-ink-2">· 선택</span></>} hint={`비우면 제한 없음 (1~${PER_PERSON_MAX}세트)`} className="w-48">
        <UnitInput unit="세트" value={draft.perMax} name="offer_per_max" onChange={(e) => set({ perMax: digits(e.target.value).slice(0, 2) })} />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between text-label font-medium text-ink">
          목표 인원 <span className="text-body"><span className="num font-bold">{draft.target}</span>명</span>
        </span>
        <RangeInput min={GROUP_TARGET_MIN} max={GROUP_TARGET_MAX} step={5} value={draft.target} name="offer_target"
          aria-label="목표 인원" onChange={(e) => set({ target: Number(e.target.value) })} />
        <p className="text-caption text-ink-2">이만큼 알림을 받으면 판매처에 공구를 요청해요</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-ink">모으는 기간</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="모으는 기간">
          {DAY_OPTIONS.map((d) => (
            <Chip key={d} role="radio" aria-checked={draft.days === d} selected={draft.days === d} onClick={() => set({ days: d })}>{d}일</Chip>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-label text-danger">{error}</p>}
    </div>
  );
}
