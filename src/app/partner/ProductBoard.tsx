"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AsOf, Badge, Button, Card, EmptyState, Field, HowCounted, Icon, Input, Sheet, SkeletonList, TextButton, useToast } from "@/components/ui";

type Row = {
  item_id: string | null; sku: string; name: string; status: string | null; stock: number | null; low: boolean;
  new: number; accepted: number; shipped: number; cancel_requests: number; sold_30: number;
};
const n = (v: number) => v.toLocaleString("ko-KR");

/**
 * 판매·출고 — 제품마다 재고와 처리할 주문 줄 수 (앱 주문, v3 10.3).
 * 재고를 적어 두면 주문 때 줄고 취소되면 돌아오며, 0 이면 앱에서 살 수 없게 된다. 저장한 뒤 표를 다시 불러온다.
 */
export function ProductBoard({ qs, toOrders }: { qs: string; toOrders: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; rows?: Row[]; readOnly?: boolean; asOf?: string; error?: string }>({ status: "loading" });
  const [edit, setEdit] = useState<Row | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/products/board?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", rows: d.rows, readOnly: d.read_only, asOf: d.as_of });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const save = async (stock: number | null) => {
    if (!edit?.item_id) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/items/${edit.item_id}/stock?${qs}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(stock === null ? "재고를 세지 않게 바꿨어요" : stock === 0 ? "재고를 0으로 저장했어요. 앱에서 살 수 없게 됐어요" : "재고를 저장했어요");
      setEdit(null);
      load();
    } catch (e) {
      toast.show(`${(e as Error).message || "재고를 저장하지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <SkeletonList rows={4} thumb={false} />;
  if (state.status === "error" || !state.rows) return (
    <EmptyState title="판매 현황을 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
  );
  if (state.rows.length === 0) return <EmptyState title="아직 제품이 없어요" description="연동 탭에서 제품을 올리면 재고와 주문 처리 현황이 여기 모여요" />;
  const todo = state.rows.reduce((s, r) => s + r.new + r.accepted, 0);
  const asks = state.rows.reduce((s, r) => s + r.cancel_requests, 0);
  const low = state.rows.filter((r) => r.low).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-2">
        <span>보낼 주문 줄 <span className="num text-ink font-medium">{n(todo)}</span></span>
        <span className="inline-flex items-center gap-1">{asks > 0 && <Icon name="alert" size={16} className="text-danger" aria-hidden />}취소 요청 <span className="num text-ink font-medium">{n(asks)}</span></span>
        <span className="inline-flex items-center gap-1">{low > 0 && <Icon name="alert" size={16} className="text-danger" aria-hidden />}재고 적음 <span className="num text-ink font-medium">{n(low)}</span></span>
        {(todo > 0 || asks > 0) && <TextButton onClick={toOrders}>주문 탭에서 처리하기</TextButton>}
      </div>
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full text-label">
          <thead>
            <tr className="text-left text-ink-2 border-b border-line">
              <th className="px-4 py-2 font-medium min-w-40">제품</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">재고</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">새 주문</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">출고 준비</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">배송 중</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">취소 요청</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">30일 판매</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {state.rows.map((r) => (
              <tr key={r.sku}>
                <td className="px-4 py-2.5 min-w-40">
                  <span className="text-ink">{r.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-caption text-ink-2"><span className="num">{r.sku}</span>{r.status === "pending" && <Badge tone="neutral">검수 중</Badge>}</span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {r.item_id && !state.readOnly ? (
                    <TextButton onClick={() => { setEdit(r); setValue(r.stock === null ? "" : String(r.stock)); }} className="num justify-end">
                      {r.low && <Icon name="alert" size={16} className="text-danger" aria-label="재고 적음" />}{r.stock === null ? "세지 않음" : n(r.stock)}
                    </TextButton>
                  ) : <span className="num">{r.stock === null ? "—" : n(r.stock)}</span>}
                </td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{n(r.new)}</td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{n(r.accepted)}</td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{n(r.shipped)}</td>
                <td className={`px-3 py-2.5 num text-right whitespace-nowrap ${r.cancel_requests ? "text-danger font-medium" : ""}`}>{n(r.cancel_requests)}</td>
                <td className="px-4 py-2.5 num text-right whitespace-nowrap">{n(r.sold_30)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <HowCounted>
          앱 주문 줄 수예요 (한 주문에 같은 제품이 여러 줄이면 줄마다). 재고는 적어 둔 제품만 세요 — 주문할 때 줄고, 취소되거나 결제하지 않고 한 시간이 지나면 돌아와요.
          0 이 되면 앱에서 살 수 없게 되고 추천에서 빠져요. 5개 이하면 재고 적음으로 알려요
        </HowCounted>
        {state.asOf && <AsOf at={state.asOf} />}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.name} 재고` : ""} size="sm"
        footer={<><Button variant="secondary" block loading={busy} onClick={() => save(null)}>세지 않기</Button><Button block loading={busy} disabled={value === ""} onClick={() => save(Number(value))}>저장하기</Button></>}>
        <Field label="남은 수량(개)" hint="판매 단위 기준 · 0 이면 앱에서 살 수 없어요">
          <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 7))} />
        </Field>
      </Sheet>
    </div>
  );
}
