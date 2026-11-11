#!/usr/bin/env node
/**
 * 추천 품질 재기 — 대표 프로필 8개로 /api/recommend 를 불러 상위 10개를 잰다.
 *
 *   node scripts/eval_recommend.mjs                          # 운영 (https://carefood-iota.vercel.app)
 *   node scripts/eval_recommend.mjs --base=http://localhost:3100 --out=/tmp/eval.json
 *   node scripts/eval_recommend.mjs --compare=/tmp/before.json  # 앞서 잰 것과 나란히
 *
 * 재는 것 (상위 10개)
 *   한끼·반찬   meal_role 이 meal·side 인 비율 — 홈 '오늘의 추천'은 끼니로 먹을 것이어야 한다
 *   재료 의심   이름에 생물·손질·반죽·육수·가루 같은 조리 전 재료 말이 있는 수
 *   건강 점수   health_score 평균
 *   나트륨      100g 당 나트륨 평균 (mg)
 *   당류        100g 당 당류 평균 (g)
 *   알레르기    고른 알레르기 성분이 이름·원재료에 보이는 수 — 0 이어야 한다
 *   맛          매운맛 프로필: taste_spicy ≥ 5 비율 / 순한맛 프로필: taste_spicy ≥ 5 수(0 이어야)
 *   겹침        제조사 + 이름 앞 4글자가 같은 쌍 — 맛만 다른 같은 제품이 줄줄이 나오면 늘어난다
 * 알레르기 말은 src/lib/recommend/allergy.ts 를 일부러 따로 적었다 — 같은 코드로 재면 같은 실수를 못 잡는다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const BASE = arg("base", "https://carefood-iota.vercel.app").replace(/\/$/, "");
const OUT = arg("out", "");
const COMPARE = arg("compare", "");
const TOP = 10;

const PROFILES = [
  { key: "cold", label: "처음 온 사람", body: { cold: true } },
  { key: "balanced", label: "균형", body: { profile: { goals: ["balanced"] } } },
  { key: "weight", label: "체중 감량", body: { profile: { goals: ["weight_loss"], weightKg: 82, heightCm: 172 } } },
  { key: "muscle_spicy", label: "근육 + 매운맛", body: { profile: { goals: ["muscle"], diet_type: "exercise", tastes: { salty: 5, sweet: 3, fatty: 5, spicy: 8 } } } },
  { key: "mild", label: "순한맛 · 덜 짜게", body: { profile: { goals: ["balanced"], tastes: { salty: 2, sweet: 3, fatty: 3, spicy: 1 } } } },
  { key: "bp", label: "혈압 관리", body: { profile: { goals: ["blood_pressure"], conditions: ["hypertension"] } } },
  { key: "sugar", label: "혈당 관리", body: { profile: { goals: ["diabetes"], conditions: ["diabetes"] } } },
  { key: "allergy", label: "견과·땅콩·우유 알레르기", body: { profile: { goals: ["balanced"], allergies: ["peanut", "treenut", "milk"] } } },
];

const ALLERGY = {
  peanut: /땅콩|피넛/,
  treenut: /호두|아몬드|캐슈|피스타치오|피스타키오|pistachio|마카다미아|헤이즐넛|피칸|견과|넛츠|잣/i,
  milk: /우유|유청|카제인|분유|버터|치즈|크림|연유|요구르트|요거트|라떼/,
};
const RAW = /생물|손질|반죽|육수|가루$|분말|생지|정육|찌개용|조림용|구이용|부침용|국물용|참깨|들깨|퓨레|페이스트/;

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const avg = (xs) => {
  const v = xs.filter((x) => x !== null && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

function measure(p, items) {
  const top = items.slice(0, TOP);
  const allergies = p.body.profile?.allergies || [];
  const spicy = p.body.profile?.tastes?.spicy;
  const keys = top.map((r) => `${String(r.manufacturer || "").replace(/\s|\(주\)|㈜|주식회사/g, "")}|${String(r.name || "").replace(/\s/g, "").slice(0, 4)}`);
  return {
    n: top.length,
    meal_side: top.length ? Math.round((top.filter((r) => r.meal_role === "meal" || r.meal_role === "side").length / top.length) * 100) : null,
    raw: top.filter((r) => RAW.test(String(r.name || ""))).length,
    health: avg(top.map((r) => num(r.health_score))),
    sodium: avg(top.map((r) => num(r.sodium_mg))),
    sugar: avg(top.map((r) => num(r.sugar_g))),
    allergy: allergies.length
      ? top.filter((r) => allergies.some((a) => ALLERGY[a] && (ALLERGY[a].test(String(r.name || "")) || ALLERGY[a].test(String(r.ingredients_raw || ""))))).length
      : null,
    spicy: spicy === undefined ? null
      : spicy >= 6 ? Math.round((top.filter((r) => (num(r.taste_spicy) ?? 0) >= 5).length / Math.max(1, top.length)) * 100)
      : top.filter((r) => (num(r.taste_spicy) ?? 0) >= 5).length,
    dup: keys.length - new Set(keys).size,
    names: top.map((r) => `${r.name}${r.meal_role ? ` (${r.meal_role})` : ""}`),
  };
}

async function run() {
  const out = { base: BASE, at: new Date().toISOString(), profiles: {} };
  for (const p of PROFILES) {
    const res = await fetch(`${BASE}/api/recommend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p.body) });
    if (!res.ok) { out.profiles[p.key] = { error: `HTTP ${res.status}` }; continue; }
    const data = await res.json();
    out.profiles[p.key] = measure(p, data.recommendations || []);
  }
  return out;
}

function table(cur, prev) {
  const cols = [["meal_side", "한끼·반찬 %"], ["raw", "재료 의심"], ["health", "건강 점수"], ["sodium", "나트륨 mg"], ["sugar", "당류 g"], ["allergy", "알레르기"], ["spicy", "매운맛"], ["dup", "겹침"]];
  const fmt = (k, v, pv) => (v === null || v === undefined ? "-" : prev && pv !== null && pv !== undefined && pv !== v ? `${pv}→${v}` : String(v));
  const lines = [`| 프로필 | ${cols.map((c) => c[1]).join(" | ")} |`, `|---|${cols.map(() => "---:").join("|")}|`];
  for (const p of PROFILES) {
    const m = cur.profiles[p.key] || {};
    const pm = prev?.profiles?.[p.key] || {};
    lines.push(m.error ? `| ${p.label} | ${m.error} |` : `| ${p.label} | ${cols.map(([k]) => fmt(k, m[k], prev ? pm[k] : undefined)).join(" | ")} |`);
  }
  return lines.join("\n");
}

const cur = await run();
const prev = COMPARE ? JSON.parse(readFileSync(COMPARE, "utf8")) : null;
console.log(`기준 ${BASE} · 상위 ${TOP}개\n`);
console.log(table(cur, prev));
for (const p of PROFILES) {
  const m = cur.profiles[p.key];
  if (m?.names) console.log(`\n${p.label}: ${m.names.slice(0, 6).join(" · ")}`);
}
if (OUT) writeFileSync(OUT, JSON.stringify(cur, null, 2));
