"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Badge, Button, Card, CardActions, CardButton, Chip, ChipRow, ConfirmSheet, EmptyState, Field, Icon, ICON_NAMES, IconButton, IconLink,
  Input, Kcal, LinkButton, ListRow, MacroGrid, MacroInline, MealSlot, MealTag, Notice, Estimate, HowCounted, AsOf, CodeBlock, TrendChart, BarList, GapChart, Page, PageHeader, Price,
  ProgressBar, SearchField, SectionHeader, Select, Sheet, Spinner, Stat, Steps, Tabs, Textarea, TextLink, TextButton, Thumb, ProductImage,
  Avatar, useToast, cn, type BadgeTone,
  BottomNavItems, SkeletonList, FoodEntryForm, DragArea, DragGhost, DragHandle, useDragItem, useDropTarget, type DragData, ChoiceCard, ChoiceList, LinkTabs, RatingStars, RatingInput, ScaleInput, QuickRating, PostAuthor, PostAction, PostActions, PostTags, ThreadItem, MealAttach, PlanAttach, ProductTagLinks, PhotoGrid, PollAttach, DayDots, Switch,
  ReelRow, ReelTile, ReelAddTile, ReelSkeleton, ReelMedia, CommentItem, VideoAttach, OfferOptionList, QtyStepper, UnitInput, RangeInput,
} from "@/components/ui";

