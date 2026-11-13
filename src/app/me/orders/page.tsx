import type { Metadata } from "next";
import { EmptyState, LinkButton, Page, PageHeader } from "@/components/ui";
import { ORDERING_ENABLED } from "@/lib/features";
import { OrderList } from "./OrderList";

export const metadata: Metadata = { title: "주문 내역" };

export default function MyOrdersPage() {
  return (
    <Page width="narrow">
      <PageHeader title="주문 내역" description="판매 업체마다 따로 보내요. 업체가 접수하기 전에는 바로 취소할 수 있어요" />
      {ORDERING_ENABLED ? <OrderList /> : (
        <EmptyState title="한 번에 주문하기는 준비 중이에요" description="지금은 식단 리스트의 장보기 목록에서 몰마다 바로 갈 수 있어요"
          action={<LinkButton href="/weekly-box" size="sm">식단 리스트로 가기</LinkButton>} />
      )}
    </Page>
  );
}
