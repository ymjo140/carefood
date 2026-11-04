---
name: carefood-design
description: 케어푸드(carefood) 화면을 만들거나 고칠 때 쓰는 디자인 스킬 — 디자인 시스템 토큰·컴포넌트로만 짓고, suta 금지선(AI 티)·모션 기준·데이터 4상태를 지키고, ds:lint·ds:wiring·ds:audit 로 검사해 기준 페이지에서 확인한다. 페이지·컴포넌트 추가, 화면 다듬기, 레이아웃·여백·색·문구·애니메이션 작업에 쓴다.
---

# carefood-design — 케어푸드 화면 만들기

케어푸드는 식약처 영양 DB 기반 식품 추천·식단 기록 서비스다(Next.js 16 + React 19 + Tailwind v4 + Supabase). 이 스킬은 화면 하나하나를 그럴듯하게 만드는 대신, **디자인 시스템을 기준으로 화면을 조합**하게 한다. 기준이 하나면 화면끼리 어긋나지 않고, 어긋나지 않으면 AI 티가 나지 않는다.

뿌리: suta(github.com/Guksu/suta, MIT — 금지선·실측 기준·모션 값·패턴), hallmark(github.com/Nutlope/hallmark, MIT — 연결 대조·데이터 4상태·새 눈 검토), 그리고 "디자인 시스템을 먼저 만들고 화면은 거기서 가져다 쓴다"는 원칙.

**의료 영역에 들어가지 않는다.** 진단·처방·치료 표현 금지. "성분 정보 + 통계적 매칭"만.

## 폴더 지도 (저장소 ymjo140/carefood)

| 경로 | 내용 |
|---|---|
| `DESIGN.md` | 규칙 요약 — 먼저 읽는다 |
| `src/styles/design-system.css` | 토큰(색·글자·굵기·둥글기·그림자·모션·키프레임). Tailwind 기본값은 비워 둠 |
| `src/components/ui/*` | 컴포넌트. `import { … } from "@/components/ui"` |
| `src/app/design-system/Reference.tsx` | 기준 페이지(카탈로그 + 검사 현황). 운영: https://carefood-iota.vercel.app/design-system |
| `scripts/ds/lint.mjs` | 정적 검사 — `npm run ds:lint` (오류 0 이어야 배포) |
| `scripts/ds/wiring.mjs` | 연결 대조 — `npm run ds:wiring -- --base=<커밋>` |
| `scripts/ds/audit.mjs` | 화면 검사 — `npm run ds:audit` (서버를 먼저 띄운다) |
| `scripts/ds/measure.mjs` | 수치(색 수·글자 크기 종류 등) |
| `.github/workflows/design-system.yml` | 푸시마다 lint·wiring, 배포 후 audit 리포트 |

## 작업 절차

1. **프로젝트를 읽는다.** `DESIGN.md`, `design-system.css`, `src/components/ui/index.ts` 를 읽고 고칠 화면 파일을 끝까지 읽는다. 데이터 로딩·핸들러·API 경로·라우트를 먼저 적어 둔다(5단계 대조용).
2. **화면 유형을 정하고 뼈대를 가져온다** (아래 "화면 유형별 뼈대").
3. **고치는 화면이면 덜어내기부터** — 값만 고치면 화면은 그대로다.
   - 같은 정보를 두 곳에 → 한 곳. 같은 행동의 입구가 둘 이상 → 화면 유형이 정한 자리 하나.
   - 위·아래 고정 줄이 여럿 → 머리 한 줄 + 주 행동 한 줄(`BottomBar`).
   - 색 배지·상태 알약·색 원 아바타·옅은 색 상자 → 글자·아이콘·정렬.
   - "(데모)", "테스트 계정" 같은 개발 문구, 해요체·합쇼체 섞임 → 고친다.
