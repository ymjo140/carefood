"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ListRow, SkeletonList } from "@/components/ui";

type C = { id: string; partner: string; name: string; text: string; expires_at: string; used_at: string | null; discount: number; status: "active" | "expired" | "used" | "revoked" };
const LABEL: Record<C["status"], string> = { active: "쓸 수 있어요", expired: "기간이 끝났어요", used: "썼어요", revoked: "쓸 수 없어요" };

/** 내 쿠폰함 — 쓸 수 있는 것 먼저 */
export function CouponList() {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; list?: C[]; error?: string }>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me/coupons");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", list: d.coupons });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  if (state.status === "loading") return <SkeletonList rows={3} thumb={false} />;
  if (state.status === "error" || !state.list) return (
    <EmptyState title="쿠폰함을 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
  );
  if (state.list.length === 0) return <EmptyState title="받은 쿠폰이 없어요" description="입점 업체 제품을 앱에서 주문하면 업체가 감사·재구매 쿠폰을 줄 수 있어요" />;
  const list = [...state.list].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
  return (
    <Card padding="none">
      <ul className="divide-y divide-line">
        {list.map((c) => (
          <li key={c.id}>
            <ListRow
              title={<span className="flex flex-wrap items-center gap-2">{c.name}<Badge tone={c.status === "active" ? "brand" : "neutral"}>{LABEL[c.status]}</Badge></span>}
              meta={<>{c.partner} · {c.text} · {c.status === "used" && c.discount ? `${c.discount.toLocaleString("ko-KR")}원 할인받았어요` : `${new Date(c.expires_at).toLocaleDateString("ko-KR")}까지`}</>} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
