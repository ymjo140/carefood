"use client";

import { useState, useEffect } from "react";
import { IconButton } from "@/components/ui";
import { getClientActorId } from "@/lib/actor-client";

function getUserId(): string | null {
  // 서버가 발급한 쿠키의 id — API 는 이 값을 받지 않고 쿠키로 직접 확인한다
  return getClientActorId();
}

export default function FavoriteButton({ productId, size = "md" }: { productId: string; size?: "sm" | "md" }) {
  const [isFav, setIsFav] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    fetch(`/api/favorites?user_id=${userId}`)
      .then(r => r.json())
      .then(data => {
        const ids = (data.favorites || []).map((f: { product_id: string }) => f.product_id);
        setIsFav(ids.includes(productId));
      })
      .catch(() => {}); // ds-allow: 초기 즐겨찾기 상태는 꺼진 채로 둠
  }, [productId]);

  const toggle = async () => {
    const userId = getUserId();
    if (!userId) return;
    setLoading(true);
    setIsFav(prev => !prev);
    try {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, product_id: productId }),
      });
    } catch {
      setIsFav(prev => !prev); // revert
    } finally {
      setLoading(false);
    }
  };

  return (
    <IconButton
      icon="heart"
      label={isFav ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기"}
      active={isFav}
      size={size === "sm" ? "sm" : "md"}
      onClick={toggle}
      disabled={loading}
      aria-pressed={isFav}
      className="disabled:opacity-50"
    />
  );
}
