import { cn } from "./cn";

/**
 * 캐릭터 — 끼록이(일력) · 람이(다람쥐) · 끼냥이(고양이). 내 화면(챌린지·기록·인증 카드)에만 나온다. 가족 화면에는 쓰지 않는다.
 * 표정 8가지: 기다려요 · 기록했어요 · 해냈어요 · 배불러요 · 걱정돼요 · 삐졌어요 · 등 돌렸어요 · 다 같이 해냈어요.
 * 몸 크기는 바뀌지 않는다 — 배불러요는 볼·배 표정만, 그날만.
 * 색은 캐릭터 전용 토큰(mascot-*)만 쓴다 — 두 테마에 같은 값, 앱 화면 강조색 규칙 밖의 일러스트 예외.
 */
export type MascotKind = "kkirok" | "rami" | "kkinyang";
export type MascotMood = "wait" | "logged" | "done" | "full" | "worried" | "sulk" | "away" | "together";

export const MASCOTS: { kind: MascotKind; name: string; about: string }[] = [
  { kind: "kkirok", name: "끼록이", about: "오늘끼록 일력" },
  { kind: "rami", name: "람이", about: "다람쥐 · 기록을 도토리처럼" },
  { kind: "kkinyang", name: "끼냥이", about: "고양이 · 살짝 새침" },
];

const MOOD_ALT: Record<MascotMood, string> = {
  wait: "기다리는", logged: "손을 흔드는", done: "두 팔을 들고 기뻐하는", full: "배를 감싸고 졸린 눈을 한", worried: "배를 잡고 걱정하는",
  sulk: "팔짱 끼고 고개를 돌린", away: "등을 돌리고 앉은", together: "손을 잡고 웃는",
};

type Geo = { x1: number; x2: number; y: number; mx: number; my: number; sl: [number, number]; sr: [number, number] };
const GEO: Record<MascotKind, Geo> = {
  kkirok: { x1: 48, x2: 72, y: 80, mx: 60, my: 93, sl: [19, 78], sr: [101, 78] },
  rami: { x1: 43, x2: 69, y: 54, mx: 56, my: 71, sl: [34, 88], sr: [78, 88] },
  kkinyang: { x1: 47, x2: 73, y: 58, mx: 60, my: 72, sl: [40, 90], sr: [80, 90] },
};

