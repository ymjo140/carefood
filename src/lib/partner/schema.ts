/**
 * 입점 업체 제품 양식 — 엑셀·피드·API 가 모두 이 필드 목록을 쓴다 (설계: Claude Docs "케어푸드 입점 업체 데이터 연동 구조").
 * 서버·스크립트(엑셀 양식 만들기) 양쪽에서 쓰므로 브라우저·Node 전용 API 를 쓰지 않는다.
 *
 * 원칙
 * - 포장 표시사항에 적힌 값을 적힌 기준 그대로 받는다(100g·1회·포장 전체). 100g 기준 환산은 우리가 한다.
 * - 우리 태그·점수는 업체 문구가 아니라 수치로 계산한다. 효능·질병 표현은 받더라도 검수로 보낸다.
 */

/* ───── 코드표 ───── */

/** 카테고리 → 우리 분류(dish_category)와 끼니 역할(meal_role) 기본값 */
export const CATEGORIES = {
  lunchbox: { label: "도시락", dish: "set", role: "meal" },
  salad: { label: "샐러드", dish: "salad", role: "meal" },
  rice: { label: "밥·덮밥·볶음밥", dish: "rice", role: "meal" },
  soup: { label: "국·탕·찌개", dish: "soup", role: "meal" },
  noodle: { label: "면·파스타", dish: "noodle", role: "meal" },
  porridge: { label: "죽", dish: "rice", role: "meal" },
  protein: { label: "닭가슴살·고기 요리", dish: "grill", role: "meal" },
  side: { label: "반찬", dish: "side", role: "side" },
  snack: { label: "간식·단백질바", dish: "snack", role: "snack" },
  dairy: { label: "요거트·유제품", dish: "dairy", role: "snack" },
  drink: { label: "음료·쉐이크", dish: "beverage", role: "drink" },
  bread: { label: "빵·시리얼", dish: "other", role: "snack" },
} as const;
export type CategoryCode = keyof typeof CATEGORIES;

export const MEAL_ROLES = { meal: "한 끼", side: "반찬", snack: "간식", drink: "음료" } as const;

/** 알레르기 유발물질 — 식품등의 표시기준 목록 (조개류는 굴·전복·홍합 포함) */
export const ALLERGENS = {
  egg: "알류", milk: "우유", buckwheat: "메밀", peanut: "땅콩", soybean: "대두", wheat: "밀",
  mackerel: "고등어", crab: "게", shrimp: "새우", pork: "돼지고기", peach: "복숭아", tomato: "토마토",
  sulfite: "아황산류", walnut: "호두", chicken: "닭고기", beef: "쇠고기", squid: "오징어",
  shellfish: "조개류", pine_nut: "잣",
} as const;
export type AllergenCode = keyof typeof ALLERGENS;

/** 원재료명에 이 말이 있는데 알레르기 목록에 없으면 검수로 (흔한 표기만 — 놓쳐도 검수자가 본다) */
const ALLERGEN_WORDS: Record<AllergenCode, RegExp> = {
  egg: /계란|달걀|난백|난황|전란|메추리알|알류/,
  milk: /우유|유청|치즈|버터|분유|크림|연유|카제인|유당/,
  buckwheat: /메밀/,
  peanut: /땅콩/,
  soybean: /대두|콩|두부|간장|된장|두유|레시틴/,
  wheat: /밀가루|소맥|밀(?!리|크)|글루텐|빵가루/,
  mackerel: /고등어/,
  crab: /게살|꽃게|대게|홍게|(?<![가-힣])게(?![가-힣])/,
  shrimp: /새우/,
  pork: /돼지|돈육|베이컨|햄(?!버)/,
  peach: /복숭아/,
  tomato: /토마토/,
  sulfite: /아황산|메타중아황산|이산화황/,
  walnut: /호두/,
  chicken: /닭|계육|치킨/,
  beef: /쇠고기|소고기|우육|한우|사골|우지/,
  squid: /오징어/,
  shellfish: /조개|굴|전복|홍합|바지락|가리비|모시조개/,
  pine_nut: /잣/,
};

