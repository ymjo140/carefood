"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Badge, Button, Card, CardActions, Chip, ChipRow, ConfirmSheet, EmptyState, Field, Icon, ICON_NAMES, IconButton,
  Input, Kcal, LinkButton, ListRow, MacroGrid, MacroInline, MealSlot, MealTag, Notice, Page, PageHeader, Price,
  ProgressBar, SearchField, SectionHeader, Select, Sheet, Spinner, Stat, Steps, Tabs, Textarea, TextLink, Thumb,
  Avatar, useToast, cn, type BadgeTone,
  ChoiceCard, ChoiceList, LinkTabs, RatingStars, RatingInput, ScaleInput, PostAuthor, PostAction, PostActions, PostTags,
} from "@/components/ui";

/* ════════════════════════════════════════════════════════════
   기준 페이지 — 사람에게는 리뷰 화면, AI 에게는 카탈로그.
   여기 그려지지 않은 컴포넌트·값은 화면에서 쓰지 않습니다.
   ════════════════════════════════════════════════════════════ */

export type DsStatus = {
  checkedAt: string;
  measuredAt: string;
  baselineAt: string;
  files: number;
  total: number;
  allowedCount: number;
  rules: { id: string; message: string; count: number }[];
  topFiles: [string, number][];
  sample: { file: string; line: number; rule: string; match: string }[];
  allowed: { file: string; line: number; rule: string; snippet: string }[];
  metrics: { label: string; before: number; after: number }[];
  audit: {
    auditedAt: string; base: string; pages: number; variants: string[]; screenshots: number; blocking: number;
    totals: Record<string, number>; byPage: { route: string; url: string; issues: number }[];
  };
};

const AUDIT_LABELS: Record<string, string> = {
  error: "화면 오류·실패 요청", overflow: "가로 넘침", "off-color": "기준 밖 색", contrast: "흐린 글자",
  "word-break": "한글 단어 쪼개짐", "tiny-text": "12px 미만 글자", "touch-target": "작은 터치 영역 (경고)",
};

