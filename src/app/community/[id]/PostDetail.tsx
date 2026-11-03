"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import MealCard from "@/components/community/MealCard";
import DailyCard from "@/components/community/DailyCard";

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부", weight: "다이어트", energy: "활력",
  muscle: "근력", blood_pressure: "혈압", diabetes: "혈당", kidney: "신장",
};

const NICKNAME_ADJECTIVES = ["건강한", "활기찬", "든든한", "상쾌한", "깔끔한", "씩씩한", "발랄한", "포근한", "산뜻한", "튼튼한"];
const NICKNAME_ANIMALS = ["사자", "호랑이", "토끼", "곰", "여우", "다람쥐", "펭귄", "고래", "부엉이", "사슴"];

function getOrCreateNickname(): string {
  try {
    const raw = localStorage.getItem("carefood_profile");
    if (raw) {
      const p = JSON.parse(raw);
      if (p.nickname && p.nickname !== "익명") return p.nickname;
      // 닉네임 없으면 생성 후 저장
      const adj = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
      const animal = NICKNAME_ANIMALS[Math.floor(Math.random() * NICKNAME_ANIMALS.length)];
      const num = Math.floor(Math.random() * 100);
      const nick = `${adj}${animal}${num}`;
      p.nickname = nick;
      localStorage.setItem("carefood_profile", JSON.stringify(p));
      return nick;
    }
    // 프로필 자체가 없는 경우
    const adj = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
    const animal = NICKNAME_ANIMALS[Math.floor(Math.random() * NICKNAME_ANIMALS.length)];
    const num = Math.floor(Math.random() * 100);
    const nick = `${adj}${animal}${num}`;
    localStorage.setItem("carefood_profile", JSON.stringify({ nickname: nick }));
    return nick;
  } catch { return "익명"; }
}

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