// 서버(UTC)와 브라우저 시간대가 달라도 같은 글자가 나오도록 한국 시간으로 고정
function kst(at: string | number, dateOnly = false) {
  const opts: Intl.DateTimeFormatOptions = dateOnly
    ? { timeZone: "Asia/Seoul", dateStyle: "medium" }
    : { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat("ko-KR", opts).format(new Date(at));
}

/* ════════════════════════════════════════════════════════════
   기준 페이지 — 사람에게는 리뷰 화면, AI 에게는 카탈로그.
   여기 그려지지 않은 컴포넌트·값은 화면에서 쓰지 않습니다.
   ════════════════════════════════════════════════════════════ */

export type DsStatus = {
  checkedAt: string;
  measuredAt: string;
  baselineAt: string;
  files: number;
  build: { builtAt: string; sha: string; message: string; branch: string; env: string };
  total: number;
  warnTotal: number;
  allowedCount: number;
  rules: { id: string; level?: string; message: string; count: number }[];
  topFiles: [string, number][];
  sample: { file: string; line: number; rule: string; level?: string; match: string }[];
  allowed: { file: string; line: number; rule: string; snippet: string }[];
  metrics: { label: string; before: number; after: number }[];
  audit: {
    auditedAt: string; base: string; commit: string | null; pages: number; variants: string[]; screenshots: number; blocking: number;
    totals: Record<string, number>; byPage: { route: string; url: string; issues: number }[];
  };
};

const REPO = "https://github.com/ymjo140/carefood";
const AUDIT_RUNS = `${REPO}/actions/workflows/design-system.yml`;

const AUDIT_LABELS: Record<string, string> = {
  error: "화면 오류·실패 요청", overflow: "가로 넘침", "off-color": "기준 밖 색", contrast: "흐린 글자",
  "word-break": "한글 단어 쪼개짐", "tiny-text": "12px 미만 글자", "touch-target": "작은 터치 영역 (경고)",
};

/* ── 색 목록: 이름 · 용도 · 대비를 잴 바탕 ── */
type ColorSpec = { token: string; usage: string; on?: string; kind?: "text" | "fill" | "deco" };
const COLOR_GROUPS: { title: string; note?: string; items: ColorSpec[] }[] = [
  {
    title: "바탕 · 면",
    note: "면은 두 단계(흰 면 + 옅은 바탕). 앰버 쪽으로 아주 살짝 기운 무채색",
    items: [
      { token: "canvas", usage: "페이지 바탕", kind: "fill" },
      { token: "surface", usage: "카드 · 시트 · 입력창", kind: "fill" },
      { token: "sunken", usage: "칩 · 빈 칸 · 안내 상자 · 영양 타일", kind: "fill" },
      { token: "line", usage: "테두리 · 구분선", kind: "fill" },
      { token: "line-strong", usage: "마우스를 올린 테두리", kind: "fill" },
    ],
  },
  {
    title: "글자",
    note: "세 단계만. 모두 대비 4.5 이상",
    items: [
      { token: "ink", usage: "제목 · 본문", on: "surface" },
      { token: "ink-2", usage: "보조 설명", on: "surface" },
      { token: "ink-3", usage: "메타 정보 · 자리표시", on: "sunken" },
    ],
  },
  {
    title: "강조색 (맑은 앰버)",
    note: "OKLCH 밝기 0.74 · 채도 0.16. 채운 면은 주 버튼 한 곳, 같은 색을 고른 상태·링크·핵심 숫자에 약하게 이어 씀. 앰버 위 글자는 먹색",
    items: [
      { token: "brand", usage: "주 버튼 면 · 진행 막대 · 고른 테두리", kind: "fill" },
      { token: "brand-hover", usage: "주 버튼에 마우스를 올렸을 때", kind: "fill" },
      { token: "brand-soft", usage: "고른 칩·탭·선택지 바탕 (옅은 색 면은 여기만)", kind: "fill" },
      { token: "brand-ink", usage: "링크 · 고른 상태 글자 · 포커스 링", on: "surface" },
      { token: "on-brand", usage: "주 버튼 글자", on: "brand" },
    ],
  },
  {
    title: "상태",
    note: "글자·아이콘으로만. 색 알약·색 상자 없음. 주의는 색 대신 경고 아이콘 모양으로",
    items: [
      { token: "positive", usage: "적합 · 완료 · 목표 달성", on: "surface" },
      { token: "danger", usage: "알레르기 경고 · 삭제 · 오류", on: "sunken" },
    ],
  },
  {
    title: "영양소 (데이터 색)",
    note: "UI 색과 따로 센다. 숫자 · 막대 · 점에만 칠하고 바탕에는 쓰지 않음",
    items: [
      { token: "protein", usage: "단백질", on: "sunken" },
      { token: "carbs", usage: "탄수화물", on: "sunken" },
      { token: "fat", usage: "지방", on: "sunken" },
      { token: "sodium", usage: "나트륨", on: "sunken" },
    ],
  },
  {
    title: "장식 · 겹침",
    items: [
      { token: "highlight", usage: "형광펜 — 한 화면 핵심 숫자 하나", kind: "fill" },
      { token: "scrim", usage: "시트 뒤 어둡게 가리는 막", kind: "deco" },
      { token: "media-scrim", usage: "사진·영상 위 글자 띠 (숏폼 칸·보기 화면)", kind: "deco" },
      { token: "on-media", usage: "사진 위 띠 안의 글자 · 아이콘", on: "media-scrim" },
    ],
  },
];
/* Tailwind 가 클래스 이름을 찾을 수 있게 전체 이름으로 적어 둠 */
const BG: Record<string, string> = {
  "canvas": "bg-canvas",
  "surface": "bg-surface",
  "sunken": "bg-sunken",
  "line": "bg-line",
  "line-strong": "bg-line-strong",
  "ink": "bg-ink",
  "ink-2": "bg-ink-2",
  "ink-3": "bg-ink-3",
  "brand": "bg-brand",
  "brand-hover": "bg-brand-hover",
  "brand-soft": "bg-brand-soft",
  "brand-ink": "bg-brand-ink",
  "on-brand": "bg-on-brand",
  "positive": "bg-positive",
  "danger": "bg-danger",
  "protein": "bg-protein",
  "carbs": "bg-carbs",
  "fat": "bg-fat",
  "sodium": "bg-sodium",
  "highlight": "bg-highlight",
  "scrim": "bg-scrim",
  "media-scrim": "bg-media-scrim",
  "on-media": "bg-on-media",
};
const TX: Record<string, string> = {
  "canvas": "text-canvas",
  "surface": "text-surface",
  "sunken": "text-sunken",
  "line": "text-line",
  "line-strong": "text-line-strong",
  "ink": "text-ink",
  "ink-2": "text-ink-2",
  "ink-3": "text-ink-3",
  "brand": "text-brand",
  "brand-hover": "text-brand-hover",
  "brand-soft": "text-brand-soft",
  "brand-ink": "text-brand-ink",
  "on-brand": "text-on-brand",
  "positive": "text-positive",
  "danger": "text-danger",
  "protein": "text-protein",
  "carbs": "text-carbs",
  "fat": "text-fat",
  "sodium": "text-sodium",
  "highlight": "text-highlight",
  "scrim": "text-scrim",
  "media-scrim": "text-media-scrim",
  "on-media": "text-on-media",
};
const ALL_TOKENS = COLOR_GROUPS.flatMap((g) => g.items.map((i) => i.token));

/* ── 대비 계산 ── */
function parseColor(v: string): [number, number, number] | null {
  v = v.trim();
  if (v.startsWith("#")) {
    const h = v.slice(1);
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = v.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function lum([r, g, b]: [number, number, number]) {
  const c = [r, g, b].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const x = parseColor(a), y = parseColor(b);
  if (!x || !y) return null;
  const l1 = lum(x), l2 = lum(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* ── 섹션 ── */
const SECTIONS = [
  ["status", "검사 현황"], ["colors", "색"], ["type", "글자"], ["shape", "모양"], ["motion", "모션"], ["buttons", "버튼"],
  ["icons", "아이콘"], ["labels", "배지·칩·탭"], ["inputs", "입력"], ["cards", "카드·목록"],
  ["nutrition", "영양"], ["meals", "끼니"], ["drag", "끌어서 놓기"], ["feedback", "안내·빈 상태"], ["bottom-nav", "탭 바"], ["overlays", "시트·알림"], ["rules", "규칙"],
] as const;

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 py-8 border-t border-line">
      <SectionHeader title={title} description={description} className="mb-4" />
      {children}
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-caption text-ink-2 bg-sunken rounded-sm px-1.5 py-0.5 break-all">{children}</code>;
}

function Demo({ label, code, children, className }: { label?: string; code?: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className={cn("rounded-lg border border-line bg-surface p-4", className)}>{children}</div>
      {(label || code) && (
        <div className="flex flex-wrap items-center gap-2">
          {label && <span className="text-caption text-ink-2">{label}</span>}
          {code && <Code>{code}</Code>}
        </div>
      )}
    </div>
  );
}

/* ════════════════════ 페이지 ════════════════════ */
export default function Reference({ status }: { status: DsStatus }) {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tabA, setTabA] = useState<"rec" | "follow" | "mine">("rec");
  const [tabB, setTabB] = useState<"search" | "fav" | "list" | "manual">("search");
  const [chips, setChips] = useState<string[]>(["고단백"]);
  const [q, setQ] = useState("");
  const [range, setRange] = useState(6);
  const [goal, setGoal] = useState("muscle");
  const [ate, setAte] = useState<string | null>("all");
  const [stars, setStars] = useState(4);
  const [scale, setScale] = useState(3);
  const [liked, setLiked] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    if (theme === "system") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", theme);
    return () => { if (prev) el.setAttribute("data-theme", prev); else el.removeAttribute("data-theme"); };
  }, [theme]);

  const passed = status.total === 0;

  return (
    <Page width="wide">
      <PageHeader
        title="케어푸드 디자인 시스템"
        description="새 화면은 여기 있는 값과 컴포넌트만 씁니다. 없는 게 필요하면 먼저 여기에 추가하세요."
        actions={
          <Tabs label="테마" items={[{ value: "system", label: "시스템" }, { value: "light", label: "라이트" }, { value: "dark", label: "다크" }]}
            value={theme} onChange={setTheme} />
        }
      />

      {/* 목차 */}
      <nav aria-label="목차" className="sticky top-14 z-30 -mx-4 px-4 py-2 bg-canvas border-b border-line">
        <div className="flex gap-1 scroll-row">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 h-8 px-3 inline-flex items-center rounded-full text-caption font-medium text-ink-2 hover:bg-sunken hover:text-ink">{label}</a>
          ))}
        </div>
      </nav>

      {/* ───────────── 검사 현황 ───────────── */}
      <Section id="status" title="기준 지키기 현황"
        description={<>배포할 때마다 <Code>scripts/ds/lint.mjs</Code> 와 <Code>measure.mjs</Code> 가 다시 셉니다 · 마지막 검사 {kst(status.checkedAt)}</>}>
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-label font-bold text-ink">이 페이지가 보여 주는 배포</p>
            <Badge tone={status.build.env === "production" ? "brand" : "neutral"}>{status.build.env === "production" ? "운영" : status.build.env === "preview" ? "미리보기" : "로컬"}</Badge>
          </div>
          <p className="text-label text-ink mt-1">
            <a href={`${REPO}/commit/${status.build.sha}`} target="_blank" rel="noreferrer" className="font-mono text-brand-ink underline-offset-4 hover:underline">{status.build.sha.slice(0, 7)}</a>
            {" "}{status.build.message}
          </p>
          <p className="text-caption text-ink-2 mt-0.5">{status.build.branch} · {kst(status.build.builtAt)} 빌드</p>
          <p className="text-caption text-ink-3 mt-2">코드를 바꿔 배포하면 이 커밋과 아래 숫자가 바뀝니다. 숫자가 그대로면 아직 배포가 끝나지 않은 겁니다.</p>
        </Card>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Card tone={passed ? "default" : "default"}>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone={passed ? "positive" : "danger"}>{passed ? "통과" : "위반 있음"}</Badge>
              <span className="text-caption text-ink-2">화면 코드 {status.files}개 파일</span>
            </div>
            <Stat size="lg" emphasis label="기준 밖 값 (정적 검사 오류)" value={status.total.toLocaleString()} unit="건" />
            <p className="text-caption text-ink-2 mt-2">경고 {status.warnTotal}건 · 예외로 허용한 줄(<Code>ds-allow</Code>) {status.allowedCount}건</p>
            {(["error", "warn"] as const).map((lvl) => (
              <div key={lvl} className="mt-4">
                <p className="text-caption font-bold text-ink-2 mb-1.5">{lvl === "error" ? "오류 — 고쳐야 배포" : "경고 — 판단이 필요한 것"}</p>
                <div className="flex flex-col gap-1.5">
                  {status.rules.filter((r) => (r.level ?? "error") === lvl).map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-caption">
                      <span className={cn("min-w-0", r.count ? "text-ink" : "text-ink-3")}>{r.message.split(" →")[0]}</span>
                      <span className={cn("num font-bold shrink-0", !r.count ? "text-positive" : lvl === "error" ? "text-danger" : "text-ink")}>{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <p className="text-label font-bold text-ink mb-3">개편 전후 수치</p>
            <div className="overflow-x-auto">
              <table className="w-full text-label">
                <thead>
                  <tr className="text-caption text-ink-2 text-left border-b border-line">
                    <th className="py-2 font-medium">항목</th>
                    <th className="py-2 font-medium text-right">개편 전</th>
                    <th className="py-2 font-medium text-right">지금</th>
                  </tr>
                </thead>
                <tbody>
                  {status.metrics.map((m) => (
                    <tr key={m.label} className="border-b border-line last:border-0">
                      <td className="py-2 text-ink">{m.label}</td>
                      <td className="py-2 text-right num text-ink-2">{m.before}</td>
                      <td className={cn("py-2 text-right num font-bold", m.after < m.before ? "text-positive" : "text-ink")}>{m.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-caption text-ink-3 mt-3">개편 전 측정 {kst(status.baselineAt, true)} · 디자인 시스템 파일(src/components/ui, 이 페이지)은 제외</p>
          </Card>
        </div>

        {(!passed || status.warnTotal > 0) && (
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <Card>
              <p className="text-label font-bold text-ink mb-2">위반이 많은 파일</p>
              {status.topFiles.map(([f, n]) => (
                <div key={f} className="flex justify-between gap-3 py-1 text-caption">
                  <span className="font-mono text-ink-2 min-w-0 break-all">{f}</span>
                  <span className="num font-bold text-danger shrink-0">{n}</span>
                </div>
              ))}
            </Card>
            <Card>
              <p className="text-label font-bold text-ink mb-2">위반 예시</p>
              {status.sample.map((v, i) => (
                <div key={i} className="py-1 text-caption">
                  <span className="font-mono text-ink-2 break-all">{v.file}:{v.line}</span>{" "}
                  <Badge tone={v.level === "warn" ? "caution" : "danger"}>{v.rule}</Badge> <Code>{v.match}</Code>
                </div>
              ))}
            </Card>
          </div>
        )}

        {status.allowed.length > 0 && (
          <Card className="mt-4">
            <details>
              <summary className="cursor-pointer text-label font-bold text-ink">예외로 허용한 줄 <span className="num">{status.allowedCount}</span>건 — 줄마다 이유가 적혀 있어요</summary>
              <div className="mt-2">
                {status.allowed.map((v, i) => (
                  <div key={i} className="py-1.5 text-caption border-b border-line last:border-0">
                    <span className="font-mono text-ink-2 break-all">{v.file}:{v.line}</span> <Badge>{v.rule}</Badge>
                    <div className="font-mono text-ink-3 whitespace-pre overflow-x-auto mt-0.5">{v.snippet}</div>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        )}

        <Card className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-label font-bold text-ink">화면 자동 검사</p>
            <Badge tone={status.audit.blocking === 0 ? "positive" : "danger"}>{status.audit.blocking === 0 ? "통과" : `문제 ${status.audit.blocking}건`}</Badge>
          </div>
          <p className="text-caption text-ink-2 mb-1">
            {kst(status.audit.auditedAt)} · 페이지 {status.audit.pages}개 × {status.audit.variants.join(" / ")} = 스크린샷 {status.audit.screenshots}장
            {status.audit.commit && <> · 커밋 <span className="font-mono">{status.audit.commit.slice(0, 7)}</span></>}
          </p>
          {status.audit.commit && status.audit.commit !== status.build.sha && (
            <p className="text-caption text-ink-2 mb-3 flex items-center gap-1"><Icon name="info" size={14} />이 숫자는 이전 커밋 기준이에요. 이번 배포의 화면 검사는 아래 리포트에서 확인하세요.</p>
          )}
          <div className="mb-3">
            <LinkButton href={AUDIT_RUNS} target="_blank" rel="noreferrer" size="sm" variant="secondary" iconRight="external">배포별 화면 검사 리포트 보기</LinkButton>
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {Object.entries(AUDIT_LABELS).map(([k, label]) => {
              const n = status.audit.totals[k] || 0;
              return (
                <div key={k} className="rounded-md bg-sunken p-2.5 flex flex-col gap-0.5 min-w-0">
                  <span className={cn("num text-title font-bold", n === 0 ? "text-positive" : k === "touch-target" ? "text-ink" : "text-danger")}>{n}</span>
                  <span className="text-caption text-ink-2">{label}</span>
                </div>
              );
            })}
          </div>
          {status.audit.byPage.some((p) => p.issues > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {status.audit.byPage.filter((p) => p.issues > 0).map((p) => (
                <Badge key={p.url} tone="danger"><span className="font-mono">{p.route}</span> {p.issues}</Badge>
              ))}
            </div>
          )}
          <p className="text-caption text-ink-3 mt-3">
            배포가 끝나면 GitHub Actions 가 전 페이지를 데스크톱·모바일·모바일 다크로 찍어 검사하고, 실행 화면 아래 <b>ds-audit-report</b> 묶음에 스크린샷 리포트를 올립니다. 직접 돌리려면 <Code>npm run ds:audit</Code>. 잴 수 없는 것(여백이 어색한지, 누를 수 있어 보이는지)은 스크린샷을 사람이 봐야 합니다.
          </p>
        </Card>
      </Section>

      {/* ───────────── 색 ───────────── */}
      <Section id="colors" title="색" description="이름 · 값 · 용도. 대비는 지금 CSS 값으로 이 화면에서 직접 계산합니다 (본문 기준 4.5)">
        <ColorTable />
      </Section>

      {/* ───────────── 글자 ───────────── */}
      <Section id="type" title="글자" description="크기 5종 · 굵기 3종. 기본 글꼴 Noto Sans KR, 숫자는 Outfit(num)">
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {[
            ["text-display", "32 / 38", "핵심 숫자 하나 · 첫 화면 큰 제목", "1,842"],
            ["text-title", "20 / 28", "페이지 제목", "오늘의 식단 기록"],
            ["text-body", "16 / 24", "본문 · 목록 제목 · 입력", "점심에 닭가슴살 샐러드를 먹었어요"],
            ["text-label", "14 / 20", "버튼 · 보조 본문 · 표", "단백질 목표의 68%를 채웠어요"],
            ["text-caption", "12 / 18", "메타 정보 · 배지 · 단위 (가장 작은 글자)", "100g당 · 식약처 영양 DB 기준"],
          ].map(([cls, size, usage, sample]) => (
            <div key={cls} className="grid gap-2 p-4 md:grid-cols-[180px_minmax(0,1fr)] items-baseline">
              <div className="flex flex-col gap-0.5">
                <Code>{cls}</Code>
                <span className="text-caption text-ink-3">{size}px · {usage}</span>
              </div>
              <p className={cn(cls, cls === "text-display" ? "num font-bold" : "text-ink")}>{sample}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3 mt-4">
          <Demo label="font-regular · 본문" code="font-regular"><p className="text-body font-regular">현미밥 한 공기</p></Demo>
          <Demo label="font-medium · 강조 본문, 라벨" code="font-medium"><p className="text-body font-medium">현미밥 한 공기</p></Demo>
          <Demo label="font-bold · 제목, 숫자, 버튼" code="font-bold"><p className="text-body font-bold">현미밥 한 공기</p></Demo>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Demo label="숫자는 num — 자리 맞춤" code='className="num"'>
            <div className="num text-title font-bold text-ink">12,800<span className="text-label text-ink-2">원</span> · 412<span className="text-label text-ink-2">kcal</span></div>
          </Demo>
          <Demo label="형광펜 — 한 화면에 핵심 숫자 하나에만" code='className="highlight"'>
            <p className="text-body text-ink">남은 단백질 <span className="highlight num font-bold">28g</span></p>
          </Demo>
        </div>
      </Section>

      {/* ───────────── 모양 ───────────── */}
      <Section id="shape" title="둥글기 · 그림자 · 간격" description="둥글기 4종 + 동그라미, 그림자는 떠 있는 것에만 1종">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          {[["rounded-sm", "6 · 배지"], ["rounded-md", "10 · 버튼, 입력, 타일"], ["rounded-lg", "16 · 카드"], ["rounded-xl", "24 · 시트"], ["rounded-full", "칩 · 아바타"]].map(([c, u]) => (
            <div key={c} className="flex flex-col gap-2">
              <div className={cn("h-16 bg-brand-soft border border-brand", c)} />
              <Code>{c}</Code>
              <span className="text-caption text-ink-2">{u}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          <Demo label="shadow-overlay — 시트 · 토스트 · 메뉴만. 카드에는 그림자 대신 테두리" code="shadow-overlay">
            <div className="flex gap-4">
              <div className="flex-1 h-16 rounded-lg bg-surface border border-line flex items-center justify-center text-caption text-ink-2">카드: 테두리</div>
              <div className="flex-1 h-16 rounded-lg bg-surface shadow-overlay flex items-center justify-center text-caption text-ink-2">뜨는 것: 그림자</div>
            </div>
          </Demo>
          <Demo label="간격은 4px 단위 (Tailwind 기본 간격 그대로) · 카드 안 16, 카드 사이 12, 구역 사이 32">
            <div className="flex items-end gap-2">
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <div key={n} className="flex flex-col items-center gap-1">
                  <div className="bg-brand rounded-sm" style={{ width: n * 4, height: n * 4 }} />
                  <span className="text-caption num text-ink-2">{n * 4}</span>
                </div>
              ))}
            </div>
          </Demo>
        </div>
      </Section>

      {/* ───────────── 모션 ───────────── */}
      <Section id="motion" title="모션" description="모션은 무슨 일이 일어났는지 알릴 때만. 움직이는 속성은 transform · opacity 뿐 (suta motion-principles)">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface mb-4">
          <table className="w-full min-w-[620px] text-label">
            <thead>
              <tr className="text-caption text-ink-2 text-left border-b border-line">
                <th className="px-3 py-2 font-medium">무엇이 움직이나</th>
                <th className="px-3 py-2 font-medium">시간</th>
                <th className="px-3 py-2 font-medium">이징</th>
                <th className="px-3 py-2 font-medium">클래스</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["색·불투명도 상태 변화 (마우스 올림·누름·포커스)", "100ms", "ease-out", "press · transition-colors"],
                ["작은 요소 등장·퇴장 (체크·토글)", "150ms", "ease-out", "duration-150"],
                ["컴포넌트 전환 (탭·토스트·드롭다운)", "250ms", "ease-out", "animate-rise-in · animate-fade-in"],
                ["화면 크기 이동 (시트·모달)", "350ms · 나갈 때 260", "ease-drawer", "animate-sheet-in / -out"],
                ["화면 전환·막대 채우기", "420ms", "ease-out", "duration-420"],
                ["살짝 넘쳤다 돌아옴 (좋아요)", "250ms", "ease-overshoot", "animate-pop"],
                ["불러오는 자리", "1.4s 반복", "ease-in-out", "animate-skeleton"],
              ].map(([what, dur, ease, cls]) => (
                <tr key={what} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 text-ink">{what}</td>
                  <td className="px-3 py-2.5 num text-ink-2 whitespace-nowrap">{dur}</td>
                  <td className="px-3 py-2.5 font-mono text-caption text-ink-2">{ease}</td>
                  <td className="px-3 py-2.5"><Code>{cls}</Code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Demo label="누름 반응 — 누르는 순간 0.97배" code='className="press"'>
            <div className="flex gap-2 flex-wrap">
              <Button>눌러 보기</Button>
              <Chip>칩도 같음</Chip>
            </div>
          </Demo>
          <Demo label="좋아요 — 한 번 튀고 멈춤" code="<IconButton active /> → animate-pop">
            <div className="flex items-center gap-2">
              <IconButton icon="heart" label={liked ? "좋아요 취소" : "좋아요"} active={liked} onClick={() => setLiked((v) => !v)} />
              <span className="text-label text-ink-2">눌러 보세요</span>
            </div>
          </Demo>
          <Demo label="불러오는 자리 — 스피너 대신 모양을 먼저" code="<SkeletonList rows />">
            <SkeletonList rows={2} />
          </Demo>
        </div>
        <Notice className="mt-4" title="동작 줄이기 설정을 켠 사람에게는">
          이동·확대를 끄고 짧은 페이드만 남깁니다(시트는 0.12초 페이드, 좋아요·스켈레톤은 멈춤). 기기 설정에서 동작 줄이기를 켜고 이 페이지에서 시트를 열어 확인할 수 있어요.
        </Notice>
        <Card className="mt-4">
          <p className="text-label font-bold text-ink mb-1">쓰지 않는 것</p>
          <p className="text-label text-ink-2">transition-all · 크기(width·height·top·margin)를 움직이는 애니메이션 · 위 다섯 단계 밖의 시간 · ease-in · 장식용 무한 반복 · 목록을 하나씩 늦게 등장시키기</p>
        </Card>
      </Section>

      {/* ───────────── 버튼 ───────────── */}
      <Section id="buttons" title="버튼" description="문구는 동작으로. 한 화면에 주 버튼은 하나">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo label="variant" code='<Button variant="primary|secondary|ghost|danger">'>
            <div className="flex flex-wrap gap-2">
              <Button>저장하기</Button>
              <Button variant="secondary">불러오기</Button>
              <Button variant="ghost">닫기</Button>
              <Button variant="danger">삭제하기</Button>
            </div>
          </Demo>
          <Demo label="size · 아이콘 · 상태" code='size="sm" icon="plus" loading disabled'>
            <div className="flex flex-wrap gap-2 items-center">
              <Button size="sm" icon="plus">음식 추가하기</Button>
              <Button size="sm" variant="secondary" icon="copy">따라하기</Button>
              <Button loading>저장하기</Button>
              <Button disabled variant="secondary">주문하기</Button>
            </div>
          </Demo>
          <Demo label="아이콘 버튼 — label 필수 (화면 읽기용)" code='<IconButton icon="heart" label="좋아요" active />'>
            <div className="flex gap-1 items-center">
              <IconButton icon="heart" label="좋아요" />
              <IconButton icon="heart" label="좋아요 취소" active />
              <IconButton icon="bookmark" label="저장" />
              <IconButton icon="share" label="공유하기" />
              <IconButton icon="close" label="닫기" tone="secondary" size="sm" />
            </div>
          </Demo>
          <Demo label="아이콘 링크 — 머리 줄 알림·마이페이지 (dot = 새 소식)" code='<IconLink href icon="bell" label="알림" dot />'>
            <div className="flex gap-1 items-center">
              <IconLink href="#buttons" icon="bell" label="알림" dot />
              <IconLink href="#buttons" icon="user" label="마이페이지" />
            </div>
          </Demo>
          <Demo label="링크 버튼 · 글자 링크 · 글자 버튼" code="<LinkButton> <TextLink> <TextButton>">
            <div className="flex flex-wrap gap-3 items-center">
              <LinkButton href="#buttons" variant="secondary" iconRight="arrow-right">식단 리스트 보기</LinkButton>
              <TextLink href="#buttons">전체 보기 <Icon name="chevron-right" size={16} /></TextLink>
              <TextButton>다르게 보여요</TextButton>
            </div>
          </Demo>
        </div>
        <Card tone="sunken" className="mt-4">
          <p className="text-label font-bold text-ink mb-2">문구 규칙</p>
          <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2 text-label">
            {[
              ["확인", "저장하기 · 기록하기 · 담기"],
              ["제출", "리뷰 남기기"],
              ["예 / 아니오", "삭제하기 / 취소"],
              ["성공!", "저장했어요 (버튼 동사의 과거형)"],
              ["AI 채우기 ✨", "AI 추천으로 채우기"],
              ["오류가 발생했습니다", "저장하지 못했어요. 다시 시도해 주세요"],
            ].map(([bad, good]) => (
              <div key={bad} className="flex items-center gap-2 min-w-0">
                <span className="text-ink-3 line-through shrink-0">{bad}</span>
                <Icon name="arrow-right" size={14} className="text-ink-3 shrink-0" />
                <span className="text-ink font-medium">{good}</span>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* ───────────── 아이콘 ───────────── */}
      <Section id="icons" title="아이콘" description="24px 격자 · 선 1.75. 이모지를 아이콘 대신 쓰지 않습니다. 새 아이콘은 Icon.tsx 에 먼저 추가">
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
          {ICON_NAMES.map((n) => (
            <div key={n} className="flex flex-col items-center gap-1.5 rounded-md border border-line bg-surface py-3 px-1">
              <Icon name={n} size={22} className="text-ink" />
              <span className="font-mono text-caption text-ink-3 text-center break-all">{n}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ───────────── 배지·칩·탭 ───────────── */}
      <Section id="labels" title="배지 · 칩 · 탭" description="배지는 누를 수 없는 라벨, 칩은 눌러서 고르는 것, 탭은 보기 전환">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo label="배지 — 색 알약 없이 옅은 테두리 + 글자색. 주의는 경고 아이콘으로" code='<Badge tone="caution">'>
            <div className="flex flex-col gap-2">
              {([
                ["neutral", "분류", "간편식"], ["brand", "출처 · 우리 서비스", "따라하기"], ["positive", "적합 · 완료", "목표 달성"],
                ["caution", "주의 · 대기 (아이콘)", "나트륨 높음"], ["danger", "경고", "알레르기 성분"], ["protein", "영양소", "고단백"],
              ] as [BadgeTone, string, string][]).map(([t, meaning, text]) => (
                <div key={t} className="flex items-center gap-3">
                  <span className="w-24 shrink-0"><Badge tone={t}>{text}</Badge></span>
                  <span className="text-caption text-ink-2">{meaning}</span>
                </div>
              ))}
            </div>
          </Demo>
          <Demo label="칩 — 필터 · 여러 개 고르기" code="<Chip selected>">
            <ChipRow>
              {["고단백", "저당", "저나트륨", "간편식", "비건", "글루텐 프리"].map((c) => (
                <Chip key={c} selected={chips.includes(c)} onClick={() => setChips((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])}>{c}</Chip>
              ))}
            </ChipRow>
            <div className="flex gap-2 mt-3"><Chip size="sm">작은 칩</Chip><Chip size="sm" selected>골랐음</Chip></div>
          </Demo>
          <Demo label='탭 · pill — 화면 위쪽 보기 전환' code='<Tabs variant="pill">'>
            <Tabs value={tabA} onChange={setTabA} items={[{ value: "rec", label: "추천" }, { value: "follow", label: "팔로잉" }, { value: "mine", label: "내 관심사" }]} />
          </Demo>
          <Demo label='탭 · line — 카드·시트 안 입력 방법 전환' code='<Tabs variant="line">' className="p-0 overflow-hidden">
            <Tabs variant="line" value={tabB} onChange={setTabB} items={[{ value: "search", label: "검색" }, { value: "fav", label: "즐겨찾기", count: 4 }, { value: "list", label: "식단 리스트", count: 2 }, { value: "manual", label: "직접 입력" }]} />
            <p className="p-4 text-label text-ink-2">선택한 탭: {tabB}</p>
          </Demo>
          <Demo label="링크 탭 — 페이지 사이 이동 (관리자 메뉴)" code="<LinkTabs items current />">
            <LinkTabs current="#labels" items={[{ href: "#labels", label: "데이터 현황" }, { href: "#labels-2", label: "시장 인사이트" }, { href: "#labels-3", label: "발주 관리" }]} />
          </Demo>
        </div>
      </Section>

      {/* ───────────── 입력 ───────────── */}
      <Section id="inputs" title="입력" description="높이 44 · 테두리 line · 고르면 brand 테두리">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo code="<Field label hint><Input/></Field>">
            <div className="flex flex-col gap-4">
              <Field label="식단 이름" hint="나중에 식단 리스트에서 바꿀 수 있어요"><Input placeholder="예: 평일 고단백 식단" /></Field>
              <Field label="키" error="100~250 사이로 입력해 주세요"><Input inputMode="numeric" defaultValue="30" /></Field>
            </div>
          </Demo>
          <Demo code="<Textarea/> <Select/> <SearchField/>">
            <div className="flex flex-col gap-4">
              <Field label="한 줄 코멘트"><Textarea placeholder="오늘 식단 어땠나요?" /></Field>
              <Field label="끼니"><Select defaultValue="lunch"><option value="breakfast">아침</option><option value="lunch">점심</option><option value="dinner">저녁</option></Select></Field>
              <SearchField value={q} onChange={setQ} onSubmit={() => toast.show(`"${q}" 검색했어요`)} placeholder="제품 이름 검색" />
            </div>
          </Demo>
          <Demo label="슬라이더 · 체크" code='className="ds-range" / "ds-check"'>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between text-label"><span className="text-ink">매운맛</span><span className="text-ink-2"><span className="num font-bold text-ink">{range}</span> · 라면 정도</span></div>
              <input type="range" min={1} max={10} value={range} onChange={(e) => setRange(Number(e.target.value))} className="ds-range" aria-label="매운맛" />
              <label className="flex items-center gap-2 min-h-11 text-body text-ink"><input type="checkbox" className="ds-check" defaultChecked /> 알레르기 성분 제외</label>
            </div>
          </Demo>
          <Demo label="켜고 끄기 — 알림 설정처럼 바로 저장되는 설정 (한 줄 전체를 누름)" code="<Switch checked onChange label description />">
            <SwitchDemo />
          </Demo>
          <Demo label="선택 카드 — 칩보다 큰 선택지 (온보딩 목표·성별·끼니 수)" code="<ChoiceCard selected title description />">
            <div className="grid gap-2">
              {[["muscle", "근력강화", "고단백 식단"], ["weight", "체중관리", "건강한 다이어트"], ["gut", "장건강", "소화가 편한 식품"]].map(([v, t, d]) => (
                <ChoiceCard key={v} selected={goal === v} onClick={() => setGoal(v)} title={t} description={d} />
              ))}
            </div>
          </Demo>
          <Demo label="세로 선택 목록 — 한 질문에 하나 고르기" code="<ChoiceList options value onChange />">
            <ChoiceList label="다 드셨나요?" value={ate} onChange={setAte} options={[
              { value: "all", label: "다 먹었어요", tone: "positive" },
              { value: "half", label: "반쯤 먹었어요", tone: "caution" },
              { value: "little", label: "조금만 먹었어요", tone: "danger" },
            ]} />
          </Demo>
          <Demo label="별점 · 단계 입력 — 별 문자(★) 대신 SVG" code="<RatingInput/> <ScaleInput/> <RatingStars/>">
            <div className="flex flex-col gap-3">
              <RatingInput value={stars} onChange={setStars} />
              <ScaleInput label="짠맛 체감" value={scale} onChange={setScale} />
              <div className="flex items-center gap-2 text-label text-ink-2"><RatingStars value={4.2} /> <span className="num font-bold text-ink">4.2</span> · 리뷰 <span className="num">18</span></div>
            </div>
          </Demo>
          <Demo label="한 번 누르는 맛 평가 — 기록 화면의 음식 아래" code="<QuickRating onPick/>">
            <QuickRating onPick={(v) => setStars(v)} />
          </Demo>
        </div>
      </Section>

      {/* ───────────── 카드·목록 ───────────── */}
      <Section id="cards" title="카드 · 목록" description="흰 면 + 얇은 테두리. 그림자 없음">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <div className="flex items-center justify-between mb-1">
              <p className="text-body font-bold text-ink">평일 고단백 식단</p>
              <Badge tone="brand">따라하기</Badge>
            </div>
            <p className="text-caption text-ink-2"><span className="num">21</span>끼 · <Kcal value={1840} className="text-caption" /> · <Price value={84500} className="text-caption" /></p>
            <CardActions>
              <Button size="sm" variant="ghost" icon="edit">이름 바꾸기</Button>
              <Button size="sm" variant="ghost" icon="trash" className="ml-auto">삭제하기</Button>
            </CardActions>
          </Card>
          <Card tone="sunken"><p className="text-label text-ink-2">tone=&quot;sunken&quot; — 카드 안의 옅은 구역, 보조 정보 묶음</p></Card>
          <Card tone="brand"><p className="text-label text-brand-ink font-medium">tone=&quot;brand&quot; — 화면에서 한 곳만 강조할 때</p></Card>
          <CardButton onClick={() => toast.show("성과 탭으로 갔어요")}>
            <Stat label="이번 주 구매 링크 클릭" value="312" unit="번" />
            <span className="block text-caption text-ink-2 mt-1">&lt;CardButton&gt; — 카드 전체가 하나의 동작일 때</span>
          </CardButton>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Demo label="목록 한 줄" code="<ListRow leading title meta trailing />" className="p-2">
            <ListRow onClick={() => toast.show("고른 제품을 담았어요")} leading={<Thumb size={44} />} title="닭가슴살 스테이크 오리지널" meta={<><Kcal value={128} className="text-caption" /> · 단백질 <span className="num">23</span>g</>} trailing={<Price value={2900} className="text-label" />} />
            <ListRow onClick={() => toast.show("고른 제품을 담았어요")} leading={<Thumb size={44} />} title="그릭요거트 플레인 무가당" meta={<><Kcal value={95} className="text-caption" /> · 단백질 <span className="num">9</span>g</>} trailing={<Price value={3500} className="text-label" />} />
          </Demo>
          <Demo label="제품 사진 — 사진이 없거나 안 열리면 그릇 아이콘" code='<ProductImage src={url} />  · <Thumb size={44} />'>
            <div className="flex gap-3">
              <span className="block size-28 rounded-md overflow-hidden"><ProductImage src={null} /></span>
            </div>
          </Demo>
          <Demo label="아바타 · 작성자 줄">
            <div className="flex items-center gap-3">
              <Avatar name="건강한사자12" />
              <div className="min-w-0">
                <p className="text-label font-bold text-ink">건강한사자12</p>
                <p className="text-caption text-ink-2">30대 · 근력강화 · 2시간 전</p>
              </div>
              <Button size="sm" variant="secondary" className="ml-auto">팔로우</Button>
            </div>
          </Demo>
          <Demo label="커뮤니티 글 — 작성자 줄 · 태그 · 동작 줄" code="<PostAuthor/> <PostTags/> <PostActions><PostAction/></PostActions>" className="p-0 overflow-hidden">
            <div className="p-4 flex flex-col gap-3">
              <PostAuthor nickname="건강한사자12" right={<span className="text-caption text-ink-3 shrink-0">2시간 전</span>} onFollow={() => toast.show("팔로우했어요")} />
              <p className="text-body text-ink">운동 후라 단백질 위주로 챙겼어요</p>
              <PostTags tags={["고단백", "간편식"]} />
            </div>
            <PostActions>
              <PostAction icon="heart" label="좋아요" count={liked ? 25 : 24} active={liked} onClick={() => setLiked((v) => !v)} />
              <PostAction icon="message" label="댓글" count={3} />
              <PostAction icon="copy" label="따라하기" count={4} onClick={() => toast.show("식단 리스트에 담았어요")} />
            </PostActions>
          </Demo>
          <Demo label="쓰레드형 글 — 카드 없이 줄로 · 끼니/일주일 식단/제품 첨부 · 답글 미리보기" code="<ThreadItem reply> <MealAttach/> <PlanAttach/> <ProductTagLinks/> <PostActions variant='thread'>" className="px-4 py-0">
            <ThreadItem nickname="지민" topic="저염 식단"
              reply={{ nickname: "하늘", content: "드레싱 반만 쓰는 거 저도 해 볼게요", more: 5 }}
              actions={
                <PostActions variant="thread">
                  <PostAction icon="heart" label="좋아요" count={24} />
                  <PostAction icon="message" label="답글" count={6} />
                  <PostAction icon="copy" label="따라하기" count={3} />
                </PostActions>
              }>
              <p className="text-body text-ink">드레싱은 따로 담아서 반만 뿌렸어요</p>
              <MealAttach mealType="lunch" foods={[{ name: "닭가슴살 샐러드" }, { name: "현미밥 105g" }, { name: "오리엔탈 드레싱 15g" }]} total={{ calories: 512, protein_g: 38, carbs_g: 52, fat_g: 14 }} />
              <ProductTagLinks products={[{ id: "00000000-0000-0000-0000-000000000000", name: "훈제 닭가슴살 100g" }]} />
            </ThreadItem>
            <ThreadItem nickname="유나" topic="고단백">
              <PlanAttach title="이번 주 식단" dayKcal={[1600, 1500, 1700, 1600, 1600, 1900, 1400]} avgKcal={1614} avgProtein={104} />
            </ThreadItem>
            <ThreadItem nickname="서준" topic="도시락">
              <p className="text-body text-ink">이번 주 도시락 네 개</p>
              <PhotoGrid alt="도시락 사진" urls={[1, 2, 3, 4].map((i) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${["#E7E0D5", "#CFC5B6", "#F3EEE6", "#E7E0D5"][i - 1]}"/></svg>`)}`)} />
            </ThreadItem>
          </Demo>
          <Demo label="투표 — 고르기 전 선택지 / 고른 뒤 비율 막대 (고른 것 다시 누르면 취소)" code="<PollAttach options counts myChoice closed note onVote />">
            <PollDemo />
          </Demo>
          <Demo label="챌린지 날짜 줄 — 해낸 날 체크 · 못 한 날 옅게 · 오늘 진한 테두리 · 남은 날 점선" code="<DayDots days />">
            <div className="flex flex-col gap-2">
              <DayDots days={(["done", "done", "missed", "done", "today", "future", "future"] as const).map((state, i) => ({ date: `d${i}`, state }))} />
              <p className="text-label text-ink"><span className="num">7</span>일 중 <span className="num font-bold text-brand-ink">3</span>일 해냈어요</p>
            </div>
          </Demo>
          <Demo label="숏폼 줄 — 피드 맨 위 '오늘의 식단 · 공구'. 맨 앞 칸이 글쓰기 입구 하나, 사진 위 글자는 아래 띠(media-scrim) 한 곳" code="<ReelRow><ReelAddTile /><ReelTile tag author line /></ReelRow>">
            <div className="overflow-hidden px-4">
              <ReelRow label="숏폼 줄 예시">
                <ReelAddTile onClick={() => {}} sub="식단 · 공구" />
                <ReelTile href="#" tag="공구" author="민지" label="민지의 공구: 닭가슴살 현미 볶음밥, 23명 모임"
                  line={<>알림 <span className="num font-bold">23</span>/30명</>} />
                <ReelTile href="#" tag="식단" author="준호" label="준호의 식단 영상" seconds={24}
                  line={<>단백질 <span className="num font-bold">38</span>g 점심</>} />
                <ReelSkeleton count={1} />
              </ReelRow>
            </div>
          </Demo>
          <Demo label="붙인 영상 — 올리는 중 · 다듬는 중(위치 같은 촬영 정보 빼기) · 붙음(미리 보기 VideoClip + 빼기). 30초까지 한 개" code="<VideoAttach status video onRemove /> · <VideoClip url poster autoplay />">
            <div className="flex flex-col gap-2">
              <VideoAttach status="uploading" video={null} onRemove={() => {}} />
              <VideoAttach status="processing" video={null} onRemove={() => {}} />
            </div>
          </Demo>
          <Demo label="공구 구성 목록 — 묶음 · 공구가 · 1개 값 · 할인율(강조색 글자) · 배송비 포함. onChange 를 주면 하나 고르기, 고른 줄은 brand-soft" code="<OfferOptionList rows value onChange /> · <QtyStepper value max onChange />">
            <OfferDemo />
          </Demo>
          <Demo label="댓글 한 줄 — 공구 질문·진행자 답. 한 단계 답은 nested, 이어지면 세로선" code="<CommentItem nickname badge createdAt content onReply onDelete />">
            <div className="flex flex-col">
              <CommentItem nickname="서연" timeLabel="2시간 전" content="한 팩 양이 얼마나 돼요?" line onReply={() => {}} />
              <CommentItem nested nickname="민지" badge="진행자" timeLabel="1시간 전" content="300g이에요. 한 끼로 딱 맞아요" onReply={() => {}} onDelete={() => {}} />
            </div>
          </Demo>
          <Demo label="숏폼 보기 위쪽 — 사진을 옆으로 넘기고, 위 띠에 몇 번째 · 올린 사람 · 닫기" code="<ReelMedia urls header closeHref />">
            <div className="overflow-hidden px-4 pt-5 max-w-sm">
              <ReelMedia urls={[]} alt="예시 공구" closeHref="#"
                header={
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name="민지" size="sm" />
                    <div className="min-w-0">
                      <p className="text-label font-bold truncate">민지 <span className="font-regular">· 공구 진행 · 2일 전</span></p>
                      <p className="text-caption flex items-center gap-1"><Icon name="check" size={14} />최근 30일 이 제품을 <span className="num font-bold">12</span>번 기록했어요</p>
                    </div>
                  </div>
                } />
            </div>
          </Demo>
        </div>
      </Section>

      {/* ───────────── 영양 ───────────── */}
      <Section id="nutrition" title="영양 표시" description="영양소 색은 전 화면 같음. 목표가 있으면 막대를 함께">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo label="영양 타일 4칸 (목표 대비)" code="<MacroGrid values targets />">
            <MacroGrid values={{ protein: 62, carbs: 180, fat: 41, sodium: 1650 }} targets={{ protein: 80, carbs: 260, fat: 60, sodium: 2000 }} />
          </Demo>
          <Demo label="한 줄 요약 — 카드·목록 안" code="<MacroInline values />">
            <MacroInline values={{ protein: 32, carbs: 45, fat: 8, sodium: 620 }} />
          </Demo>
          <Demo label="핵심 숫자 — 형광펜은 한 화면에 하나" code="<Stat emphasis size=lg />">
            <div className="flex gap-8 flex-wrap">
              <Stat size="lg" emphasis label="오늘 먹은 칼로리" value="1,240" unit="kcal" />
              <Stat label="목표" value="1,800" unit="kcal" />
              <Stat label="주간 비용" value="84,500" unit="원" />
            </div>
          </Demo>
          <Demo label="진행 막대" code='<ProgressBar value max tone />'>
            <div className="flex flex-col gap-3">
              <ProgressBar value={68} tone="brand" label="목표 달성" />
              <ProgressBar value={92} tone="positive" label="완료" />
              <ProgressBar value={110} max={100} tone="caution" label="초과" />
            </div>
          </Demo>
        </div>
      </Section>

      {/* ───────────── 끼니 ───────────── */}
      <Section id="charts" title="그래프" description="성과·수요·정산 대시보드. 축 하나 · 가는 선 · 이번 값은 강조색, 비교는 회색 점선 · 올리거나 화살표 키로 값 보기 · 표로도 읽힘">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <TrendChart label="이번 기간 판매액" format={(v) => `${v.toLocaleString("ko-KR")}원`}
              data={[3, 5, 4, 8, 6, 9, 12, 10, 14, 11].map((v, i) => ({ label: `11/${i + 1}`, value: v * 10000, prev: [2, 4, 5, 5, 7, 6, 8, 9, 8, 10][i] * 10000 }))} />
            <span className="text-caption text-ink-2"><Code>{'<TrendChart data label format>'}</Code> — 하루별 추이, prev 가 있으면 지난 기간 점선</span>
          </Card>
          <Card>
            <BarList rows={[{ key: "a", label: "노출", value: 4800, display: "4,800" }, { key: "b", label: "상세 조회", value: 390, display: "390", sub: "8%" }, { key: "c", label: "구매 링크 클릭", value: 120, display: "120", sub: "31%" }]} />
            <span className="block mt-3 text-caption text-ink-2"><Code>{'<BarList rows>'}</Code> — 큰 것 비교·단계별 줄어듦, 숫자는 글자로</span>
          </Card>
          <Card className="md:col-span-2">
            <GapChart xLabel="찾는 사람" yLabel="맞는 제품" xFormat={(v) => `${v}%`} yFormat={(v) => `${v}개`} selected="b"
              points={[{ key: "a", label: "단백질 많은 한 끼", x: 31, y: 120 }, { key: "b", label: "나트륨 적은 한 끼", x: 24, y: 18 }, { key: "c", label: "당류 적은 간식", x: 9, y: 60 }, { key: "d", label: "가벼운 한 끼", x: 18, y: 80 }]} />
            <span className="text-caption text-ink-2"><Code>{'<GapChart points selected onSelect>'}</Code> — 많이 찾는데 제품이 적은 곳(오른쪽 아래)을 고르는 그림</span>
          </Card>
        </div>
      </Section>

      <Section id="meals" title="끼니" description="색을 쓰지 않고 글자로 구분. 비어 있는 칸은 점선">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo label="끼니 라벨" code='<MealTag meal="lunch" />'>
            <div className="flex flex-wrap gap-4">{["breakfast", "lunch", "dinner", "snack"].map((m) => <MealTag key={m} meal={m} />)}</div>
          </Demo>
          <div className="flex flex-col gap-2">
            <MealSlot meal="lunch" right={<Kcal value={412} className="text-label" />}>
              <p className="text-body font-medium text-ink">닭가슴살 샐러드 · 현미밥</p>
              <MacroInline values={{ protein: 32, carbs: 45, fat: 8 }} className="mt-1" />
            </MealSlot>
            <MealSlot meal="dinner" empty onAdd={() => toast.show("음식 고르기를 열었어요")} />
            <span className="text-caption text-ink-2"><Code>{"<MealSlot meal right empty onAdd />"}</Code></span>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          <Demo label="일반 메뉴 넣기 — 양 고르기 + kcal 고쳐 쓰기" code='<FoodEntryForm food={…} onSubmit />'>
            <FoodEntryForm
              food={{ id: "demo", name: "파스타 (크림)", serving_desc: "1인분 350g", serving_size_g: 350, calories: 650, protein_g: 18, carbs_g: 70, fat_g: 32, sodium_mg: 1100, source: "curated" }}
              note="보통 1인분 기준이에요. 가게·양에 따라 달라요"
              onSubmit={(e) => toast.show(`${e.name} ${e.calories}kcal 를 넣었어요`)} />
          </Demo>
          <Demo label="목록에 없을 때 — 이름 + kcal 직접" code="<FoodEntryForm onSubmit />">
            <FoodEntryForm onSubmit={(e) => toast.show(`${e.name} ${e.calories}kcal 를 넣었어요`)} />
          </Demo>
        </div>
      </Section>

      {/* ───────────── 끌어서 놓기 ───────────── */}
      <Section id="drag" title="끌어서 놓기" description="손잡이로만 끕니다(휴대폰 스크롤과 겹치지 않게). 마우스·터치·키보드(스페이스→화살표→스페이스) 모두. 같은 일을 버튼으로도 할 수 있게 둡니다">
        <DragDemo />
        <p className="text-caption text-ink-2 mt-3">
          <Code>{"<DragArea onDrop renderOverlay>"}</Code> · <Code>useDragItem(id, data)</Code> → <Code>{"<DragHandle {...handle} label />"}</Code> · <Code>useDropTarget(id, data)</Code> → <Code>isOver</Code> · <Code>{"<MealSlot handle dropping />"}</Code>
        </p>
      </Section>

      {/* ───────────── 안내 · 빈 상태 ───────────── */}
      <Section id="feedback" title="안내 · 빈 상태 · 로딩">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Notice tone="danger" title="알레르기 성분이 들어 있어요">우유, 대두 — 프로필에 등록한 알레르기와 겹쳐요</Notice>
            <Notice tone="caution">나트륨이 하루 권장량의 45%예요</Notice>
            <Notice>식약처 영양 DB 기준 정보이며 의학적 진단·처방을 대신하지 않아요</Notice>
            <Notice icon="lock">지금은 관심만 모아요. 판매는 준비가 끝나면 열려요</Notice>
            <span className="text-caption text-ink-2"><Code>{'<Notice tone="danger|caution|neutral|brand" title icon?>'}</Code></span>
            <Estimate>제품 맛은 영양성분으로 추정했어요. 맛 평가가 2건 모이면 평가를 반영해요</Estimate>
            <span className="text-caption text-ink-2"><Code>{'<Estimate>'}</Code> — 계산으로 짐작한 값 옆에 한 줄. 실제 측정·평가처럼 보이지 않게</span>
            <div className="flex flex-wrap items-center gap-3"><HowCounted>지난 28일 동안 구매 링크를 누른 횟수예요. 같은 사람이 여러 번 누르면 모두 세요</HowCounted><AsOf at="2026-11-14T01:32:00Z" /></div>
            <span className="text-caption text-ink-2"><Code>{'<HowCounted>'}</Code> — 숫자 묶음 옆 &ldquo;어떻게 셌나요&rdquo; 펼치기 · <Code>{'<AsOf>'}</Code> — 데이터 기준 시각</span>
            <CodeBlock>{'curl -X POST "https://carefood-iota.vercel.app/api/partner/v1/products/batch" \\\n  -H "Authorization: Bearer cf_live_…"'}</CodeBlock>
            <span className="text-caption text-ink-2"><Code>{'<CodeBlock>'}</Code> — 그대로 복사할 요청·응답 예시. 넘치면 이 칸만 가로로 스크롤</span>
          </div>
          <div className="flex flex-col gap-4">
            <EmptyState title="아직 저장한 식단이 없어요" description="AI 추천으로 7일 식단을 채우거나 커뮤니티에서 따라하기 해 보세요"
              action={<><Button size="sm">AI 추천으로 채우기</Button><LinkButton href="#feedback" size="sm" variant="secondary">커뮤니티 보기</LinkButton></>} />
            <div className="flex items-center gap-6">
              <Spinner />
              <Steps total={5} current={1} className="flex-1" />
            </div>
          </div>
        </div>
      </Section>

      {/* ───────────── 하단 탭 바 ───────────── */}
      <Section id="bottom-nav" title="하단 탭 바" description="휴대폰(640px 미만)에서 탭의 첫 화면에만. 상세·작성 화면과 하단 고정 바가 있는 화면에서는 숨김. 입력 중에도 숨김">
        <div className="max-w-[390px] rounded-lg border border-line bg-surface overflow-hidden">
          <div className="h-24 bg-canvas flex items-center justify-center text-caption text-ink-3">화면 내용</div>
          <div className="border-t border-line"><BottomNavItems current="/weekly-box" /></div>
        </div>
        <p className="text-caption text-ink-2 mt-2"><Code>{"<BottomNav />"}</Code> 는 레이아웃에 한 번만 둡니다. 떠 있는 버튼·알림은 <Code>above-nav</Code> 로 탭 바 위에 뜹니다. 주 행동이 있는 화면은 <Code>{"<BottomBar>"}</Code> 를 쓰면 탭 바가 알아서 물러납니다.</p>
      </Section>

      {/* ───────────── 시트·알림 ───────────── */}
      <Section id="overlays" title="시트 · 확인창 · 완료 알림" description="모달·확인창·알림은 이 세 가지로만. window.alert / confirm 쓰지 않음">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>시트 열기</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>확인창 열기</Button>
          <Button variant="secondary" onClick={() => toast.show("식단을 저장했어요")}>완료 알림</Button>
          <Button variant="secondary" onClick={() => toast.show("식단 리스트에 담았어요. 아래 식단 탭에서 볼 수 있어요")}>어디로 갔는지 알리는 알림</Button>
          <Button variant="secondary" onClick={() => toast.show("저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" })}>실패 알림</Button>
        </div>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="어느 요일에 넣을까요?" description="건강한사자12의 점심 · 3가지 음식"
          footer={<><Button variant="secondary" block onClick={() => setSheetOpen(false)}>취소</Button><Button block onClick={() => { setSheetOpen(false); toast.show("수요일 점심에 넣었어요"); }}>넣기</Button></>}>
          <div className="flex flex-wrap gap-2">{["월", "화", "수", "목", "금", "토", "일"].map((d) => <Chip key={d} selected={d === "수"}>{d}</Chip>)}</div>
        </Sheet>
        <ConfirmSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); toast.show("식단을 삭제했어요"); }}
          title="이 식단을 삭제할까요?" description="식단 리스트에서 사라지고 되돌릴 수 없어요" confirmLabel="삭제하기" />
      </Section>

      {/* ───────────── 규칙 ───────────── */}
      <Section id="rules" title="규칙 — AI 와 사람 모두" description="전문은 저장소의 DESIGN.md">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="text-label font-bold text-ink mb-2">해야 할 것</p>
            <ul className="flex flex-col gap-1.5 text-label text-ink">
              {[
                "새 화면은 src/components/ui 와 이 페이지에 있는 것만 조합한다",
                "없는 컴포넌트는 화면에서 만들지 않고 ui 에 먼저 추가한 뒤 이 페이지에 그린다",
                "모든 페이지는 <Page> 로 감싼다 (넓은 화면에서 가운데 정렬)",
                "숫자는 num, 핵심 숫자 하나에만 형광펜",
                "버튼은 동작(저장하기), 완료 알림은 과거형(저장했어요)",
                "UI 유채색은 앰버 하나 + 오류 빨강. 완료 초록은 글자로만, 영양소 4색은 숫자·막대에만",
              ].map((t) => <li key={t} className="flex gap-2"><Icon name="check" size={16} className="text-positive shrink-0 mt-0.5" />{t}</li>)}
            </ul>
          </Card>
          <Card>
            <p className="text-label font-bold text-ink mb-2">쓰지 않는 것 (AI 티)</p>
            <ul className="flex flex-col gap-1.5 text-label text-ink">
              {[
                "색 직접 쓰기 (#hex, rgb, bg-blue-500, text-white)",
                "그라데이션 · 카드 그림자 · 흐림(blur) 장식",
                "대문자 라벨 · 색 네모 안 흰 아이콘 통계 카드",
                "이모지 아이콘 (🍱 📦 ✨)",
                "text-[11px] 같은 임의 크기 · style 로 색·여백 정하기",
                "window.alert / confirm",
              ].map((t) => <li key={t} className="flex gap-2"><Icon name="close" size={16} className="text-danger shrink-0 mt-0.5" />{t}</li>)}
            </ul>
          </Card>
        </div>
      </Section>
    </Page>
  );
}

/* ── 색 표: 라이트·다크 값을 CSS 에서 직접 읽고 대비 계산 ── */
function ColorTable() {
  const lightRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const [vals, setVals] = useState<{ light: Record<string, string>; dark: Record<string, string> } | null>(null);

  useEffect(() => {
    const read = (el: HTMLElement | null) => {
      const out: Record<string, string> = {};
      if (!el) return out;
      const cs = getComputedStyle(el);
      for (const t of ALL_TOKENS) out[t] = cs.getPropertyValue(`--ds-${t}`).trim();
      return out;
    };
    setVals({ light: read(lightRef.current), dark: read(darkRef.current) });
  }, []);

  const ratioCell = (spec: ColorSpec, mode: "light" | "dark") => {
    if (!vals || !spec.on) return <span className="text-caption text-ink-3">{spec.kind === "deco" ? "장식" : "면"}</span>;
    const v = vals[mode];
    const r = contrast(v[spec.token], v[spec.on]);
    if (r == null) return <span className="text-caption text-ink-3">–</span>;
    const ok = r >= 4.5;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("num text-label font-bold", ok ? "text-positive" : "text-danger")}>{r.toFixed(2)}</span>
        <Badge tone={ok ? "positive" : "danger"}>{ok ? "통과" : "미달"}</Badge>
      </span>
    );
  };

  return (
    <>
      <div ref={lightRef} data-theme="light" hidden />
      <div ref={darkRef} data-theme="dark" hidden />
      <div className="flex flex-col gap-6">
        {COLOR_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
              <h3 className="text-label font-bold text-ink">{g.title}</h3>
              {g.note && <p className="text-caption text-ink-2">{g.note}</p>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[760px] text-label whitespace-nowrap">
                <thead>
                  <tr className="text-caption text-ink-2 text-left border-b border-line">
                    <th className="px-3 py-2 font-medium">이름</th>
                    <th className="px-3 py-2 font-medium">라이트</th>
                    <th className="px-3 py-2 font-medium">다크</th>
                    <th className="px-3 py-2 font-medium">용도</th>
                    <th className="px-3 py-2 font-medium">대비 라이트</th>
                    <th className="px-3 py-2 font-medium">대비 다크</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.token} className="border-b border-line last:border-0 align-middle">
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-caption text-ink">{it.token}</span>
                          {it.on && <span className="text-caption text-ink-3">바탕: {it.on}</span>}
                        </div>
                      </td>
                      {(["light", "dark"] as const).map((mode) => (
                        <td key={mode} className="px-3 py-2.5">
                          <div data-theme={mode} className="inline-flex items-center gap-2 rounded-md p-1 pr-2 bg-canvas border border-line whitespace-nowrap">
                            <span className={cn("size-7 rounded-sm border border-line", BG[it.token])} />
                            {it.on && (
                              <span className={cn("h-7 px-2 inline-flex items-center rounded-sm text-caption font-bold", BG[it.on], TX[it.token])}>가나 12</span>
                            )}
                            <span className="font-mono text-caption text-ink-2">{vals?.[mode][it.token] || ""}</span>
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-ink-2 min-w-36 whitespace-normal">{it.usage}</td>
                      <td className="px-3 py-2.5">{ratioCell(it, "light")}</td>
                      <td className="px-3 py-2.5">{ratioCell(it, "dark")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── 끌어서 놓기 데모 ── */
const DEMO_DAYS = ["월", "화", "수"];
function DemoDay({ day, count }: { day: string; count: number }) {
  const { setNodeRef, isOver, isDragging } = useDropTarget(`demo-day:${day}`, { day, label: `${day}요일` });
  return (
    <div ref={setNodeRef} className={cn("flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border transition-colors",
      isOver ? "border-brand bg-brand-soft text-brand-ink" : isDragging ? "border-dashed border-line-strong text-ink-2" : "border-line text-ink-2")}>
      <span className="text-label font-bold">{day}</span>
      <span className="num text-caption">{count}끼</span>
    </div>
  );
}
function DemoMeal({ id, name }: { id: string; name: string }) {
  const { setNodeRef, itemClass, handle } = useDragItem(`demo-meal:${id}`, { id, label: name });
  return (
    <div ref={setNodeRef} className={itemClass}>
      <MealSlot meal="lunch" handle={<DragHandle {...handle} label={`${name} 옮기기`} />} right={<Kcal value={412} className="text-label" />}>
        <p className="text-body font-medium text-ink">{name}</p>
      </MealSlot>
    </div>
  );
}
function DragDemo() {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({ 월: 1, 화: 0, 수: 2 });
  return (
    <DragArea
      onDrop={(drag: DragData, drop: DragData) => {
        const day = String(drop.day);
        setCounts((c) => ({ ...c, [day]: (c[day] || 0) + 1 }));
        toast.show(`${drag.label} 을 ${day}요일 점심으로 옮겼어요`);
      }}
      describe={(d) => String(d?.label || "항목")}
      renderOverlay={(d) => <DragGhost>{String(d.label)}</DragGhost>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid grid-cols-3 gap-1 self-start">{DEMO_DAYS.map((d) => <DemoDay key={d} day={d} count={counts[d] || 0} />)}</div>
        <DemoMeal id="a" name="닭가슴살 샐러드" />
      </div>
    </DragArea>
  );
}

/** 투표 데모 — 눌러 보면 비율 막대로 바뀐다 */
function PollDemo() {
  const [mine, setMine] = useState<number | null>(null);
  const base = [12, 7, 3];
  const counts = base.map((c, i) => c + (mine === i ? 1 : 0));
  return (
    <div className="flex flex-col gap-4">
      <PollAttach options={["현미밥 도시락", "샐러드 도시락", "곤약밥 도시락"]} counts={counts} myChoice={mine} closed={false} note="2일 남았어요" onVote={setMine} />
      <PollAttach options={["아침에 먹어요", "점심에 먹어요"]} counts={[18, 9]} myChoice={null} closed note="마감했어요" />
    </div>
  );
}

/** 켜고 끄기 데모 */
function SwitchDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="flex flex-col divide-y divide-line">
      <Switch label="끼니 기록 알림" description="점심 1시·저녁 8시가 지나도 그 끼니 기록이 없을 때" checked={a} onChange={setA} />
      <Switch label="주간 요약" description="월요일 아침, 지난주 기록한 날 수와 하루 평균" checked={b} onChange={setB} />
    </div>
  );
}

function OfferDemo() {
  const [pick, setPick] = useState<number | null>(1);
  const [qty, setQty] = useState(2);
  const [packs, setPacks] = useState("10");
  const [target, setTarget] = useState(30);
  const rows = [
    { title: "5개 묶음", price: 21500, unit: 4300, pct: 7, total: 24500 },
    { title: "10개 묶음", price: 39000, unit: 3900, pct: 15, total: 39000 },
  ];
  return (
    <div className="flex flex-col gap-4">
      <OfferOptionList rows={rows} value={pick} onChange={setPick} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink">수량</span>
        <QtyStepper value={qty} max={5} onChange={setQty} unit="세트" />
      </div>
      <div className="flex items-end gap-3">
        <Field label="묶음 (UnitInput)" className="w-28"><UnitInput unit="개" value={packs} onChange={(e) => setPacks(e.target.value.replace(/[^0-9]/g, ""))} /></Field>
        <Field label={<>목표 인원 <span className="num">{target}</span>명 (RangeInput)</>} className="flex-1">
          <RangeInput min={10} max={100} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="목표 인원" />
        </Field>
      </div>
    </div>
  );
}
