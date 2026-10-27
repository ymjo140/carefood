"use client";

/**
 * 클릭 트래킹이 포함된 외부 링크 컴포넌트
 *
 * 구매 링크를 클릭하면:
 * 1. /api/track/click으로 이벤트 전송 (비동기, 블로킹 안함)
 * 2. 원래 URL로 새 탭에서 이동
 */
export default function TrackableLink({
  href,
  productId,
  platform,
  children,
  className,
  style,
}: {
  href: string;
  productId: string;
  platform: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const handleClick = () => {
    // 비동기로 클릭 이벤트 전송 (유저 경험에 영향 없음)
    try {
      const userId = typeof window !== "undefined"
        ? localStorage.getItem("carefood_anon_id") || undefined
        : undefined;

      fetch("/api/track/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          product_id: productId,
          platform,
          click_url: href,
          referrer_page: typeof window !== "undefined" ? window.location.pathname : null,
        }),
        // keepalive로 페이지 이탈 후에도 전송 보장
        keepalive: true,
      }).catch(() => { /* 트래킹 실패는 무시 */ });
    } catch { /* */ }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}
