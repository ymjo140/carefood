import type { Metadata } from "next";
import baseline from "../../../scripts/ds/metrics/baseline.json";
import latest from "../../../scripts/ds/metrics/latest.json";
import lintJson from "../../../scripts/ds/metrics/lint.json";
import auditJson from "../../../scripts/ds/metrics/audit.json";
import build from "../../../scripts/ds/metrics/build.json";
import Reference, { type DsStatus } from "./Reference";

export const metadata: Metadata = {
  title: "디자인 시스템",
  robots: { index: false, follow: false },
};

const METRIC_ROWS: Array<[keyof typeof baseline & keyof typeof latest, string]> = [
  ["distinctColors", "서로 다른 색"],
  ["gradients", "그라데이션"],
  ["shadows", "그림자"],
  ["fontSizeKinds", "글자 크기 종류"],
  ["radiusKinds", "모서리 둥글기 종류"],
  ["buttonShapeKinds", "버튼 모양 종류"],
  ["inlineStyles", "페이지 안에 직접 쓴 스타일"],
];

type LintItem = { file: string; line: number; rule: string; level?: string; match: string; snippet: string };
const lintResult = lintJson as unknown as {
  checkedAt: string; files: number; total: number; warnTotal?: number; allowedCount: number;
  rules: { id: string; level?: string; message: string; count: number }[];
  byFile: [string, number][]; violations: LintItem[]; allowed: LintItem[];
};

export default function DesignSystemPage() {
  const status: DsStatus = {
    checkedAt: lintResult.checkedAt,
    measuredAt: latest.measuredAt,
    baselineAt: baseline.measuredAt,
    files: lintResult.files,
    build,
    total: lintResult.total,
    warnTotal: lintResult.warnTotal ?? 0,
    allowedCount: lintResult.allowedCount,
    rules: lintResult.rules,
    topFiles: lintResult.byFile.slice(0, 12),
    sample: lintResult.violations.slice(0, 30).map((v) => ({ file: v.file, line: v.line, rule: v.rule, level: v.level, match: v.match })),
    allowed: lintResult.allowed.slice(0, 80).map((v) => ({ file: v.file, line: v.line, rule: v.rule, snippet: v.snippet })),
    audit: {
      auditedAt: auditJson.auditedAt, base: auditJson.base, commit: (auditJson as { commit?: string | null }).commit ?? null, pages: auditJson.pages, variants: auditJson.variants,
      screenshots: auditJson.screenshots, blocking: auditJson.blocking, totals: auditJson.totals as Record<string, number>,
      byPage: auditJson.byPage,
    },
    metrics: METRIC_ROWS.map(([k, label]) => ({ label, before: Number(baseline[k]), after: Number(latest[k]) })),
  };
  return <Reference status={status} />;
}