4. **순서를 정한다.** 요소를 적고 순위를 매긴다. 1순위는 하나 — 가장 큰 글자 하나(필요하면 `Stat emphasis` 형광펜), 채운 주 버튼 하나. 넣을 이유를 한 문장으로 말 못 하는 요소는 뺀다. 요청에 적힌 요소는 하나도 빼지 않는다.
5. **컴포넌트를 고른다.** 기준 페이지에 있는 것만. **없으면 화면 파일에서 만들지 않는다** — `src/components/ui/<이름>.tsx` 에 기존 토큰만으로 먼저 만들고, `index.ts` 에 내보내고, `Reference.tsx` 에 그린 뒤 쓴다.
6. **데이터 영역마다 네 상태를 그린다** — 불러오는 중(`Skeleton*`, 스피너는 버튼·작은 칸에만) · 비어 있음(`EmptyState`: 이유 한 줄 + 행동 하나) · 실패(이유 + "다시 불러오기") · 채워짐. 사용자 동작이 실패하면 `toast.show("…하지 못했어요. 다시 시도해 주세요", { tone: "danger" })`.
7. **검사한다.**
   - `npm run ds:lint` → 오류 0. 경고는 판단하고, 의도한 예외는 그 줄에 `// ds-allow: 이유`.
   - `npm run ds:wiring -- --base=<고치기 전 커밋>` → 실패 0. 옮긴 연결은 경고로 나온다. 일부러 뺀 것은 파일에 `// ds-wiring-drop: <항목> — <이유>`.
   - `npx tsc --noEmit -p .` · `npx eslint <바꾼 파일>`
   - 빌드 후 서버(`npm run build && npx next start -p 3100`)를 띄우고 `npm run ds:audit -- --only=<경로>` → 문제 0.
8. **스크린샷을 본다.** 자동 검사는 잴 수 있는 것만 잡는다. 여백이 어색한지, 누를 수 있어 보이는지, 넓은 화면에서 비어 보이는지, 1순위가 정말 먼저 보이는지는 눈으로 본다. 큰 작업이면 작업을 안 본 검토자(새 맥락의 에이전트)에게 스크린샷만 주고 보게 한다 — 만든 쪽이 자기 결과를 채점하지 않는다.
9. **마무리 체크리스트를 확인하고**, 무엇을 왜 바꿨는지와 동작이 달라졌을 수 있는 부분을 짧게 보고한다.

## 금지선 (AI 티) — 맞는 컴포넌트가 없어도 지킨다

### 레이아웃

| AI가 흔히 하는 것 | 대신 |
|---|---|
| 어느 화면이든 히어로 → 카드 3장 → 버튼 | 화면 유형의 뼈대에서 시작 |
| 모든 구역·행을 테두리+그림자 카드로, 카드 안에 상자 | 간격·얇은 선·옅은 바탕(`sunken`)으로 묶고 카드는 독립 단위에 한 겹 |
| 주 행동을 채운 버튼으로 여러 곳에 | 채운 버튼은 하나. 상세·폼·주문은 `BottomBar` 에. 보조는 `secondary`·`ghost`·`TextLink` |
| 같은 정보 두 곳, 같은 행동 입구 세 곳 | 정보는 한 곳, 행동은 정해진 자리 하나 |
| 모든 간격이 같은 값 | 묶음 안 간격 ≤ 묶음 사이의 1/2, 4px 척도. 카드 안 16 · 카드 사이 12 · 구역 사이 32 |
| 지표 숫자와 라벨이 비슷한 크기, 라벨까지 굵게 | 숫자는 라벨의 2~3배(`Stat`), 굵게는 영역마다 한 줄 |
| 제목·문단 가운데 정렬, 금액 왼쪽 정렬 | 왼쪽 선 하나. 금액·영양 수치는 오른쪽 + `num` |
| 좁은 화면에서 글자를 9~11px로 | 열을 줄인다. 글자 12 이상, 누르는 영역 44 |
| 넓은 화면을 카드로 꽉 채움 | `Page` 폭(narrow 430 / default 720 / wide 1120) 안에서 가운데 |

### 글자 · 색 · 면

