"use client";

import { Badge, cn, type BadgeTone } from "@/components/ui";

/**
 * DualRadarChart — 맛 프로필 + 영양 프로필 이중 오각형 레이더 차트
 *
 * 두 개의 오각형이 겹쳐서 보이며, 제품/사용자의 맛·영양 매칭 상태를 한눈에 보여줌.
 * - 맛 프로필: 매운맛 · 단맛 · 짠맛 · 감칠맛 · 신맛 (1~5)
 * - 영양 프로필: 단백질 · 탄수화물 · 지방 · 섬유질 · 균형 (1~5 스코어)
 */

type TasteProfile = {
  salty: number;    // 짠맛 (나트륨 기반)
  sweet: number;    // 단맛 (당류 기반)
  savory: number;   // 고소함 (지방 기반)
  light: number;    // 담백함 (단백질÷칼로리 비율)
  spicy: number;     // 매운맛 (spicy_score 기반)
};

type NutritionProfile = {
  protein: number;    // 1~5 스코어
  carbs: number;
  fat: number;
  fiber: number;
  vitamins: number;   // 균형 (나트륨 역산)
};

type DualRadarChartProps = {
  /** 제품의 맛 프로필 (1~5) */
  taste: TasteProfile;
  /** 사용자의 맛 선호 프로필 (1~5), 없으면 맛만 단일 표시 */
  userTaste?: TasteProfile;
  /** 제품의 영양 충족률 (0~100) */
  nutrition?: NutritionProfile;
  /** 사용자의 현재 영양 상태 (0~100), 없으면 영양만 단일 표시 */
  userNutrition?: NutritionProfile;
  /** 제품 맛이 실제 평가가 아니라 영양성분으로 추정한 값이면 true (범례에 '추정') */
  tasteEstimated?: boolean;
  /** 종합 매칭 점수 (0~100) */
  matchScore?: number;
  /** (호환용) 예전 크기 지정 — 이제 라벨이 12px 실제 크기로 보이도록 고정 크기로 그림 */
  size?: number;
  /** 모드: taste만 / nutrition만 / 둘 다 */
  mode?: "taste" | "nutrition" | "dual";
};

// 맛 프로필: 영양성분에서 확실히 알 수 있는 것만
// (나중에 캡사이신·글루탐산 데이터 확보 시 매운맛·감칠맛 추가)
const TASTE_LABELS = ["짠맛", "단맛", "고소함", "담백함", "매운맛"];
const NUTRITION_LABELS = ["단백", "탄수", "지방", "섬유질", "저염도"];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function makePolygonPoints(
  cx: number,
  cy: number,
  values: number[],
  maxVal: number,
  radius: number
): string {
  return values
    .map((v, i) => {
      const angle = (360 / values.length) * i;
      const r = (v / maxVal) * radius;
      const { x, y } = polarToCartesian(cx, cy, r, angle);
      return `${x},${y}`;
    })
    .join(" ");
}

/* ── 계열 색: 토큰 클래스 (SVG fill/stroke) ── */
const SERIES = {
  taste: { stroke: "stroke-brand", fill: "fill-brand", dot: "bg-brand" },
  nutrition: { stroke: "stroke-positive", fill: "fill-positive", dot: "bg-positive" },
  user: { stroke: "stroke-protein", fill: "fill-protein" },
} as const;

/* 한 장의 오각형 — 라벨 12px 가 실제 크기로 보이도록 viewBox 를 1:1 로 그린다 */
const VB_W = 224;
const VB_H = 172;
const R = 56;
const CX = VB_W / 2;
const CY = 88;

function RadarGrid({ labels }: { labels: string[] }) {
  const sides = labels.length;
  const rings = [1, 2, 3, 4, 5].map((lv) => {
    const r = (R / 5) * lv;
    const pts = Array.from({ length: sides }, (_, i) => {
      const { x, y } = polarToCartesian(CX, CY, r, (360 / sides) * i);
      return `${x},${y}`;
    }).join(" ");
    return <polygon key={lv} points={pts} fill="none" className="stroke-line" strokeWidth="1" />;
  });
  const axes = labels.map((label, i) => {
    const angle = (360 / sides) * i;
    const outer = polarToCartesian(CX, CY, R, angle);
    const pos = polarToCartesian(CX, CY, R + 12, angle);
    const dx = pos.x - CX;
    const dy = pos.y - CY;
    const anchor: "start" | "middle" | "end" = dx < -5 ? "end" : dx > 5 ? "start" : "middle";
    const offsetX = dx < -5 ? -2 : dx > 5 ? 2 : 0;
    const offsetY = dy < -5 ? -6 : dy > 5 ? 8 : 0;
    return (
      <g key={label}>
        <line x1={CX} y1={CY} x2={outer.x} y2={outer.y} className="stroke-line" strokeWidth="1" />
        <text x={pos.x + offsetX} y={pos.y + offsetY} textAnchor={anchor} dominantBaseline="middle"
          fontSize="12" fontWeight="500" className="fill-ink-2">
          {label}
        </text>
      </g>
    );
  });
  return <>{rings}{axes}</>;
}

