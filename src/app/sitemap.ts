import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BASE_URL = "https://carefood-iota.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── 정적 페이지 ──
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/products`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/community`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/diary`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/diary/report`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/weekly-box`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/health`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/onboarding`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/vendor/apply`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // ── 동적 페이지: 인기 제품 ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  let productPages: MetadataRoute.Sitemap = [];
  try {
    const { data: products } = await sb
      .from("products")
      .select("id, updated_at")
      .eq("is_purchasable", true)
      .not("health_score", "is", null)
      .order("health_score", { ascending: false })
      .limit(1000);

    if (products) {
      productPages = products.map((p: { id: string; updated_at: string | null }) => ({
        url: `${BASE_URL}/products/${p.id}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }
  } catch { /* DB 에러 시 정적 페이지만 */ }

  // ── 동적 페이지: 공유 식단 ──
  let communityPages: MetadataRoute.Sitemap = [];
  try {
    const { data: plans } = await sb
      .from("shared_meal_plans")
      .select("id, updated_at")
      .eq("is_active", true)
      .order("like_count", { ascending: false })
      .limit(200);

    if (plans) {
      communityPages = plans.map((p: { id: string; updated_at: string | null }) => ({
        url: `${BASE_URL}/community/${p.id}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    }
  } catch { /* DB 에러 시 정적 페이지만 */ }

  return [...staticPages, ...productPages, ...communityPages];
}
