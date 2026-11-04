"use client";

import { useState, useEffect } from "react";
import { Button, Chip, Field, Icon, Kcal, Sheet, Tabs, Textarea, cn } from "@/components/ui";

const MEAL_TYPES = [
  { key: "breakfast", label: "아침" },
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
  { key: "snack", label: "간식" },
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

  // 오늘 식단 기록 불러오기 — 식단 기록 화면과 같은 날짜 기준.
  // (recent=true 는 id 없이 { recent } 를 돌려줘서 목록이 늘 비어 보였음)
  useEffect(() => {
    if (!isOpen || mode !== "meal") return;
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/diary?user_id=${encodeURIComponent(userId)}&date=${today}`)
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

  const canPost = mode === "daily" ? content.trim().length > 0 : selectedMeals.length > 0;

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title="새 글 쓰기"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>취소</Button>
          <Button block onClick={handlePost} disabled={!canPost} loading={posting}>공유하기</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          label="글 종류"
          value={mode}
          onChange={setMode}
          items={[{ value: "meal", label: "식단 공유" }, { value: "daily", label: "일상 · 질문" }]}
        />

        {mode === "meal" && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-label font-medium text-ink">끼니</span>
              <div className="flex flex-wrap gap-2">
                {MEAL_TYPES.map(mt => (
                  <Chip key={mt.key} selected={mealType === mt.key} onClick={() => setMealType(mt.key)}>{mt.label}</Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-label font-medium text-ink">
                오늘 기록에서 고르기 <span className="text-ink-2 font-regular">· <span className="num">{selectedMeals.length}</span>개 고름</span>
              </span>
              {recentMeals.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {recentMeals.map(entry => {
                    const selected = selectedMeals.some(m => m.id === entry.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => toggleMeal(entry)}
                        aria-pressed={selected}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-md border px-3 h-12 text-left transition-colors",
                          selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
                        )}
                      >
                        <span className={cn("size-5 rounded-sm border flex items-center justify-center shrink-0", selected ? "border-brand bg-brand text-on-brand" : "border-line-strong")}>
                          {selected && <Icon name="check" size={14} />}
                        </span>
                        <span className="flex-1 min-w-0 text-label font-medium text-ink truncate">{entry.food_name}</span>
                        <Kcal value={entry.calories} className="text-caption shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-label text-ink-2 text-center py-6 rounded-md bg-sunken">오늘 기록한 식단이 없어요</p>
              )}
            </div>
          </>
        )}

        <Field label={mode === "meal" ? "한 줄 코멘트 (선택)" : "내용"}>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={mode === "meal" ? "오늘 식단 어땠나요?" : "건강 팁, 후기, 질문을 공유해 보세요"}
            rows={mode === "daily" ? 5 : 2}
          />
        </Field>
      </div>
    </Sheet>
  );
}
