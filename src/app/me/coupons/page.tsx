import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/ui";
import { CouponList } from "./CouponList";

export const metadata: Metadata = { title: "쿠폰함" };

export default function MyCouponsPage() {
  return (
    <Page width="narrow">
      <PageHeader title="쿠폰함" description="입점 업체가 준 쿠폰이에요. 한 번에 주문할 때 업체마다 할인이 가장 큰 쿠폰 하나가 저절로 쓰여요" />
      <CouponList />
    </Page>
  );
}
