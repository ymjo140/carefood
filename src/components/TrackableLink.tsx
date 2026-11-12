"use client";

import { AFFILIATE_PLATFORMS } from "@/lib/platforms";

/**
 * 클릭 트래킹이 포함된 외부 링크 컴포넌트
 *
 * 구매 링크를 클릭하면:
 * 1. /api/track/click으로 이벤트 전송 (비동기, 블로킹 안함) — 누가 눌렀는지는 서버가 쿠키로 안다
 * 2. 원래 URL로 새 탭에서 이동
 */
export default function TrackableLink({
  href,
  productId,
  platform,
  children,
  className,
  style,
  placement,
  partner = false,
}: {
  href: string;
  productId: string;
  platform: string;
  /** 어느 화면·자리에서 눌렀는지 (예: detail_best, shopping_list) — 화면별 클릭을 나눠 본다 */
  placement?: string;
  /** 입점 업체 링크 — 누를 때 무작위 클릭 번호를 만들어 링크에 cf_click 으로 붙인다 (구매 수수료 정산용, 사용자 정보 없음) */
  partner?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    let clickId: string | null = null;
    let target = href;
    if (partner) {
      try {
        clickId = crypto.randomUUID();
        const u = new URL(href);
        u.searchParams.set("cf_click", clickId);
        target = u.toString();
        e.currentTarget.href = target; // 이 클릭이 여는 주소 — 누를 때마다 새 번호
      } catch { clickId = null; target = href; } // ds-allow: 번호를 못 붙여도 링크는 그대로 연다
    }
    // 비동기로 클릭 이벤트 전송 (유저 경험에 영향 없음)
    try {
      fetch("/api/track/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          platform,
          click_url: target,
          click_id: clickId,
          referrer_page: typeof window !== "undefined" ? window.location.pathname : null,
          placement: placement || null,
        }),
        // keepalive로 페이지 이탈 후에도 전송 보장
        keepalive: true,
      }).catch(() => { /* 트래킹 실패는 무시 */ }); // ds-allow: 클릭 추적 실패는 알리지 않음
    } catch { /* */ } // ds-allow: 클릭 추적 실패는 알리지 않음
  };

  return (
    <a
      href={href}
      target="_blank"
      // 제휴(수수료) 링크는 sponsored 로 표시
      rel={partner || AFFILIATE_PLATFORMS.has(platform) ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      onClick={handleClick}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}
