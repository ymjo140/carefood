# 케어푸드 디자인 규칙

> 화면 모양의 기준은 디자인 시스템이다.
> 새 화면은 디자인 시스템에 있는 것만 쓴다. 없으면 디자인 시스템에 먼저 추가한다.

- 기준 페이지: **https://carefood-iota.vercel.app/design-system** — 색·글자·모션·버튼·배지·입력·카드·영양·끼니·탭 바·시트·알림이 전부 그려져 있고, 배포된 커밋과 정적 검사·화면 검사 결과가 같이 나온다. 코드를 바꿔 배포하면 이 페이지의 커밋과 숫자가 바뀐다.
- 작업 순서·금지선 전문: `.claude/skills/carefood-design/SKILL.md` (suta 를 바탕으로 우리 앱에 맞춤)

## 1. 어디에 무엇이 있나

| 무엇 | 위치 |
|---|---|
| 값 (색·글자·굵기·둥글기·그림자·모션) | `src/styles/design-system.css` |
| 컴포넌트 | `src/components/ui/*` — `import { Button, Card, ... } from "@/components/ui"` |
| 기준 페이지 | `src/app/design-system/Reference.tsx` |
| 정적 검사 | `npm run ds:lint` — 오류 0 이어야 배포 (경고는 판단) |
| 연결 대조 | `npm run ds:wiring -- --base=<커밋>` — 링크·API·입력 이름이 빠졌는지 |
| 화면 검사 | `npm run ds:audit` — 전 페이지 스크린샷 + 가로 넘침·기준 밖 색·흐린 글자·한글 쪼개짐·작은 글자·오류 |
| 수치 | `npm run ds:measure` |
| CI | `.github/workflows/design-system.yml` — 푸시마다 정적 검사·연결 대조, 배포 후 화면 검사 리포트 |

## 2. 새 화면·고치는 화면의 순서

1. **화면 유형을 정한다** (홈·탐색·상세·기록·리스트·피드·온보딩·관리 — 스킬 문서의 뼈대).
2. **고칠 때는 덜어내기부터.** 같은 정보·같은 행동의 입구가 두 곳이면 하나만, 위·아래 고정 줄은 한 줄씩, 색 배지·색 상자는 글자·아이콘으로.
3. **1순위를 하나 정한다** — 가장 큰 글자 하나, 채운 주 버튼 하나.
4. `/design-system` 에서 컴포넌트를 고른다. 없으면 화면에서 만들지 않고 `src/components/ui` 에 먼저 만들어 기준 페이지에 그린다.
5. 데이터 영역마다 네 상태를 그린다 — 불러오는 중(스켈레톤) · 비어 있음 · 실패(이유 + 다시 불러오기) · 채워짐.
6. `ds:lint` 오류 0 → `ds:wiring` 실패 0 → `ds:audit` 문제 0.
7. 스크린샷을 사람이(또는 작업을 안 본 검토자가) 본다.

## 3. 값

