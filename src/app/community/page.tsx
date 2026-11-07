"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ThreadCard, { type FeedPostData } from "@/components/community/ThreadCard";
import PostComposer, { type Attach } from "@/components/community/PostComposer";
import { Avatar, Button, Chip, ChipRow, EmptyState, Icon, Page, PageHeader, SkeletonPost, Spinner, Tabs, useToast } from "@/components/ui";
import { COMMUNITY_TOPICS } from "@/lib/community-topics";
import { getOrCreateNickname } from "@/lib/nickname";

/**
 * 피드 (쓰레드형) — 맨 위 바로 쓰기 줄 → 보기(추천·팔로잉·모임·내 글) → 줄로 나눈 글 목록
 * ds-wiring-drop: /api/community/follow — 팔로우는 글 상세에서 (목록의 카드마다 있던 채운 버튼을 뺌)
 */
type Tab = "recommend" | "following" | "topic" | "mine";

const TABS: { value: Tab; label: string }[] = [
  { value: "recommend", label: "추천" },
  { value: "following", label: "팔로잉" },
  { value: "topic", label: "모임" },
  { value: "mine", label: "내 글" },
];

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("recommend");
  const [topic, setTopic] = useState<string>(COMMUNITY_TOPICS[0]);
  const [posts, setPosts] = useState<FeedPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [composer, setComposer] = useState<{ open: boolean; attach: Attach | null }>({ open: false, attach: null });
  const [nickname, setNick] = useState("");
  const toast = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 이 기기 저장소·주소는 화면을 그린 뒤에 읽는다 */
    setNick(getOrCreateNickname());
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "mine" || t === "following" || t === "topic") setTab(t);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /* ─── 불러오기 ─── */
  const fetchFeed = useCallback(async (pg = 1, append = false) => {
    if (pg === 1) setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ tab, page: String(pg) });
      if (tab === "topic") params.set("topic", topic);
      const res = await fetch(`/api/community/feed?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const incoming: FeedPostData[] = data.posts || [];
      setPosts((prev) => (append ? [...prev, ...incoming] : incoming));
      setHasMore(data.hasMore ?? false);
      setPage(pg);
    } catch {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [tab, topic]);

  useEffect(() => { fetchFeed(1, false); }, [fetchFeed]); // eslint-disable-line react-hooks/set-state-in-effect -- 보기를 바꿀 때마다 다시 불러온다

  /* ─── 아래로 내리면 더 불러오기 ─── */
  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchFeed(page + 1, true); },
      { threshold: 0.1 },
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore, page, fetchFeed]);

  /* ─── 동작 ─── */
  const handleLike = async (postId: string) => {
    const flip = (p: FeedPostData) => (p.id !== postId ? p : { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? Math.max((p.like_count || 0) - 1, 0) : (p.like_count || 0) + 1 });
    setPosts((prev) => prev.map(flip));
    try {
      const res = await fetch("/api/community/like", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setPosts((prev) => prev.map(flip)); // 되돌림
      toast.show("좋아요를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const handleCopy = async (postId: string) => {
    try {
      const res = await fetch("/api/community/copy", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, copy_count: (p.copy_count || 0) + 1 } : p)));
      toast.show(`"${data.title || "식단"}" 식단 리스트에 담았어요. 아래 식단 탭에서 볼 수 있어요`);
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const openComposer = (attach: Attach | null = null) => setComposer({ open: true, attach });

  const empty = {
    recommend: { title: "아직 글이 없어요", description: "첫 번째로 오늘 식단을 나눠 보세요" },
    following: { title: "팔로잉한 사람이 아직 없어요", description: "글을 열어 마음에 드는 사람을 팔로우하면 여기에 모여요" },
    topic: { title: `${topic} 모임에 아직 글이 없어요`, description: "글을 쓸 때 이 모임을 고르면 여기에 나와요" },
    mine: { title: "아직 쓴 글이 없어요", description: "오늘 먹은 걸 기록에서 골라 바로 올릴 수 있어요" },
  }[tab];

  return (
    <Page width="narrow">
      <PageHeader title="피드" />

      {/* ── 바로 쓰기 ── */}
      <section aria-label="바로 쓰기" className="flex gap-3 pb-4 border-b border-line">
        <Avatar name={nickname || "나"} />
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <button type="button" onClick={() => openComposer(null)}
            className="text-left min-h-10 text-body text-ink-3 hover:text-ink-2 transition-colors">
            오늘 뭐 먹었는지 나눠 보세요
          </button>
          <ChipRow>
            <Chip size="sm" onClick={() => openComposer("meal")}><Icon name="notebook" size={14} />기록한 끼니</Chip>
            <Chip size="sm" onClick={() => openComposer("plan")}><Icon name="calendar" size={14} />저장한 식단</Chip>
            <Chip size="sm" onClick={() => openComposer("product")}><Icon name="tag" size={14} />제품 태그</Chip>
            <Link href="/group-buy" className="press inline-flex items-center justify-center gap-1 rounded-full border whitespace-nowrap shrink-0 h-8 px-3 text-caption border-line bg-surface text-ink-2 font-medium hover:border-line-strong hover:text-ink">
              <Icon name="users" size={14} />공구 제안
            </Link>
          </ChipRow>
        </div>
      </section>

      {/* ── 보기 전환 ── */}
      <div className="sticky top-14 z-30 -mx-4 px-4 pt-3 pb-2 bg-canvas flex flex-col gap-2 border-b border-line">
        <Tabs label="피드 보기" value={tab} onChange={setTab} items={TABS} />
        {tab === "topic" && (
          <ChipRow>
            {COMMUNITY_TOPICS.map((t) => (
              <Chip key={t} size="sm" selected={topic === t} onClick={() => setTopic(t)}>{t}</Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {/* ── 글 ── */}
      <div className="flex flex-col">
        {loading && posts.length === 0 ? (
          <SkeletonPost count={3} />
        ) : loadError && posts.length === 0 ? (
          <EmptyState className="mt-4" title="피드를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => fetchFeed(1, false)}>다시 불러오기</Button>} />
        ) : posts.length === 0 ? (
          <EmptyState className="mt-4" title={empty.title} description={empty.description}
            action={tab === "following"
              ? <Button size="sm" variant="secondary" onClick={() => setTab("recommend")}>추천 글 보기</Button>
              : <Button size="sm" variant="secondary" icon="edit" onClick={() => openComposer(tab === "mine" ? "meal" : null)}>글 쓰기</Button>} />
        ) : (
          posts.map((post) => (
            <ThreadCard key={post.id} post={post}
              onLike={() => handleLike(post.id)}
              onCopy={() => handleCopy(post.id)}
              onReply={() => router.push(`/community/${post.id}#reply`)} />
          ))
        )}

        {hasMore && <div ref={sentinelRef} className="h-8" />}
        {hasMore && <div className="flex justify-center py-4"><Spinner size={20} /></div>}
        {loadError && posts.length > 0 && (
          <div className="flex justify-center py-4">
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => fetchFeed(page + 1, true)}>더 불러오지 못했어요 · 다시 불러오기</Button>
          </div>
        )}
      </div>

      <PostComposer
        isOpen={composer.open}
        initialAttach={composer.attach}
        nickname={nickname || "익명"}
        onClose={() => setComposer({ open: false, attach: null })}
        onPosted={() => { if (tab !== "recommend" && tab !== "mine") setTab("recommend"); else fetchFeed(1, false); }}
      />
    </Page>
  );
}