const circ = (x: number, y: number, r: number) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** 표정 — 눈·눈썹·입·몸짓·주변 표시 */
function faceOf(mood: MascotMood, kind: MascotKind) {
  const G = GEO[kind];
  const arc = (x: number) => `M${x - 5} ${G.y + 2} Q${x} ${G.y - 4} ${x + 5} ${G.y + 2}`;
  const openM = (w: number, d: number) => `M${G.mx - w} ${G.my - 1} Q${G.mx} ${G.my + d} ${G.mx + w} ${G.my - 1} Z`;
  const catW = `M${G.mx - 6} ${G.my} Q${G.mx - 3} ${G.my + 3} ${G.mx} ${G.my} Q${G.mx + 3} ${G.my + 3} ${G.mx + 6} ${G.my}`;
  const f = { eyes: "", eyesFill: false, brows: "", mouth: "", mouthFill: false, extra: "", spark: "", tilt: "", face: true, arms: true, cheek: 6, aL: 20, aR: -20 };
  const smile = kind === "kkinyang" ? catW : `M${G.mx - 6} ${G.my} Q${G.mx} ${G.my + 5} ${G.mx + 6} ${G.my}`;
  switch (mood) {
    case "wait": f.eyes = `${circ(G.x1, G.y, 3.4)} ${circ(G.x2, G.y, 3.4)}`; f.eyesFill = true; f.mouth = smile; break;
    case "logged": f.eyes = `${arc(G.x1)} ${arc(G.x2)}`; f.mouth = kind === "kkinyang" ? catW : openM(6, 9); f.mouthFill = kind !== "kkinyang"; f.aR = -150; break;
    case "done": f.eyes = `${arc(G.x1)} ${arc(G.x2)}`; f.mouth = openM(8, 12); f.mouthFill = true; f.aL = 150; f.aR = -150; f.cheek = 7.5;
      f.spark = "M8 24 L15 31 M112 24 L105 31 M60 0 V7 M22 6 L26 12 M98 6 L94 12"; break;
    case "full": f.eyes = `M${G.x1 - 5} ${G.y} Q${G.x1} ${G.y + 4} ${G.x1 + 5} ${G.y} M${G.x2 - 5} ${G.y} Q${G.x2} ${G.y + 4} ${G.x2 + 5} ${G.y}`;
      f.mouth = circ(G.mx, G.my + 1, 2.2); f.mouthFill = true; f.cheek = 10; f.aL = -50; f.aR = 50; f.extra = `M100 ${G.y + 8} Q105 ${G.y + 6} 110 ${G.y + 8} M100 ${G.y + 15} Q106 ${G.y + 13} 113 ${G.y + 15}`; break;
    case "worried": f.eyes = `${circ(G.x1, G.y + 1, 3)} ${circ(G.x2, G.y + 1, 3)}`; f.eyesFill = true;
      f.brows = `M${G.x1 - 6} ${G.y - 5} L${G.x1 + 4} ${G.y - 9} M${G.x2 + 6} ${G.y - 5} L${G.x2 - 4} ${G.y - 9}`;
      f.mouth = `M${G.mx - 7} ${G.my + 2} q3.5 -3 7 0 q3.5 3 7 0`; f.aL = -50; f.aR = 50;
      f.extra = `M102 ${G.y - 16} Q107 ${G.y - 8} 102 ${G.y - 3} Q97 ${G.y - 8} 102 ${G.y - 16} Z`; break;
    case "sulk": f.eyes = `M${G.x1 - 6} ${G.y - 3} H${G.x1 + 6} M${G.x2 - 6} ${G.y - 3} H${G.x2 + 6} ${circ(G.x1 + 3, G.y + 1, 1.8)} ${circ(G.x2 + 3, G.y + 1, 1.8)}`;
      f.eyesFill = true; f.mouth = `M${G.mx - 5} ${G.my + 3} Q${G.mx} ${G.my - 2} ${G.mx + 5} ${G.my + 3}`; f.cheek = 8; f.aL = -80; f.aR = 80;
      f.tilt = "rotate(-6 60 80)"; f.extra = "M97 10 q3 -6 9 -3 q5 -4 9 2 q4 3 1 7 h-17 q-4 -2 -2 -6 Z"; break;
    case "away": f.face = false; f.arms = false; f.tilt = "rotate(6 60 90)";
      f.extra = `M90 2 h18 a9 9 0 0 1 0 18 h-18 a9 9 0 0 1 0 -18 Z ${circ(93, 11, 1)} ${circ(99, 11, 1)} ${circ(105, 11, 1)}`; break;
    case "together": f.eyes = `${arc(G.x1)} ${arc(G.x2)}`; f.mouth = openM(6, 9); f.mouthFill = true; f.aL = 75; f.aR = -75; break;
  }
  return f;
}

function Arms({ kind, f, cls }: { kind: MascotKind; f: ReturnType<typeof faceOf>; cls: string }) {
  if (!f.arms) return null;
  const G = GEO[kind];
  const w = kind === "kkirok" ? 13 : 10, h = kind === "kkirok" ? 24 : 21;
  return (
    <>
      <rect x={-w / 2} y={0} width={w} height={h} rx={w / 2} className={cls} transform={`translate(${G.sl[0]} ${G.sl[1]}) rotate(${f.aL})`} />
      <rect x={-w / 2} y={0} width={w} height={h} rx={w / 2} className={cls} transform={`translate(${G.sr[0]} ${G.sr[1]}) rotate(${f.aR})`} />
    </>
  );
}

