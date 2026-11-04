"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import MealCard from "@/components/community/MealCard";
import DailyCard from "@/components/community/DailyCard";
import { Avatar, Badge, BottomBar, Button, Card, EmptyState, Input, Page, PageLoading, SectionHeader, useToast } from "@/components/ui";
import { CONCERN_LABELS, timeAgo } from "@/components/ui/FeedPost";

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
  const toast = useToast();
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
      toast.show(`"${data.title || "식단"}" 식단 리스트에 담았어요`, { action: { label: "보기", href: "/weekly-box" } });
    } else {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
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
    const next = data.following ?? !following;
    setFollowing(next);
    toast.show(next ? "팔로우했어요" : "팔로우를 취소했어요");
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



  if (loading) return <PageLoading />;

  if (!post) {
    return (
      <Page width="narrow">
        <EmptyState
          title="게시글을 찾을 수 없어요"
          description="삭제됐거나 주소가 바뀌었을 수 있어요"
          action={<Button size="sm" variant="secondary" onClick={() => router.push("/community")}>피드로 돌아가기</Button>}
        />
      </Page>
    );
  }

  const isMine = post.user_id === userId.current;

  return (
    <Page width="narrow" className="pb-32">
      {/* ── 위쪽 줄 ── */}
      <div className="flex items-center justify-between gap-2 mb-3 -ml-2">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => router.back()}>뒤로</Button>
        {!isMine && (
          <Button size="sm" variant={following ? "secondary" : "primary"} onClick={handleFollow}>
            {following ? "팔로잉" : "팔로우"}
          </Button>
        )}
      </div>

      {/* ── 글 ── */}
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

      {/* ── 작성자 건강 관심사 ── */}
      {post.author_concerns && post.author_concerns.length > 0 && (
        <Card tone="sunken" padding="sm" className="mt-3">
          <p className="text-caption text-ink-2 mb-2">작성자 건강 관심사</p>
          <div className="flex gap-1.5 flex-wrap">
            {post.author_concerns.map((c: string) => (
              <Badge key={c} tone="brand">{CONCERN_LABELS[c] || c}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* ── 댓글 ── */}
      <section className="mt-6">
        <SectionHeader title={<>댓글 {comments.length > 0 && <span className="num text-ink-2">{comments.length}</span>}</>} />
        {comments.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {comments.map(c => (
              <li key={c.id} className="flex gap-3 py-3">
                <Avatar name={c.author_nickname} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-label font-bold text-ink truncate">{c.author_nickname}</span>
                    <span className="text-caption text-ink-3 shrink-0">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-body text-ink mt-0.5 whitespace-pre-line">{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-label text-ink-2 text-center py-8">아직 댓글이 없어요. 첫 댓글을 남겨 보세요</p>
        )}
      </section>

      {/* ── 댓글 입력 (아래 고정) ── */}
      <BottomBar>
        <form
          className="flex-1 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); handleComment(); }}
        >
          <Input
            ref={inputRef}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="댓글을 입력하세요"
            aria-label="댓글"
          />
          <Button type="submit" disabled={!commentText.trim()} loading={sending} className="shrink-0">남기기</Button>
        </form>
      </BottomBar>
    </Page>
  );
}