export const STORAGE = { frozen: "냉동", chilled: "냉장", room: "실온" } as const;
export const STATUS = { on_sale: "판매 중", sold_out: "품절", discontinued: "판매 종료" } as const;
export const CHANNELS = { own_mall: "자사몰", smartstore: "스마트스토어", coupang: "쿠팡", kurly: "컬리", other: "기타" } as const;
export const NUTRITION_BASIS = { "100g": "100g(ml) 당", serving: "1회 제공량 당", pack: "포장 전체" } as const;
export const NUTRITION_SOURCE = { label: "포장 표시사항", lab: "시험성적서", calculated: "배합비 계산" } as const;
export const SHIPPING = { dawn: "새벽배송", parcel: "택배", same_day: "당일배송" } as const;

/* ───── 필드 정의 ───── */

export type FieldType = "text" | "int" | "num" | "url" | "date" | "enum" | "list";
export type Need = "필수" | "식단 서비스 필수" | "권장" | "선택";
export type Field = {
  key: string;
  label: string;
  need: Need;
  type: FieldType;
  /** 엑셀 안내 칸에 쓰는 설명 */
  help: string;
  example: string;
  enumOf?: Record<string, string>;
  max?: number;
  /** 바뀌면 사람 검수 (영양·원재료·알레르기·이름) */
  content?: boolean;
};

const NUT = (key: string, label: string, unit: string, need: Need, example: string): Field => ({
  key, label: `${label} (${unit})`, need, type: "num", help: `영양성분 기준(nutrition_basis)에 적힌 그대로, ${unit}`, example, content: true,
});

