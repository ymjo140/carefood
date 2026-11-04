# 케어푸드 디자인 규칙

> 화면 모양의 기준은 디자인 시스템이다.
> 새 화면은 디자인 시스템에 있는 것만 쓴다. 없으면 디자인 시스템에 먼저 추가한다.

기준 페이지: **`/design-system`** (색·글자·버튼·배지·입력·카드·영양·끼니·시트·알림이 전부 그려져 있고, 정적 검사 현황과 개편 전후 수치도 같이 나온다)

## 1. 어디에 무엇이 있나

| 무엇 | 위치 |
|---|---|
| 값 (색·글자 크기·굵기·둥글기·그림자) | `src/styles/design-system.css` |
| 컴포넌트 | `src/components/ui/*` — `import { Button, Card, ... } from "@/components/ui"` |
| 기준 페이지 | `src/app/design-system/Reference.tsx` |
| 정적 검사 | `npm run ds:lint` (`scripts/ds/lint.mjs`) |
| 화면 검사 | `npm run ds:audit` (`scripts/ds/audit.mjs`) — 전 페이지 스크린샷 + 자동 점검 리포트 |
| 수치 측정 | `npm run ds:measure` (`scripts/ds/measure.mjs`) |

## 2. 새 화면을 만들 때 순서

1. `/design-system` 에서 쓸 컴포넌트를 고른다.
2. 없는 게 필요하면 **화면 파일에서 만들지 않는다.** `src/components/ui` 에 먼저 만들고(이미 있는 색·둥글기·글자 크기만으로), `index.ts` 에 내보내고, 기준 페이지에 그려 둔다.
3. 화면은 `<Page>` 로 감싸고 컴포넌트를 조합한다.
4. `npm run ds:lint` 위반 0건, `npm run ds:audit` 문제 0건을 확인한다.
5. 스크린샷을 사람이 본다. (잴 수 없는 것: 여백이 어색한지, 누를 수 있어 보이는지, 넓은 화면에서 비어 보이는지)

## 3. 값

- **색**: `canvas` `surface` `sunken` `line` `line-strong` / `ink` `ink-2` `ink-3` / `brand` `brand-hover` `brand-soft` `brand-ink` `on-brand` / `positive` `caution` `danger` (+`-soft`) / `protein` `carbs` `fat` `sodium` (+`-soft`) / `meal-breakfast|lunch|dinner|snack` / `highlight` `scrim`
  - Tailwind 기본 팔레트(`bg-blue-500`, `text-white`, `bg-black/40`)는 **지워 놓았다. 써도 칠해지지 않는다.**
  - 앰버(`bg-brand`) 위 글자는 흰색이 아니라 `text-on-brand`(먹색). 흰 글자는 대비 3.1로 미달.
  - 같은 의미는 같은 색: 주의·대기 = `caution`, 경고·알레르기·삭제 = `danger`, 적합·완료 = `positive`.
- **글자 크기 5종**: `text-caption`(12) `text-label`(14) `text-body`(16) `text-title`(20) `text-display`(32). 12px 보다 작은 글자는 없다.
- **굵기 3종**: `font-regular` `font-medium` `font-bold`
- **둥글기 4종 + full**: `rounded-sm`(배지) `rounded-md`(버튼·입력·타일) `rounded-lg`(카드) `rounded-xl`(시트) `rounded-full`(칩·아바타)
- **그림자 1종**: `shadow-overlay` — 시트·토스트·메뉴처럼 화면 위에 뜨는 것만. 카드는 테두리.
- **숫자**: `num` 클래스 (Outfit, 자리 맞춤)
- **장식**: 형광펜 `highlight` 하나. 한 화면에 핵심 숫자 하나에만.

## 4. 쓰지 않는 것 (AI 티)

- `#hex`, `rgb()`, 기본 팔레트, `text-[11px]` / `bg-[#..]` / `rounded-[14px]` 같은 임의 값
- 그라데이션, 카드 그림자, `blur`/`backdrop-blur` 장식
- `uppercase` 라벨
- 색 네모 안에 흰 아이콘을 넣은 통계 카드
- 이모지 아이콘 (🍱 📦 ✨ 💪) — 아이콘은 `<Icon name>`, 없으면 `Icon.tsx` 에 먼저 추가
- `style={{ color, background, padding, fontSize, minHeight ... }}` — style 은 너비 %, 위치처럼 **계산된 값**에만
- `window.alert` / `window.confirm` — `useToast()` / `<ConfirmSheet>`
- 페이지마다 따로 만든 모달·토스트·확인창

꼭 필요한 예외는 그 줄에 `// ds-allow: 이유` 를 적는다. 예외는 기준 페이지에 개수와 함께 그대로 보인다.

## 5. 문구

- 버튼은 **동작**: "확인" ✕ → "저장하기", "기록하기", "담기", "삭제하기"
- 완료 알림은 **같은 동사의 과거형**: "저장했어요", "식단 리스트에 담았어요"
- 실패는 무엇이 안 됐는지 + 할 일: "저장하지 못했어요. 다시 시도해 주세요"
- 비어 있음은 이유 한 줄 + 다음 행동 하나 (`<EmptyState>`)
- 의료 표현 금지: 진단·처방·치료 단어를 쓰지 않는다. "성분 정보 + 통계적 매칭"

## 6. 컴포넌트 고르는 법

| 필요 | 컴포넌트 |
|---|---|
| 페이지 틀 / 제목 / 구역 제목 | `Page` / `PageHeader` / `SectionHeader` |
| 누르는 것 | `Button` `LinkButton` `IconButton` `TextLink` |
| 누를 수 없는 라벨 | `Badge` |
| 골라서 거르는 것 | `Chip` `ChipRow` |
| 보기 전환 | `Tabs` (pill: 화면 위쪽 / line: 카드·시트 안) |
| 묶음 | `Card` `CardActions` |
| 목록 한 줄 | `ListRow` + `Thumb` / `Avatar` |
| 입력 | `Field` `Input` `Textarea` `Select` `SearchField`, 슬라이더 `.ds-range`, 체크 `.ds-check` |
| 영양 | `MacroGrid` `MacroStat` `MacroInline` `ProgressBar` `Stat` `Kcal` `Price` |
| 끼니 | `MealTag` `MealSlot` `mealMeta()` |
| 안내 / 빈 상태 / 로딩 | `Notice` / `EmptyState` / `Spinner` `PageLoading` |
| 겹침 | `Sheet` `ConfirmSheet` `useToast()` `BottomBar` |
| 단계 | `Steps` |
