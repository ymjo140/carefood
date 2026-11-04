"use client";

import { useState, useEffect } from "react";
import { Button, Sheet, MealTag, useToast } from "@/components/ui";

const MEAL_OPTIONS = ["breakfast", "lunch", "dinner", "snack"] as const;

/**
 * "먹었어요" 버튼 — 상품 상세 페이지에서 식사 기록 추가
 * /api/diary로 통합 (nutrient_base_g 보정 + serving_multiplier 지원)
 */
export default function MealLogButton({ productId, productName }: { productId: string; productName?: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    try {
      const profile = localStorage.getItem("carefood_profile");
      if (profile) {
        const p = JSON.parse(profile);
        if (p.user_id) { setUserId(p.user_id); return; }
      }
      const anonId = localStorage.getItem("carefood_anon_id");
      if (anonId) setUserId(anonId);
    } catch { /* */ } // ds-allow: 로컬 ID 읽기
  }, []);

  const handleLog = async (mealType: string) => {
    if (!userId || saving) return;
    setSaving(true);

    try {
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          product_id: productId,
          food_name: productName || "제품",
          meal_type: mealType,
          date: new Date().toISOString().slice(0, 10),
        }),
      });
      if (res.ok) {
        setLogged(true);
        setShowMenu(false);
        toast.show("오늘 식단 기록에 넣었어요");
        setTimeout(() => setLogged(false), 3000);
      } else {
        toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      }
    } catch (e) {
      console.error(e);
      toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    setSaving(false);
  };

  // 비로그인이면 표시 안 함
  if (!userId) return null;

  return (
    <>
      {logged ? (
        <Button variant="secondary" icon="check" disabled>기록했어요</Button>
      ) : (
        <Button variant="secondary" icon="plus" onClick={() => setShowMenu(true)}>먹었어요</Button>
      )}

      {/* 끼니 선택 */}
      <Sheet
        open={showMenu}
        onClose={() => setShowMenu(false)}
        title="어느 끼니에 기록할까요?"
        description={productName}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {MEAL_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleLog(key)}
              disabled={saving}
              className="w-full flex items-center justify-between h-12 px-4 rounded-md border border-line bg-surface hover:border-line-strong transition-colors disabled:opacity-50"
            >
              <MealTag meal={key} />
              <span className="text-label text-brand-ink font-bold">기록하기</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
