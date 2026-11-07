"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "./cn";
import { Avatar } from "./Misc";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { mealMeta } from "./Meal";
import { Kcal, MacroInline } from "./Nutrition";

/**
 * 커뮤니티 글 — 작성자 줄 · 동작 줄 · 시간 표기.
 * 식단 카드·일상 카드·상세 화면이 같은 모양을 쓰도록 여기에 둡니다.
 */

export const AGE_GROUP_LABELS: Record<string, string> = {
  "10s": "10대", "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60s": "60대", "60plus": "60대+",
};

export const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부", weight: "다이어트", energy: "활력",
  muscle: "근력", blood_pressure: "혈압", diabetes: "혈당", kidney: "신장",
  balanced: "균형식단", weight_loss: "체중관리",
};

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 작성자 줄 — 아바타 · 이름 · 나이대·관심사 · 시간 · (팔로우) */
export function PostAuthor({
  nickname, ageGroup, concerns, createdAt, onAuthorClick, onFollow, following = false, right, size = "md",
}: {
  nickname: string;
  ageGroup?: string | null;
  concerns?: string[] | null;
  createdAt?: string;
  onAuthorClick?: () => void;
  onFollow?: () => void;
  following?: boolean;
  right?: ReactNode;
  size?: "sm" | "md";
}) {
  const meta = [ageGroup ? AGE_GROUP_LABELS[ageGroup] || ageGroup : null, ...(concerns || []).slice(0, 2).map((c) => CONCERN_LABELS[c] || c)]
    .filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={nickname} size={size} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {onAuthorClick ? (
            <button type="button" onClick={onAuthorClick} className="block py-1.5 text-label font-bold text-ink hover:underline underline-offset-4 truncate">{nickname}</button>
          ) : (
            <span className="text-label font-bold text-ink truncate">{nickname}</span>
          )}
          {createdAt && <span className="text-caption text-ink-3 shrink-0">{timeAgo(createdAt)}</span>}
        </div>
        {meta && <p className="text-caption text-ink-2 truncate">{meta}</p>}
      </div>
      {right}
      {onFollow && (
        <Button size="sm" variant="secondary" aria-pressed={following} onClick={onFollow} className="shrink-0">
          {following ? "팔로잉" : "팔로우하기"}
        </Button>
      )}
    </div>
  );
}

/** 동작 버튼 하나 — 아이콘 + 글자/숫자 */
export function PostAction({
  icon, label, count, active = false, onClick,
}: {
  icon: IconName; label: string; count?: number; active?: boolean; onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={count ? `${label} ${count}` : label}
      className={cn(
        "press inline-flex items-center gap-1.5 h-10 px-2.5 rounded-md text-label whitespace-nowrap",
        active ? "text-brand-ink font-bold" : "text-ink-2 font-medium hover:text-ink hover:bg-sunken",
      )}
    >
      <Icon key={active ? "on" : "off"} name={icon} size={18} filled={active && icon === "heart"} className={active && icon === "heart" ? "animate-pop" : undefined} />
      <span>{label}</span>
      {!!count && <span className="num">{count}</span>}
    </button>
  );
}

/** 동작 줄 — card: 카드 아래 선과 함께 / thread: 쓰레드형 글 안 (선 없이 왼쪽 정렬) */
export function PostActions({ children, className, variant = "card" }: { children: ReactNode; className?: string; variant?: "card" | "thread" }) {
  return <div className={cn("flex items-center gap-1", variant === "card" ? "border-t border-line px-2 py-1" : "-ml-2.5 flex-wrap", className)}>{children}</div>;
}

/**
 * 쓰레드형 글 한 개 — 카드 없이 아래 줄로 나눈다 (Threads 처럼).
 * 왼쪽: 아바타, 답글 미리보기가 있으면 세로 선으로 이어 작은 아바타. 오른쪽: 이름 · 모임 · 시간 → 내용 → 동작 → 답글 미리보기.
 * href 가 있으면 빈 곳을 눌러 글로 간다 (버튼·링크를 누른 경우는 제외). 키보드는 시간 링크로 간다.
 */
