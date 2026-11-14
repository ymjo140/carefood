"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button, EmptyState, Page, PageLoading, StoryAction, StoryCaption, StoryFrame, StoryHeader, StoryMedia, StoryProgress, StoryReply, StorySticker,
  mealMeta, timeAgo, useToast,
} from "@/components/ui";
import ShareCardSheet, { type ShareTarget } from "@/components/community/ShareCardSheet";
import { getOrCreateNickname } from "@/lib/nickname";

/**
 * 스토리 보기 — 피드 맨 위 '스토리' 칸을 누르면 여기로 (/stories?at=meal-<id> | group_buy-<id>).
 * 인스타 스토리처럼 사진·영상만 크게, 스티커 하나(누르면 게시물), 아래는 답글 칸.
 * - 사진은 5초, 영상은 끝까지 보여 주고 다음 사람으로. 왼쪽 1/3 누르면 이전, 꾹 누르면 멈춤, 화살표·Esc
 * - 답글은 그 게시물의 답글(공구는 질문)로 남고 올린 사람에게 알림이 간다 (1:1 메시지는 없음)
 * - 오른쪽 위 '게시물'로 글 상세·공구 상세에 간다. 공구 조건·구성 고르기·질문 목록은 상세에만 있다
 * - 내 스토리면 아래 줄이 '인증 카드 만들기'(인스타 공유)로 바뀐다
 * - 동작 줄이기를 켠 사람은 저절로 넘어가지 않는다(누를 때만)
 */
type Story = {
  kind: "meal" | "group_buy"; id: string; image: string | null; video: string | null; author: string; created_at: string;
  seconds: number | null; mine: boolean; liked: boolean; like_count: number; comment_count: number; text?: string;
  meal_type?: string | null; kcal?: number | null; protein_g?: number | null;
  product_name?: string; current_count?: number; target_count?: number; pct?: number | null; days_left?: number | null;
};

const PHOTO_MS = 5000;
const keyOf = (s: Story) => `${s.kind}-${s.id}`;
const postHref = (s: Pick<Story, "kind" | "id">) => (s.kind === "meal" ? `/community/${s.id}` : `/group-buy/${s.id}`);

