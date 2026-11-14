import type { SVGProps } from "react";

/**
 * 아이콘 — 24px 격자, 선 굵기 1.75. 이모지를 아이콘 대신 쓰지 않습니다.
 * 새 아이콘이 필요하면 PATHS 에 먼저 추가하고 /design-system 에서 확인하세요.
 */
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-down": "M6 9l6 6 6-6",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20",
  heart: "M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z",
  message: "M5 5h14v10.5H10L5 19.5z",
  copy: "M9 9h10v10H9zM5 15V5h10",
  bookmark: "M7 4h10v16l-5-3.8L7 20z",
  trash: "M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7",
  edit: "M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4",
  share: "M12 4v11M8 8l4-4 4 4M5 13v6.5h14V13",
  camera: "M4 8h3.5L9 5.5h6L16.5 8H20v11H4zM12 16.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  video: "M4 7h11v10H4zM15 10.5l5-3v9l-5-3z",
  play: "M8 5.5v13l10.5-6.5z",
  "volume-off": "M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9.5l5 5M21 9.5l-5 5",
  "volume-on": "M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9a4.2 4.2 0 0 1 0 6M18.5 6.5a7.8 7.8 0 0 1 0 11",
  user: "M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  info: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 11v5M12 8h.01",
  alert: "M12 4.5l8.5 15h-17zM12 10v4.5M12 17h.01",
  filter: "M4 6.5h16M7 12h10M10 17.5h4",
  calendar: "M4.5 6h15v14h-15zM4.5 10.5h15M9 3.5V8M15 3.5V8",
  cart: "M4 5h2l2 10h10l2-7H7.2M10 19.5h.01M17 19.5h.01",
  refresh: "M19 12a7 7 0 1 1-2-4.9M19 4.5V8h-3.5",
  external: "M14 5h5v5M19 5l-8 8M17 14v5H5V7h5",
  home: "M4 10.5L12 4l8 6.5V20h-5.5v-6h-5v6H4z",
  list: "M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01",
  notebook: "M6 4h12v16H6zM9.5 8.5h5M9.5 12h5M4 8h3M4 12h3M4 16h3",
  feed: "M4.5 5h15v5h-15zM4.5 14h15v5h-15z",
  grip: "M8.75 6h.5M14.75 6h.5M8.75 12h.5M14.75 12h.5M8.75 18h.5M14.75 18h.5",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  tag: "M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5zM8.5 8.5h.01",
  bell: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5h4",
  logout: "M14 5h5v14h-5M10 8l-4 4 4 4M6 12h9",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.7-3.4 3-5.5 6-5.5s5.3 2.1 6 5.5M15.5 4.3a3.5 3.5 0 0 1 0 6.4M17.5 14.8c1.8.7 3 2.5 3.5 5.2",
  lock: "M5.5 11h13v9h-13zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  lunchbox: "M3.5 6.5h17v12h-17zM3.5 11h17M12 11v7.5",
  leaf: "M11 20a7 7 0 0 1-7-7c0-5 4-9 16-9 0 12-4 16-9 16zM4 20l9-9",
  egg: "M12 3.5c-3.8 0-6.5 5.8-6.5 9.5a6.5 6.5 0 0 0 13 0c0-3.7-2.7-9.5-6.5-9.5z",
  bowl: "M3.5 11.5h17a8.5 8.5 0 0 1-17 0zM8.5 8c0-1.4 1-1.9 1-3.3M13.5 8c0-1.4 1-1.9 1-3.3",
  cookie: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM8.5 9h.01M14 8h.01M15.5 13.5h.01M9 15h.01M12 12h.01",
  cup: "M6 3.5h12l-1.5 16.5h-9zM6.5 8h11",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  poll: "M5 19.5h14M7 16.5v-5M12 16.5v-11M17 16.5v-8",
  flag: "M6 20.5v-16M6 5h11.5l-2.5 4 2.5 4H6",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

type Props = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  filled?: boolean;
};

export function Icon({ name, size = 20, filled = false, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