export const FIELDS: Field[] = [
  { key: "partner_sku", label: "제품 코드", need: "필수", type: "text", max: 64, help: "업체 안에서 겹치지 않는 코드. 바꾸면 다른 제품이 돼요", example: "GR-2611-014" },
  { key: "name", label: "제품명", need: "필수", type: "text", max: 80, help: "화면에 보일 이름", example: "닭가슴살 현미 볶음밥 도시락", content: true },
  { key: "brand", label: "브랜드", need: "필수", type: "text", max: 40, help: "", example: "예시브랜드" },
  { key: "manufacturer", label: "제조원", need: "권장", type: "text", max: 60, help: "표시사항의 제조원", example: "예시식품(주)" },
  { key: "report_no", label: "품목보고번호", need: "권장", type: "text", max: 20, help: "포장에 인쇄된 번호(숫자만). 식단 서비스 메뉴는 없으면 비워요", example: "20230123456789" },
  { key: "barcode", label: "바코드", need: "권장", type: "text", max: 14, help: "GTIN-13 (13자리)", example: "8801234567890" },
  { key: "food_type", label: "식품유형", need: "권장", type: "text", max: 40, help: "표시사항의 식품유형", example: "즉석조리식품" },
  { key: "category", label: "카테고리", need: "필수", type: "enum", enumOf: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])), help: "코드표에서 하나", example: "lunchbox" },
  { key: "meal_role_hint", label: "먹는 역할", need: "선택", type: "enum", enumOf: MEAL_ROLES, help: "한 끼·반찬·간식·음료. 비우면 카테고리로 정해요", example: "meal" },

  { key: "total_weight", label: "총 내용량", need: "필수", type: "num", help: "포장 하나의 무게(g) 또는 부피(ml)", example: "300" },
  { key: "weight_unit", label: "용량 단위", need: "선택", type: "enum", enumOf: { g: "g", ml: "ml" }, help: "비우면 g", example: "g" },
  { key: "serving_size", label: "1회 제공량", need: "필수", type: "num", help: "한 번 먹는 양. 포장 하나를 다 먹으면 총 내용량과 같게", example: "300" },
  { key: "pack_count", label: "판매 단위 개수", need: "필수", type: "int", help: "한 번 주문에 들어 있는 포장 수. 낱개 1, \"24개입\"은 24", example: "1" },

  { key: "nutrition_basis", label: "영양성분 기준", need: "필수", type: "enum", enumOf: NUTRITION_BASIS, help: "아래 영양 값이 무엇 당인지", example: "serving", content: true },
  { key: "nutrition_source", label: "영양성분 출처", need: "필수", type: "enum", enumOf: NUTRITION_SOURCE, help: "표시 의무가 없는 메뉴는 시험성적서·배합비 계산", example: "label", content: true },
  NUT("calories_kcal", "열량", "kcal", "필수", "420"),
  NUT("sodium_mg", "나트륨", "mg", "필수", "640"),
  NUT("carbs_g", "탄수화물", "g", "필수", "52"),
  NUT("sugars_g", "당류", "g", "필수", "6"),
  NUT("fat_g", "지방", "g", "필수", "11"),
  NUT("trans_fat_g", "트랜스지방", "g", "필수", "0"),
  NUT("saturated_fat_g", "포화지방", "g", "필수", "3"),
  NUT("cholesterol_mg", "콜레스테롤", "mg", "필수", "55"),
  NUT("protein_g", "단백질", "g", "필수", "28"),
  NUT("fiber_g", "식이섬유", "g", "선택", "4"),
  NUT("potassium_mg", "칼륨", "mg", "선택", ""),
  NUT("calcium_mg", "칼슘", "mg", "선택", ""),
  { key: "nutrition_image_url", label: "영양성분표 사진 주소", need: "권장", type: "url", help: "검수 때 확인해요", example: "https://…/nutrition.jpg" },

  { key: "ingredients_raw", label: "원재료명", need: "필수", type: "text", max: 3000, help: "표시사항 원재료명 전문", example: "현미밥(국산), 닭가슴살(브라질산), 양파, 간장(대두, 밀)…", content: true },
  { key: "allergens", label: "알레르기 유발물질", need: "필수", type: "list", enumOf: ALLERGENS, help: "코드표의 이름이나 코드를 쉼표로. 없으면 \"없음\"", example: "닭고기, 대두, 밀", content: true },
  { key: "cross_contact", label: "같은 시설 제조 문구", need: "선택", type: "text", max: 300, help: "\"이 제품은 … 를 사용한 제품과 같은 제조시설에서 제조\"", example: "", content: true },
  { key: "storage", label: "보관", need: "필수", type: "enum", enumOf: STORAGE, help: "", example: "frozen" },
  { key: "shelf_life_days", label: "소비기한(일)", need: "권장", type: "int", help: "제조일부터 며칠", example: "180" },

  { key: "status", label: "판매 상태", need: "필수", type: "enum", enumOf: STATUS, help: "", example: "on_sale" },
  { key: "price", label: "판매가(원)", need: "필수", type: "int", help: "판매 단위(위 개수만큼) 가격", example: "5900" },
  { key: "list_price", label: "정가(원)", need: "선택", type: "int", help: "", example: "6900" },
  { key: "channel", label: "판매처", need: "필수", type: "enum", enumOf: CHANNELS, help: "구매 링크가 가는 곳", example: "own_mall" },
  { key: "url", label: "구매 링크", need: "필수", type: "url", help: "https 로 시작. 우리 추적 값은 우리가 붙여요", example: "https://shop.example.com/p/123" },
  { key: "channel_2", label: "판매처 2", need: "선택", type: "enum", enumOf: CHANNELS, help: "다른 곳에서도 판다면", example: "" },
  { key: "price_2", label: "판매가 2(원)", need: "선택", type: "int", help: "", example: "" },
  { key: "url_2", label: "구매 링크 2", need: "선택", type: "url", help: "", example: "" },
  { key: "shipping_type", label: "배송", need: "권장", type: "enum", enumOf: SHIPPING, help: "", example: "parcel" },
  { key: "shipping_fee", label: "배송비(원)", need: "권장", type: "int", help: "", example: "3000" },
  { key: "free_shipping_over", label: "무료배송 기준(원)", need: "선택", type: "int", help: "", example: "30000" },

  { key: "available_from", label: "판매 시작일", need: "식단 서비스 필수", type: "date", help: "주마다 바뀌는 메뉴는 그 주의 시작일 (YYYY-MM-DD)", example: "2026-11-16" },
  { key: "available_to", label: "판매 종료일", need: "식단 서비스 필수", type: "date", help: "", example: "2026-11-22" },
  { key: "plans", label: "들어가는 플랜", need: "선택", type: "text", max: 200, help: "쉼표로 (예: 주5식, 다이어트 플랜)", example: "" },
  { key: "delivery_days", label: "배송 요일", need: "선택", type: "text", max: 40, help: "예: 월, 수, 금", example: "" },
  { key: "min_order", label: "최소 주문", need: "선택", type: "text", max: 60, help: "예: 5식 이상", example: "" },

  { key: "image_url_1", label: "제품 사진 1", need: "필수", type: "url", help: "정사각 800px 이상, 글자 없는 제품 사진", example: "https://…/1.jpg" },
  { key: "image_url_2", label: "제품 사진 2", need: "선택", type: "url", help: "", example: "" },
  { key: "image_url_3", label: "제품 사진 3", need: "선택", type: "url", help: "", example: "" },
  { key: "description", label: "소개 문구", need: "선택", type: "text", max: 300, help: "효능·질병 표현은 쓸 수 없어요 (식품표시광고법)", example: "", content: true },
  { key: "claims", label: "강조 표시", need: "선택", type: "text", max: 100, help: "표시기준에 맞는 강조표시만 (예: 저당, 고단백)", example: "", content: true },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<string, Field>;

