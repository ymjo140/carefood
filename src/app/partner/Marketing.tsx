"use client";

import { useState } from "react";
import { Coupons, useCoupons } from "./Coupons";
import { Flows } from "./Flows";
import { Segments } from "./Segments";
import { Credits } from "./Commission";
import { CollabManage } from "./DemandTab";
import { DisputeSheet, type DisputeTarget } from "./Disputes";
import type { Go } from "@/lib/partner/tabs";

/**
 * 마케팅 — 쿠폰 · 자동 알림 · 광고(앱 전체 고객층 발송 + 충전금) · 협업(인플루언서) (11/14 구조 진단: 고객·수요·정산에 흩어져 있던 것).
 * 내 고객에게 가는 것(쿠폰·자동 알림)과 돈이 드는 광고, 다른 사람이 알리는 협업을 한 메뉴에 두고 보기로 나눈다.
 */
export function Marketing({ qs, view, go, prefill, readOnly }: { qs: string; view: string; go: Go; prefill: { need?: string; goal?: string } | null; readOnly: boolean }) {
  const { state: coupons, reload } = useCoupons(qs);
  const [dispute, setDispute] = useState<DisputeTarget | null>(null);
  if (view === "flows") return <Flows qs={qs} coupons={coupons} toCoupons={() => go("marketing", { view: "coupons" })} />;
  if (view === "ads") return (
    <div className="flex flex-col gap-10">
      <Segments qs={qs} prefill={prefill} onTopup={() => document.getElementById("ad-credits")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      <div id="ad-credits" className="scroll-mt-4"><Credits qs={qs} onDispute={readOnly ? undefined : setDispute} /></div>
      <DisputeSheet qs={qs} target={dispute} onClose={() => setDispute(null)} onSent={() => setDispute(null)} />
    </div>
  );
  if (view === "collabs") return <CollabManage qs={qs} toFlow={() => go("analytics", { view: "demand" })} />;
  return <Coupons qs={qs} state={coupons} reload={reload} />;
}