| AI가 흔히 하는 것 | 대신 |
|---|---|
| 강조색을 그때그때 · 프레임워크 기본 파랑 | 강조색은 맑은 앰버 `brand` 하나. 채운 면은 주 버튼 한 곳, 같은 색을 고른 상태·링크·핵심 숫자(`brand-ink`)에 약하게 이어 씀 |
| 상태마다 색 하나(주의 주황·완료 초록·정보 파랑) | UI 유채색은 앰버 + 오류 빨강(`danger`). 완료(`positive`)는 글자로만, 주의는 경고 아이콘 모양으로 |
| 연노랑·살구·연민트 바탕을 배지·안내·선택에 | 면은 `surface`·`sunken` 두 단계. 옅은 색 면은 고른 상태(`brand-soft`)에만 |
| 색 알약 배지 | `Badge` — 옅은 테두리 + 글자색 |
| 영양소 타일마다 색 바탕 | `MacroStat` — `sunken` 바탕, 영양소 색은 숫자·막대·점에만 |
| 끼니마다 색 점·색 줄 | 끼니 이름 글자로 (`MealTag`) |
| 앰버 위에 흰 글자 | `on-brand`(먹색). 흰 글자는 대비 미달 |
| 회색 글자를 그때그때 | `ink` · `ink-2` · `ink-3` 세 단계만 (모두 4.5 이상) |
| 카드에 테두리+그림자 | 테두리만. 그림자(`shadow-overlay`)는 시트·토스트·메뉴·떠 있는 버튼 |
| 그라데이션·글로우·blur | 쓰지 않는다. 장식은 형광펜 `highlight` 하나(한 화면 핵심 숫자 하나) |
| 이모지 아이콘(🍱 📦 ✨) | `<Icon name>` 한 벌(24 격자·선 1.75). 없으면 `Icon.tsx` 에 먼저 |
| `text-[11px]` · `bg-[#…]` · `rounded-[14px]` | 토큰: `text-caption/label/body/title/display`, `rounded-sm/md/lg/xl/full` |
| `uppercase` 라벨 | 쓰지 않는다 |

### 문구

| AI가 흔히 하는 것 | 대신 |
|---|---|
| "담겼습니다"와 "담았어요"를 섞음 | 해요체 하나 (약관·개인정보만 합쇼체) |
| 버튼 "확인", "제출", 확인창 "예/아니오" | 동작: "저장하기", "기록하기", "담기" · 확인창 "취소" + "삭제하기" |
| 완료 "성공!" | 같은 동사의 과거형: "저장했어요" |
| 오류 "오류가 발생했습니다" | 무엇이 안 됐는지 + 할 일: "저장하지 못했어요. 다시 시도해 주세요" |
| 제목 아래 제목 되풀이 설명 | 보조 줄은 이유·조건·숫자만. 없어도 되면 뺀다 |
| "스마트한·똑똑한" 홍보 문구 | 숫자와 사실("34만 식품 영양 DB") |
| 알림에 "보러 가기" 버튼 | 알림은 알리기만. 어디로 갔는지 문구로 ("식단 리스트에 담았어요. 아래 식단 탭에서 볼 수 있어요") |

### 모션

| AI가 흔히 하는 것 | 대신 |
|---|---|
| `transition-all` | 움직일 속성 이름(`transition-colors`) 또는 `press` |
| width·height·top·margin 애니메이션 | `transform`·`opacity` 만 (막대는 `scaleX`) |
| 모든 것에 300ms ease | 크기에 맞는 시간: 100 상태 변화 · 150 작은 요소 · 250 컴포넌트 · 350 시트 · 420 화면/막대 |
| 퇴장에 ease-in, 진입과 같은 시간 | 퇴장도 ease-out, 진입의 3/4 |
| 장식용 무한 반복 | 모션은 무슨 일이 일어났는지 알릴 때만 (`animate-pop` 은 좋아요 한 번) |
| 동작 줄이기 무시 | 토큰 CSS가 이미 처리 — 새 키프레임을 만들면 reduced-motion 블록도 같이 |

### 상호작용 · 접근성

