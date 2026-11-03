"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import MealCard from "@/components/community/MealCard";
import DailyCard from "@/components/community/DailyCard";
import PostComposer from "@/components/community/PostComposer";

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

const CONCERN_LABELS: Record<string, string> = {
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
  const [toast, setToast] = useState("");
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
        setToast(`✅ "${data.title || "식단"}" 식단 리스트에 저장됨 · 보러가기 →`);
        setTimeout(() => setToast(""), 4000);
      }
    } catch { /* */ }
  };

  const handleFollow = async (authorId: string) => {
    try {
      const res = await fetch("/api/community/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower_id: userId.current, following_id: authorId }),
      });
      const data = await res.json();
      if (data.following) {
        setToast("팔로우했어요!");
      } else {
        setToast("팔로우를 취소했어요");
      }
      setTimeout(() => setToast(""), 2000);
    } catch { /* */ }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "recommend", label: "추천" },
    { key: "following", label: "팔로잉" },
    { key: "concern", label: "내 관심사" },
  ];

  return (
    <div className="max-w-lg mx-auto pb-24" style={{ background: "#0C1117", minHeight: "100vh" }}>
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 px-4 pt-4 pb-2" style={{ background: "#0C1117" }}>
        <h1 className="text-lg font-extrabold mb-3" style={{ color: "#ECEBE6" }}>식단 피드</h1>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setConcernFilter(""); }}
              className="text-[12px] px-3 py-1.5 rounded-full font-medium transition-colors"
              style={{
                background: tab === t.key ? "#C4870A" : "#252C35",
                color: tab === t.key ? "#0C1117" : "#8A919A",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Concern chips (visible when concern tab active) */}
        {tab === "concern" && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {Object.entries(CONCERN_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => setConcernFilter(concernFilter === key ? "" : key)}
                className="text-[11px] px-2.5 py-1 rounded-full shrink-0 transition-colors"
                style={{
                  background: concernFilter === key ? "rgba(196,135,10,0.2)" : "#252C35",
                  color: concernFilter === key ? "#C4870A" : "#8A919A",
                  border: concernFilter === key ? "1px solid rgba(196,135,10,0.3)" : "1px solid transparent",
                }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Feed ── */}
      <div className="px-4 space-y-3">
        {loading && posts.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#252C35", borderTopColor: "#C4870A" }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[14px] mb-1" style={{ color: "#ECEBE6" }}>
              {tab === "following" ? "팔로잉한 사람이 아직 없어요" : "아직 게시글이 없어요"}
            </p>
            <p className="text-[12px]" style={{ color: "#8A919A" }}>
              {tab === "following" ? "관심 있는 사람을 팔로우하면 여기에 나타나요" : "첫 번째 식단을 공유해보세요!"}
            </p>
          </div>
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

        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className="h-8" />}
        {hasMore && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#252C35", borderTopColor: "#C4870A" }} />
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          onClick={() => { if (toast.includes("보러가기")) router.push("/weekly-box"); }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-medium"
          style={{ background: "#C4870A", color: "#0C1117", maxWidth: "90vw", cursor: toast.includes("보러가기") ? "pointer" : "default" }}>
          {toast}
        </div>
      )}

      {/* ── FAB (글쓰기) ── */}
      <button onClick={() => setComposerOpen(true)}
        className="fixed bottom-20 right-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-lg z-40 transition-transform hover:scale-105 active:scale-95"
        style={{ background: "#C4870A", color: "#0C1117" }}>
        ✏️
      </button>

      {/* ── PostComposer ── */}
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
    </div>
  );
}
