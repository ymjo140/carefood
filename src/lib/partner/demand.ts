/**
 * 수요 빈틈 — 조건별로 "찾는 사람 비율"과 "지금 살 수 있는 제품 수"를 나란히 놓는다. 서버 전용.
 * 찾는 사람은 가입할 때 고른 목표·입맛으로 짐작한다(질환 관련 값은 쓰지 않는다). 개인 단위 정보는 내보내지 않고,
 * 전체가 10명 미만이거나 그 조건에 10명 미만이면 비율을 주지 않는다.
 * 제품 수는 DB 함수 demand_gap_supply 가 센다 — 조건 키는 그 함수와 같아야 한다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const MIN_PEOPLE = 10;

export const SEGMENTS = [
  { key: "meal_high_protein", label: "단백질 많은 한 끼", rule: "한 끼에 단백질 25g 이상" },
  { key: "meal_protein_light", label: "단백질 많고 가벼운 한 끼", rule: "단백질 25g 이상 · 450kcal 이하" },
  { key: "meal_protein_low_sodium", label: "단백질 많고 나트륨 적은 한 끼", rule: "단백질 25g 이상 · 나트륨 600mg 이하" },
  { key: "meal_low_sodium", label: "나트륨 적은 한 끼", rule: "한 끼에 나트륨 600mg 이하" },
  { key: "meal_low_sugar", label: "당류 적은 한 끼", rule: "한 끼에 당류 5g 이하" },
  { key: "meal_light", label: "가벼운 한 끼", rule: "한 끼에 150~400kcal" },
  { key: "meal_high_fiber", label: "식이섬유 많은 한 끼", rule: "한 끼에 식이섬유 6g 이상" },
  { key: "snack_high_protein", label: "단백질 간식", rule: "1회에 단백질 10g 이상" },
  { key: "snack_low_sugar", label: "당류 적은 간식", rule: "1회에 당류 5g 이하" },
] as const;
export type SegmentKey = (typeof SEGMENTS)[number]["key"];

type Profile = { concerns: string[] | null; diet_type: string | null; taste_salty: number | null; taste_sweet: number | null };

/** 고른 목표·입맛 → 찾을 만한 조건 (맛 단계는 1~10, 3 이하면 그 맛을 덜 찾는 편) */
export function wants(p: Profile): SegmentKey[] {
  const out = new Set<SegmentKey>();
  const weight = (p.concerns || []).includes("weight") || p.diet_type === "diet";
  const exercise = p.diet_type === "exercise";
  const lowSalt = p.taste_salty !== null && p.taste_salty <= 3;
  const lowSweet = p.taste_sweet !== null && p.taste_sweet <= 3;
  if (weight) for (const k of ["meal_light", "meal_low_sugar", "snack_low_sugar", "meal_protein_light"] as const) out.add(k);
  if (exercise) for (const k of ["meal_high_protein", "snack_high_protein", "meal_protein_light"] as const) out.add(k);
  if ((p.concerns || []).includes("gut_health")) out.add("meal_high_fiber");
  if (lowSalt) { out.add("meal_low_sodium"); if (exercise) out.add("meal_protein_low_sodium"); }
  if (lowSweet) { out.add("meal_low_sugar"); out.add("snack_low_sugar"); }
  return [...out];
}

export type DemandRow = {
  key: SegmentKey; label: string; rule: string;
  /** 찾는 사람 비율(%) — 모이지 않았으면 null */
  share: number | null;
  supply: number; partner_supply: number; mine: number;
};

export async function buildDemand(sb: Sb, partnerId: string): Promise<{ people: number | null; segments: DemandRow[] }> {
  const [pr, su] = await Promise.all([
    sb.from("user_profiles").select("concerns, diet_type, taste_salty, taste_sweet").eq("onboarding_completed", true).limit(100000),
    sb.rpc("demand_gap_supply", { p_partner: partnerId }),
  ]);
  if (pr.error || su.error) throw new Error((pr.error || su.error).message);
  const profiles = (pr.data || []) as Profile[];
  const tally = new Map<string, number>();
  for (const p of profiles) for (const k of wants(p)) tally.set(k, (tally.get(k) || 0) + 1);
  const supply = new Map<string, { supply: number; partner_supply: number; mine: number }>(
    ((su.data || []) as { segment: string; supply: number; partner_supply: number; mine: number }[])
      .map((r) => [r.segment, { supply: Number(r.supply), partner_supply: Number(r.partner_supply), mine: Number(r.mine) }]),
  );
  const enough = profiles.length >= MIN_PEOPLE;
  const segments: DemandRow[] = SEGMENTS.map((s) => {
    const n = tally.get(s.key) || 0;
    const sp = supply.get(s.key) || { supply: 0, partner_supply: 0, mine: 0 };
    return { ...s, share: enough && n >= MIN_PEOPLE ? Math.round((n / profiles.length) * 100) : null, ...sp };
  });
  // 빈틈이 큰 순 — 찾는 사람이 많고 제품이 적을수록 앞. 비율을 모르는 조건은 제품이 적은 순으로 뒤에
  const gap = (r: DemandRow) => (r.share === null ? -1 : r.share / Math.log2(r.supply + 2));
  segments.sort((a, b) => gap(b) - gap(a) || a.supply - b.supply);
  return { people: enough ? Math.floor(profiles.length / 10) * 10 : null, segments };
}
