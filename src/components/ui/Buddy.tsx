import { cn } from "./cn";
import { buddyName, type IngredientKey, type PersonalityKey, type StageKey } from "@/lib/buddy";
import type { MascotMood } from "./Mascot";

/**
 * 재료 캐릭터(버디) — 재료 30종 몸 × 성격 8 얼굴 × 표정(기분) × 자라기 4단계. 내 화면(기록·챌린지·캐릭터)에만 나온다. 가족 화면에는 쓰지 않는다.
 * 몸은 먹은 양으로 바뀌지 않는다 — 크기는 같이 기록한 날 수(stage)로만. '배불러요'는 그날 얼굴만.
 * 색은 재료 그림 전용 토큰(food-*)만 — 두 테마에 같은 값, 앱 화면 강조색 규칙 밖의 일러스트 예외.
 * 이름·규칙은 lib/buddy.ts, 말은 lib/buddy-lines.ts.
 */
type Part = { d: string; c: string; s?: string; w?: number };
const P = (d: string, c: string, s?: string, w = 3): Part => ({ d, c, s, w });
const O = (cx: number, cy: number, rx: number, ry = rx) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 `;

/** 몸 — 200×200 판, 얼굴 자리는 (82·118, 112) 근처 */
const BODY: Record<IngredientKey, Part[]> = {
  sweetpotato: [
    P("M96 52 C92 36 98 24 108 18 C110 30 106 42 100 52 Z", "fill-food-leaf"),
    P("M30 120 C30 78 64 52 104 54 C148 56 176 86 172 124 C168 160 136 180 100 180 C60 180 30 158 30 120 Z", "fill-food-purple"),
    P("M168 136 C178 140 186 146 190 154 C182 154 174 150 166 146 Z", "fill-food-purple"),
    P(O(102, 152, 36, 18), "fill-food-orange"),
  ],
  potato: [
    P("M36 118 C36 76 66 56 102 56 C142 56 166 82 166 118 C166 156 138 178 100 178 C62 178 36 156 36 118 Z", "fill-food-tan"),
    P(O(61, 90, 3) + O(147, 92, 3) + O(135, 160, 3) + O(72, 156, 2.5), "fill-food-tan-deep"),
  ],
  pumpkin: [
    P("M28 118 C28 80 62 62 100 62 C138 62 172 80 172 118 C172 156 140 176 100 176 C60 176 28 156 28 118 Z", "fill-food-pumpkin"),
    P("M66 68 C54 100 54 142 68 172 M134 68 C146 100 146 142 132 172", "fill-none", "stroke-food-pumpkin-deep"),
    P("M94 64 C94 50 100 44 110 42 L112 48 C106 50 104 56 104 64 Z", "fill-food-stem"),
  ],
  chestnut: [
    P("M100 48 C130 62 168 96 166 132 C164 162 136 180 100 180 C64 180 36 162 34 132 C32 96 70 62 100 48 Z", "fill-food-brown"),
    P("M38 150 C60 162 140 162 162 150 C158 170 132 180 100 180 C68 180 42 170 38 150 Z", "fill-food-sand"),
    P("M95 50 L100 38 L105 50 Z", "fill-food-brown-deep"),
  ],
  riceball: [
    P("M100 46 C114 46 178 140 168 160 C162 176 140 178 100 178 C60 178 38 176 32 160 C22 140 86 46 100 46 Z", "fill-food-white", "stroke-food-cup-line"),
    P("M66 146 H134 Q140 146 140 152 V176 H60 V152 Q60 146 66 146 Z", "fill-food-nori"),
  ],
  mochi: [
    P("M30 140 C30 98 62 76 100 76 C138 76 170 98 170 140 C170 168 140 178 100 178 C60 178 30 168 30 140 Z", "fill-food-cream", "stroke-food-cream-line"),
    P(O(72, 90, 2.5) + O(124, 86, 2.5) + O(148, 112, 2), "fill-food-cream-line"),
  ],
  tofu: [
    P("M46 72 Q52 50 76 50 H140 Q160 50 160 66 L156 72 Z", "fill-food-white", "stroke-food-cream-line"),
    P("M62 70 H142 Q164 70 164 92 V152 Q164 174 142 174 H62 Q40 174 40 152 V92 Q40 70 62 70 Z", "fill-food-cream", "stroke-food-cream-line"),
  ],
  egg: [
    P("M100 40 C140 40 166 100 166 132 C166 162 138 182 100 182 C62 182 34 162 34 132 C34 100 60 40 100 40 Z", "fill-food-cream", "stroke-food-cream-line"),
  ],
  quail: [
    P("M100 58 C132 58 154 104 154 132 C154 158 130 176 100 176 C70 176 46 158 46 132 C46 104 68 58 100 58 Z", "fill-food-shell", "stroke-food-shell-line"),
    P(O(71, 96, 5, 4) + O(130, 90, 4, 3) + O(137, 150, 5, 4) + O(72, 152, 4, 3), "fill-food-speck"),
  ],
  pea: [
    P("M20 120 C38 76 162 76 180 120 C162 164 38 164 20 120 Z", "fill-food-pea"),
    P(O(48, 120, 14) + O(152, 120, 14) + O(100, 118, 34, 32), "fill-food-pea-light"),
  ],
  yogurt: [
    P("M44 98 H156 L146 176 Q144 182 136 182 H64 Q56 182 54 176 Z", "fill-food-white", "stroke-food-cup-line"),
    P("M46 100 C44 78 68 68 84 74 C92 56 120 56 126 72 C146 68 160 84 154 100 Z", "fill-food-white", "stroke-food-cup-line"),
    P(O(122, 62, 8), "fill-food-berry-deep"),
  ],
  cheese: [
    P("M30 120 L150 64 Q172 58 172 80 V168 Q172 178 162 178 H40 Q30 178 30 168 Z", "fill-food-yellow", "stroke-food-yellow-deep"),
    P(O(59, 160, 7) + O(152, 94, 6) + O(148, 156, 8), "fill-food-yellow-deep"),
  ],
  yolk: [
    P("M36 122 C24 92 56 70 78 78 C88 54 132 54 142 76 C170 70 182 106 168 126 C184 152 152 180 124 168 C110 188 66 184 60 162 C32 166 22 140 36 122 Z", "fill-food-white", "stroke-food-cream-line"),
    P(O(100, 118, 42), "fill-food-yolk"),
    P("M114 74 L128 66 L130 82 Z M114 74 L100 66 L98 82 Z", "fill-food-coral"),
  ],
  avocado: [
    P("M100 24 C142 24 162 78 164 118 C166 164 136 186 100 186 C64 186 34 164 36 118 C38 78 58 24 100 24 Z", "fill-food-avocado"),
    P("M100 38 C134 38 150 84 152 120 C153 158 128 174 100 174 C72 174 47 158 48 120 C50 84 66 38 100 38 Z", "fill-food-avocado-light"),
    P(O(100, 154, 18, 16), "fill-food-seed"),
  ],
  walnut: [
    P("M38 116 C38 78 68 58 100 58 C132 58 162 78 162 116 C162 154 134 176 100 176 C66 176 38 154 38 116 Z", "fill-food-nut"),
    P("M58 82 C74 94 72 104 56 112 M142 82 C126 94 128 104 144 112 M62 152 C76 142 86 150 82 164 M138 152 C124 142 114 150 118 164 M100 60 V84", "fill-none", "stroke-food-nut-deep"),
  ],
  peanut: [
    P("M100 36 C134 36 146 66 132 88 C150 104 152 132 140 154 C128 178 72 178 60 154 C48 132 50 104 68 88 C54 66 66 36 100 36 Z", "fill-food-peanut", "stroke-food-nut-deep"),
    P(O(88, 56, 2.5) + O(112, 60, 2.5) + O(86, 160, 2.5) + O(114, 162, 2.5), "fill-food-nut-deep"),
  ],
  olive: [
    P("M42 116 C42 80 70 60 104 60 C140 60 160 84 158 118 C156 152 132 174 100 174 C66 174 42 150 42 116 Z", "fill-food-olive"),
    P("M118 62 C128 44 146 38 158 42 C150 56 134 62 120 64 Z", "fill-food-stem"),
  ],
  almond: [
    P("M100 34 C138 62 162 104 158 136 C154 166 128 182 100 182 C72 182 46 166 42 136 C38 104 62 62 100 34 Z", "fill-food-nut"),
    P("M62 120 C60 142 68 160 80 170 M138 120 C140 142 132 160 120 170", "fill-none", "stroke-food-nut-deep"),
  ],
  tomato: [
    P(O(100, 120, 66, 62), "fill-food-red"),
    P("M100 56 L108 44 L112 60 L128 58 L114 70 L120 82 L100 72 L80 82 L86 70 L72 58 L88 60 L92 44 Z", "fill-food-leaf-deep"),
    P(O(61, 98, 7, 11), "fill-food-red-light"),
  ],
  cabbage: [
    P(O(100, 120, 68, 62), "fill-food-cabbage"),
    P("M60 66 C46 98 48 150 70 174 M140 66 C154 98 152 150 130 174 M100 58 V80", "fill-none", "stroke-food-cabbage-deep"),
  ],
  mushroom: [
    P("M60 96 H140 V154 Q140 180 116 180 H84 Q60 180 60 154 Z", "fill-food-cream", "stroke-food-shell-line"),
    P("M24 98 C24 60 62 38 100 38 C138 38 176 60 176 98 Z", "fill-food-mushroom", "stroke-food-mushroom-deep"),
    P(O(67, 70, 5, 4) + O(130, 62, 6, 4), "fill-food-mushroom-deep"),
  ],
  radish: [
    P("M96 68 C86 40 70 30 58 34 C62 52 80 64 96 70 Z M104 68 C114 40 130 30 142 34 C138 52 120 64 104 70 Z", "fill-food-leaf"),
    P(O(100, 124, 60, 56), "fill-food-radish"),
    P("M97 176 L100 194 L103 176 Z", "fill-food-radish"),
  ],
  lotus: [
    P(O(100, 118, 72, 64), "fill-food-shell", "stroke-food-shell-line"),
    P(O(50, 118, 10) + O(150, 118, 10) + O(85, 74, 9) + O(115, 74, 9) + O(89, 158, 9) + O(111, 158, 9), "fill-food-shell-line"),
  ],
  corn: [
    P("M62 62 C62 42 138 42 138 62 V158 C138 182 62 182 62 158 Z", "fill-food-yellow"),
    P("M62 120 C38 140 42 172 70 186 C78 170 74 150 62 120 Z M138 120 C162 140 158 172 130 186 C122 170 126 150 138 120 Z", "fill-food-pea"),
    P("M80 70 H120 M76 90 H124", "fill-none", "stroke-food-yellow-deep"),
  ],
  tangerine: [
    P(O(100, 120, 66, 60), "fill-food-tangerine"),
    P("M100 62 C110 46 128 40 140 44 C132 58 116 64 102 64 Z", "fill-food-leaf-deep"),
    P(O(62, 92, 2) + O(142, 150, 2) + O(72, 156, 2), "fill-food-tangerine-deep"),
  ],
  blueberry: [
    P(O(100, 120, 62, 58), "fill-food-berry"),
    P("M86 64 L92 54 L100 63 L108 54 L114 64 L100 72 Z", "fill-food-berry-deep"),
  ],
  peach: [
    P("M100 66 C150 50 174 100 162 140 C152 172 120 182 100 172 C80 182 48 172 38 140 C26 100 50 50 100 66 Z", "fill-food-peach"),
    P("M100 68 C94 80 94 90 98 98", "fill-none", "stroke-food-peach-deep"),
    P("M100 64 C110 44 130 38 140 44 C132 58 114 64 102 66 Z", "fill-food-leaf"),
  ],
  kiwi: [
    P(O(100, 118, 72, 62), "fill-food-kiwi-skin"),
    P(O(100, 118, 62, 52), "fill-food-kiwi"),
    P(O(100, 152, 20, 10), "fill-food-kiwi-core"),
    P(O(72, 84, 2.5, 3.5) + O(100, 76, 2.5, 3.5) + O(128, 84, 2.5, 3.5) + O(62, 148, 2.5, 3.5) + O(138, 148, 2.5, 3.5), "fill-food-nori"),
  ],
  strawberry: [
    P("M100 176 C58 164 34 122 38 92 C42 66 70 60 100 70 C130 60 158 66 162 92 C166 122 142 164 100 176 Z", "fill-food-strawberry"),
    P("M68 68 L84 56 L92 70 L100 52 L108 70 L116 56 L132 68 L100 80 Z", "fill-food-leaf-deep"),
    P(O(64, 96, 2.5, 3.5) + O(136, 96, 2.5, 3.5) + O(78, 150, 2.5, 3.5) + O(122, 150, 2.5, 3.5) + O(100, 162, 2.5, 3.5), "fill-food-pip"),
  ],
  fig: [
    P("M100 44 C112 44 116 60 124 70 C156 88 170 120 158 150 C146 178 54 178 42 150 C30 120 44 88 76 70 C84 60 88 44 100 44 Z", "fill-food-fig"),
    P("M96 46 L100 32 L104 46 Z", "fill-food-stem"),
    P("M64 150 C80 162 120 162 136 150", "fill-none", "stroke-food-fig-deep"),
  ],
};

type Face = { dots?: string; lines?: string; brows?: string; mouth: string; mouthFill?: boolean; extra?: string; extraCls?: string; blush: number; tilt?: string; hide?: boolean };
const happyArcs = "M76 112 Q82 105 88 112 M112 112 Q118 105 124 112";
const FACE: Record<PersonalityKey, Face> = {
  kind: { lines: happyArcs, mouth: "M91 122 Q100 134 109 122 Z", mouthFill: true, blush: 0.75 },
  picky: { dots: O(82, 114, 4) + O(118, 114, 4), lines: "M74 110 H90 M110 110 H126", brows: "M74 100 L90 98 M110 94 L126 99", mouth: "M92 128 Q96 124 100 128 Q104 132 108 128", blush: 0.3 },
  prim: { dots: O(118, 112, 5), lines: "M76 112 Q82 117 88 112", brows: "M111 98 Q118 93 125 98", mouth: "M96 126 Q100 123 104 126", extra: "M146 80 L150 72 L154 80 L162 84 L154 88 L150 96 L146 88 L138 84 Z", extraCls: "fill-food-pumpkin", blush: 0.6 },
  calm: { lines: "M76 112 Q82 117 88 112 M112 112 Q118 117 124 112", mouth: "M94 126 Q100 130 106 126", extra: "M140 66 H150 L140 76 H150 M156 52 H164 L156 60 H164", extraCls: "fill-none stroke-food-speck", blush: 0.5 },
  chatty: { dots: O(82, 112, 6) + O(118, 112, 6), brows: "M74 98 Q82 94 90 98 M110 98 Q118 94 126 98", mouth: "M88 120 Q100 142 112 120 Z", mouthFill: true, extra: "M152 86 L164 78 M156 98 H170 M152 110 L164 118", extraCls: "fill-none stroke-food-pumpkin", blush: 0.7 },
  brave: { dots: O(82, 112, 6) + O(118, 112, 6), brows: "M74 100 L90 97 M110 97 L126 100", mouth: "M88 120 H112 Q110 134 100 134 Q90 134 88 120 Z", mouthFill: true, extra: "M36 72 L46 82 M164 72 L154 82", extraCls: "fill-none stroke-food-pumpkin", blush: 0.6 },
  shy: { dots: O(82, 117, 3.5) + O(118, 117, 3.5), brows: "M76 104 Q82 101 88 104 M112 104 Q118 101 124 104", mouth: "M97 128 Q100 130 103 128", extra: "M152 86 C147 96 147 102 152 104 C157 102 157 96 152 86 Z", extraCls: "fill-food-sky", blush: 1 },
  odd: { dots: O(82, 112, 7) + O(118, 110, 3), mouth: "M91 122 Q100 132 109 122", extra: "M100 129 C100 138 109 138 109 128 Z", extraCls: "fill-food-red-light", blush: 0.6 },
};

/** 기분이 정하는 얼굴 — 기다려요·기록했어요는 성격 얼굴 그대로 */
function faceOf(personality: PersonalityKey, mood: MascotMood): Face {
  const base = FACE[personality] ?? FACE.kind;
  const spark = { extra: "M30 66 L40 76 M170 66 L160 76 M100 26 V38", extraCls: "fill-none stroke-food-pumpkin" };
  switch (mood) {
    case "done": case "together": return { lines: happyArcs, mouth: "M88 120 Q100 140 112 120 Z", mouthFill: true, blush: 0.9, ...spark };
    case "full": return { lines: "M75 112 Q82 118 89 112 M111 112 Q118 118 125 112", mouth: O(100, 128, 3), mouthFill: true, blush: 1, extra: "M150 120 Q156 117 162 120 M150 130 Q157 127 164 130", extraCls: "fill-none stroke-food-speck" };
    case "worried": return { dots: O(82, 114, 3.5) + O(118, 114, 3.5), brows: "M74 104 L88 100 M126 104 L112 100", mouth: "M92 128 q4 -3 8 0 q4 3 8 0", blush: 0.4, extra: "M152 86 C147 96 147 102 152 104 C157 102 157 96 152 86 Z", extraCls: "fill-food-sky" };
    case "sulk": return { dots: O(85, 115, 2.5) + O(121, 115, 2.5), lines: "M75 110 H89 M111 110 H125", mouth: "M95 129 Q100 124 105 129", blush: 0.9, tilt: "rotate(-6 100 120)", extra: "M136 52 q4 -8 12 -4 q6 -6 12 2 q6 4 2 10 h-22 q-6 -2 -4 -8 Z", extraCls: "fill-food-white stroke-food-cup-line" };
    case "away": return { mouth: "", blush: 0, hide: true, tilt: "translate(200 0) scale(-1 1)", extra: "M84 30 h32 a11 11 0 0 1 0 22 h-32 a11 11 0 0 1 0 -22 Z " + O(90, 41, 1.8) + O(100, 41, 1.8) + O(110, 41, 1.8), extraCls: "fill-food-white stroke-food-cup-line" };
    default: return base;
  }
}

const MOOD_ALT: Record<MascotMood, string> = {
  wait: "기다리는", logged: "웃는", done: "신난", full: "배부른", worried: "걱정하는", sulk: "살짝 삐진", away: "등을 돌린", together: "다 같이 신난",
};
const STAGE_SCALE: Record<StageKey, number> = { sprout: 0.78, kid: 0.86, grown: 0.94, best: 1 };

export function Buddy({ ingredient, personality, mood = "wait", stage = "grown", size = 96, className, decorative = false }: {
  ingredient: IngredientKey; personality: PersonalityKey; mood?: MascotMood; stage?: StageKey; size?: number; className?: string;
  /** 옆에 이름이 이미 있으면 true (읽기 프로그램이 두 번 읽지 않게) */
  decorative?: boolean;
}) {
  const parts = BODY[ingredient] ?? BODY.tofu;
  const f = faceOf(personality, mood);
  const s = STAGE_SCALE[stage] ?? 1;
  const label = `${MOOD_ALT[mood]} ${buddyName(ingredient, personality)}`;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={cn("shrink-0", className)}
      role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label} aria-hidden={decorative ? true : undefined}>
      <g transform={`translate(100 192) scale(${s}) translate(-100 -192)`}>
        {stage === "best" && <path d="M78 24 L84 8 L94 20 L100 4 L106 20 L116 8 L122 24 Z" className="fill-food-yolk stroke-food-yellow-deep" strokeWidth={2} strokeLinejoin="round" />}
        <g transform={f.tilt}>
          {parts.map((p, i) => <path key={i} d={p.d} className={cn(p.c, p.s)} strokeWidth={p.s ? p.w : undefined} strokeLinejoin="round" strokeLinecap="round" />)}
          {!f.hide && (
            <>
              <path d={O(67, 126, 9, 6) + O(133, 126, 9, 6)} className="fill-food-blush" opacity={f.blush} />
              {f.dots && <path d={f.dots} className="fill-food-ink" />}
              {f.lines && <path d={f.lines} className="fill-none stroke-food-ink" strokeWidth={4} strokeLinecap="round" />}
              {f.brows && <path d={f.brows} className="fill-none stroke-food-ink" strokeWidth={3.5} strokeLinecap="round" />}
              {f.mouth && <path d={f.mouth} className={cn("stroke-food-ink", f.mouthFill ? "fill-food-ink" : "fill-none")} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
            </>
          )}
        </g>
        {f.extra && <path d={f.extra} className={f.extraCls} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      </g>
    </svg>
  );
}
