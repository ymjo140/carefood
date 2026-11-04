"use client";

/**
 * 끌어서 놓기 — @dnd-kit/core 위에 디자인 시스템 모양만 얹은 것
 *
 *   <DragArea onDrop={(drag, drop) => …} renderOverlay={(drag) => <DragGhost>…</DragGhost>}>
 *     const d = useDragItem("cell:mon:lunch", { … });   → <div ref={d.setNodeRef}> … <DragHandle {...d.handle} label="점심 옮기기" />
 *     const t = useDropTarget("day:tue", { … });         → <button ref={t.setNodeRef} className={dropClass(t.isOver)}>
 *   </DragArea>
 *
 * - 손잡이(DragHandle)로만 끈다: 휴대폰에서 스크롤과 겹치지 않고, 카드 안 버튼도 그대로 눌린다.
 * - 마우스·터치·키보드(손잡이에 포커스 → 스페이스 → 화살표 → 스페이스) 모두 된다.
 * - 끄는 동안 원래 자리는 흐려지고(opacity), 손가락을 따라오는 건 DragGhost(transform) 하나.
 * - 끌기는 보조 수단이다. 같은 일을 버튼으로도 할 수 있게 둔다.
 */

import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  pointerWithin, rectIntersection,
  type DragEndEvent, type DragStartEvent, type Announcements, type CollisionDetection, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useState, type ReactNode, type HTMLAttributes } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

export type DragData = Record<string, unknown>;

/** 손가락(마우스) 아래 자리만 — 빈 곳에 놓으면 아무 일도 없다. 키보드일 때는 겹친 면적으로 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 || args.pointerCoordinates ? hits : rectIntersection(args);
};

/** 키보드 화살표 — 그 방향의 가장 가까운 놓을 자리로 한 번에 건너뛴다 */
const jumpToDropTarget: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, droppableContainers } }) => {
  const dir = ({ ArrowDown: "down", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right" } as const)[event.code as "ArrowDown"];
  if (!dir || !active || !collisionRect) return undefined;
  event.preventDefault();
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number } | undefined;
  let bestScore = Infinity;
  for (const c of droppableContainers.getEnabled()) {
    const r = droppableRects.get(c.id);
    if (!r) continue;
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const ahead = dir === "down" ? dy > 4 : dir === "up" ? dy < -4 : dir === "right" ? dx > 4 : dx < -4;
    if (!ahead) continue;
    const score = dir === "down" || dir === "up" ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = { x: r.left + r.width / 2 - collisionRect.width / 2, y: r.top + r.height / 2 - collisionRect.height / 2 };
    }
  }
  return best;
};

export function DragArea({ children, onDrop, renderOverlay, describe }: {
  children: ReactNode;
  /** 놓을 자리 위에서 놓았을 때 */
  onDrop: (drag: DragData, drop: DragData) => void;
  /** 끄는 동안 손가락을 따라오는 모양 */
  renderOverlay?: (drag: DragData) => ReactNode;
  /** 화면 읽기 프로그램에 읽어 줄 이름 (예: d => `${d.label}`) */
  describe?: (data: DragData | undefined) => string;
}) {
  const [active, setActive] = useState<DragData | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: jumpToDropTarget }),
  );
  const name = (d?: DragData) => (describe ? describe(d) : "항목");
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `${name(a.data.current)} 을(를) 집었어요. 화살표로 옮기고 스페이스로 놓아요`,
    onDragOver: ({ active: a, over }) => (over ? `${name(over.data.current)} 위에 있어요` : `${name(a.data.current)} 을(를) 옮기는 중이에요`),
    onDragEnd: ({ active: a, over }) => (over ? `${name(over.data.current)} 에 놓았어요` : `${name(a.data.current)} 을(를) 제자리에 두었어요`),
    onDragCancel: ({ active: a }) => `${name(a.data.current)} 옮기기를 취소했어요`,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      // 화면 가장자리 8% 에서만 저절로 스크롤 — 머리 아래 붙은 요일 줄 위에서 페이지가 밀려 올라가지 않게
      autoScroll={{ threshold: { x: 0, y: 0.08 } }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "스페이스나 엔터로 집고, 화살표로 옮기고, 다시 스페이스로 놓아요. Esc 는 취소예요." } }}
      onDragStart={(e: DragStartEvent) => setActive((e.active.data.current as DragData) || null)}
      onDragCancel={() => setActive(null)}
      onDragEnd={(e: DragEndEvent) => {
        setActive(null);
        if (e.over && e.active.id !== e.over.id) onDrop((e.active.data.current as DragData) || {}, (e.over.data.current as DragData) || {});
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>{active && renderOverlay ? renderOverlay(active) : null}</DragOverlay>
    </DndContext>
  );
}

/** 끌 수 있는 항목. 손잡이 props(handle)는 DragHandle 에 넘긴다 */
export function useDragItem(id: string, data: DragData, disabled = false) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data, disabled });
  return {
    setNodeRef,
    isDragging,
    /** 원래 자리에 붙일 클래스 — 끄는 동안 흐려진다 */
    itemClass: cn("transition-opacity duration-150", isDragging && "opacity-40"),
    handle: { ...attributes, ...listeners } as HTMLAttributes<HTMLButtonElement>,
  };
}

/** 놓을 자리. isOver 일 때 dropClass 로 표시한다 */
export function useDropTarget(id: string, data: DragData, disabled = false) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data, disabled });
  return { setNodeRef, isOver, isDragging: !!active };
}

/** 놓을 자리 표시 — 테두리 앰버 + 고른 상태 바탕 */
export function dropClass(isOver: boolean) {
  return isOver ? "border-brand bg-brand-soft" : "";
}

/** 손잡이 — 44px 누르는 영역, 터치 스크롤과 겹치지 않게 touch-none */
export function DragHandle({ label, className, ...props }: { label: string; className?: string } & HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        "inline-flex items-center justify-center size-11 -my-2 -ml-2 shrink-0 rounded-md text-ink-3 touch-none cursor-grab active:cursor-grabbing hover:text-ink hover:bg-sunken transition-colors",
        className,
      )}
    >
      <Icon name="grip" size={20} />
    </button>
  );
}

/** 끄는 동안 따라오는 모양 */
export function DragGhost({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-overlay text-label text-ink cursor-grabbing max-w-80">
      {children}
    </div>
  );
}
