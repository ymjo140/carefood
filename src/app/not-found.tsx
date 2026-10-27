import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl mb-4">🍽️</p>
      <h1 className="text-2xl font-extrabold mb-2">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-muted mb-6">
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <div className="flex gap-3">
        <Link href="/"
          className="bg-primary text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-primary-dark transition-colors">
          홈으로
        </Link>
        <Link href="/products"
          className="border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-surface transition-colors">
          제품 탐색
        </Link>
      </div>
    </div>
  );
}
