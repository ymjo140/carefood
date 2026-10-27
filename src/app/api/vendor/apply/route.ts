import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_name, representative, email, phone, website, business_number, business_type, product_count, message } = body;

  if (!company_name || !representative || !email) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await (supabase as any)
    .from("vendor_applications")
    .insert({
      company_name,
      representative,
      email,
      phone: phone || null,
      website: website || null,
      business_number: business_number || null,
      business_type: business_type || "meal_service",
      product_count: product_count || null,
      message: message || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "신청 중 오류가 발생했습니다" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
