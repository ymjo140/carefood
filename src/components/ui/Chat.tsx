import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { ListRow, Thumb } from "./Misc";

/**
 * 캐릭터와 이야기하기 — 말풍선 한 줄. 캐릭터는 왼쪽(얼굴 + 테두리 풍선), 나는 오른쪽(옅은 바탕 풍선).
 * 이어지는 캐릭터 말은 얼굴을 한 번만(avatar 를 비우면 자리만 둔다). 색 바탕·그림자 없음.
 */
export function ChatBubble({ from, avatar, children, className }: {
  from: "buddy" | "me"; avatar?: ReactNode; children: ReactNode; className?: string;
}) {
  if (from === "me") {
    return (
      <div className={cn("flex justify-end pl-12", className)}>
        <p className="rounded-lg rounded-tr-sm bg-sunken px-3.5 py-2.5 text-body text-ink whitespace-pre-line break-words min-w-0">{children}</p>
      </div>
    );
  }
  return (
    <div className={cn("flex items-start gap-2 pr-12", className)}>
      <span className="size-10 shrink-0 flex items-center justify-center" aria-hidden="true">{avatar}</span>
      <p className="rounded-lg rounded-tl-sm border border-line bg-surface px-3.5 py-2.5 text-body text-ink whitespace-pre-line break-words min-w-0">{children}</p>
    </div>
  );
}

/** 캐릭터가 답을 쓰는 중 — 점 세 개가 차례로 옅어졌다 짙어진다 (opacity 만, 동작 줄이기면 멈춤) */
export function ChatTyping({ avatar, label = "답을 쓰고 있어요" }: { avatar?: ReactNode; label?: string }) {
  return (
    <div className="flex items-start gap-2" role="status" aria-label={label}>
      <span className="size-10 shrink-0 flex items-center justify-center" aria-hidden="true">{avatar}</span>
      <span className="flex items-center gap-1 rounded-lg rounded-tl-sm border border-line bg-surface px-4 h-11" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-ink-3 animate-skeleton" style={{ animationDelay: `${i * 150}ms` }} />)}
      </span>
    </div>
  );
}

/**
 * 캐릭터가 고른 추천 — 말풍선 바로 아래, 얼굴 자리만큼 들여서. 우리 DB 에서 고른 것만(제품은 상세로 가는 줄, 대표 메뉴는 이름과 숫자만).
 * 줄마다 이름 · 숫자 한 줄(물은 기준이 맨 앞). 색 바탕·배지 없이 테두리 카드 한 겹.
 */
export type ChatPickItem = { id: string; name: string; maker?: string | null; image?: string | null; facts: string; href?: string | null };
export function ChatPicks({ items, label = "추천", className }: { items: ChatPickItem[]; label?: string; className?: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label={label} className={cn("ml-12 flex flex-col rounded-lg border border-line bg-surface divide-y divide-line overflow-hidden", className)}>
      {items.map((it) => (
        <li key={it.id}>
          <ListRow href={it.href ?? undefined}
            leading={it.href ? <Thumb src={it.image} alt="" size={40} /> : undefined}
            title={it.name}
            meta={<span className="num">{it.maker ? `${it.maker} · ` : ""}{it.facts}</span>}
            trailing={it.href ? <Icon name="chevron-right" size={18} className="text-ink-3" /> : undefined} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 캐릭터가 짠 하루·일주일 식단 — 묶음(끼니 또는 요일)마다 머리 줄 + 추천 줄, 맨 아래 행동 하나(예: 일주일 식단에 담기).
 * ChatPicks 와 같은 테두리 카드 한 겹. 머리 줄 오른쪽 숫자는 그 묶음의 열량 합.
 */
export function ChatPlan({ groups, label, action, compact = false, className }: {
  groups: { key: string; title: string; meta?: ReactNode; items: ChatPickItem[] }[];
  label: string; action?: ReactNode;
  /** 일주일처럼 줄이 많을 때 — 이름·숫자를 한 줄씩 작게 (상세로 가는 줄 없이) */
  compact?: boolean; className?: string;
}) {
  if (!groups.length) return null;
  return (
    <section aria-label={label} className={cn("ml-12 rounded-lg border border-line bg-surface overflow-hidden", className)}>
      <ul className="flex flex-col divide-y divide-line">
        {groups.map((g) => (
          <li key={g.key} className="flex flex-col">
            <p className="flex items-baseline justify-between gap-2 px-3 pt-2.5 text-label font-bold text-ink">
              <span>{g.title}</span>{g.meta && <span className="text-caption font-medium text-ink-2 num whitespace-nowrap">{g.meta}</span>}
            </p>
            {compact ? (
              <ul className="flex flex-col gap-1 px-3 pt-1.5 pb-2.5">
                {g.items.map((it) => (
                  <li key={`${g.key}-${it.id}`} className="flex items-baseline justify-between gap-2 text-label text-ink min-w-0">
                    <span className="truncate">{it.name}</span><span className="text-caption text-ink-2 num whitespace-nowrap">{it.facts}</span>
                  </li>
                ))}
              </ul>
            ) : g.items.map((it) => (
              <ListRow key={`${g.key}-${it.id}`} href={it.href ?? undefined}
                title={it.name}
                meta={<span className="num">{it.maker ? `${it.maker} · ` : ""}{it.facts}</span>}
                trailing={it.href ? <Icon name="chevron-right" size={18} className="text-ink-3" /> : undefined} />
            ))}
          </li>
        ))}
      </ul>
      {action && <div className="border-t border-line p-3">{action}</div>}
    </section>
  );
}
