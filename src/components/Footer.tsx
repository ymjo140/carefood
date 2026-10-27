import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4 mt-auto">
      <div className="max-w-6xl mx-auto">
        {/* 상단: 로고 + 링크 그룹 */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 mb-6">
          <div>
            <span className="font-extrabold text-foreground text-lg">케어푸드</span>
            <p className="text-xs text-muted mt-1">성분으로 찾는 내 몸에 맞는 식품</p>
          </div>

          <div className="flex gap-8 sm:gap-12 text-sm">
            <div>
              <p className="font-bold text-foreground text-xs mb-2">서비스</p>
              <div className="flex flex-col gap-1.5">
                <Link href="/products" className="text-muted hover:text-foreground transition-colors text-xs">제품 탐색</Link>
                <Link href="/weekly-box" className="text-muted hover:text-foreground transition-colors text-xs">주간 식단 박스</Link>
                <Link href="/community" className="text-muted hover:text-foreground transition-colors text-xs">커뮤니티</Link>
              </div>
            </div>
            <div>
              <p className="font-bold text-foreground text-xs mb-2">비즈니스</p>
              <div className="flex flex-col gap-1.5">
                <Link href="/vendor/apply" className="text-muted hover:text-foreground transition-colors text-xs">입점 문의</Link>
                <a href="mailto:support@carefood.kr" className="text-muted hover:text-foreground transition-colors text-xs">제휴 제안</a>
                <a href="mailto:support@carefood.kr" className="text-muted hover:text-foreground transition-colors text-xs">광고 문의</a>
              </div>
            </div>
            <div>
              <p className="font-bold text-foreground text-xs mb-2">정책</p>
              <div className="flex flex-col gap-1.5">
                <Link href="/terms" className="text-muted hover:text-foreground transition-colors text-xs">이용약관</Link>
                <Link href="/privacy" className="text-muted hover:text-foreground transition-colors text-xs">개인정보처리방침</Link>
              </div>
            </div>
          </div>
        </div>

        {/* 면책 */}
        <div className="text-xs text-muted/60 text-center sm:text-left leading-relaxed border-t border-border pt-4">
          본 서비스는 식약처 영양성분 데이터베이스 기반 정보 제공 서비스이며,
          의학적 진단·치료·처방을 대체하지 않습니다.
          질환이 있는 경우 반드시 의사와 상담하세요.
        </div>
      </div>
    </footer>
  );
}
