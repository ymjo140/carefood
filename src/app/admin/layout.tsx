import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageLoading } from "@/components/ui";
import { getAdminUser } from "@/lib/actor-server";

export const metadata = { title: "관리", robots: { index: false, follow: false } };

/** 관리 화면은 관리자 계정(ADMIN_EMAILS)만 — 아니면 로그인으로 */
async function AdminGate({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?returnTo=/admin");
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
