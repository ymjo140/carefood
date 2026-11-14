import { Card, CodeBlock, Page, PageHeader, SectionHeader, TextLink } from "@/components/ui";
import { FIELDS } from "@/lib/partner/schema";
import { CARRIERS } from "@/lib/order-status";

export const metadata = { title: "입점 업체 연동 문서" };

const BASE = "https://carefood-iota.vercel.app/api/partner/v1";

const ENDPOINTS: [string, string, string][] = [
  ["PUT", "/products/{partner_sku}", "제품 하나 등록·수정 (전체 필드)"],
  ["POST", "/products/batch", "제품 최대 500개를 한 번에"],
  ["PATCH", "/products/{partner_sku}/offer", "가격·재고·판매 상태만 (검수 없이 바로 반영)"],
  ["DELETE", "/products/{partner_sku}", "판매 종료 (기록은 남아요)"],
  ["GET", "/products?status=rejected", "내 제품과 검수 상태, 반려 이유"],
  ["GET", "/batches/{batch_id}", "한 번 보낸 묶음의 처리 결과"],
  ["POST", "/conversions", "오늘끼록 링크로 들어온 주문 (구매 수수료 정산)"],
  ["GET", "/orders?status=new", "오늘끼록 앱에서 들어온 주문 (앱 주문이 열린 뒤)"],
  ["PATCH", "/orders/{order_id}", "주문 접수·발송(송장)·배송 완료·취소"],
];

const RESULTS: [string, string][] = [
  ["applied", "바로 반영했어요 (가격·재고·링크만 바뀐 경우)"],
  ["pending_review", "오늘끼록이 확인한 뒤 반영해요 (새 제품, 영양·원재료·알레르기 변경). 응답 코드 202"],
  ["unchanged", "지난번과 같아서 아무것도 하지 않았어요"],
];

const ERRORS: [string, string, string][] = [
  ["401", "unauthorized", "키가 없거나 폐기된 키"],
  ["403", "partner_paused", "업체 계정이 멈춤"],
  ["404", "not_found", "없는 제품 코드·묶음·주문"],
  ["409", "conflict", "지금 상태에서는 할 수 없는 주문 처리 (예: 발송한 주문 취소)"],
  ["413", "too_large · too_many", "본문 2MB 초과, 개수 초과"],
  ["422", "invalid", "값이 양식에 맞지 않음 — errors 에 칸과 이유"],
  ["429", "rate_limited", "키 하나에 1분 120번 초과"],
];

const PUT_EXAMPLE = `curl -X PUT "${BASE}/products/GR-2611-014" \\
  -H "Authorization: Bearer cf_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "닭가슴살 현미 볶음밥 도시락",
    "brand": "예시브랜드",
    "category": "lunchbox",
    "total_weight": { "value": 300, "unit": "g" },
    "serving_size": { "value": 300 },
    "pack_count": 1,
    "nutrition": {
      "basis": "serving", "source": "label",
      "calories_kcal": 420, "sodium_mg": 640, "carbs_g": 52, "sugars_g": 6,
      "fat_g": 11, "trans_fat_g": 0, "saturated_fat_g": 3,
      "cholesterol_mg": 55, "protein_g": 28
    },
    "ingredients_raw": "현미밥(국산), 닭가슴살(브라질산), 간장(대두, 밀)…",
    "allergens": ["chicken", "soybean", "wheat"],
    "storage": "frozen",
    "status": "on_sale",
    "offers": [{ "channel": "own_mall", "price": 5900, "url": "https://shop.example.com/p/123" }],
    "images": ["https://shop.example.com/img/123.jpg"],
    "available_from": "2026-11-16",
    "available_to": "2026-11-22"
  }'

→ 202  { "partner_sku": "GR-2611-014", "result": "pending_review", "batch_id": "…" }`;

const OFFER_EXAMPLE = `curl -X PATCH "${BASE}/products/GR-2611-014/offer" \\
  -H "Authorization: Bearer cf_live_…" -H "Content-Type: application/json" \\
  -d '{ "price": 5500, "stock": 120 }'   # stock: 남은 수량 (null 이면 세지 않음, 0 이면 앱에서 살 수 없음)

→ 200  { "partner_sku": "GR-2611-014", "result": "applied" }`;