| AI가 흔히 하는 것 | 대신 |
|---|---|
| 눌러도 반응 없음 | `press` (누르는 순간 0.97배) — `Button`·`Chip`·`Tabs` 에 이미 있음 |
| 로딩은 스피너 하나 · 연타 두 번 제출 | `Skeleton*` 으로 자리를 잡고, 진행 중엔 `Button loading` 으로 잠금 |
| 오류를 `catch {}` 로 삼킴 | 사용자 동작은 danger 알림, 불러오기는 실패 상태. 추적·보조는 `// ds-allow` |
| `div onClick` | `button`·`a`·`input` — 키보드로 닿게 |
| 아이콘만 있는 버튼에 이름 없음 | `IconButton label` 필수 |
| 모달을 직접 만듦 · `window.confirm` | `Sheet` · `ConfirmSheet` (포커스 이동·Esc·포커스 복귀 포함) |
| 한국어가 단어 중간에서 줄바꿈 | 전역 `keep-all` 이 처리. 좁은 표 칸은 `whitespace-nowrap` / `min-w-*` |
| 하단 탭 바 위에 또 하단 바를 쌓음 | 주 행동 화면은 `BottomBar` — 탭 바가 알아서 물러남. 떠 있는 버튼은 `above-nav` |

## 값 (src/styles/design-system.css)

| 무엇 | 값 |
|---|---|
| 면 | `canvas` #FBF8F3 · `surface` #FFF · `sunken` #F3EEE6 · `line` · `line-strong` (다크는 #141210 계열) |
| 글자 | `ink` · `ink-2` · `ink-3` — 모두 4.5 이상 |
| 강조 | `brand` #EA9602 (OKLCH 0.74/0.16/70) · `brand-hover` · `brand-soft`(고른 상태만) · `brand-ink` #8B5500 · `on-brand` #1C1305 |
| 상태 | `positive` · `danger` — 글자·아이콘만 |
| 영양 | `protein` · `carbs` · `fat` · `sodium` — 숫자·막대·점만 |
| 글자 크기 | caption 12 · label 14 · body 16 · title 20 · display 32 |
| 굵기 | regular 400 · medium 500 · bold 700 |
| 둥글기 | sm 6(배지) · md 10(버튼·입력) · lg 16(카드) · xl 24(시트) · full |
| 그림자 | `shadow-overlay` 1종 |
| 모션 | `duration-100/150/250/350/420` · `ease-out/drawer/inout/overshoot` · `animate-sheet-in/out` `fade-in/out` `rise-in` `pop` `skeleton` `spin` · `press` |
| 기타 | `num`(숫자) · `highlight`(형광펜) · `scroll-row` · `above-nav` · `.ds-range` · `.ds-check` |

Tailwind 기본 팔레트·그림자·글자 크기·둥글기·이징은 지워져 있어 써도 칠해지지 않는다.

## 화면 유형별 뼈대

| 화면 | 경로 | 뼈대 |
|---|---|---|
| 홈 | `/` | 첫 화면에 한 줄 제목 + 주 행동 하나(시작하기). 재방문자는 오늘 상태(Stat 하나 형광펜) → 개인화 추천 가로 줄. 구역 제목 + 가로 줄 반복, 카드 3장 템플릿 금지. 탭 바 있음 |
| 탐색 | `/products` | 검색 줄 → 정렬 탭 → 결과 수 → 목록. 넓은 화면은 왼쪽 필터 열, 휴대폰은 필터를 `Sheet`. 불러오는 중 `SkeletonList`, 결과 없음 `EmptyState` + 필터 초기화. 탭 바 있음 |
| 상세 | `/products/[id]` | 사진 → 이름·제조사 → 핵심 숫자 하나 → 영양(`MacroGrid`) → 알레르기 경고(`AllergenWarning`) → 맛·리뷰 → 가격 비교. 주 행동(구매·기록)은 하나. 탭 바 없음 |
| 식단 기록 | `/diary` | 날짜 줄 → 오늘 합계(남은 kcal 형광펜 + `MacroGrid` 목표 막대) → 끼니별 `MealSlot`(비면 점선 + 추가) → 음식 추가 시트(`Tabs line`: 검색·즐겨찾기·식단 리스트·직접 입력). 탭 바 있음 |
| 식단 리스트 | `/weekly-box` | 저장한 식단 카드(출처 `Badge`, 이름 바꾸기·불러오기·삭제) → 7일 편집기(요일 탭 → 끼니 칸) → 담은 게 있으면 `BottomBar` 주문(탭 바 물러남) |
| 피드 | `/community` | `Tabs pill`(추천·팔로잉·관심사) → 글 카드(`PostAuthor` → 내용 → 식단 요약 → `PostActions`). 글쓰기는 떠 있는 버튼(`above-nav`) → `Sheet`. 불러오는 중 `SkeletonPost`. 탭 바 있음 |
| 글 상세 | `/community/[id]` | 글 → 댓글 목록 → `BottomBar` 댓글 입력. 탭 바 없음 |
| 온보딩 | `/onboarding` | `Steps` → 한 화면 한 질문 → `ChoiceCard`/`Chip`/`.ds-range` → `BottomBar` 이전·다음. 결과는 Stat 하나 형광펜 + `MacroGrid` |
| 관리 | `/admin/*` | `LinkTabs` → 지표 행(Card + Stat, 색 네모 아이콘 금지) → 표(숫자 오른쪽 `num`). 상태는 `Badge` |

