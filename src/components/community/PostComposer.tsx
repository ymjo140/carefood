"use client";

import { useState, useEffect } from "react";

const MEAL_TYPES = [
  { key: "breakfast", label: "🌅 아침" },
  { key: "lunch", label: "☀️ 점심" },
  { key: "dinner", label: "🌙 저녁" },
  { key: "snack", label: "🍪 간식" },
];

type DiaryEntry = {
  id: string;
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_type: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  nickname: string;
  ageGroup?: string;
  concerns?: string[];
  goals?: string[];
  onPosted: () => void;
};

export default function PostComposer({ isOpen, onClose, userId, nickname, ageGroup, concerns, goals, onPosted }: Props) {
  const [mode, setMode] = useState<"meal" | "daily">("meal");
  const [content, setContent] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [recentMeals, setRecentMeals] = useState<DiaryEntry[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<DiaryEntry[]>([]);
  const [posting, setPosting] = useState(false);

  // Load recent diary entries
  useEffect(() => {
    if (!isOpen || mode !== "meal") return;
    fetch(`/api/diary?user_id=${userId}&recent=true`)
      .then(r => r.json())
      .then(data => setRecentMeals(data.entries || []))
      .catch(() => {});
  }, [isOpen, mode, userId]);

  const toggleMeal = (entry: DiaryEntry) => {
    setSelectedMeals(prev =>
      prev.some(m => m.id === entry.id)
        ? prev.filter(m => m.id !== entry.id)
        : [...prev, entry]
    );
  };

  const handlePost = async () => {
    if (posting) return;
    setPosting(true);

    try {
      const body: Record<string, unknown> = {
        user_id: userId,
        post_type: mode,
        content: content.trim() || null,
        author_nickname: nickname,
        author_age_group: ageGroup,
        author_concerns: concerns || [],
        author_goals: goals || [],
      };

      if (mode === "meal" && selectedMeals.length > 0) {
        const total = selectedMeals.reduce(
          (acc, m) => ({
            calories: acc.calories + (m.calories || 0),
            protein_g: acc.protein_g + (m.protein_g || 0),
            carbs_g: acc.carbs_g + (m.carbs_g || 0),
            fat_g: acc.fat_g + (m.fat_g || 0),
          }),
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
        );
        body.meal_type = mealType;
        body.meal_data = {
          foods: selectedMeals.map(m => ({
            name: m.food_name,
            calories: m.calories,
            protein_g: m.protein_g,
            carbs_g: m.carbs_g,
            fat_g: m.fat_g,
          })),
          total,
        };
      }

      const res = await fetch("/api/community/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onPosted();
        onClose();
        setContent("");
        setSelectedMeals([]);
      }
    } finally {
      setPosting(false);
    }
  };

  if (!isOpen) return null;

  const canPost = mode === "daily" ? content.trim().length > 0 : selectedMeals.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto"
        style={{ background: "#161C24" }}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b"
          style={{ background: "#161C24", borderColor: "#252C35" }}>
          <button onClick={onClose} className="text-sm" style={{ color: "#8A919A" }}>취소</button>
          <span className="text-sm font-bold" style={{ color: "#ECEBE6" }}>새 글 쓰기</span>
          <button onClick={handlePost} disabled={!canPost || posting}
            className="text-sm font-bold px-3 py-1 rounded-full disabled:opacity-40"
            style={{ background: "#C4870A", color: "#0C1117" }}>
            {posting ? "..." : "공유"}
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 px-4 pt-3">
          {[
            { key: "meal" as const, label: "🍱 식단 공유" },
            { key: "daily" as const, label: "💬 일상/질문" },
          ].map(t => (
            <button key={t.key} onClick={() => setMode(t.key)}
              className="text-xs px-3 py-1.5 rounded-full font-medium"
              style={{
                background: mode === t.key ? "#C4870A" : "#252C35",
                color: mode === t.key ? "#0C1117" : "#8A919A",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {mode === "meal" && (
            <>
              {/* Meal type */}
              <div className="flex gap-1.5">
                {MEAL_TYPES.map(mt => (
                  <button key={mt.key} onClick={() => setMealType(mt.key)}
                    className="text-[11px] px-2.5 py-1 rounded-full"
                    style={{
                      background: mealType === mt.key ? "#C4870A" : "#252C35",
                      color: mealType === mt.key ? "#0C1117" : "#8A919A",
                    }}>
                    {mt.label}
                  </button>
                ))}
              </div>

              {/* Recent meals to select */}
              <div>
                <p className="text-[11px] mb-2" style={{ color: "#8A919A" }}>
                  오늘 기록에서 선택하세요 ({selectedMeals.length}개 선택)
                </p>
                {recentMeals.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentMeals.map(entry => {
                      const selected = selectedMeals.some(m => m.id === entry.id);
                      return (
                        <button key={entry.id} onClick={() => toggleMeal(entry)}
                          className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
                          style={{
                            background: selected ? "rgba(196,135,10,0.15)" : "#252C35",
                            border: selected ? "1px solid rgba(196,135,10,0.4)" : "1px solid transparent",
                          }}>
                          <div>
                            <span className="text-[12px] font-medium" style={{ color: "#ECEBE6" }}>
                              {entry.food_name}
                            </span>
                          </div>
                          <span className="text-[11px]" style={{ color: "#8A919A" }}>
                            {entry.calories}kcal
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-center py-4" style={{ color: "#8A919A" }}>
                    오늘 기록된 식단이 없습니다
                  </p>
                )}
              </div>
            </>
          )}

          {/* Content */}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={mode === "meal" ? "한 줄 코멘트 (선택)" : "건강 팁, 후기, 질문을 공유해보세요"}
            className="w-full rounded-lg px-3 py-2.5 text-[13px] resize-none focus:outline-none placeholder:text-[#8A919A]/60"
            style={{ background: "#252C35", color: "#ECEBE6", minHeight: mode === "daily" ? "120px" : "60px" }}
            rows={mode === "daily" ? 5 : 2}
          />
        </div>
      </div>
    </div>
  );
}