export function ThreadItem({
  nickname, topic, createdAt, href, children, actions, reply, menu, className,
}: {
  nickname: string; topic?: string | null; createdAt?: string; href?: string;
  children?: ReactNode; actions?: ReactNode; menu?: ReactNode; className?: string;
  /** 답글 미리보기 — 한 개 + 더 보기 */
  reply?: { nickname: string; content: string; more?: number } | null;
}) {
  const router = useRouter();
  return (
    <article
      className={cn("flex gap-3 py-4 border-b border-line", href && "cursor-pointer", className)}
      onClick={(e) => {
        if (!href || (e.target as HTMLElement).closest("button,a,input,textarea,select,label")) return;
        router.push(href);
      }}
    >
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <Avatar name={nickname} />
        {reply && <span aria-hidden="true" className="flex-1 w-0.5 rounded-full bg-line" />}
        {reply && <Avatar name={reply.nickname} size="xs" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-label font-bold text-ink truncate">{nickname}</span>
          {topic && <span className="text-caption text-ink-2 truncate">{topic}</span>}
          {createdAt && (href
            ? <Link href={href} className="inline-flex items-center min-h-8 px-1 -mx-1 text-caption text-ink-3 shrink-0 hover:underline">· {timeAgo(createdAt)}</Link>
            : <span className="text-caption text-ink-3 shrink-0">· {timeAgo(createdAt)}</span>)}
          {menu && <span className="ml-auto shrink-0">{menu}</span>}
        </div>
        {children}
        {actions}
        {reply && (
          <div className="flex flex-col gap-0.5">
            <p className="text-label text-ink-2 line-clamp-2"><b className="font-bold text-ink">{reply.nickname}</b> {reply.content}</p>
            {!!reply.more && reply.more > 0 && href && (
              <Link href={href} className="self-start inline-flex items-center min-h-8 text-label font-medium text-brand-ink hover:underline underline-offset-4">
                답글 <span className="num mx-0.5">{reply.more}</span>개 더 보기
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** 글에 붙은 끼니 — 끼니 · 칼로리 · 음식(앞 3개) · 탄단지 */
export function MealAttach({ mealType, foods, total, label, className }: {
  mealType?: string | null; label?: string;
  foods: { name: string; calories?: number }[];
  total?: { calories: number; protein_g?: number; carbs_g?: number; fat_g?: number } | null;
  className?: string;
}) {
  const shown = foods.slice(0, 3);
  return (
    <div className={cn("rounded-md bg-sunken px-3 py-2.5 flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-ink-2">{label || (mealType ? `${mealMeta(mealType).label} 기록` : "식단")} · <span className="num">{foods.length}</span>가지</span>
        {total && <Kcal value={Math.round(total.calories)} className="text-label" />}
      </div>
      <p className="text-label text-ink line-clamp-2">
        {shown.map((f) => f.name).join(" · ")}{foods.length > 3 && <span className="text-ink-2"> 외 <span className="num">{foods.length - 3}</span>가지</span>}
      </p>
      {total && <MacroInline values={{ protein: total.protein_g, carbs: total.carbs_g, fat: total.fat_g }} />}
    </div>
  );
}

/** 글에 붙은 일주일 식단 — 요일별 칼로리 · 하루 평균 */
export function PlanAttach({ title, dayKcal, avgKcal, avgProtein, className }: {
  title: string; dayKcal: (number | null)[]; avgKcal?: number | null; avgProtein?: number | null; className?: string;
}) {
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const filled = dayKcal.filter((k) => k && k > 0).length;
  return (
    <div className={cn("rounded-md bg-sunken px-3 py-2.5 flex flex-col gap-2", className)}>
      <span className="flex items-center gap-1.5 text-caption text-ink-2"><Icon name="calendar" size={14} />{title} · <span className="num">{filled}</span>일</span>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAYS.map((d, i) => (
          <span key={d} className="flex flex-col gap-0.5">
            <span className="text-caption text-ink-2">{d}</span>
            <span className="num text-caption text-ink">{dayKcal[i] ? (dayKcal[i]! >= 1000 ? `${(dayKcal[i]! / 1000).toFixed(1)}k` : Math.round(dayKcal[i]!)) : "–"}</span>
          </span>
        ))}
      </div>
      {avgKcal ? (
        <p className="text-label text-ink-2">하루 평균 <span className="num font-bold text-ink">{Math.round(avgKcal).toLocaleString("ko-KR")}</span>kcal
          {avgProtein ? <> · 단백질 <span className="num font-bold text-protein">{Math.round(avgProtein)}</span>g</> : null}</p>
      ) : null}
    </div>
  );
}

/** 글에 붙은 제품 — 누르면 케어푸드 제품 페이지로 (판매처로 바로 보내지 않는다) */
export function ProductTagLinks({ products, className }: { products?: { id: string; name: string }[] | null; className?: string }) {
  if (!products || products.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {products.map((p) => (
        <Link key={p.id} href={`/products/${p.id}`}
          className="inline-flex items-center gap-1 h-8 max-w-full px-2.5 rounded-sm border border-line bg-surface text-caption text-ink-2 hover:border-line-strong hover:text-ink transition-colors">
          <Icon name="tag" size={14} className="shrink-0" /><span className="truncate">{p.name}</span>
        </Link>
      ))}
    </div>
  );
}

/** #태그 줄 */
export function PostTags({ tags, className }: { tags?: string[] | null; className?: string }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((t) => <Badge key={t}>#{t}</Badge>)}
    </div>
  );
}

/**
 * 글 사진 1~4장 — 1장은 넓게, 2장은 나란히, 3장은 세 칸, 4장은 2×2.
 * onOpen 이 있으면 사진을 눌러 크게 본다 (글 상세). 없으면 글 전체를 누른 것으로 넘어간다 (피드)
 */
export function PhotoGrid({ urls, alt, onOpen, className }: { urls: string[]; alt: string; onOpen?: (i: number) => void; className?: string }) {
  if (!urls.length) return null;
  const n = Math.min(urls.length, 4);
  const shown = urls.slice(0, 4);
  return (
    <div className={cn("grid gap-1 overflow-hidden rounded-md border border-line bg-sunken", n === 1 ? "grid-cols-1" : n === 3 ? "grid-cols-3" : "grid-cols-2", className)}>
      {shown.map((u, i) => {
        // eslint-disable-next-line @next/next/no-img-element
        const img = <img src={u} alt={n > 1 ? `${alt} ${i + 1}/${n}` : alt} loading="lazy" className={cn("w-full object-cover", n === 1 ? "max-h-96" : "aspect-square")} />;
        return onOpen
          ? <button key={u} type="button" className="press block" aria-label={`사진 ${i + 1} 크게 보기`} onClick={() => onOpen(i)}>{img}</button>
          : <span key={u} className="block">{img}</span>;
      })}
    </div>
  );
}
