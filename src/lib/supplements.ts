/**
 * 영양제 챙기기 — 내가 등록한 영양제를 오늘 먹었는지만 체크한다 (DB 없이 계산만, 시험: tests/supplements.test.ts).
 * 서버는 /api/me/supplements(등록·체크) · /api/me/buddy/chat(캐릭터가 챙기기).
 *  - 효과·먹는 양·같이 먹는 법·끊기는 말하지 않는다 (의료 영역 밖). 먹었는지 기억만 돕는다.
 *  - 때(아침·점심·저녁·아무 때나)가 지났는데 안 먹었으면 캐릭터가 하루 한 번 묻는다.
 *  - "영양제 먹었어요" · "비타민D 챙겼어" 같은 말로 체크할 수 있다.
 */
export type Timing = "morning" | "lunch" | "evening" | "any";
export const TIMINGS: { key: Timing; label: string; due: number }[] = [
  { key: "morning", label: "아침", due: 10 },
  { key: "lunch", label: "점심", due: 14 },
  { key: "evening", label: "저녁", due: 20 },
  { key: "any", label: "아무 때나", due: 12 },
];
export const timingLabel = (t: string) => TIMINGS.find((x) => x.key === t)?.label ?? "아무 때나";
export const isTiming = (t: unknown): t is Timing => TIMINGS.some((x) => x.key === t);
export const MAX_SUPPLEMENTS = 10;

export type Supp = { id: string; name: string; timing: Timing; taken: boolean };

/** 지금 챙길 때가 지났는데 아직 안 먹은 것 */
export function dueNow(items: Supp[], hour: number): Supp[] {
  return items.filter((s) => !s.taken && hour >= (TIMINGS.find((x) => x.key === s.timing)?.due ?? 12));
}

/** 먹었다는 말인가 — 이름을 말했으면 그것만, "영양제"라고 했으면 아직 안 먹은 것 전부(때가 지난 것이 있으면 그것만) */
export function takenFromText(text: string, items: Supp[], hour: number): Supp[] {
  if (!/먹었|먹음|챙겼|복용했|먹고\s*왔/.test(text)) return [];
  const t = text.replace(/\s+/g, "").toLowerCase();
  const named = items.filter((s) => !s.taken && t.includes(s.name.replace(/\s+/g, "").toLowerCase()));
  if (named.length) return named;
  if (!/영양제|약\s*챙|비타민|오메가|유산균|철분|칼슘|마그네슘|루테인|밀크씨슬|프로바이오틱스/.test(text)) return [];
  const left = items.filter((s) => !s.taken);
  const due = dueNow(left, hour);
  return due.length ? due : left;
}

/** 이름 묶기 — "비타민D·오메가3" */
export const suppNames = (items: Pick<Supp, "name">[]) => items.map((s) => s.name).join("·");