function Face({ f }: { f: ReturnType<typeof faceOf> }) {
  return (
    <>
      <path d={f.eyes} className={cn("stroke-mascot-ink", f.eyesFill ? "fill-mascot-ink" : "fill-none")} strokeWidth={3} strokeLinecap="round" />
      {f.brows && <path d={f.brows} className="fill-none stroke-mascot-ink" strokeWidth={2.5} strokeLinecap="round" />}
      <path d={f.mouth} className={cn("stroke-mascot-ink", f.mouthFill ? "fill-mascot-ink" : "fill-none")} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function Body({ kind, mood, streak }: { kind: MascotKind; mood: MascotMood; streak?: number | null }) {
  const f = faceOf(mood, kind);
  if (kind === "kkirok") {
    return (
      <g transform={f.tilt || undefined}>
        <rect x={42} y={114} width={12} height={18} rx={6} className="fill-mascot-tomato" />
        <rect x={66} y={114} width={12} height={18} rx={6} className="fill-mascot-tomato" />
        <Arms kind={kind} f={f} cls="fill-mascot-tomato" />
        <rect x={20} y={30} width={80} height={90} rx={mood === "full" ? 28 : 20} className="fill-mascot-cream stroke-mascot-tomato" strokeWidth={3} />
        <path d="M21.5 56 V50 Q21.5 31.5 40 31.5 H80 Q98.5 31.5 98.5 50 V56 Z" className="fill-mascot-tomato" />
        {mood === "done" && streak ? <text x={60} y={50} textAnchor="middle" fontSize={13} fontWeight={700} className="fill-mascot-cream">{streak}일</text> : null}
        <rect x={38} y={18} width={8} height={22} rx={4} className="fill-mascot-cream stroke-mascot-tomato" strokeWidth={3} />
        <rect x={74} y={18} width={8} height={22} rx={4} className="fill-mascot-cream stroke-mascot-tomato" strokeWidth={3} />
        {f.face ? (
          <>
            <ellipse cx={36} cy={94} rx={f.cheek} ry={4.5} className="fill-mascot-tomato" opacity={0.25} />
            <ellipse cx={84} cy={94} rx={f.cheek} ry={4.5} className="fill-mascot-tomato" opacity={0.25} />
            <Face f={f} />
          </>
        ) : (
          <path d="M36 82 H84 M36 94 H84 M36 106 H70" className="fill-none stroke-mascot-mute" opacity={0.3} strokeWidth={2} strokeLinecap="round" />
        )}
      </g>
    );
  }
  if (kind === "rami") {
    return (
      <g transform={f.tilt || undefined}>
        <path d="M78 122 C116 118 122 74 106 50 C96 34 76 40 84 58 C92 74 96 96 74 106 Z" className="fill-mascot-tail" />
        <path d="M92 60 C101 74 103 94 90 106" className="fill-none stroke-mascot-tail-line" strokeWidth={4} strokeLinecap="round" />
        <ellipse cx={44} cy={128} rx={9} ry={5} className="fill-mascot-tail" />
        <ellipse cx={68} cy={128} rx={9} ry={5} className="fill-mascot-tail" />
        <ellipse cx={56} cy={100} rx={28} ry={28} className="fill-mascot-chestnut" />
        <ellipse cx={56} cy={106} rx={17} ry={19} className="fill-mascot-belly" />
        <Arms kind={kind} f={f} cls="fill-mascot-tail" />
        <path d="M30 44 L32 16 L48 34 Z" className="fill-mascot-chestnut" /><path d="M33 40 L34 24 L43 34 Z" className="fill-mascot-ear" />
        <path d="M82 44 L80 16 L64 34 Z" className="fill-mascot-chestnut" /><path d="M79 40 L78 24 L69 34 Z" className="fill-mascot-ear" />
        <ellipse cx={56} cy={58} rx={32} ry={27} className="fill-mascot-chestnut" />
        {f.face && (
          <>
            <ellipse cx={56} cy={68} rx={15} ry={10} className="fill-mascot-belly" />
            <ellipse cx={32} cy={66} rx={f.cheek} ry={4.5} className="fill-mascot-cheek" opacity={0.5} />
            <ellipse cx={80} cy={66} rx={f.cheek} ry={4.5} className="fill-mascot-cheek" opacity={0.5} />
            <ellipse cx={56} cy={63.5} rx={3} ry={2.2} className="fill-mascot-ink" />
            <Face f={f} />
          </>
        )}
      </g>
    );
  }
  return (
    <g transform={f.tilt || undefined}>
      <path d="M40 124 C10 124 6 96 14 82 C18 74 28 76 24 86 C20 96 22 110 42 112 Z" className="fill-mascot-gray-dark" />
      <ellipse cx={48} cy={128} rx={9} ry={5} className="fill-mascot-white stroke-mascot-gray" strokeWidth={1.5} />
      <ellipse cx={72} cy={128} rx={9} ry={5} className="fill-mascot-white stroke-mascot-gray" strokeWidth={1.5} />
      <ellipse cx={60} cy={102} rx={26} ry={26} className="fill-mascot-gray" />
      <ellipse cx={60} cy={108} rx={15} ry={17} className="fill-mascot-white" />
      <Arms kind={kind} f={f} cls="fill-mascot-gray-dark" />
      <path d="M30 48 L30 16 L54 36 Z" className="fill-mascot-gray" /><path d="M34 42 L34 24 L48 36 Z" className="fill-mascot-pink" />
      <path d="M90 48 L90 16 L66 36 Z" className="fill-mascot-gray" /><path d="M86 42 L86 24 L72 36 Z" className="fill-mascot-pink" />
      <ellipse cx={60} cy={60} rx={34} ry={28} className="fill-mascot-gray" />
      <path d="M54 34 V42 M60 33 V43 M66 34 V42" className="fill-none stroke-mascot-stripe" strokeWidth={3} strokeLinecap="round" />
      {f.face && (
        <>
          <ellipse cx={60} cy={70} rx={13} ry={9} className="fill-mascot-white" />
          <ellipse cx={36} cy={68} rx={f.cheek} ry={4.5} className="fill-mascot-nose" opacity={0.45} />
          <ellipse cx={84} cy={68} rx={f.cheek} ry={4.5} className="fill-mascot-nose" opacity={0.45} />
          <path d="M28 65 H40 M28 72 L40 70 M92 65 H80 M92 72 L80 70" className="fill-none stroke-mascot-stripe" strokeWidth={1.8} strokeLinecap="round" />
          <path d="M57 64.5 H63 L60 68 Z" className="fill-mascot-nose stroke-mascot-nose" strokeWidth={1.5} strokeLinejoin="round" />
          <Face f={f} />
        </>
      )}
    </g>
  );
}

function One({ kind, mood, size, streak, label }: { kind: MascotKind; mood: MascotMood; size: number; streak?: number | null; label?: string }) {
  const f = faceOf(mood, kind);
  return (
    <svg viewBox="0 0 120 140" width={size} height={Math.round((size * 140) / 120)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0">
      <Body kind={kind} mood={mood} streak={streak} />
      {f.extra && <path d={f.extra} className="fill-none stroke-mascot-mute" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {f.spark && <path d={f.spark} className="fill-none stroke-brand" strokeWidth={3} strokeLinecap="round" />}
    </svg>
  );
}

/** 캐릭터 한 마리 (다 같이 해냈어요는 세 마리가 손을 잡는다) */
export function Mascot({ kind, mood, size = 96, streak, className }: {
  kind: MascotKind; mood: MascotMood; size?: number; streak?: number | null; className?: string;
}) {
  const name = MASCOTS.find((m) => m.kind === kind)?.name ?? "캐릭터";
  const label = `${MOOD_ALT[mood]} ${name}`;
  if (mood === "together") {
    return (
      <span role="img" aria-label={label} className={cn("inline-flex items-end -space-x-2", className)}>
        {[0, 1, 2].map((i) => <One key={i} kind={kind} mood={mood} size={Math.round(size * 0.62)} />)}
      </span>
    );
  }
  return <span className={cn("inline-flex", className)}><One kind={kind} mood={mood} size={size} streak={streak} label={label} /></span>;
}
