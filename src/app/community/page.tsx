"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import MealCard from "@/components/community/MealCard";
import DailyCard from "@/components/community/DailyCard";
import PostComposer from "@/components/community/PostComposer";
import { Button, Chip, ChipRow, EmptyState, Page, PageHeader, Spinner, Tabs, useToast } from "@/components/ui";

/* ─── helpers ─── */
function getUserId(): string {
  try {
    let id = localStorage.getItem("carefood_anon_id");
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("carefood_anon_id", id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

const NICKNAME_ADJECTIVES = ["건강한", "활기찬", "든든한", "상쾌한", "깔끔한", "씩씩한", "발랄한", "포근한", "산뜻한", "튼튼한"];
const NICKNAME_ANIMALS = ["사자", "호랑이", "토끼", "곰", "여우", "다람쥐", "펭귄", "고래", "부엉이", "사슴"];

function generateNickname(): string {
  const adj = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
  const animal = NICKNAME_ANIMALS[Math.floor(Math.random() * NICKNAME_ANIMALS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${animal}${num}`;
}

function getUserProfile(): { nickname: string; ageGroup?: string; concerns?: string[]; goals?: string[] } {
  try {
    const raw = localStorage.getItem("carefood_profile");
    if (raw) {
      const p = JSON.parse(raw);
      let nick = p.nickname || p.display_name;
      if (!nick || nick === "익명") {
        nick = generateNickname();
        // 생성된 닉네임 저장
        p.nickname = nick;
        localStorage.setItem("carefood_profile", JSON.stringify(p));
      }
      return {
        nickname: nick,
        ageGroup: p.age_group,
        concerns: p.health_concerns || p.concerns,
        goals: p.goals,
      };
    }
    // 프로필 자체가 없으면 닉네임만 생성해서 저장
    const nick = generateNickname();
    localStorage.setItem("carefood_profile", JSON.stringify({ nickname: nick }));
    return { nickname: nick };
  } catch { /* */ }
  return { nickname: generateNickname() };
}

const CONCERN_FILTERS: Record<string, string> = {
  gut_health: "장건강", skin: "피부", weight: "다이어트", energy: "활력",
  muscle: "근력", blood_pressure: "혈압", diabetes: "혈당", kidney: "신장",
};

type Tab = "recommend" | "following" | "concern";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeedPost = any;

/* ─── Page ─── */
export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("recommend");
  const [concernFilter, setConcernFilter] = useState("");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const toast = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const userId = useRef("");
  const profile = useRef<{ nickname: string; ageGroup?: string; concerns?: string[]; goals?: string[] }>({ nickname: "익명" });
  const router = useRouter();

  useEffect(() => {
    userId.current = getUserId();
    profile.current = getUserProfile();
  }, []);

  /* ─── fetch feed ─── */
  const fetchFeed = useCallback(async (pg = 1, append = false) => {
    if (pg === 1) setLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        page: String(pg),
        user_id: userId.current,
      });
      if (tab === "concern" && concernFilter) params.set("concern", concernFilter);
      const res = await fetch(`/api/community/feed?${params}`);
      const data = await res.json();
      const incoming: FeedPost[] = data.posts || [];
      setPosts(prev => append ? [...prev, ...incoming] : incoming);
      setHasMore(data.hasMore ?? false);
      setPage(pg);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [tab, concernFilter]);

  useEffect(() => { fetchFeed(1, false); }, [fetchFeed]);

  /* ─── infinite scroll ─── */
  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) fetchFeed(page + 1, true); },
      { threshold: 0.1 },
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore, page, fetchFeed]);

  /* ─── actions ─── */
  const handleLike = async (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? Math.max((p.like_count || 0) - 1, 0) : (p.like_count || 0) + 1 };
    }));
    try {
      await fetch("/api/community/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId.current, post_id: postId }),
      });
    } catch { fetchFeed(1); }
  };

  const handleCopy = async (postId: string) => {
    try {
      const res = await fetch("/api/community/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, user_id: userId.current }),
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, copy_count: (p.copy_count || 0) + 1 } : p
        ));
        toast.show(`"${data.title || "식단"}" 식단 리스트에 담았어요`, { action: { label: "보기", href: "/weekly-box" } });
      } else {
        toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      }
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const handleFollow = async (authorId: string) => {
    try {
      const res = await fetch("/api/community/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower_id: userId.current, following_id: authorId }),
      });
      const data = await res.json();
      toast.show(data.following ? "팔로우했어요" : "팔로우를 취소했어요");
    } catch { /* */ }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "recommend", label: "추천" },
    { key: "following", label: "팔로잉" },
    { key: "concern", label: "내 관심사" },
  ];

  return (
    <Page width="narrow">
      <PageHeader title="식단 피드" description="다른 사람의 식단을 보고 내 식단 리스트에 담아 보세요" />

      {/* ── 보기 전환 ── */}
      <div className="sticky top-14 z-30 -mx-4 px-4 pt-1 pb-3 bg-canvas flex flex-col gap-2">
        <Tabs
          label="피드 보기"
          value={tab}
          onChange={(v) => { setTab(v); setConcernFilter(""); }}
          items={TABS.map(t => ({ value: t.key, label: t.label }))}
        />
        {tab === "concern" && (
          <ChipRow>
            {Object.entries(CONCERN_FILTERS).map(([key, label]) => (
              <Chip key={key} size="sm" selected={concernFilter === key} onClick={() => setConcernFilter(concernFilter === key ? "" : key)}>
                {label}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {/* ── 피드 ── */}
      <div className="flex flex-col gap-3">
        {loading && posts.length === 0 ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : posts.length === 0 ? (
          <EmptyState
            title={tab === "following" ? "팔로잉한 사람이 아직 없어요" : "아직 게시글이 없어요"}
            description={tab === "following" ? "관심 있는 사람을 팔로우하면 여기에 나타나요" : "첫 번째 식단을 공유해 보세요"}
            action={tab === "following" ? undefined : <Button size="sm" icon="edit" onClick={() => setComposerOpen(true)}>글 쓰기</Button>}
          />
        ) : (
          posts.map((post: FeedPost) =>
            post.post_type === "meal" ? (
              <MealCard
                key={post.id}
                post={post}
                onLike={() => handleLike(post.id)}
                onCopy={() => handleCopy(post.id)}
                onComment={() => router.push(`/community/${post.id}`)}
                onAuthorClick={() => router.push(`/community/${post.id}`)}
                onFollow={post.user_id !== userId.current ? () => handleFollow(post.user_id) : undefined}
                onCardClick={() => router.push(`/community/${post.id}`)}
              />
            ) : (
              <DailyCard
                key={post.id}
                post={post}
                onLike={() => handleLike(post.id)}
                onComment={() => router.push(`/community/${post.id}`)}
                onFollow={post.user_id !== userId.current ? () => handleFollow(post.user_id) : undefined}
                onCardClick={() => router.push(`/community/${post.id}`)}
              />
            )
          )
        )}

        {/* 무한 스크롤 감지 */}
        {hasMore && <div ref={sentinelRef} className="h-8" />}
        {hasMore && <div className="flex justify-center py-4"><Spinner size={20} /></div>}
      </div>

      {/* ── 글쓰기 버튼 ── */}
      <Button
        icon="edit"
        onClick={() => setComposerOpen(true)}
        className="fixed z-40 rounded-full shadow-overlay right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        글 쓰기
      </Button>

      <PostComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        userId={userId.current}
        nickname={profile.current.nickname}
        ageGroup={profile.current.ageGroup}
        concerns={profile.current.concerns}
        goals={profile.current.goals}
        onPosted={() => fetchFeed(1, false)}
      />
    </Page>
  );
}
