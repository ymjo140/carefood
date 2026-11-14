<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 화면 작업 규칙 (디자인 시스템)

화면(src/app, src/components)을 만들거나 고칠 때는 **`.claude/skills/carefood-design/SKILL.md` 의 절차를 따르고 `DESIGN.md` 를 먼저 읽는다.**

- 새 화면은 `src/components/ui` 와 `src/styles/design-system.css` 에 있는 것만 쓴다. 없으면 거기에 먼저 추가하고 `/design-system` 기준 페이지에 그린다.
- UI 유채색은 강조색(앰버) 하나 + 오류 빨강. 색 알약·옅은 색 바탕·이모지 아이콘·그라데이션·카드 그림자·임의 값·style 로 색/여백 정하기 금지.
- 모션은 transform·opacity 만, 시간은 100/150/250/350/420.
- 데이터 영역은 불러오는 중·비어 있음·실패·채워짐 네 상태. 오류를 삼키지 않는다.
- 버튼은 동작("저장하기"), 완료 알림은 과거형("저장했어요"), 해요체 하나.
- 끝나면 `npm run ds:lint` 오류 0, `npm run ds:wiring -- --base=<고치기 전 커밋>` 실패 0.
- **배포는 몰아서** — main 에 합쳐도 바로 배포되지 않는다(vercel.json `git.deploymentEnabled.main=false`, Vercel Hobby 하루 배포 한도 때문). 2시간마다(Supabase 예약 `batched-deploy`) 운영 커밋과 main 끝이 다르면 배포 훅으로 배포한다(`src/lib/deploy-batch.ts`, `/api/deploy/run`). 급하면 관리자가 `POST /api/deploy/run?now=1`. PR 미리보기도 한도를 쓰니 작은 수정은 PR 하나로 묶는다.
- 돈·상태 계산(정산·구매확정·환불·반품·쿠폰·마감·주문 상태)을 고치면 `npm test` 통과 — 규칙이 바뀌면 `tests/` 의 시험도 같이 고친다. 시험은 가짜 DB(`tests/fake-sb.ts`, 1,000줄 한도까지 흉내)로 돈다.

## 코드 리뷰 (쓰고 나서 스스로, 올리기 전에)

자동 검사(ds:lint · ds:wiring · tsc · eslint)는 아래를 잡지 못한다. PR을 올리기 전에 바꾼 파일을 이 목록으로 직접 읽고, 같은 종류가 다른 파일에도 있는지 찾아 같이 고친다. PR 본문에 무엇을 확인했는지 적는다.

- **데이터 4상태** — 불러오는 중·비어 있음·실패·채워짐을 모두 그린다. `return null` 로 숨기는 것은 "표가 아직 없음" 같은 준비 전 상태뿐.
- **공통 컴포넌트** — 화면 파일에 `<button>` `<input>` `<select>` 를 직접 쓰지 않는다. 없으면 `src/components/ui` 에 만들고 기준 페이지에 그린다. 누르는 영역 44px.
- **늦은 응답** — 기간·필터·다시 불러오기처럼 같은 요청이 겹칠 수 있으면 마지막 요청만 상태를 바꾼다(요청 번호). 실패 경로도 같이.
- **바꾼 뒤 다시 불러오기** — 올리기·저장·가져오기 뒤에 그 결과를 보여 주는 다른 구역도 새로 불러온다.
- **경합(서버)** — 읽고 → 판단하고 → 쓰는 일은 DB 함수 하나에서 줄을 잠그거나 조건부 update(`.eq("status", …)`)로. 먼저 읽은 값으로 덮어쓰지 않는다. 돈·동의·상태 전이는 특히.
- **기간·날짜 경계** — 한국 시간 자정에서 끊는다. 시각 칸(created_at)과 날짜 칸(date·day)의 경계가 같아야 이번/지난 기간이 같은 날을 두 번 세지 않는다. from 이상 to 미만. 한도는 "지금"이 아니라 대상 시각 기준.
- **분모·모집단** — 합계·비율의 분자와 분모가 같은 대상인지. 목록을 자른(slice) 뒤에 합계를 내지 않는다.
- **저장값과 조회값** — 조건으로 거르는 값이 실제로 저장되는지(예: 온보딩 목표). 예전 데이터는 어떻게 다루는지 적는다.
- **만료·상태 필터** — 마감 지난 것(expires_at), 판매 종료, 꺼진 것을 지금 것처럼 보여 주지 않는다. 사용자 화면 API와 같은 기준.
- **오류 삼키기** — `catch {}` · `.catch(() => null)` 금지. 덤 기능이면 기록하고 그 줄에 `// ds-allow: 이유`, 화면에 영향이 있으면 알린다.
- **권한·소유** — 업체 API는 자기 업체 것만, 관리자 보기(`?as=`)는 읽기 전용. 관리자 API는 `adminOnly`.
- **개인정보** — 업체에 사람 단위로 보이는 것은 자기 업체 구매자뿐이고 업체마다 다른 가명 번호로만(연락처·이름·건강 목표 없음, 배송 정보는 동의한 주문의 배송 전까지). 앱 전체 고객층·비율은 10명 미만 가림, 질환 관련 값 안 씀, 의료 표현 없음. 혜택·자동 알림은 광고 — 광고 동의자에게만, 21~8시는 야간 동의자만.
- **휴대폰 표** — 숫자 칸은 줄바꿈 막기(`whitespace-nowrap`), 이름 칸은 최소 폭. 390px 스크린샷으로 확인.
