"use client";

/**
 * DualRadarChart — 맛 프로필 + 영양 프로필 이중 오각형 레이더 차트
 *
 * 두 개의 오각형이 겹쳐서 보이며, 제품/사용자의 맛·영양 매칭 상태를 한눈에 보여줌.
 * - 맛 프로필: 매운맛 · 단맛 · 짠맛 · 감칠맛 · 신맛 (1~5)
 * - 영양 프로필: 단백질 · 탄수화물 · 지방 · 섬유질 · 균형 (1~5 스코어)
 */

type TasteProfile = {
  spicy: number;
  sweet: number;
  salty: number;
  umami: number;
  sour: number;
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
  /** 종합 매칭 점수 (0~100) */
  matchScore?: number;
  /** 차트 크기 */
  size?: number;
  /** 모드: taste만 / nutrition만 / 둘 다 */
  mode?: "taste" | "nutrition" | "dual";
};

const TASTE_LABELS = ["매운맛", "단맛", "짠맛", "감칠맛", "신맛"];
const NUTRITION_LABELS = ["단백", "탄수", "지방", "섬유질", "균형"];

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

function RadarGrid({
  cx,
  cy,
  radius,
  levels,
  labels,
  sides,
}: {
  cx: number;
  cy: number;
  radius: number;
  levels: number;
  labels: string[];
  sides: number;
}) {
  const gridLines = [];
  // 동심 다각형
  for (let lv = 1; lv <= levels; lv++) {
    const r = (radius / levels) * lv;
    const pts = Array.from({ length: sides }, (_, i) => {
      const angle = (360 / sides) * i;
      const { x, y } = polarToCartesian(cx, cy, r, angle);
      return `${x},${y}`;
    }).join(" ");
    gridLines.push(
      <polygon
        key={`grid-${lv}`}
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity={0.15}
      />
    );
  }
  // 축 선 + 라벨
  const axes = labels.map((label, i) => {
    const angle = (360 / sides) * i;
    const outer = polarToCartesian(cx, cy, radius, angle);
    const labelPos = polarToCartesian(cx, cy, radius + 22, angle);
    return (
      <g key={`axis-${i}`}>
        <line
          x1={cx}
          y1={cy}
          x2={outer.x}
          y2={outer.y}
          stroke="currentColor"
          strokeWidth="0.5"
          opacity={0.2}
        />
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fill="currentColor"
          opacity={0.6}
          fontWeight="500"
        >
          {label}
        </text>
      </g>
    );
  });
  return (
    <>
      {gridLines}
      {axes}
    </>
  );
}

