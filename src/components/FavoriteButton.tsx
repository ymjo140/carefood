"use client";

import { useState, useEffect } from "react";

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

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const btnSize = size === "sm" ? "p-1.5" : "p-2";

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`${btnSize} rounded-full hover:bg-surface transition-colors disabled:opacity-50`}
      style={{ minHeight: size === "sm" ? "28px" : "36px", minWidth: size === "sm" ? "28px" : "36px" }}
      title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      <svg className={`${iconSize} ${isFav ? "text-red-500 fill-red-500" : "text-muted"}`}
        viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}
        style={{ minHeight: "unset", minWidth: "unset" }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