export default function StoryViewer() {
  const router = useRouter();
  const at = useSearchParams().get("at") || "";
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Story[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const elapsed = useRef(0);

  /* ── 목록 (피드 줄과 같은 것) ── */
  useEffect(() => {
    let alive = true;
    fetch("/api/community/reels")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error);
        if (!alive) return;
        const items = (d.items || []) as Story[];
        const i = items.findIndex((s) => keyOf(s) === at);
        if (i < 0) {
          // 줄에서 빠진 것(30일 지남·마감) — 게시물로 바로
          const [kind, ...rest] = at.split("-");
          const id = rest.join("-");
          if ((kind === "meal" || kind === "group_buy") && id) { router.replace(postHref({ kind, id })); return; }
        }
        setIndex(Math.max(0, i));
        setState({ status: "done", items });
      })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [at, attempt, router]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); // eslint-disable-line react-hooks/set-state-in-effect -- 브라우저 설정은 그린 뒤에 읽는다
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  const items = state.items;
  const story = items[index] as Story | undefined;
  const paused = held || typing || hidden || !!share;

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/community");
  }, [router]);

  const go = useCallback((to: number) => {
    if (to < 0) { elapsed.current = 0; setProgress(0); return; }
    if (to >= items.length) { close(); return; }
    elapsed.current = 0;
    setProgress(0);
    setReply("");
    setIndex(to);
    // 주소도 지금 보는 것으로 (새로 고침·공유해도 같은 스토리)
    window.history.replaceState(null, "", `/stories?at=${keyOf(items[to])}`);
  }, [items, close]);

  /* ── 사진 타이머 (영상은 영상 시간으로) ── */
  useEffect(() => {
    if (!story || story.video || paused || reduced) return; // 동작 줄이기면 사진은 누를 때만 넘어간다
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const v = elapsed.current / PHOTO_MS;
      if (v >= 1) { go(index + 1); return; }
      setProgress(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story, paused, reduced, index, go]);

  // 다음 사진을 미리 받아 둔다
  useEffect(() => {
    const next = items[index + 1];
    if (next?.image) { const img = new Image(); img.src = next.image; }
  }, [items, index]);

  /* ── 키보드 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing || share) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typing, share, index, go, close]);

  const patch = (id: string, p: Partial<Story>) => setState((s) => ({ ...s, items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  const like = async () => {
    if (!story) return;
    const s = story;
    patch(s.id, { liked: !s.liked, like_count: Math.max(0, s.like_count + (s.liked ? -1 : 1)) });
    try {
      const r = s.kind === "meal"
        ? await fetch("/api/community/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: s.id }) })
        : await fetch(`/api/community/group-buy/${s.id}/like`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      if (typeof d.like_count === "number") patch(s.id, { liked: !!d.liked, like_count: d.like_count });
    } catch {
      patch(s.id, { liked: s.liked, like_count: s.like_count });
      toast.show("좋아요를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const send = async () => {
    if (!story || !reply.trim()) return;
    const s = story;
    setSending(true);
    try {
      const r = s.kind === "meal"
        ? await fetch("/api/community/comment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: s.id, content: reply.trim(), author_nickname: getOrCreateNickname() }) })
        : await fetch(`/api/community/group-buy/${s.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: reply.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      patch(s.id, { comment_count: s.comment_count + 1 });
      setReply("");
      toast.show(s.kind === "meal" ? "답글을 남겼어요. 게시물에서 볼 수 있어요" : "질문을 남겼어요. 공구 게시물에서 답을 볼 수 있어요");
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : null;
      toast.show(msg || "답글을 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSending(false); }
  };

  const sendLink = async () => {
    if (!story) return;
    const url = `${window.location.origin}${postHref(story)}`;
    try {
      if (navigator.share) { await navigator.share({ url }); return; }
      await navigator.clipboard.writeText(url);
      toast.show("링크를 복사했어요");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      toast.show("링크를 복사하지 못했어요. 게시물에서 주소를 복사해 주세요", { tone: "danger" });
    }
  };

  if (state.status === "loading") return <PageLoading />;
  if (state.status === "error") {
    return (
      <Page width="narrow">
        <EmptyState title="스토리를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", items: [] }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
      </Page>
    );
  }
  if (!story) {
    return (
      <Page width="narrow">
        <EmptyState title="지금 볼 스토리가 없어요" description="최근 30일 안에 사진·영상을 붙인 식단과 모으는 중인 공구가 여기에 나와요"
          action={<Button size="sm" variant="secondary" onClick={() => router.push("/community")}>피드로 가기</Button>} />
      </Page>
    );
  }

  const isMeal = story.kind === "meal";
  const meal = isMeal && story.meal_type ? mealMeta(story.meal_type).label : null;
  const stickerText = isMeal
    ? <>{meal ? `${meal} · ` : ""}{story.protein_g != null ? <>단백질 <span className="num font-bold">{Math.round(story.protein_g)}</span>g</> : "식단 기록 보기"}</>
    : <>공구{story.days_left != null ? ` D-${story.days_left}` : ""}{story.pct ? <> · <span className="num font-bold">{story.pct}</span>%</> : ""} · <span className="num">{story.current_count}/{story.target_count}</span>명</>;
  const caption = isMeal ? story.text : story.product_name;

  return (
    <>
      <StoryFrame label={`${story.author}의 ${isMeal ? "식단" : "공구"} 스토리 (${index + 1}/${items.length})`}
        onPrev={() => go(index - 1)} onNext={() => go(index + 1)} onHold={setHeld}
        top={<>
          <StoryProgress count={items.length} index={index} value={progress} />
          <StoryHeader author={story.author} meta={<>{isMeal ? "식단" : "공구"} · {timeAgo(story.created_at)}</>} paused={held}
            postHref={postHref(story)} postLabel={isMeal ? "게시물 보기" : "공구 게시물 보기"} onClose={close} />
        </>}
        sticker={
          <div className="w-full flex flex-col items-center gap-2">
            {caption && <StoryCaption>{caption}</StoryCaption>}
            <StorySticker href={postHref(story)} label={isMeal ? "게시물에서 식단 보기" : "공구 조건 보기"}>{stickerText}</StorySticker>
          </div>
        }
        footer={story.mine ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 min-w-0 text-label text-on-media">
              좋아요 <span className="num font-bold">{story.like_count}</span> · {isMeal ? "답글" : "질문"} <span className="num font-bold">{story.comment_count}</span>
            </p>
            {story.video && <StoryAction icon={muted ? "volume-off" : "volume-on"} label={muted ? "소리 켜기" : "소리 끄기"} active={!muted} onClick={() => setMuted((m) => !m)} />}
            <Button size="sm" icon="share" onClick={() => setShare({ kind: story.kind, id: story.id })}>인증 카드 만들기</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <StoryReply value={reply} onChange={setReply} onSubmit={send} sending={sending} onFocusChange={setTyping}
              placeholder={isMeal ? `${story.author} 님에게 답글` : `${story.author} 님에게 질문`} />
            {story.video && <StoryAction icon={muted ? "volume-off" : "volume-on"} label={muted ? "소리 켜기" : "소리 끄기"} active={!muted} onClick={() => setMuted((m) => !m)} />}
            <StoryAction icon="heart" label="좋아요" active={story.liked} onClick={like} />
            <StoryAction icon="send" label="링크 보내기" onClick={sendLink} />
          </div>
        )}>
        <StoryMedia image={story.image} video={story.video} alt={`${story.author}의 ${isMeal ? "식단" : `${story.product_name} 공구`}`}
          paused={paused} muted={muted}
          onTime={(t, d) => { if (d > 0) setProgress(t / d); }} onEnded={() => { if (!reduced) go(index + 1); }} />
      </StoryFrame>
      <ShareCardSheet target={share} open={!!share} onClose={() => setShare(null)} />
    </>
  );
}
