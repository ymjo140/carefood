/**
 * 캐릭터 삐짐 알림 — 기록을 다시 하자고 부르는 알림이라 광고로 본다 (정보통신망법 제50조).
 *  - 광고 알림에 동의한 사람에게만, 제목 앞에 (광고), 끝에 받지 않는 방법. 낮 12시대에만 (밤에 보내지 않는다).
 *  - 캐릭터를 골랐고(캐릭터 없이·간단 모드 아님) '기록 안 한 날 삐지기'를 켠 사람만.
 *  - 한 번 끊길 때마다 두 번까지: 어제 처음 기록이 빠졌을 때('삐졌어요'), 사흘째 빠졌을 때('등 돌렸어요'). 오늘 기록했으면 보내지 않는다.
 */
import { addDays } from "@/lib/day";
import { LINES } from "@/lib/mascot";
import type { MascotKind } from "@/components/ui/Mascot";
import type { PushPayload } from "@/lib/push";

export const MASCOT_PUSH_HOUR = 12;
const NAMES: Record<MascotKind, string> = { kkirok: "끼록이", rami: "람이", kkinyang: "끼냥이" };

export function planMascotPush(o: { kind: MascotKind; days: Set<string>; today: string; ever: boolean }): { key: string; payload: PushPayload } | null {
  const { kind, days, today, ever } = o;
  if (!ever || days.has(today)) return null;
  const d = (n: number) => addDays(today, -n);
  const name = NAMES[kind];
  const tail = " · 받지 않으려면 마이 > 알림 설정에서 끌 수 있어요";
  // 어제 처음 빠짐: 어제 없음, 그저께 있음
  if (!days.has(d(1)) && days.has(d(2))) {
    return { key: `sulk:${d(1)}`, payload: { title: `(광고) 오늘끼록 · ${name}가 살짝 삐졌어요`, body: LINES[kind].sulk({ streak: 0, meals: 0 }) + tail, url: "/diary", tag: "mascot" } };
  }
  // 사흘째: 어제·그저께·그끄저께 없음, 그 전날 있음
  if (!days.has(d(1)) && !days.has(d(2)) && !days.has(d(3)) && days.has(d(4))) {
    return { key: `away:${d(3)}`, payload: { title: `(광고) 오늘끼록 · ${name}가 기다리고 있어요`, body: LINES[kind].away({ streak: 0, meals: 0 }) + tail, url: "/diary", tag: "mascot" } };
  }
  return null;
}
