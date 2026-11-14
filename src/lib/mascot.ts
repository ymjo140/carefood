/**
 * 캐릭터가 지금 어떤 표정으로 무슨 말을 하나 — 화면(설정·챌린지)과 서버(/api/me/mascot)가 같이 쓴다.
 * 규칙 (기획: claude/캐릭터-가족관리-기획.md)
 *  - 몸은 그대로. '배불러요'는 오늘 열량이 목표의 110%를 넘고 두 끼 이상 기록한 날만, 다음 날 아침이면 원래대로.
 *  - 적게 먹어도 칭찬하지 않는다. 목표의 70% 미만인 날이 어제까지 3일 이어지면 '걱정돼요'.
 *  - 삐짐은 어제 기록이 하나도 없을 때만, 한 끼 적으면 바로 풀린다. 3일 넘게 없으면 등을 돌리고, 돌아오면 반가워한다.
 *  - 돌아온 사람을 탓하는 말은 쓰지 않는다. 숫자는 이어진 날 수만.
 * 끄기: 삐지기(sulk=false 면 삐짐·등 돌림 대신 기다려요), 배불러요·걱정돼요(moods=false 면 그 표정 대신 기록했어요/기다려요).
 */
import type { MascotKind, MascotMood } from "@/components/ui/Mascot";

export type MascotPrefs = { kind: MascotKind | "none"; sulk: boolean; moods: boolean; simple: boolean };
export const DEFAULT_PREFS: MascotPrefs = { kind: "kkirok", sulk: true, moods: true, simple: false };
export const MASCOT_KINDS = ["kkirok", "rami", "kkinyang", "none"] as const;

export type MascotFacts = {
  todayRecords: number;
  /** 오늘 끼니로 센 수 (150kcal 이상 아침·점심·저녁) */
  todayMeals: number;
  todayKcal: number;
  goalKcal: number;
  /** 어제부터 거꾸로 하루씩 — 그날 기록 수와 열량 (최소 3일) */
  past: { records: number; kcal: number }[];
  /** 기록을 한 번이라도 한 적이 있나 (처음 온 사람은 삐지지 않는다) */
  ever: boolean;
  doneToday: boolean;
  togetherToday: boolean;
  /** 오늘까지 이어서 기록한 날 수 */
  streak: number;
};

export type MascotState = { mood: MascotMood; welcomeBack: boolean };

export function moodOf(f: MascotFacts, p: Pick<MascotPrefs, "sulk" | "moods">): MascotState {
  const missed = (n: number) => f.past.length >= n && f.past.slice(0, n).every((d) => d.records === 0);
  const lowDays = f.past.length >= 3 && f.past.slice(0, 3).every((d) => d.records > 0 && d.kcal < f.goalKcal * 0.7);
  if (f.todayRecords > 0) {
    const welcomeBack = missed(3);
    if (f.togetherToday) return { mood: "together", welcomeBack };
    if (f.doneToday) return { mood: "done", welcomeBack };
    if (p.moods && f.todayMeals >= 2 && f.todayKcal > f.goalKcal * 1.1) return { mood: "full", welcomeBack };
    if (p.moods && lowDays) return { mood: "worried", welcomeBack };
    return { mood: "logged", welcomeBack };
  }
  if (f.ever && p.sulk && missed(3)) return { mood: "away", welcomeBack: false };
  if (f.ever && p.sulk && missed(1)) return { mood: "sulk", welcomeBack: false };
  if (p.moods && lowDays) return { mood: "worried", welcomeBack: false };
  return { mood: "wait", welcomeBack: false };
}

type Ctx = { streak: number; meals: number };
type Lines = Record<MascotMood, (c: Ctx) => string> & { back: (c: Ctx) => string };
const left = (m: number) => (m >= 3 ? "오늘 세 끼 다 적었어요" : m === 2 ? "저녁만 남았어요" : m === 1 ? "두 끼 남았어요" : "한 끼 더 적어 볼까요?");

export const LINES: Record<MascotKind, Lines> = {
  kkirok: {
    wait: () => "오늘 첫 끼 뭐 먹었어요?",
    logged: (c) => `기록했어요. ${left(c.meals)}`,
    done: (c) => (c.streak > 1 ? `오늘 해냈어요! ${c.streak}일째 이어 가요` : "오늘 해냈어요!"),
    full: () => "오늘은 배불러요. 내일 다시 같이 해요",
    worried: () => "요즘 기록이 목표보다 많이 적어요. 구간을 바꾸거나 쉬어 갈까요?",
    sulk: () => "어제는 하나도 안 적었어요… 오늘은 같이 적어요",
    away: () => "며칠째 기다리고 있어요. 한 끼부터 적어요",
    together: () => "오늘 다 같이 해냈어요",
    back: () => "다시 와 줘서 반가워요. 오늘 한 끼부터 같이 적어요",
  },
  rami: {
    wait: () => "오늘 첫 도토리는 뭐예요?",
    logged: (c) => `도토리를 모았어요. ${left(c.meals)}`,
    done: (c) => (c.streak > 1 ? `오늘 도토리 다 모았어요! ${c.streak}일째예요` : "오늘 도토리 다 모았어요!"),
    full: () => "볼까지 꽉 찼어요. 내일 다시 같이 해요",
    worried: () => "요즘 기록이 목표보다 많이 적어요. 구간을 바꾸거나 쉬어 갈까요?",
    sulk: () => "어제는 도토리를 하나도 못 모았어요…",
    away: () => "도토리 굴에서 기다리고 있어요",
    together: () => "다 같이 도토리를 모았어요",
    back: () => "다시 와 줘서 반가워요. 오늘 도토리 하나부터 모아요",
  },
  kkinyang: {
    wait: () => "오늘 뭐 먹었는지… 알려 줄 거죠?",
    logged: (c) => `기록했네요. ${left(c.meals)}`,
    done: (c) => (c.streak > 1 ? `해냈어요. ${c.streak}일째예요. 조금 대단해요` : "해냈어요. 조금 대단해요"),
    full: () => "배불러서 꼼짝하기 싫어요. 내일 다시 해요",
    worried: () => "요즘 기록이 목표보다 많이 적어요. 구간을 바꾸거나 쉬어 갈까요?",
    sulk: () => "어제는 하나도 안 적었죠. 흥",
    away: () => "등 돌리고 기다리는 중이에요",
    together: () => "다 같이 해냈어요. 골골",
    back: () => "…왔어요? 기다린 건 아니에요",
  },
};

export function lineOf(kind: MascotKind, s: MascotState, c: Ctx) {
  const L = LINES[kind];
  return s.welcomeBack ? L.back(c) : L[s.mood](c);
}

export function cleanPrefs(raw: Partial<Record<keyof MascotPrefs, unknown>>, base: MascotPrefs = DEFAULT_PREFS): MascotPrefs {
  const kind = (MASCOT_KINDS as readonly string[]).includes(String(raw.kind)) ? (raw.kind as MascotPrefs["kind"]) : base.kind;
  const b = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return { kind, sulk: b(raw.sulk, base.sulk), moods: b(raw.moods, base.moods), simple: b(raw.simple, base.simple) };
}
