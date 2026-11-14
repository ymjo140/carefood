import { cn } from "./cn";
import { IconButton } from "./Button";

/**
 * 공구 구성 목록 — 구성마다 묶음 · 공구가 · 1개 값 · 할인율 · 배송비 포함 총액.
 * onChange 를 주면 하나 고르는 목록(라디오), 없으면 보여 주기만. 할인율은 강조색 글자(데이터 숫자), 고른 줄은 brand-soft.
 */
export type OfferRow = { title: string; price: number; unit: number; pct: number | null; total: number; note?: string | null };

const won = (n: number) => n.toLocaleString("ko-KR");

export function OfferOptionList({ rows, value, onChange, label = "구성" }: {
  rows: OfferRow[]; value?: number | null; onChange?: (i: number) => void; label?: string;
}) {
  const body = (r: OfferRow) => (
    <>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
        <span className="text-body font-medium text-ink">{r.title}</span>
        <span className="text-caption text-ink-2">
          1개 <span className="num">{won(r.unit)}</span>원 · 배송비 포함 <span className="num">{won(r.total)}</span>원{r.note ? ` · ${r.note}` : ""}
        </span>
      </span>
      <span className="shrink-0 flex flex-col items-end">
        {r.pct != null && r.pct > 0 && <span className="num text-label font-bold text-brand-ink">{r.pct}%</span>}
        <span className="text-body text-ink whitespace-nowrap"><span className="num font-bold">{won(r.price)}</span>원</span>
      </span>
    </>
  );
  if (!onChange) {
    return (
      <ul aria-label={label} className="flex flex-col divide-y divide-line rounded-md border border-line">
        {rows.map((r, i) => <li key={i} className="flex items-center gap-3 px-3 py-2.5">{body(r)}</li>)}
      </ul>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const on = value === i;
        return (
          <button key={i} type="button" role="radio" aria-checked={on} onClick={() => onChange(i)}
            className={cn("press flex items-center gap-3 min-h-14 px-3 py-2.5 rounded-md border transition-colors",
              on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong")}>
            {body(r)}
          </button>
        );
      })}
    </div>
  );
}

/** 수량 고르기 — 빼기 · 숫자 · 더하기 */
export function QtyStepper({ value, min = 1, max, onChange, unit = "개", label = "수량" }: {
  value: number; min?: number; max: number; onChange: (n: number) => void; unit?: string; label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <IconButton icon="minus" tone="secondary" label={`${label} 하나 줄이기`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
      <span className="min-w-14 text-center text-body text-ink" aria-live="polite"><span className="num font-bold">{value}</span>{unit}</span>
      <IconButton icon="plus" tone="secondary" label={`${label} 하나 늘리기`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
    </div>
  );
}
