import { cn } from "./cn";
import { Spinner } from "./Layout";

/**
 * 카카오 로그인 버튼 — 카카오 로그인 디자인 가이드를 따른다(노란 컨테이너 · 말풍선 심볼 · "카카오 로그인"류 문구).
 * 색은 kakao / on-kakao 토큰, 이 버튼에만 쓴다. 높이 44px(md 버튼과 같음), 둥글기 md.
 * 서버 경로(/auth/kakao)로 가는 링크라 a 로 그린다. 누르면 다시 누를 수 없게 loading 을 켠다.
 */
export function KakaoButton({ href, label = "카카오로 로그인하기", loading, onClick, className }: {
  href: string; label?: string; loading?: boolean; onClick?: () => void; className?: string;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      aria-busy={loading || undefined}
      className={cn(
        "press relative inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-kakao px-4 text-label font-bold text-on-kakao select-none",
        loading && "pointer-events-none opacity-60",
        className,
      )}
    >
      {loading ? <Spinner size={18} /> : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="absolute left-4">
          <path fill="currentColor" d="M12 3.5c-5 0-9 3.1-9 7 0 2.5 1.7 4.7 4.2 6l-.9 3.4c-.1.3.3.5.5.3l4-2.7c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7s-4-7.1-9-7.1z" />
        </svg>
      )}
      {label}
    </a>
  );
}
