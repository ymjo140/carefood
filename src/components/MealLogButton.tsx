"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "먹었어요" 버튼 — 상품 상세 페이지에서 식사 기록 추가
 */
export default function MealLogButton({ productId }: { productId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    })();
  }, []);

  const handleLog = async (mealType: string) => {
    if (!userId || saving) return;
    setSaving(true);

    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, productId, mealType }),
      });
      if (res.ok) {
        setLogged(true);
        setShowMenu(false);
        setTimeout(() => setLogged(false), 3000);
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  // 비로그인이면 표시 안 함
  if (!userId) return null;

  return (
    <div className="relative">
      {logged ? (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          기록됨
        </div>
      ) : (
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
          </svg>
          먹었어요
        </button>
      )}

      {/* 끼니 선택 메뉴 */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-10 min-w-[120px]">
          {[
            { key: "breakfast", label: "아침" },
            { key: "lunch", label: "점심" },
            { key: "dinner", label: "저녁" },
            { key: "snack", label: "간식" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => handleLog(m.key)}
              disabled={saving}
              className="w-full text-left px-4 py-3 text-sm hover:bg-surface transition-colors disabled:opacity-50"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
