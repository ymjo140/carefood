"use client";

import { useState, useEffect } from "react";
import { IconButton } from "@/components/ui";

function getUserId(): string | null {
  try { return localStorage.getItem("carefood_anon_id") || null; } catch { return null; }
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
      .catch(() => {});
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