- **색** — UI 유채색은 **강조색(맑은 앰버) 하나 + 오류 빨강**.
  - 면: `canvas` `surface` `sunken` `line` `line-strong` / 글자: `ink` `ink-2` `ink-3` (모두 4.5 이상)
  - 강조: `brand`(#EA9602, 주 버튼 면) `brand-hover` `brand-soft`(고른 상태 바탕에만) `brand-ink`(링크·고른 상태 글자·포커스 링) `on-brand`(앰버 위 먹색 글자)
  - 상태: `positive`(완료·적합) `danger`(경고·오류) — **글자·아이콘으로만**, 바탕 알약·색 상자 없음. 주의는 색 대신 경고 아이콘.
  - 영양소: `protein` `carbs` `fat` `sodium` — 데이터 색. **숫자·막대·점에만**, 바탕에는 쓰지 않는다.
  - 끼니는 색 없이 글자로.
  - 사진 위 글자: `media-scrim`(어두운 띠) + `on-media`(흰 글자) — 숏폼 칸·보기 화면의 사진 위에만. 두 테마에 같은 값. 스토리 보기 바탕은 `media`.
  - 카카오 로그인 버튼: `kakao`(#FEE500) `on-kakao` — 카카오 디자인 가이드 색, `KakaoButton` 에만.
  - 캐릭터 그림: `mascot-*`(토마토·크림·밤색·회색 등) — `Mascot` 에만. 일러스트 예외, 두 테마에 같은 값.
  - Tailwind 기본 팔레트(`bg-blue-500`, `text-white`)와 지운 토큰(`*-soft`, `caution`, `meal-*`)은 칠해지지 않는다.
- **글자 5종**: `text-caption`(12) `text-label`(14) `text-body`(16) `text-title`(20) `text-display`(32)
- **굵기 3종**: `font-regular` `font-medium` `font-bold`
- **둥글기**: `rounded-sm`(배지) `md`(버튼·입력) `lg`(카드) `xl`(시트) `full`
- **그림자 1종**: `shadow-overlay` — 시트·토스트·메뉴·떠 있는 버튼만
- **숫자**: `num` · **장식**: 형광펜 `highlight` 하나 (한 화면 핵심 숫자 하나)
- **모션**: 시간 `100`(상태 변화) `150`(작은 요소) `250`(컴포넌트) `350`(시트) `420`(화면·막대), 이징 `ease-out` `ease-drawer` `ease-inout` `ease-overshoot`. 움직이는 속성은 `transform`·`opacity` 뿐. 누르는 것은 `press`. 퇴장은 진입의 3/4. 동작 줄이기면 페이드만.

## 4. 쓰지 않는 것 (AI 티)

- 색 직접 쓰기, 임의 값(`text-[11px]`, `bg-[#..]`), 그라데이션, 카드 그림자, blur, `uppercase`
- 상태마다 색 알약·옅은 색 바탕(연노랑·살구·연민트), 색 원 아바타
- 이모지 아이콘 — `<Icon>`, 없으면 `Icon.tsx` 에 먼저 추가
- `style` 로 색·여백·글자·움직임 — `style` 은 너비 %·위치·transform 같은 계산값에만
- `transition-all`, 크기(width·height·top·margin) 애니메이션, 다섯 단계 밖 시간, `ease-in`
- `window.alert` / `confirm`, 페이지마다 만든 토스트·모달
- 알림에 "보러 가기" 버튼 — 어디로 갔는지 문구로 말하고, 길은 탭 바가 맡는다
- 오류를 조용히 삼키는 `catch {}` — 사용자 동작 실패는 `toast.show(…, { tone: "danger" })`, 불러오기 실패는 오류 상태. 보조·추적은 `// ds-allow: 이유`
- 화면에 남은 "(데모)"·"테스트 계정" 같은 개발 문구

꼭 필요한 예외는 그 줄에 `// ds-allow: 이유`. 기준 페이지에 개수와 함께 보인다.

## 5. 문구

- 해요체 하나 (약관·개인정보만 합쇼체)
- 버튼은 동작: "저장하기", "기록하기", "담기", "삭제하기" — 확인창은 "취소" + 동작 이름
- 완료 알림은 같은 동사의 과거형: "저장했어요", "식단 리스트에 담았어요"
- 실패는 무엇이 안 됐는지 + 할 일: "저장하지 못했어요. 다시 시도해 주세요"
- 비어 있음은 이유 한 줄 + 행동 하나 (`<EmptyState>`)
- 의료 표현 금지: 진단·처방·치료 단어 대신 "성분 정보 + 통계적 매칭"
- 추천 이유는 성분 사실 + 숫자 한 줄: "나트륨 210mg · 한 끼 기준의 절반", "단백질 24g". "건강에 좋아요"·"혈당 관리에 적합" 같은 효능 말은 쓰지 않는다
- 계산으로 짐작한 값(리뷰 전 맛, 1회 제공량 환산 등)은 옆에 `<Estimate>` 한 줄로 추정임을 밝힌다

## 6. 컴포넌트 고르는 법

| 필요 | 컴포넌트 |
|---|---|
| 페이지 틀 / 제목 / 구역 제목 | `Page` / `PageHeader` / `SectionHeader` |
| 누르는 것 | `Button` `LinkButton` `IconButton` `TextLink` · 카카오 로그인 `KakaoButton`(카카오 가이드 색, 이 버튼에만) |
| 누를 수 없는 라벨 | `Badge` (옅은 테두리 + 글자색) |
| 골라서 거르는 것 | `Chip` `ChipRow` · 큰 선택지 `ChoiceCard` · 세로 하나 고르기 `ChoiceList` |
| 보기 전환 | `Tabs` (pill: 화면 위쪽 / line: 카드·시트 안) · 페이지 이동 탭 `LinkTabs` |
| 묶음 | `Card` `CardActions` |
| 목록 한 줄 | `ListRow` + `Thumb` / `Avatar` |
| 입력 | `Field` `Input` `Textarea` `Select` `SearchField` · 숫자+단위 `UnitInput` · 슬라이더 `RangeInput`(.ds-range), 체크 `Checkbox`(.ds-check, 표 줄 고르기는 aria-label), 파일 `FilePick`, `RatingInput` `ScaleInput` · 한 번 누르는 맛 평가 `QuickRating` |
| 영양 | `MacroGrid` `MacroStat` `MacroInline` `ProgressBar` `Stat` `Kcal` `Price` |
| 그래프(대시보드) | 하루별 추이 `TrendChart` · 가로 막대 `BarList` · 빈틈 그림 `GapChart` — 축 하나, 이번 값 강조색·비교 회색 점선 |
| 끼니 | `MealTag` `MealSlot` `mealMeta()` |
| 커뮤니티 글 | `PostAuthor` `PostActions` `PostAction` `PostTags` · 댓글 한 줄 `CommentItem` · 챌린지·연속 기록 인증 `CertAttach` (`certLine` 한 줄) |
| 공구 조건 | 구성 목록(보기·고르기) `OfferOptionList` · 수량 `QtyStepper` |
| 숏폼(식단·공구 사진·영상) | `ReelRow` `ReelTile` `ReelAddTile` `ReelSkeleton` · 보기 화면 위쪽 `ReelMedia` · 영상 `VideoClip` · 글쓰기에 붙인 영상 `VideoAttach` |
| 스토리 보기(꽉 찬 화면) | `StoryFrame` `StoryProgress` `StoryHeader` `StoryMedia` `StorySticker` `StoryCaption` `StoryAction` `StoryReply` — 바탕 `media`(두 테마 같은 값) |
| 인증 카드 | 미리 보기 `ShareCardPreview` · 공유 순서 `ShareSteps` (그림은 `lib/share-card`) |
| 챌린지 같이 하기 | 날짜 점 `DayDots`(size sm, before) · 진행표 한 줄 `MemberProgressRow` · 겹친 아바타 `AvatarStack` |
| 안내 / 추정 표시 / 비어 있음 / 불러오는 중 | `Notice` / `Estimate` / `EmptyState` / `Skeleton` `SkeletonList` `SkeletonPost` (`Spinner` 는 버튼·작은 칸에만) |
| 겹침 | `Sheet` `ConfirmSheet` `useToast()` |
| 하단 | `BottomNav`(레이아웃에 한 번) · 주 행동 줄 `BottomBar`(있으면 탭 바가 물러남) · 떠 있는 버튼은 `above-nav` |
| 단계 | `Steps` |
| 캐릭터(내 화면에만) | `Mascot` (kind 끼록이·람이·끼냥이 · mood 8가지) · 고르기는 `/me/character` |

참고: suta(github.com/Guksu/suta, MIT) 의 금지선·모션 값·패턴, hallmark(github.com/Nutlope/hallmark, MIT) 의 연결 대조·데이터 4상태·새 눈 검토.