/* ───── 검사 결과 ───── */

export type IssueCode =
  | "required" | "format" | "enum" | "too_long" | "range" | "serving_gt_total"   // → 반려
  | "energy_mismatch" | "missing_sodium" | "allergen_mismatch" | "claim_words" | "duplicate_code"; // → 검수
export type Issue = { field?: string; code: IssueCode; message: string };

export const REVIEW_LABELS: Record<string, string> = {
  new: "새 제품",
  content_changed: "영양·원재료·알레르기 변경",
  energy_mismatch: "열량 검산이 20% 넘게 달라요",
  missing_sodium: "간이 된 한 끼인데 나트륨이 거의 없어요",
  allergen_mismatch: "원재료와 알레르기 목록이 달라요",
  claim_words: "효능·질병 표현이 있어요",
  duplicate_code: "같은 품목보고번호·바코드가 다른 제품에 있어요",
};

/** 정리한 제품 하나 — partner_items.data */
export type PartnerItem = {
  partner_sku: string;
  name: string;
  brand: string;
  manufacturer?: string;
  report_no?: string;
  barcode?: string;
  food_type?: string;
  category: CategoryCode;
  meal_role: keyof typeof MEAL_ROLES;
  weight_unit: "g" | "ml";
  total_weight: number;
  serving_size: number;
  pack_count: number;
  nutrition_basis: keyof typeof NUTRITION_BASIS;
  nutrition_source: keyof typeof NUTRITION_SOURCE;
  /** 받은 기준 그대로 */
  nutrition: Record<string, number | null>;
  /** 100g(ml) 당으로 바꾼 값 — products 에 들어가는 값 */
  per100: Record<string, number | null>;
  nutrition_image_url?: string;
  ingredients_raw: string;
  allergens: AllergenCode[];
  cross_contact?: string;
  storage: keyof typeof STORAGE;
  shelf_life_days?: number;
  status: keyof typeof STATUS;
  offers: { channel: keyof typeof CHANNELS; price: number; url: string }[];
  list_price?: number;
  shipping_type?: keyof typeof SHIPPING;
  shipping_fee?: number;
  free_shipping_over?: number;
  available_from?: string;
  available_to?: string;
  plans?: string;
  delivery_days?: string;
  min_order?: string;
  images: string[];
  description?: string;
  claims?: string;
};

export const NUTRIENT_KEYS = ["calories_kcal", "sodium_mg", "carbs_g", "sugars_g", "fat_g", "trans_fat_g", "saturated_fat_g", "cholesterol_mg", "protein_g", "fiber_g", "potassium_mg", "calcium_mg"] as const;

/** 바뀌면 사람 검수로 가는 값 (가격·재고·링크·배송은 바로 반영) */
export const CONTENT_KEYS = ["name", "category", "meal_role", "nutrition_basis", "nutrition_source", "nutrition", "ingredients_raw", "allergens", "cross_contact", "description", "claims", "serving_size", "total_weight"] as const;

/* ───── 값 읽기 ───── */

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const isUrl = (s: string) => /^https:\/\/[^\s]+$/i.test(s);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** 코드나 이름 둘 다 받는다 ("lunchbox" 또는 "도시락") */
function enumValue(f: Field, raw: string): string | null {
  if (!f.enumOf) return null;
  const s = raw.trim();
  if (s in f.enumOf) return s;
  const low = s.toLowerCase();
  for (const [k, v] of Object.entries(f.enumOf)) if (k.toLowerCase() === low || v === s) return k;
  return null;
}