const CONV_EXAMPLE = `curl -X POST "${BASE}/conversions" \\
  -H "Authorization: Bearer cf_live_…" -H "Content-Type: application/json" \\
  -d '{ "conversions": [{
    "click_id": "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
    "order_no": "ORD-20261112-0001",
    "amount": 23600,
    "status": "confirmed",
    "ordered_at": "2026-11-12T14:30:00+09:00"
  }] }'

→ 200  { "received": 1, "saved": 1, "rejected": 0, "errors": [] }`;

const ORDER_EXAMPLE = `curl "${BASE}/orders?status=new" -H "Authorization: Bearer cf_live_…"

→ 200  { "orders": [{
    "order_id": "8a1f0c52-…", "ordered_at": "2026-11-12T05:30:00Z", "status": "new", "amount": 23600, "shipping_fee": 3000,
    "lines": [{ "partner_sku": "GR-2611-014", "product_name": "저당 닭가슴살 도시락", "quantity": 2, "unit_price": 11800 }],
    "shipping": { "name": "…", "phone": "…", "postal_code": "…", "address1": "…", "address2": "…", "note": "…" },
    "cancel_requested_at": null, "cancel_request_reason": null
  }] }

curl -X PATCH "${BASE}/orders/8a1f0c52-…" \\
  -H "Authorization: Bearer cf_live_…" -H "Content-Type: application/json" \\
  -d '{ "status": "shipped", "carrier": "cj", "tracking_number": "123456789012" }'

→ 200  { "order": { … "status": "shipped" }, "changed": true }`;

const ERROR_EXAMPLE = `→ 422
{
  "error": { "code": "invalid", "message": "제품을 받지 못했어요. errors 를 확인해 주세요" },
  "errors": [{ "field": "serving_size", "message": "1회 제공량이 총 내용량보다 커요" }]
}`;