export default function DualRadarChart({
  taste,
  userTaste,
  nutrition,
  userNutrition,
  matchScore,
  size = 240,
  mode = "dual",
}: DualRadarChartProps) {
  const showTaste = mode === "taste" || mode === "dual";
  const showNutrition = mode === "nutrition" || mode === "dual";

  const padding = 36;
  const svgSize = size + padding * 2;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = size / 2;

  const tasteValues = [taste.spicy, taste.sweet, taste.salty, taste.umami, taste.sour];
  const userTasteValues = userTaste
    ? [userTaste.spicy, userTaste.sweet, userTaste.salty, userTaste.umami, userTaste.sour]
    : null;

  const nutritionValues = nutrition
    ? [nutrition.protein, nutrition.carbs, nutrition.fat, nutrition.fiber, nutrition.vitamins]
    : null;
  const userNutritionValues = userNutrition
    ? [userNutrition.protein, userNutrition.carbs, userNutrition.fat, userNutrition.fiber, userNutrition.vitamins]
    : null;

  // 듀얼 모드: 좌우로 두 오각형 나란히
  if (mode === "dual" && nutritionValues) {
    const pad = 52; // 라벨 잘림 방지 여백 (한글 2글자 기준)
    const halfW = size / 2 + pad;
    const dualSvgW = halfW * 2 + 20;
    const smallR = size * 0.34;
    const cx1 = halfW / 2 + 10;
    const cx2 = halfW + halfW / 2 + 10;
    const dualCy = halfW / 2 + 14;

    return (
      <div className="flex flex-col items-center gap-3">
        {matchScore !== undefined && (
          <div className="flex items-center gap-2">
            <div
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{
                background: matchScore >= 80 ? "#D4A843" : matchScore >= 50 ? "#E06030" : "#6E7A8A",
                color: matchScore >= 80 ? "#0C1117" : "#ECEBE6",
              }}
            >
              매칭 {matchScore}점
            </div>
          </div>
        )}
        <svg
          viewBox={`0 0 ${dualSvgW} ${halfW + 28}`}
          width={dualSvgW}
          style={{ maxWidth: "100%" }}
        >
          {/* 맛 프로필 */}
          <text x={cx1} y={14} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity={0.8}>
            맛 프로필
          </text>
          <g>
            <RadarGrid cx={cx1} cy={dualCy} radius={smallR} levels={5} labels={TASTE_LABELS} sides={5} />
            {userTasteValues && (
              <polygon
                points={makePolygonPoints(cx1, dualCy, userTasteValues, 5, smallR)}
                fill="rgba(106,163,232,0.15)"
                stroke="#6BA3E8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
            )}
            <polygon
              points={makePolygonPoints(cx1, dualCy, tasteValues, 5, smallR)}
              fill="rgba(212,168,67,0.25)"
              stroke="#D4A843"
              strokeWidth="2"
            />
            {/* 꼭짓점 점 */}
            {tasteValues.map((v, i) => {
              const angle = (360 / 5) * i;
              const r = (v / 5) * smallR;
              const { x, y } = polarToCartesian(cx1, dualCy, r, angle);
              return <circle key={i} cx={x} cy={y} r="3" fill="#D4A843" />;
            })}
          </g>

          {/* 영양 프로필 */}
          <text x={cx2} y={14} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity={0.8}>
            영양 프로필
          </text>
          <g>
            <RadarGrid cx={cx2} cy={dualCy} radius={smallR} levels={5} labels={NUTRITION_LABELS} sides={5} />
            {userNutritionValues && (
              <polygon
                points={makePolygonPoints(cx2, dualCy, userNutritionValues, 5, smallR)}
                fill="rgba(106,163,232,0.15)"
                stroke="#6BA3E8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
            )}
            <polygon
              points={makePolygonPoints(cx2, dualCy, nutritionValues, 5, smallR)}
              fill="rgba(224,96,48,0.25)"
              stroke="#E06030"
              strokeWidth="2"
            />
            {nutritionValues.map((v, i) => {
              const angle = (360 / 5) * i;
              const r = (v / 5) * smallR;
              const { x, y } = polarToCartesian(cx2, dualCy, r, angle);
              return <circle key={i} cx={x} cy={y} r="3" fill="#E06030" />;
            })}
          </g>
        </svg>
        {/* 범례 */}
        <div className="flex gap-4 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#D4A843" }} />
            제품
          </span>
          {(userTasteValues || userNutritionValues) && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-dashed" style={{ borderColor: "#6BA3E8" }} />
              내 선호
            </span>
          )}
          {nutritionValues && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#E06030" }} />
              영양 충족
            </span>
          )}
        </div>
      </div>
    );
  }

  // 단일 모드 (맛 or 영양)
  const values = showTaste ? tasteValues : (nutritionValues || [0, 0, 0, 0, 0]);
  const maxVal = 5;
  const labels = showTaste ? TASTE_LABELS : NUTRITION_LABELS;
  const color = showTaste ? "#D4A843" : "#E06030";
  const bgValues = showTaste ? userTasteValues : userNutritionValues;

  return (
    <div className="flex flex-col items-center gap-3">
      {matchScore !== undefined && (
        <div
          className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{
            background: matchScore >= 80 ? "#D4A843" : matchScore >= 50 ? "#E06030" : "#6E7A8A",
            color: matchScore >= 80 ? "#0C1117" : "#ECEBE6",
          }}
        >
          매칭 {matchScore}점
        </div>
      )}
      <svg viewBox={`0 0 ${svgSize} ${svgSize}`} width={svgSize} style={{ maxWidth: "100%" }}>
        <RadarGrid cx={cx} cy={cy} radius={radius} levels={5} labels={labels} sides={5} />
        {bgValues && (
          <polygon
            points={makePolygonPoints(cx, cy, bgValues, maxVal, radius)}
            fill="rgba(106,163,232,0.15)"
            stroke="#6BA3E8"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        )}
        <polygon
          points={makePolygonPoints(cx, cy, values, maxVal, radius)}
          fill={`${color}40`}
          stroke={color}
          strokeWidth="2"
        />
        {values.map((v, i) => {
          const angle = (360 / 5) * i;
          const r = (v / maxVal) * radius;
          const { x, y } = polarToCartesian(cx, cy, r, angle);
          return <circle key={i} cx={x} cy={y} r="3.5" fill={color} />;
        })}
      </svg>
      <p className="text-[10px] text-muted text-center">
        {showTaste ? "맛 프로필" : "영양 프로필"}
      </p>
    </div>
  );
}

/**
 * 매칭 점수 계산 유틸
 */
export function calcTasteMatchScore(product: TasteProfile, user: TasteProfile): number {
  const axes: (keyof TasteProfile)[] = ["spicy", "sweet", "salty", "umami", "sour"];
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
