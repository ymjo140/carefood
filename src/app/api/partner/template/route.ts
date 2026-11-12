import { NextRequest } from "next/server";
import { buildOrdersTemplate, buildTemplate } from "@/lib/partner/excel";

/** GET /api/partner/template[?kind=orders] — 입점 제품 양식 / 주문 내역 양식 (누구나 내려받을 수 있다, 데이터 없음) */
export async function GET(req: NextRequest) {
  const orders = req.nextUrl.searchParams.get("kind") === "orders";
  const buf = orders ? await buildOrdersTemplate() : await buildTemplate();
  const name = orders ? "케어푸드_주문내역_양식.xlsx" : "케어푸드_입점제품_양식.xlsx";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