const Code = CodeBlock;
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <Card padding="none" className="overflow-x-auto">
      <table className="w-full text-label">
        <thead><tr className="text-ink-2 border-b border-line">{head.map((h) => <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={j === r.length - 1 ? "px-4 py-2.5 text-ink min-w-56" : "px-4 py-2.5 text-ink num whitespace-nowrap align-top"}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** 입점 업체 연동 문서 — 필드 표는 양식 정의(schema.ts)에서 바로 그린다 */
export default function PartnerDocsPage() {
  const codeTables = FIELDS.filter((f) => f.enumOf && !f.key.endsWith("_2"));
  return (
    <Page>
      <PageHeader title="입점 업체 연동 문서" description="제품·가격·재고·주문을 오늘끼록에 보내는 세 가지 길 — 엑셀, 상품 피드, API. 세 길 모두 같은 칸을 써요" />

      <SectionHeader title="세 가지 길" />
      <Table head={["길", "받는 방법"]} rows={[
        ["엑셀", "양식을 채워 입점 업체 화면에 올려요. 개발이 필요 없어요"],
        ["상품 피드", "같은 칸의 CSV·JSON 을 주소 하나에 올려 두면 하루 두 번 가져가요. 피드에서 빠진 제품은 판매 종료로 내려요"],
        ["API", "바뀔 때 바로 보내요. 아래가 API 설명이에요"],
      ]} />
      <p className="text-label text-ink-2 mt-2">
        <TextLink href="/api/partner/template">엑셀 양식</TextLink> · <TextLink href="/api/partner/template?kind=feed">예시 피드(CSV)</TextLink> ·{" "}
        <TextLink href="/api/partner/template?kind=orders">주문 내역 양식</TextLink> · <TextLink href="/partner">입점 업체 화면</TextLink>
      </p>

      <SectionHeader title="API 기본" className="mt-10" />
      <ul className="flex flex-col gap-1.5 text-label text-ink list-disc pl-5">
        <li>주소: <span className="num break-all" data-ds-allow-break>{BASE}</span></li>
        <li>인증: 모든 요청에 <span className="num">Authorization: Bearer &lt;API 키&gt;</span>. 키는 입점 업체 화면의 API 탭에서 만들고, 서버에만 두세요</li>
        <li>본문은 JSON(UTF-8), 2MB 까지. 키 하나에 1분 120번까지 보낼 수 있어요</li>
        <li>같은 내용을 다시 보내도 한 번만 반영돼요. 제품은 제품 코드, 주문은 주문 번호가 기준이에요</li>
        <li>가격·재고·링크만 바뀌면 바로 반영하고, 새 제품과 영양·원재료·알레르기 변경은 오늘끼록이 확인한 뒤 반영해요</li>
      </ul>

      <SectionHeader title="요청" className="mt-10" />
      <Table head={["방식", "주소", "하는 일"]} rows={ENDPOINTS} />

      <SectionHeader title="제품 보내기" className="mt-10" />
      <Code>{PUT_EXAMPLE}</Code>
      <p className="text-label text-ink-2 mt-2">
        칸은 아래 표의 키를 그대로 쓰거나(납작한 모양), 위처럼 nutrition · offers · images · total_weight 로 묶어 보내도 돼요.
        영양 값은 포장에 적힌 기준 그대로 보내고 nutrition.basis 에 그 기준(100g · serving · pack)을 적어요.
      </p>
      <div className="mt-3"><Table head={["result", "뜻"]} rows={RESULTS} /></div>

      <SectionHeader title="가격·재고만 고치기" className="mt-10" />
      <Code>{OFFER_EXAMPLE}</Code>
      <p className="text-label text-ink-2 mt-2">price · list_price · status(on_sale · sold_out · discontinued) · url 중 바꿀 것만 보내요.</p>

      <SectionHeader title="주문 보내기 (구매 수수료)" className="mt-10" />
      <p className="text-label text-ink mb-2">
        오늘끼록의 구매 링크에는 <span className="num">cf_click</span> 값이 붙어요. 그 방문에서 나온 주문에 이 값을 같이 저장해 두었다가 보내 주세요.
        취소·반품은 같은 주문 번호로 status 만 바꿔 다시 보내요. 값에는 고객을 알아볼 정보가 없어요.
      </p>
      <Code>{CONV_EXAMPLE}</Code>
      <p className="text-label text-ink-2 mt-2">status: ordered · confirmed · canceled · returned. 수수료는 confirmed 금액에만 계산해요. ordered_at 에 시간대가 없으면 한국 시간으로 읽어요.</p>

      <SectionHeader title="앱 주문 받기" className="mt-10" description="오늘끼록 앱 안 주문이 열린 뒤에 쓰여요. 그 전에는 빈 목록이 와요" />
      <p className="text-label text-ink mb-2">
        결제가 끝난 주문만 와요. 한 주문 안의 우리 업체 상품은 한 묶음으로 움직여요: new → accepted → shipped → delivered.
        받는 분 정보(shipping)는 배송에만 쓰고, 배송이 끝나면 응답에서 빠져요.
        amount 는 상품 금액, shipping_fee 는 주문할 때 제품의 배송비·무료배송 기준으로 계산한 이 업체 배송비예요.
      </p>
      <p className="text-label text-ink mb-2">
        접수하기 전에는 주문자가 바로 취소할 수 있어요 (status 가 canceled, canceled_by 가 buyer 로 와요).
        접수한 뒤에는 취소를 요청만 해요 — cancel_requested_at 이 채워지면, 보내기 전이면 canceled 로 바꾸고(reason 없이 보내도 돼요) 이미 보냈다면 shipped 로 보내 주세요.
      </p>
      <Code>{ORDER_EXAMPLE}</Code>
      <p className="text-label text-ink-2 mt-2">
        status: accepted · shipped(carrier 와 tracking_number 필요) · delivered · canceled(reason 필요, 발송 전까지만).
        carrier: {Object.entries(CARRIERS).map(([k, v], i) => <span key={k}>{i > 0 && " · "}<span className="num">{k}</span> {v}</span>)}.
        direct 는 송장 번호 없이 보낼 수 있어요. 같은 상태를 다시 보내면 changed 가 false 로 와요.
      </p>

      <SectionHeader title="오류" className="mt-10" />
      <Code>{ERROR_EXAMPLE}</Code>
      <div className="mt-3"><Table head={["응답 코드", "error.code", "뜻"]} rows={ERRORS} /></div>

      <SectionHeader title="제품 칸" className="mt-10" description="엑셀·피드·API 가 같이 쓰는 칸이에요" />
      <Table head={["키", "이름", "필수", "설명"]} rows={FIELDS.map((f) => [f.key, f.label, f.need, f.help || "—"])} />

      <SectionHeader title="코드표" className="mt-10" />
      <div className="flex flex-col gap-4">
        {codeTables.map((f) => (
          <div key={f.key}>
            <h3 className="text-label font-bold text-ink mb-1.5">{f.label} <span className="num font-regular text-ink-2">{f.key}</span></h3>
            <p className="text-label text-ink">
              {Object.entries(f.enumOf || {}).map(([k, v], i) => <span key={k}>{i > 0 && " · "}<span className="num">{k}</span> {v !== k && <span className="text-ink-2">{v}</span>}</span>)}
            </p>
          </div>
        ))}
      </div>
    </Page>
  );
}