function num(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** 원재료에 보이는 알레르기 중 목록에 없는 것 */
export function allergenGaps(ingredients: string, listed: AllergenCode[]): AllergenCode[] {
  const out: AllergenCode[] = [];
  for (const [code, re] of Object.entries(ALLERGEN_WORDS) as [AllergenCode, RegExp][]) {
    if (!listed.includes(code) && re.test(ingredients)) out.push(code);
  }
  return out;
}

// 식품표시광고법 제8조 — 질병 예방·치료, 의약품 오인 표현. 걸리면 사람이 본다
const CLAIM_WORDS = /치료|예방|완치|처방|진단|효능|효과|개선|완화|회복|낫|당뇨|고혈압|암(?![가-힣])|비만 ?치료|다이어트 ?효과|혈당 ?(조절|관리|낮)|혈압 ?(조절|관리|낮)|콜레스테롤 ?(낮|감소)|면역력|해독|디톡스/;

// 간이 된 요리 이름 — 나트륨이 1회 20mg 도 안 되면 빠진 값 (scripts/health_score.py SEASONED 와 같은 뜻)
const SEASONED = /볶음|덮밥|양념|돈까스|돈가스|짬뽕|라면|우동|소스|찌개|탕$|국$|국밥|카레|커리|짜장|김치|불고기|제육|갈비|떡볶이|만두|조림|간장|된장|고추장/;
const UNSALTED = /곰탕|곰국|설렁탕|도가니|우족|사골|백숙|삼계탕|수육/;

/**
 * 한 행(필드 키 → 값)을 검사하고 정리한다.
 * errors 가 있으면 반영하지 않는다(반려). review 는 사람 검수 이유, warnings 는 알리기만.
 * kind: 업체 유형 — 식단 서비스는 판매 기간이 필수
 */
export function parseRow(row: Record<string, unknown>, kind: "meal_service" | "brand" | "mall"): {
  item: PartnerItem | null; errors: Issue[]; review: Issue[]; warnings: Issue[];
} {
  const errors: Issue[] = [];
  const review: Issue[] = [];
  const warnings: Issue[] = [];
  const v: Record<string, string> = {};
  for (const f of FIELDS) v[f.key] = str(row[f.key]);

  for (const f of FIELDS) {
    const s = v[f.key];
    const required = f.need === "필수" || (f.need === "식단 서비스 필수" && kind === "meal_service");
    if (!s) {
      if (required) errors.push({ field: f.key, code: "required", message: `${f.label}을(를) 채워 주세요` });
      continue;
    }
    if (f.max && s.length > f.max) errors.push({ field: f.key, code: "too_long", message: `${f.label}은(는) ${f.max}자까지예요` });
    if (f.type === "url" && !isUrl(s)) errors.push({ field: f.key, code: "format", message: `${f.label}은(는) https:// 로 시작하는 주소여야 해요` });
    if (f.type === "date" && !isDate(s)) errors.push({ field: f.key, code: "format", message: `${f.label}은(는) 2026-11-16 처럼 적어 주세요` });
    if ((f.type === "num" || f.type === "int") && (Number.isNaN(num(s)) || (num(s) ?? 0) < 0)) errors.push({ field: f.key, code: "format", message: `${f.label}은(는) 0 이상의 숫자여야 해요` });
    if (f.type === "int" && Number.isFinite(num(s)) && !Number.isInteger(num(s))) errors.push({ field: f.key, code: "format", message: `${f.label}은(는) 정수여야 해요` });
    if (f.type === "enum" && !enumValue(f, s)) errors.push({ field: f.key, code: "enum", message: `${f.label}: "${s}"는 코드표에 없어요` });
  }

  // 알레르기 — "없음" 또는 코드·이름 목록
  const allergens: AllergenCode[] = [];
  if (v.allergens && v.allergens !== "없음") {
    for (const part of v.allergens.split(/[,，·/]/).map((x) => x.trim()).filter(Boolean)) {
      const code = enumValue(FIELD_BY_KEY.allergens, part);
      if (code) { if (!allergens.includes(code as AllergenCode)) allergens.push(code as AllergenCode); }
      else errors.push({ field: "allergens", code: "enum", message: `알레르기 유발물질: "${part}"는 코드표에 없어요` });
    }
  }

  // 판매처 2 는 셋이 같이
  if ((v.channel_2 || v.price_2 || v.url_2) && !(v.channel_2 && v.price_2 && v.url_2)) {
    errors.push({ field: "channel_2", code: "required", message: "판매처 2·판매가 2·구매 링크 2는 셋 다 채우거나 셋 다 비워 주세요" });
  }

  const total = num(v.total_weight) ?? NaN;
  const serving = num(v.serving_size) ?? NaN;
  const pack = num(v.pack_count) ?? NaN;
  if (Number.isFinite(total) && Number.isFinite(serving) && serving > total) {
    errors.push({ field: "serving_size", code: "serving_gt_total", message: "1회 제공량이 총 내용량보다 커요" });
  }
  if (Number.isFinite(total) && (total <= 0 || total > 20000)) errors.push({ field: "total_weight", code: "range", message: "총 내용량은 0보다 크고 20kg 이하여야 해요" });
  if (Number.isFinite(serving) && serving <= 0) errors.push({ field: "serving_size", code: "range", message: "1회 제공량은 0보다 커야 해요" });
  if (Number.isFinite(pack) && (pack < 1 || pack > 100)) errors.push({ field: "pack_count", code: "range", message: "판매 단위 개수는 1~100이에요" });
  if (v.available_from && v.available_to && isDate(v.available_from) && isDate(v.available_to) && v.available_to < v.available_from) {
    errors.push({ field: "available_to", code: "range", message: "판매 종료일이 시작일보다 빨라요" });
  }

  if (errors.length) return { item: null, errors, review, warnings };

  // ── 정리 ──
  const basis = enumValue(FIELD_BY_KEY.nutrition_basis, v.nutrition_basis) as PartnerItem["nutrition_basis"];
  const nutrition: Record<string, number | null> = {};
  for (const k of NUTRIENT_KEYS) nutrition[k] = num(v[k]);
  const base = basis === "100g" ? 100 : basis === "serving" ? serving : total;
  const per100: Record<string, number | null> = {};
  for (const k of NUTRIENT_KEYS) {
    const x = nutrition[k];
    per100[k] = x === null ? null : Math.round((x * 100 / base) * 100) / 100;
  }

  // 물리적으로 불가능한 값 — 반려
  const p = per100;
  const grams = ["carbs_g", "sugars_g", "fat_g", "trans_fat_g", "saturated_fat_g", "protein_g", "fiber_g"] as const;
  if ((p.calories_kcal ?? 0) > 900 || grams.some((k) => (p[k] ?? 0) > 100) || (p.sodium_mg ?? 0) > 40000
    || (p.sugars_g ?? 0) > (p.carbs_g ?? 0) + 0.5 || (p.saturated_fat_g ?? 0) + (p.trans_fat_g ?? 0) > (p.fat_g ?? 0) + 0.5) {
    errors.push({ field: "nutrition", code: "range", message: "영양 값이 맞지 않아요 (100g 당 900kcal 초과, 당류 > 탄수화물, 포화+트랜스지방 > 지방 등). 기준과 단위를 확인해 주세요" });
    return { item: null, errors, review, warnings };
  }

  const category = enumValue(FIELD_BY_KEY.category, v.category) as CategoryCode;
  const role = (v.meal_role_hint ? enumValue(FIELD_BY_KEY.meal_role_hint, v.meal_role_hint) : CATEGORIES[category].role) as PartnerItem["meal_role"];
  const offers: PartnerItem["offers"] = [{ channel: enumValue(FIELD_BY_KEY.channel, v.channel) as keyof typeof CHANNELS, price: num(v.price) as number, url: v.url }];
  if (v.channel_2) offers.push({ channel: enumValue(FIELD_BY_KEY.channel_2, v.channel_2) as keyof typeof CHANNELS, price: num(v.price_2) as number, url: v.url_2 });

  const item: PartnerItem = {
    partner_sku: v.partner_sku,
    name: v.name,
    brand: v.brand,
    manufacturer: v.manufacturer || undefined,
    report_no: v.report_no ? v.report_no.replace(/\D/g, "") : undefined,
    barcode: v.barcode ? v.barcode.replace(/\D/g, "") : undefined,
    food_type: v.food_type || undefined,
    category,
    meal_role: role,
    weight_unit: (v.weight_unit ? enumValue(FIELD_BY_KEY.weight_unit, v.weight_unit) : "g") as "g" | "ml",
    total_weight: total,
    serving_size: serving,
    pack_count: pack,
    nutrition_basis: basis,
    nutrition_source: enumValue(FIELD_BY_KEY.nutrition_source, v.nutrition_source) as PartnerItem["nutrition_source"],
    nutrition,
    per100,
    nutrition_image_url: v.nutrition_image_url || undefined,
    ingredients_raw: v.ingredients_raw,
    allergens,
    cross_contact: v.cross_contact || undefined,
    storage: enumValue(FIELD_BY_KEY.storage, v.storage) as PartnerItem["storage"],
    shelf_life_days: v.shelf_life_days ? (num(v.shelf_life_days) as number) : undefined,
    status: enumValue(FIELD_BY_KEY.status, v.status) as PartnerItem["status"],
    offers,
    list_price: v.list_price ? (num(v.list_price) as number) : undefined,
    shipping_type: v.shipping_type ? (enumValue(FIELD_BY_KEY.shipping_type, v.shipping_type) as PartnerItem["shipping_type"]) : undefined,
    shipping_fee: v.shipping_fee ? (num(v.shipping_fee) as number) : undefined,
    free_shipping_over: v.free_shipping_over ? (num(v.free_shipping_over) as number) : undefined,
    available_from: v.available_from || undefined,
    available_to: v.available_to || undefined,
    plans: v.plans || undefined,
    delivery_days: v.delivery_days || undefined,
    min_order: v.min_order || undefined,
    images: [v.image_url_1, v.image_url_2, v.image_url_3].filter(Boolean),
    description: v.description || undefined,
    claims: v.claims || undefined,
  };

  // ── 검수로 보낼 것 ──
  const kcal = p.calories_kcal ?? 0;
  const est = 4 * (p.carbs_g ?? 0) + 4 * (p.protein_g ?? 0) + 9 * (p.fat_g ?? 0);
  if (kcal > 20 && Math.abs(est - kcal) / kcal > 0.2) {
    review.push({ field: "calories_kcal", code: "energy_mismatch", message: `열량 ${Math.round(kcal)}kcal 이 탄·단·지로 계산한 ${Math.round(est)}kcal 와 20% 넘게 달라요 (100g 기준)` });
  }
  const sodiumServing = (p.sodium_mg ?? 0) * serving / 100;
  if ((role === "meal" || role === "side") && sodiumServing < 20 && SEASONED.test(item.name) && !UNSALTED.test(item.name)) {
    review.push({ field: "sodium_mg", code: "missing_sodium", message: "간이 된 요리인데 1회 나트륨이 20mg 미만이에요" });
  }
  const gaps = allergenGaps(item.ingredients_raw, allergens);
  if (gaps.length) review.push({ field: "allergens", code: "allergen_mismatch", message: `원재료에 ${gaps.map((g) => ALLERGENS[g]).join("·")}이(가) 보이는데 알레르기 목록에 없어요` });
  const claimText = `${item.description || ""} ${item.claims || ""} ${item.name}`;
  if (CLAIM_WORDS.test(claimText)) review.push({ field: "description", code: "claim_words", message: "효능·질병으로 읽힐 수 있는 표현이 있어요" });

  if (!item.report_no && kind === "brand") warnings.push({ field: "report_no", code: "required", message: "품목보고번호가 있으면 식약처 정보와 정확히 연결돼요" });
  if (!item.nutrition_image_url) warnings.push({ field: "nutrition_image_url", code: "required", message: "영양성분표 사진이 있으면 검수가 빨라요" });

  return { item, errors, review, warnings };
}

/** 키 순서와 상관없이 같은 값이면 같은 글자 — DB(jsonb)는 객체 키 순서를 바꿔 저장한다 */
export function stable(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

/** 검수가 필요한 변경인지 — 영양·원재료·알레르기·이름 등 (가격·재고·링크만 바뀌면 false) */
export function contentChanged(a: PartnerItem | null | undefined, b: PartnerItem): string[] {
  if (!a) return ["new"];
  const out: string[] = [];
  for (const k of CONTENT_KEYS) if (stable(a[k]) !== stable(b[k])) out.push(k);
  return out;
}

/** 어떤 값이든 바뀌었는지 (바뀐 게 없으면 아무것도 안 한다) */
export function anyChanged(a: PartnerItem | null | undefined, b: PartnerItem): string[] {
  if (!a) return ["new"];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PartnerItem>;
  return [...keys].filter((k) => stable(a[k] ?? null) !== stable(b[k] ?? null));
}
