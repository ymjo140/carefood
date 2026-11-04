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