## 컴포넌트

`Page` `PageHeader` `SectionHeader` · `Button` `LinkButton` `IconButton` `TextLink` · `Badge` · `Chip` `ChipRow` `ChoiceCard` `ChoiceList` · `Tabs` `LinkTabs` · `Card` `CardActions` · `ListRow` `Thumb` `Avatar` · `Field` `Input` `Textarea` `Select` `SearchField` `RatingInput` `ScaleInput` `RatingStars` · `MacroGrid` `MacroStat` `MacroInline` `ProgressBar` `Stat` `Kcal` `Price` · `MealTag` `MealSlot` · `PostAuthor` `PostActions` `PostAction` `PostTags` · `Notice` `EmptyState` `Skeleton` `SkeletonList` `SkeletonPost` `Spinner` `PageLoading` · `Sheet` `ConfirmSheet` `useToast` · `BottomNav` `BottomBar` · `Steps` · `Icon`

쓰는 법과 모양은 기준 페이지에 그려져 있다. 추가할 때는 기준 페이지에도 데모를 넣는다.

## 마무리 체크리스트

- [ ] 1순위가 하나다 — 가장 큰 글자 하나, 채운 주 버튼 하나, 형광펜은 한 곳.
- [ ] 같은 정보·같은 행동이 한 곳에만 있다. 위·아래 고정 줄은 한 줄씩이다.
- [ ] UI 유채색이 앰버 + 오류 빨강뿐이다(영양소 색은 숫자·막대에만). 색 알약·옅은 색 바탕·색 아바타가 없다.
- [ ] 데이터 영역마다 불러오는 중·비어 있음·실패·채워짐이 있다. 오류를 삼키는 catch 가 없다(있으면 ds-allow 이유).
- [ ] 문구가 해요체 하나이고, 버튼은 동작, 완료는 과거형, 실패는 할 일까지 말한다. 개발 문구가 없다.
- [ ] 움직이는 속성이 transform·opacity 뿐이고 시간이 다섯 단계 안이다.
- [ ] 누를 수 있는 것은 키보드로 닿고, 아이콘 버튼에 이름이 있고, 시트는 Esc로 닫힌다.
- [ ] 390px 에서 가로로 넘치지 않고, 한글이 단어 중간에서 끊기지 않는다.
- [ ] `ds:lint` 오류 0 · `ds:wiring` 실패 0 · `ds:audit` 문제 0 · `tsc` 0.
- [ ] 새 컴포넌트는 `ui` 에 있고 기준 페이지에 그려져 있다.
- [ ] 스크린샷을 눈으로 봤다(라이트·다크, 휴대폰·넓은 화면).
- [ ] 의료 표현(진단·처방·치료)이 없다.

## 이 저장소 밖에서 쓸 때

`DESIGN.md`·토큰 파일이 없으면 위 "값"과 "금지선"을 그대로 기준으로 삼고, 토큰을 먼저 만든 뒤 화면을 짓는다. 검사 스크립트가 없으면 체크리스트를 직접 확인한다.
