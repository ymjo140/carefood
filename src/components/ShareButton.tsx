"use client";

import { useState } from "react";
import { Icon, useToast } from "@/components/ui";

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
  const toast = useToast();

  const handleShare = async () => {
    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

    // Web Share API 시도 (모바일에서 카톡 등으로 바로 공유)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch { // ds-allow: 공유 창을 닫은 경우는 정상
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
      toast.show("링크를 복사하지 못했어요. 주소창의 주소를 직접 복사해 주세요", { tone: "danger" });
    }
  };

  return (
    <button
      onClick={handleShare}
      className={className}
      style={style}
    >
      {copied ? <span className="inline-flex items-center gap-1"><Icon name="check" size={16} />링크를 복사했어요</span> : children || "공유하기"}
    </button>
  );
}