function RadarPanel({ title, labels, values, userValues, series }: {
  title: string;
  labels: string[];
  values: number[];
  userValues?: number[] | null;
  series: "taste" | "nutrition";
}) {
  const s = SERIES[series];
  return (
    <figure className="flex flex-col items-center gap-1 m-0">
      <figcaption className="text-label font-bold text-ink">{title}</figcaption>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={VB_W} className="max-w-full h-auto" role="img"
        aria-label={`${title}: ${labels.map((l, i) => `${l} ${values[i]}`).join(", ")}`}>
        <RadarGrid labels={labels} />
        {userValues && (
          <polygon points={makePolygonPoints(CX, CY, userValues, 5, R)}
            className={cn(SERIES.user.fill, SERIES.user.stroke)} fillOpacity={0.12} strokeWidth="1.5" strokeDasharray="4 3" />
        )}
        <polygon points={makePolygonPoints(CX, CY, values, 5, R)}
          className={cn(s.fill, s.stroke)} fillOpacity={0.22} strokeWidth="2" />
        {values.map((v, i) => {
          const { x, y } = polarToCartesian(CX, CY, (v / 5) * R, (360 / values.length) * i);
          return <circle key={i} cx={x} cy={y} r="3" className={s.fill} />;
        })}
      </svg>
    </figure>
  );
}

function MatchBadge({ score }: { score: number }) {
  const tone: BadgeTone = score >= 80 ? "positive" : score >= 50 ? "brand" : "neutral";
  return <Badge tone={tone} className="font-bold">매칭 <span className="num">{score}</span>점</Badge>;
}

export default function DualRadarChart({
  taste,
  userTaste,
  nutrition,
  userNutrition,
  matchScore,
  tasteEstimated = false,
  mode = "dual",
}: DualRadarChartProps) {
  const showTaste = mode === "taste" || mode === "dual";

  const tasteValues = [taste.salty, taste.sweet, taste.savory, taste.light, taste.spicy];
  const userTasteValues = userTaste
    ? [userTaste.salty, userTaste.sweet, userTaste.savory, userTaste.light, userTaste.spicy]
    : null;

  const nutritionValues = nutrition
    ? [nutrition.protein, nutrition.carbs, nutrition.fat, nutrition.fiber, nutrition.vitamins]
    : null;
  const userNutritionValues = userNutrition
    ? [userNutrition.protein, userNutrition.carbs, userNutrition.fat, userNutrition.fiber, userNutrition.vitamins]
    : null;

  // 듀얼 모드: 두 오각형 나란히 (좁으면 위아래)
  if (mode === "dual" && nutritionValues) {
    return (
      <div className="flex flex-col items-center gap-3">
        {matchScore !== undefined && <MatchBadge score={matchScore} />}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-4">
          <RadarPanel title="맛 프로필" labels={TASTE_LABELS} values={tasteValues} userValues={userTasteValues} series="taste" />
          <RadarPanel title="영양 프로필" labels={NUTRITION_LABELS} values={nutritionValues} userValues={userNutritionValues} series="nutrition" />
        </div>
        <Legend showUser={!!(userTasteValues || userNutritionValues)} showNutrition estimated={tasteEstimated} />
      </div>
    );
  }

  // 단일 모드 (맛 or 영양)
  const values = showTaste ? tasteValues : (nutritionValues || [0, 0, 0, 0, 0]);
  const bgValues = showTaste ? userTasteValues : userNutritionValues;

  return (
    <div className="flex flex-col items-center gap-3">
      {matchScore !== undefined && <MatchBadge score={matchScore} />}
      <RadarPanel title={showTaste ? "맛 프로필" : "영양 프로필"} labels={showTaste ? TASTE_LABELS : NUTRITION_LABELS}
        values={values} userValues={bgValues} series={showTaste ? "taste" : "nutrition"} />
      {bgValues && <Legend showUser showNutrition={!showTaste} showTaste={showTaste} estimated={tasteEstimated} />}
    </div>
  );
}

function Legend({ showUser, showNutrition, showTaste = true, estimated = false }: { showUser: boolean; showNutrition: boolean; showTaste?: boolean; estimated?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-caption text-ink-2">
      {showTaste && (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", SERIES.taste.dot)} aria-hidden="true" />{estimated ? "제품 맛 (추정)" : "제품 맛"}
        </span>
      )}
      {showNutrition && (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", SERIES.nutrition.dot)} aria-hidden="true" />영양 충족
        </span>
      )}
      {showUser && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-dashed border-protein" aria-hidden="true" />내 선호
        </span>
      )}
    </div>
  );
}

/**
 * 매칭 점수 계산 유틸
 */
export function calcTasteMatchScore(product: TasteProfile, user: TasteProfile): number {
  const axes: (keyof TasteProfile)[] = ["salty", "sweet", "savory", "light", "spicy"];
  const maxDist = Math.sqrt(axes.length * 16); // 각 축 최대 차이 4, 5축
  const dist = Math.sqrt(
    axes.reduce((sum, k) => sum + Math.pow(product[k] - user[k], 2), 0)
  );
  return Math.round((1 - dist / maxDist) * 100);
}

export function calcNutritionMatchScore(nutrition: NutritionProfile): number {
  const axes: (keyof NutritionProfile)[] = ["protein", "carbs", "fat", "fiber", "vitamins"];
  // 1~5 스케일 평균을 0~100 점수로 변환 (5=100, 3=60, 1=20)
  const scores = axes.map((k) => ((nutrition[k] - 1) / 4) * 100);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function calcOverallMatchScore(tasteScore: number, nutritionScore: number): number {
  return Math.round(tasteScore * 0.4 + nutritionScore * 0.6);
}
