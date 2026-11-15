import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * 앱 안 링크 — next/link 와 같고, 미리 불러오기(prefetch)만 기본으로 끈다.
 * 이 앱 화면은 대부분 요청마다 서버에서 만들어서, 화면에 보이는 링크마다 미리 불러오면 링크 하나가 서버 함수 호출 하나가 된다
 * (11/14 하루 함수 호출 30만 번 — 제품 목록처럼 링크가 많은 화면을 열기만 해도 수십 번). 누르면 그때 불러온다.
 * 꼭 미리 불러와야 하는 곳만 prefetch 를 넘긴다.
 */
export default function Link({ prefetch = false, ...rest }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...rest} />;
}
