import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4 mt-auto">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-foreground">케어푸드</span>
          <span className="text-border">·</span>
          <span>상황 맞춤 식품 큐레이션</span>
        </div>
        <div className="flex gap-4">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            이용약관
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            개인정보처리방침
          </Link>
        </div>
      </div>
      <div className="max-w-3xl mx-auto mt-4 text-xs text-muted/60 text-center sm:text-left">
        본 서비스는 의학적 진단·치료를 대체하지 않습니다.
        식품 선택 시 전문의와 상담하시기 바랍니다.
      </div>
    </footer>
  );
}