/* ── 색 목록: 이름 · 용도 · 대비를 잴 바탕 ── */
type ColorSpec = { token: string; usage: string; on?: string; kind?: "text" | "fill" | "deco" };
const COLOR_GROUPS: { title: string; note?: string; items: ColorSpec[] }[] = [
  {
    title: "바탕 · 면",
    items: [
      { token: "canvas", usage: "페이지 바탕", kind: "fill" },
      { token: "surface", usage: "카드 · 시트 · 입력창", kind: "fill" },
      { token: "sunken", usage: "칩 · 빈 칸 · 옅은 구역", kind: "fill" },
      { token: "line", usage: "테두리 · 구분선", kind: "fill" },
      { token: "line-strong", usage: "마우스를 올린 테두리", kind: "fill" },
    ],
  },
  {
    title: "글자",
    note: "본문 대비 4.5 이상. 회색 글자도 예외 없음",
    items: [
      { token: "ink", usage: "제목 · 본문", on: "surface" },
      { token: "ink-2", usage: "보조 설명", on: "surface" },
      { token: "ink-3", usage: "메타 정보 · 자리표시", on: "sunken" },
    ],
  },
  {
    title: "브랜드 (앰버)",
    note: "채운 앰버 위 글자는 흰색이 아니라 먹색(on-brand). 흰 글자는 대비 3.1로 미달",
    items: [
      { token: "brand", usage: "주 버튼 면 · 진행 막대 · 선택 테두리", kind: "fill" },
      { token: "brand-hover", usage: "주 버튼에 마우스를 올렸을 때", kind: "fill" },
      { token: "brand-soft", usage: "고른 칩 바탕 · 강조 카드", kind: "fill" },
      { token: "brand-ink", usage: "링크 · 앰버 색 글자", on: "surface" },
      { token: "on-brand", usage: "주 버튼 글자", on: "brand" },
    ],
  },
  {
    title: "상태",
    note: "같은 의미는 어느 화면에서든 같은 색",
    items: [
      { token: "positive", usage: "적합 · 완료 · 목표 달성", on: "positive-soft" },
      { token: "caution", usage: "주의 · 확인 필요 · 대기", on: "caution-soft" },
      { token: "danger", usage: "알레르기 경고 · 삭제 · 오류", on: "danger-soft" },
    ],
  },
  {
    title: "영양소",
    note: "단백질·탄수화물·지방·나트륨은 전 화면 같은 색. 옅은 바탕 위 글자로도 대비 4.5 이상",
    items: [
      { token: "protein", usage: "단백질", on: "protein-soft" },
      { token: "carbs", usage: "탄수화물", on: "carbs-soft" },
      { token: "fat", usage: "지방", on: "fat-soft" },
      { token: "sodium", usage: "나트륨", on: "sodium-soft" },
    ],
  },
  {
    title: "끼니",
    note: "점 · 왼쪽 세로줄 전용. 끼니 이름 글자와 항상 같이 써서 색에만 의존하지 않음",
    items: [
      { token: "meal-breakfast", usage: "아침", kind: "deco" },
      { token: "meal-lunch", usage: "점심", kind: "deco" },
      { token: "meal-dinner", usage: "저녁", kind: "deco" },
      { token: "meal-snack", usage: "간식", kind: "deco" },
    ],
  },
  {
    title: "장식 · 겹침",
    items: [
      { token: "highlight", usage: "형광펜 — 한 화면 핵심 숫자 하나", kind: "fill" },
      { token: "scrim", usage: "시트 뒤 어둡게 가리는 막", kind: "deco" },
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
  "positive-soft": "bg-positive-soft",
  "caution": "bg-caution",
  "caution-soft": "bg-caution-soft",
  "danger": "bg-danger",
  "danger-soft": "bg-danger-soft",
  "protein": "bg-protein",
  "protein-soft": "bg-protein-soft",
  "carbs": "bg-carbs",
  "carbs-soft": "bg-carbs-soft",
  "fat": "bg-fat",
  "fat-soft": "bg-fat-soft",
  "sodium": "bg-sodium",
  "sodium-soft": "bg-sodium-soft",
  "meal-breakfast": "bg-meal-breakfast",
  "meal-lunch": "bg-meal-lunch",
  "meal-dinner": "bg-meal-dinner",
  "meal-snack": "bg-meal-snack",
  "highlight": "bg-highlight",
  "scrim": "bg-scrim",
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
  "positive-soft": "text-positive-soft",
  "caution": "text-caution",
  "caution-soft": "text-caution-soft",
  "danger": "text-danger",
  "danger-soft": "text-danger-soft",
  "protein": "text-protein",
  "protein-soft": "text-protein-soft",
  "carbs": "text-carbs",
  "carbs-soft": "text-carbs-soft",
  "fat": "text-fat",
  "fat-soft": "text-fat-soft",
  "sodium": "text-sodium",
  "sodium-soft": "text-sodium-soft",
  "meal-breakfast": "text-meal-breakfast",
  "meal-lunch": "text-meal-lunch",
  "meal-dinner": "text-meal-dinner",
  "meal-snack": "text-meal-snack",
  "highlight": "text-highlight",
  "scrim": "text-scrim",
};
const ALL_TOKENS = COLOR_GROUPS.flatMap((g) => g.items.map((i) => i.token)).concat(["protein-soft", "carbs-soft", "fat-soft", "sodium-soft", "positive-soft", "caution-soft", "danger-soft"]);

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
  ["status", "검사 현황"], ["colors", "색"], ["type", "글자"], ["shape", "모양"], ["buttons", "버튼"],
  ["icons", "아이콘"], ["labels", "배지·칩·탭"], ["inputs", "입력"], ["cards", "카드·목록"],
  ["nutrition", "영양"], ["meals", "끼니"], ["feedback", "안내·빈 상태"], ["overlays", "시트·알림"], ["rules", "규칙"],
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
        description={<>빌드할 때마다 <Code>scripts/ds/lint.mjs</Code> 와 <Code>measure.mjs</Code> 가 다시 셉니다 · 마지막 검사 {new Date(status.checkedAt).toLocaleString("ko-KR")}</>}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Card tone={passed ? "default" : "default"}>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone={passed ? "positive" : "danger"}>{passed ? "통과" : "위반 있음"}</Badge>
              <span className="text-caption text-ink-2">화면 코드 {status.files}개 파일</span>
            </div>
            <Stat size="lg" emphasis label="기준 밖 값 (정적 검사 위반)" value={status.total.toLocaleString()} unit="건" />
            <p className="text-caption text-ink-2 mt-2">예외로 허용한 줄(<Code>ds-allow</Code>) {status.allowedCount}건</p>
            <div className="mt-4 flex flex-col gap-1.5">
              {status.rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-caption">
                  <span className={cn("min-w-0", r.count ? "text-ink" : "text-ink-3")}>{r.message.split(" →")[0]}</span>
                  <span className={cn("num font-bold shrink-0", r.count ? "text-danger" : "text-positive")}>{r.count}</span>
                </div>
              ))}
            </div>
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
            <p className="text-caption text-ink-3 mt-3">개편 전 측정 {new Date(status.baselineAt).toLocaleDateString("ko-KR")} · 디자인 시스템 파일(src/components/ui, 이 페이지)은 제외</p>
          </Card>
        </div>

        {!passed && (
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
                  <Badge tone="danger">{v.rule}</Badge> <Code>{v.match}</Code>
                </div>
              ))}
            </Card>
          </div>
        )}

        {status.allowed.length > 0 && (
          <Card className="mt-4">
            <p className="text-label font-bold text-ink mb-2">예외로 허용한 줄</p>
            {status.allowed.map((v, i) => (
              <div key={i} className="py-1 text-caption">
                <span className="font-mono text-ink-2 break-all">{v.file}:{v.line}</span> <Badge>{v.rule}</Badge>
                <div className="font-mono text-ink-3 break-all">{v.snippet}</div>
              </div>
            ))}
          </Card>
        )}

        <Card className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-label font-bold text-ink">화면 자동 검사</p>
            <Badge tone={status.audit.blocking === 0 ? "positive" : "danger"}>{status.audit.blocking === 0 ? "통과" : `문제 ${status.audit.blocking}건`}</Badge>
          </div>
          <p className="text-caption text-ink-2 mb-3">
            {new Date(status.audit.auditedAt).toLocaleString("ko-KR")} · 페이지 {status.audit.pages}개 × {status.audit.variants.join(" / ")} = 스크린샷 {status.audit.screenshots}장 · {status.audit.base}
          </p>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {Object.entries(AUDIT_LABELS).map(([k, label]) => {
              const n = status.audit.totals[k] || 0;
              return (
                <div key={k} className="rounded-md bg-sunken p-2.5 flex flex-col gap-0.5 min-w-0">
                  <span className={cn("num text-title font-bold", n === 0 ? "text-positive" : k === "touch-target" ? "text-caution" : "text-danger")}>{n}</span>
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
            <Code>npm run ds:audit</Code> 로 다시 검사하면 스크린샷이 든 리포트가 ds-audit/report 에 생깁니다. 배포가 끝날 때마다 GitHub Actions 에서도 돌아갑니다. 잴 수 없는 것(여백이 어색한지, 누를 수 있어 보이는지)은 스크린샷을 사람이 봐야 합니다.
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
          <Demo label="링크 버튼 · 글자 링크" code="<LinkButton> <TextLink>">
            <div className="flex flex-wrap gap-3 items-center">
              <LinkButton href="#buttons" variant="secondary" iconRight="arrow-right">식단 리스트 보기</LinkButton>
              <TextLink href="#buttons">전체 보기 <Icon name="chevron-right" size={16} /></TextLink>
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
          <Demo label="배지 — tone 은 의미로 고릅니다" code='<Badge tone="caution">'>
            <div className="flex flex-col gap-2">
              {([
                ["neutral", "분류", "간편식"], ["brand", "출처 · 우리 서비스", "따라하기"], ["positive", "적합 · 완료", "목표 달성"],
                ["caution", "주의 · 대기", "나트륨 높음"], ["danger", "경고", "알레르기 성분"], ["protein", "영양소", "고단백"],
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
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Demo label="목록 한 줄" code="<ListRow leading title meta trailing />" className="p-2">
            <ListRow onClick={() => toast.show("고른 제품을 담았어요")} leading={<Thumb size={44} />} title="닭가슴살 스테이크 오리지널" meta={<><Kcal value={128} className="text-caption" /> · 단백질 <span className="num">23</span>g</>} trailing={<Price value={2900} className="text-label" />} />
            <ListRow onClick={() => toast.show("고른 제품을 담았어요")} leading={<Thumb size={44} />} title="그릭요거트 플레인 무가당" meta={<><Kcal value={95} className="text-caption" /> · 단백질 <span className="num">9</span>g</>} trailing={<Price value={3500} className="text-label" />} />
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
              <PostAuthor nickname="건강한사자12" ageGroup="30s" concerns={["muscle"]} right={<span className="text-caption text-ink-3 shrink-0">2시간 전</span>} onFollow={() => toast.show("팔로우했어요")} />
              <p className="text-body text-ink">운동 후라 단백질 위주로 챙겼어요</p>
              <PostTags tags={["고단백", "간편식"]} />
            </div>
            <PostActions>
              <PostAction icon="heart" label="좋아요" count={liked ? 25 : 24} active={liked} onClick={() => setLiked((v) => !v)} />
              <PostAction icon="message" label="댓글" count={3} />
              <PostAction icon="copy" label="따라하기" count={4} onClick={() => toast.show("식단 리스트에 담았어요", { action: { label: "보기", href: "#cards" } })} />
            </PostActions>
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
      <Section id="meals" title="끼니" description="색은 점과 세로줄로만. 비어 있는 칸은 점선">
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
      </Section>

      {/* ───────────── 안내 · 빈 상태 ───────────── */}
      <Section id="feedback" title="안내 · 빈 상태 · 로딩">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Notice tone="danger" title="알레르기 성분이 들어 있어요">우유, 대두 — 프로필에 등록한 알레르기와 겹쳐요</Notice>
            <Notice tone="caution">나트륨이 하루 권장량의 45%예요</Notice>
            <Notice>식약처 영양 DB 기준 정보이며 의학적 진단·처방을 대신하지 않아요</Notice>
            <span className="text-caption text-ink-2"><Code>{'<Notice tone="danger|caution|neutral|brand" title>'}</Code></span>
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

      {/* ───────────── 시트·알림 ───────────── */}
      <Section id="overlays" title="시트 · 확인창 · 완료 알림" description="모달·확인창·알림은 이 세 가지로만. window.alert / confirm 쓰지 않음">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>시트 열기</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>확인창 열기</Button>
          <Button variant="secondary" onClick={() => toast.show("식단을 저장했어요")}>완료 알림</Button>
          <Button variant="secondary" onClick={() => toast.show("식단 리스트에 담았어요", { action: { label: "보기", href: "#overlays" } })}>이동 있는 알림</Button>
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
                "같은 의미는 같은 색 — 주의는 caution, 경고는 danger",
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
