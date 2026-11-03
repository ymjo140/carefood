"use client";

import { useState, useEffect } from "react";

const ALLERGEN_KEYWORDS: Record<string, { keywords: string[]; label: string }> = {
  egg: { keywords: ["계란", "달걀", "난류", "난백", "난황", "에그"], label: "계란" },
  milk: { keywords: ["우유", "밀크", "유단백", "카제인", "유청", "치즈", "버터", "크림"], label: "우유" },
  wheat: { keywords: ["밀가루", "소맥", "글루텐"], label: "밀" },
  soybean: { keywords: ["대두", "두부", "두유", "된장", "간장", "콩나물"], label: "대두" },
  peanut: { keywords: ["땅콩", "피넛"], label: "땅콩" },
  treenut: { keywords: ["호두", "아몬드", "캐슈넛", "피스타치오", "마카다미아", "잣", "헤이즐넛", "견과"], label: "견과류" },
  shellfish: { keywords: ["새우", "게", "랍스터", "크랩", "갑각"], label: "갑각류" },
  fish: { keywords: ["고등어", "연어", "참치", "멸치", "오징어", "조기", "꽁치", "갈치", "생선"], label: "생선" },
  buckwheat: { keywords: ["메밀"], label: "메밀" },
  peach: { keywords: ["복숭아"], label: "복숭아" },
  sulfite: { keywords: ["아황산"], label: "아황산류" },
};

export default function AllergenWarning({ productName }: { productName: string }) {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("carefood_profile");
      if (!raw) return;
      const profile = JSON.parse(raw);
      const allergies: string[] = profile.allergies || [];
      if (allergies.length === 0) return;

      const name = productName.toLowerCase();
      const matched: string[] = [];
      for (const allergy of allergies) {
        const config = ALLERGEN_KEYWORDS[allergy];
        if (config && config.keywords.some((kw) => name.includes(kw))) {
          matched.push(config.label);
        }
      }
      setWarnings(matched);
    } catch { /* ignore */ }
  }, [productName]);

  if (warnings.length === 0) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5"
      style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)" }}
    >
      <span className="text-base mt-0.5">⚠️</span>
      <div>
        <p className="text-sm font-bold" style={{ color: "#DC2626" }}>
          알레르기 주의
        </p>
        <p className="text-xs mt-0.5 text-muted">
          이 제품에 <strong style={{ color: "#DC2626" }}>{warnings.join(", ")}</strong> 성분이 포함되어 있을 수 있습니다.
          제품 라벨을 반드시 확인하세요.
        </p>
      </div>
    </div>
  );
}
