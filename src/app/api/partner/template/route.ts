import { NextRequest } from "next/server";
import { buildOrdersTemplate, buildTemplate } from "@/lib/partner/excel";
import { exampleCsv } from "@/lib/partner/feed";
import { excelSamples } from "@/lib/partner/demo";

/** GET /api/partner/template[?kind=orders|feed|example] — 입점 제품 양식 / 주문 내역 양식 / 예시 피드 / 예시 6개를 채운 양식 (누구나 내려받을 수 있다, 업체 데이터 없음) */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("kind") === "feed") {
    // 예시 피드(CSV) — 첫 줄 필드 키, 둘째 줄 예시
    return new Response(exampleCsv(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("케어푸드_피드_예시.csv")}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  const kind = req.nextUrl.searchParams.get("kind");
  const orders = kind === "orders";
  const example = kind === "example";
  const buf = orders ? await buildOrdersTemplate() : await buildTemplate(example ? excelSamples() : undefined);
  const name = orders ? "케어푸드_주문내역_양식.xlsx" : example ? "케어푸드_입점제품_예시.xlsx" : "케어푸드_입점제품_양식.xlsx";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
