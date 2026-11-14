/**
 * 캐릭터 삐짐 알림 — 기록을 다시 하자고 부르는 알림이라 광고로 본다 (정보통신망법 제50조).
 *  - 광고 알림에 동의한 사람에게만, 제목 앞에 (광고), 끝에 받지 않는 방법. 낮 12시대에만 (밤에 보내지 않는다).
 *  - 캐릭터를 보이게 둔 사람만 ('캐릭터 없이'면 보내지 않는다). 같이 다니는 재료 캐릭터의 이름·말투로, 아직 없으면 끼록이로.
 *  - 한 번 끊길 때마다 두 번까지: 어제 처음 기록이 빠졌을 때('삐졌어요'), 사흘째 빠졌을 때('등 돌렸어요'). 오늘 기록했으면 보내지 않는다.
 */
import { addDays } from "@/lib/day";
import { LINES } from "@/lib/mascot";
import { buddyName, josa, seedOf } from "@/lib/buddy";
import { buddyLine } from "@/lib/buddy-lines";
import type { PushPayload } from "@/lib/push";

export const MASCOT_PUSH_HOUR = 12;

/** 알림에 나오는 캐릭터 — 이름과 '삐졌어요'·'등 돌렸어요' 한 줄 */
export type PushWho = { name: string; sulk: string; away: string };
/** 아직 보자기를 안 푼 사람은 브랜드 마스코트 끼록이로 */
export const KKIROK_WHO: PushWho = { name: "끼록이", sulk: LINES.kkirok.sulk({ streak: 0, meals: 0 }), away: LINES.kkirok.away({ streak: 0, meals: 0 }) };
export function buddyWho(ingredient: string, personality: string, seedKey: string): PushWho {
  const ctx = { days: 0, seed: seedOf(seedKey) };
  return { name: buddyName(ingredient, personality), sulk: buddyLine(ingredient, personality, "sulk", ctx), away: buddyLine(ingredient, personality, "away", ctx) };
}

export function planMascotPush(o: { who: PushWho; days: Set<string>; today: string; ever: boolean }): { key: string; payload: PushPayload } | null {
  const { who, days, today, ever } = o;
  if (!ever || days.has(today)) return null;
  const d = (n: number) => addDays(today, -n);
  const name = who.name;
  const ga = josa(name, "이", "가");
  const tail = " · 받지 않으려면 마이 > 알림 설정에서 끌 수 있어요";
  // 어제 처음 빠짐: 어제 없음, 그저께 있음
  if (!days.has(d(1)) && days.has(d(2))) {
    return { key: `sulk:${d(1)}`, payload: { title: `(광고) 오늘끼록 · ${name}${ga} 살짝 삐졌어요`, body: who.sulk + tail, url: "/diary", tag: "mascot" } };
  }
  // 사흘째: 어제·그저께·그끄저께 없음, 그 전날 있음
  if (!days.has(d(1)) && !days.has(d(2)) && !days.has(d(3)) && days.has(d(4))) {
    return { key: `away:${d(3)}`, payload: { title: `(광고) 오늘끼록 · ${name}${ga} 기다리고 있어요`, body: who.away + tail, url: "/diary", tag: "mascot" } };
  }
  return null;
}
