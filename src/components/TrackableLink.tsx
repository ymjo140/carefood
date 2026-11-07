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
}: {
  href: string;
  productId: string;
  platform: string;
  /** 어느 화면·자리에서 눌렀는지 (예: detail_best, shopping_list) — 화면별 클릭을 나눠 본다 */
  placement?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const handleClick = () => {
    // 비동기로 클릭 이벤트 전송 (유저 경험에 영향 없음)
    try {
      fetch("/api/track/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          platform,
          click_url: href,
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
      rel={AFFILIATE_PLATFORMS.has(platform) ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      onClick={handleClick}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}
