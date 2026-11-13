"use client";

import { useState } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * 제품 사진 — 부모 칸을 채운다. 사진이 없거나 판매처 이미지가 안 열리면 빈 회색 칸 대신 그릇 아이콘.
 * (빈 칸만 있으면 화면이 깨진 것처럼 보인다)
 */
export function ProductImage({ src, alt = "", className, iconSize = 28 }: {
  src?: string | null; alt?: string; className?: string; iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const show = !!src && !failed;
  return (
    <span className={cn("flex items-center justify-center w-full h-full bg-sunken overflow-hidden", className)}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name="bowl" size={iconSize} className="text-ink-3" />
      )}
    </span>
  );
}
