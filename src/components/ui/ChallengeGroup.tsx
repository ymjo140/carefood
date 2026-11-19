import type { ReactNode } from "react";
import Link from "@/components/ui/AppLink";
import { cn } from "./cn";
import { Avatar } from "./Misc";
import { DayDots, type DayDot } from "./Challenge";

/**
 * 같이 하기(묶음) — 진행표 한 줄과 겹친 아바타.
 * 진행표 한 줄: 아바타 · 닉네임(나·연 사람 표시) · 날짜 점(작게) · 해낸 날/목표 · 오른쪽 행동(응원).
 * 성분 숫자는 보이지 않는다 — 해낸 날만. 휴대폰에서 숫자 칸은 줄바꿈하지 않는다.
 */
export function MemberProgressRow({ name, me = false, host = false, days, done, goal, reached = false, action }: {
  name: string; me?: boolean; host?: boolean; days: DayDot[]; done: number; goal: number; reached?: boolean;
  /** 응원 버튼 등 */
  action?: ReactNode;
}) {
  return (
    <li className={cn("flex items-center gap-3 py-3", me && "-mx-3 px-3 rounded-md bg-sunken")}>
      <Avatar name={name} size="sm" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <p className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-label font-bold text-ink truncate">{name}</span>
          {me && <span className="text-caption text-brand-ink shrink-0">나</span>}
          {host && <span className="text-caption text-ink-2 shrink-0">연 사람</span>}
        </p>
        <DayDots days={days} size="sm" label={`${name}의 날짜별 진행`} />
      </div>
      <p className="shrink-0 whitespace-nowrap text-label text-ink-2 text-right">
        <span className={cn("num font-bold", reached ? "text-brand-ink" : "text-ink")}>{done}</span>/<span className="num">{goal}</span>일
      </p>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

/**
 * 묶음 보드 한 줄 — 오늘 인증했는지와 그 사진만 (사람끼리 해낸 날 수·순위를 비교하지 않는다).
 * photo 가 없고 proved 면 '인증했어요'(볼 수 없는 팔로워만 글), 아니면 '아직'. 사진을 누르면 그 글로 간다.
 */
export function MemberTodayRow({ name, me = false, host = false, proved, photo, full, href, album = false, action }: {
  name: string; me?: boolean; host?: boolean; proved: boolean; photo?: string | null; href?: string | null; album?: boolean;
  /** 작게 보기 사진이 없을 때 돌아갈 원래 사진 */
  full?: string | null;
  action?: ReactNode;
}) {
  const thumb = photo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={photo} alt={`${name}의 오늘 인증 사진`} className="size-14 rounded-md border border-line object-cover"
      onError={(e) => { if (full && e.currentTarget.src !== full) e.currentTarget.src = full; }} />
    : null;
  return (
    <li className={cn("flex items-center gap-3 py-3", me && "-mx-3 px-3 rounded-md bg-sunken")}>
      <Avatar name={name} size="sm" />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-label font-bold text-ink truncate">{name}</span>
          {me && <span className="text-caption text-brand-ink shrink-0">나</span>}
          {host && <span className="text-caption text-ink-2 shrink-0">연 사람</span>}
        </p>
        <p className={cn("text-caption", proved ? "text-ink" : "text-ink-2")}>
          {proved ? <>오늘 인증했어요{album && <span className="text-ink-2"> · 앨범에서 고름</span>}</> : "오늘 아직"}
        </p>
      </div>
      {thumb && (href ? <Link href={href} className="press shrink-0 rounded-md" aria-label={`${name}의 오늘 인증 글 보기`}>{thumb}</Link> : <span className="shrink-0">{thumb}</span>)}
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

/** 겹친 아바타 — 같이 하는 사람 몇 명 (넘치면 +n) */
export function AvatarStack({ names, max = 5, className }: { names: string[]; max?: number; className?: string }) {
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)} aria-label={`${names.length}명`}>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size="sm" className={cn("ring-2 ring-canvas", i > 0 && "-ml-2")} />
      ))}
      {more > 0 && <span className="-ml-2 size-8 rounded-full bg-sunken ring-2 ring-canvas text-caption text-ink-2 num flex items-center justify-center">+{more}</span>}
    </span>
  );
}
