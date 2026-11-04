import { LinkButton, Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page width="narrow">
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-2">
        <p className="num text-display font-bold text-ink-3">404</p>
        <h1 className="text-title font-bold text-ink">페이지를 찾을 수 없어요</h1>
        <p className="text-label text-ink-2">요청하신 페이지가 없거나 다른 곳으로 옮겨졌어요.</p>
        <div className="flex gap-2 mt-4">
          <LinkButton href="/">홈으로 가기</LinkButton>
          <LinkButton href="/products" variant="secondary">제품 둘러보기</LinkButton>
        </div>
      </div>
    </Page>
  );
}
