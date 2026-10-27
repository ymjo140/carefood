"use client";

import { useState } from "react";

/**
 * 범용 공유 버튼
 *
 * Web Share API 지원 시 → 네이티브 공유 시트 (카톡, 라인, 인스타 등)
 * 미지원 시 → URL 클립보드 복사
 */
export default function ShareButton({
  title,
  text,
  url,
  className,
  children,
  style,
}: {
  title: string;
  text: string;
  url?: string;
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

    // Web Share API 시도 (모바일에서 카톡 등으로 바로 공유)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch {
        // 사용자가 취소했거나 실패 → 클립보드로 폴백
      }
    }

    // 폴백: 클립보드 복사
    try {
      const shareText = `${title}\n${text}\n${shareUrl}`;
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드도 안 되면 무시
    }
  };

  return (
    <button
      onClick={handleShare}
      className={className}
      style={style}
    >
      {copied ? "✓ 복사됨!" : children || "공유하기"}
    </button>
  );
}
