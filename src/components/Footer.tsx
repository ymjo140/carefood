import Link from "next/link";

const LINK = "text-caption text-ink-2 hover:text-ink transition-colors";

export default function Footer() {
  return (
    <footer className="border-t border-line mt-auto">
      <div className="mx-auto max-w-[1152px] pt-8 pb-10 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {/* 상단: 로고 + 링크 그룹 */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 mb-6">
          <div>
            <span className="text-body font-bold text-ink">케어푸드</span>
            <p className="text-caption text-ink-2 mt-1">성분으로 찾는 내 몸에 맞는 식품</p>
          </div>

          <div className="flex flex-wrap gap-8 sm:gap-12">
            <div>
              <p className="text-caption font-bold text-ink mb-2">서비스</p>
              <div className="flex flex-col gap-1.5">
                <Link href="/products" className={LINK}>제품 탐색</Link>
                <Link href="/weekly-box" className={LINK}>식단 리스트</Link>
                <Link href="/community" className={LINK}>커뮤니티</Link>
              </div>
            </div>
            <div>
              <p className="text-caption font-bold text-ink mb-2">비즈니스</p>
              <div className="flex flex-col gap-1.5">
                <Link href="/vendor/apply" className={LINK}>입점 문의</Link>
                <a href="mailto:support@carefood.kr" className={LINK}>제휴 제안</a>
                <a href="mailto:support@carefood.kr" className={LINK}>광고 문의</a>
              </div>
            </div>
            <div>
              <p className="text-caption font-bold text-ink mb-2">정책</p>
              <div className="flex flex-col gap-1.5">
                <Link href="/terms" className={LINK}>이용약관</Link>
                <Link href="/privacy" className={LINK}>개인정보처리방침</Link>
              </div>
            </div>
          </div>
        </div>

        {/* 면책 */}
        <p className="text-caption text-ink-3 text-center sm:text-left border-t border-line pt-4">
          본 서비스는 식약처 영양성분 데이터베이스 기반 정보 제공 서비스이며,
          의학적 진단·치료·처방을 대체하지 않습니다.
          질환이 있는 경우 반드시 의사와 상담하세요.
        </p>
      </div>
    </footer>
  );
}
