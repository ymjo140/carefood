import { buildTemplate } from "@/lib/partner/excel";

/** GET /api/partner/template — 입점 제품 엑셀 양식 (누구나 내려받을 수 있다, 데이터 없음) */
export async function GET() {
  const buf = await buildTemplate();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("케어푸드_입점제품_양식.xlsx")}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