type Comment = {
  id: string;
  author_nickname: string;
  content: string;
  created_at: string;
  user_id: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeedPost = any;

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [following, setFollowing] = useState(false);
  const [toast, setToast] = useState("");
  const userId = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { userId.current = getUserId(); }, []);

  /* ── Load post + comments ── */
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const uid = getUserId();
        // 단일 게시글 조회 API
        const [postRes, cRes] = await Promise.all([
          fetch(`/api/community/feed?id=${id}&user_id=${uid}`),
          fetch(`/api/community/comment?post_id=${id}`),
        ]);
        const postData = await postRes.json();
        if (postData.post) {
          setPost(postData.post);
          setFollowing(postData.post.is_following ?? false);
        }
        const cData = await cRes.json();
        setComments(cData.comments || []);
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  /* ── Actions ── */
  const handleLike = async () => {
    if (!post) return;
    setPost((p: FeedPost) => ({
      ...p,
      is_liked: !p.is_liked,
      like_count: p.is_liked ? Math.max((p.like_count || 0) - 1, 0) : (p.like_count || 0) + 1,
    }));
    await fetch("/api/community/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId.current, post_id: id }),
    });
  };

  const handleCopy = async () => {
    if (!post) return;
    const res = await fetch("/api/community/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: id, user_id: userId.current }),
    });
    if (res.ok) {
      const data = await res.json();
      setPost((p: FeedPost) => ({ ...p, copy_count: (p.copy_count || 0) + 1 }));
      setToast(`식단 ${data.copied || ""}개가 오늘 식단에 저장되었어요!`);
      setTimeout(() => setToast(""), 2500);
    } else {
      setToast("따라하기 실패 — 다시 시도해주세요");
      setTimeout(() => setToast(""), 2500);
    }
  };

  const handleFollow = async () => {
    if (!post) return;
    const res = await fetch("/api/community/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follower_id: userId.current, following_id: post.user_id }),
    });
    const data = await res.json();
    setFollowing(data.following ?? !following);
  };

  const handleComment = async () => {
    if (!commentText.trim() || sending) return;
    setSending(true);
    try {
      const nickname = getOrCreateNickname();
      const res = await fetch("/api/community/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId.current,
          post_id: id,
          content: commentText.trim(),
          author_nickname: nickname,
        }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments(prev => [...prev, data.comment]);
        setPost((p: FeedPost) => ({ ...p, comment_count: (p.comment_count || 0) + 1 }));
        setCommentText("");
      }
    } catch { /* */ }
    finally { setSending(false); }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto flex justify-center py-24" style={{ background: "#0C1117", minHeight: "100vh" }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#252C35", borderTopColor: "#C4870A" }} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center" style={{ background: "#0C1117", minHeight: "100vh" }}>
        <p className="text-[14px] mb-4" style={{ color: "#ECEBE6" }}>게시글을 찾을 수 없습니다</p>
        <button onClick={() => router.push("/community")} className="text-[13px] px-4 py-2 rounded-lg"
          style={{ background: "#252C35", color: "#C4870A" }}>
          피드로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24" style={{ background: "#0C1117", minHeight: "100vh" }}>
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ background: "#0C1117", borderBottom: "1px solid #252C35" }}>
        <button onClick={() => router.back()} className="text-[13px]" style={{ color: "#8A919A" }}>
          ← 뒤로
        </button>
        {post.user_id !== userId.current && (
          <button onClick={handleFollow}
            className="text-[11px] px-3 py-1 rounded-full font-medium transition-colors"
            style={{
              background: following ? "#252C35" : "#C4870A",
              color: following ? "#8A919A" : "#0C1117",
            }}>
            {following ? "팔로잉" : "팔로우"}
          </button>
        )}
      </div>

      {/* ── Post ── */}
      <div className="px-4 pt-3">
        {post.post_type === "meal" ? (
          <MealCard
            post={post}
            onLike={handleLike}
            onCopy={handleCopy}
            onComment={() => inputRef.current?.focus()}
          />
        ) : (
          <DailyCard
            post={post}
            onLike={handleLike}
            onComment={() => inputRef.current?.focus()}
          />
        )}
      </div>

      {/* ── Author concerns detail ── */}
      {post.author_concerns && post.author_concerns.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-lg p-3" style={{ background: "#161C24" }}>
            <p className="text-[11px] mb-2" style={{ color: "#8A919A" }}>작성자 건강 관심사</p>
            <div className="flex gap-1.5 flex-wrap">
              {post.author_concerns.map((c: string) => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(196,135,10,0.1)", color: "#C4870A" }}>
                  {CONCERN_LABELS[c] || c}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Comments ── */}
      <div className="px-4 mt-4">
        <p className="text-[13px] font-bold mb-3" style={{ color: "#ECEBE6" }}>
          댓글 {comments.length > 0 ? `(${comments.length})` : ""}
        </p>

        {comments.length > 0 ? (
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="rounded-lg p-3" style={{ background: "#161C24" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                      style={{ background: "#252C35", color: "#C4870A" }}>
                      {c.author_nickname[0]}
                    </div>
                    <span className="text-[12px] font-bold" style={{ color: "#ECEBE6" }}>{c.author_nickname}</span>
                  </div>
                  <span className="text-[10px]" style={{ color: "#8A919A" }}>{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-[12px] leading-relaxed ml-8" style={{ color: "#ECEBE6" }}>
                  {c.content}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-center py-6" style={{ color: "#8A919A" }}>
            아직 댓글이 없어요. 첫 댓글을 남겨보세요!
          </p>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-medium animate-[fadeIn_0.2s_ease]"
          style={{ background: "#C4870A", color: "#0C1117", maxWidth: "90vw" }}>
          {toast}
        </div>
      )}

      {/* ── Comment input (fixed bottom) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 border-t"
        style={{ background: "#161C24", borderColor: "#252C35" }}>
        <div className="max-w-lg mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
            placeholder="댓글을 입력하세요"
            className="flex-1 rounded-lg px-3 py-2 text-[13px] focus:outline-none"
            style={{ background: "#252C35", color: "#ECEBE6" }}
          />
          <button onClick={handleComment} disabled={!commentText.trim() || sending}
            className="px-3 py-2 rounded-lg text-[12px] font-bold disabled:opacity-40 transition-colors"
            style={{ background: "#C4870A", color: "#0C1117" }}>
            {sending ? "..." : "전송"}
          </button>
        </div>
      </div>
    </div>
  );
}
