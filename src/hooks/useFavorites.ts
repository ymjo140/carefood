"use client";

import { useState, useEffect, useCallback } from "react";

type FavoriteProduct = {
  product_id: string;
  name: string;
  manufacturer?: string;
  calories?: number;
  protein_g?: number;
  best_price?: number | null;
  image_url?: string | null;
  prices?: { platform: string; price: number; url: string }[];
};

function getUserId(): string | null {
  try {
    return localStorage.getItem("carefood_anon_id") || null;
  } catch {
    return null;
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/favorites?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
        setFavoriteIds(new Set((data.favorites || []).map((f: FavoriteProduct) => f.product_id)));
      }
    } catch (err) {
      console.error("Failed to load favorites:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const toggleFavorite = useCallback(async (productId: string) => {
    const userId = getUserId();
    if (!userId) return;

    // Optimistic update
    const wasFavorited = favoriteIds.has(productId);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(productId);
      else next.add(productId);
      return next;
    });

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, product_id: productId }),
      });
      if (res.ok) {
        // Reload full list
        loadFavorites();
      }
    } catch {
      // Revert on error
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (wasFavorited) next.add(productId);
        else next.delete(productId);
        return next;
      });
    }
  }, [favoriteIds, loadFavorites]);

  const isFavorite = useCallback((productId: string) => {
    return favoriteIds.has(productId);
  }, [favoriteIds]);

  return { favorites, favoriteIds, loading, toggleFavorite, isFavorite, reload: loadFavorites };
}
