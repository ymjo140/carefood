import { NextResponse } from "next/server";
import { connection } from "next/server";
import { pushPublicKey } from "@/lib/push";

/** GET /api/push/key — 브라우저가 구독할 때 쓰는 공개 키. 아직 없으면 null (알림 준비 중) */
export async function GET() {
  await connection();
  return NextResponse.json({ key: pushPublicKey() });
}
