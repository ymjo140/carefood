<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 화면 작업 규칙 (디자인 시스템)

화면(src/app, src/components)을 만들거나 고칠 때는 **반드시 `DESIGN.md` 를 먼저 읽는다.**

- 새 화면은 `src/components/ui` 와 `src/styles/design-system.css` 에 있는 것만 쓴다. 없으면 거기에 먼저 추가하고 `/design-system` 기준 페이지에 그린다.
- 색을 직접 쓰지 않는다(#hex, rgb, bg-blue-500, text-white). Tailwind 기본 팔레트는 지워져 있어 칠해지지 않는다.
- 그라데이션·카드 그림자·blur·uppercase·이모지 아이콘·임의 값(text-[11px])·style 로 색/여백 정하기 금지.
- 버튼은 동작("저장하기"), 완료 알림은 과거형("저장했어요"). alert/confirm 대신 useToast / ConfirmSheet.
- 끝나면 `npm run ds:lint` 가 0건이어야 한다.
