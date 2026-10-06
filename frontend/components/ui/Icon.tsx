import type { ReactNode, SVGProps } from "react";

/** Original, hand-drawn 24x24 icon set. Colour comes from CSS `color`. */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS: Record<string, ReactNode> = {
  flame: (
    <>
      <path fill="currentColor" d="M12.4 1.8c.6 3.3-1.2 4.9-2.7 6.7C8.2 10.3 7 12 7 14.4a5.4 5.4 0 0 0 10.8 0c0-2.2-1-3.9-2.2-5.4-.2 1.5-.9 2.4-1.9 2.9.5-3.4-.1-7.2-1.3-10.1z" />
      <path fill="var(--icon-cut, #fff)" fillOpacity=".55" d="M12.3 12.6c-1.3 1.2-2 2.2-2 3.4a2.2 2.2 0 0 0 4.4 0c0-1.2-.8-2.2-2.4-3.4z" />
    </>
  ),
  heart: <path fill="currentColor" d="M12 21.2C6.2 17.3 3 13.9 3 9.9 3 7.2 5 5.2 7.6 5.2c1.8 0 3.4 1 4.4 2.6 1-1.6 2.6-2.6 4.4-2.6C19 5.2 21 7.2 21 9.9c0 4-3.2 7.4-9 11.3z" />,
  gem: (
    <>
      <path fill="currentColor" d="M7 3.5h10l4.5 5.7L12 21 2.5 9.2z" />
      <path fill="var(--icon-cut, #fff)" fillOpacity=".5" d="M7 3.5l-1.7 5.7h13.4L17 3.5z" />
      <path fill="none" stroke="var(--icon-cut, #fff)" strokeOpacity=".55" strokeWidth="1.2" d="M2.5 9.2h19M9.2 9.2 12 21l2.8-11.8" />
    </>
  ),
  bolt: <path fill="currentColor" d="M13.5 1.8 4.2 13.4h6l-1.2 8.8 9.8-12.4h-6.2z" />,
  star: <path fill="currentColor" d="m12 2.2 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.1l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />,
  crown: <path fill="currentColor" d="m3 8.2 4.3 3.6L12 4.6l4.7 7.2L21 8.2 19.2 19H4.8z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10.5" rx="2.6" fill="currentColor" />
      <path {...S} d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </>
  ),
  check: <path {...S} strokeWidth={3.6} d="m4.8 12.8 4.6 4.6 9.8-10.4" />,
  x: <path {...S} strokeWidth={3} d="m6 6 12 12M18 6 6 18" />,
  plus: <path {...S} strokeWidth={3} d="M12 5v14M5 12h14" />,
  "chevron-left": <path {...S} strokeWidth={3} d="m15 5-7 7 7 7" />,
  book: <path fill="currentColor" d="M3 4.5h6.3A2.7 2.7 0 0 1 12 7.2v13.3a2.7 2.7 0 0 0-2.7-2.2H3zm18 0h-6.3A2.7 2.7 0 0 0 12 7.2v13.3a2.7 2.7 0 0 1 2.7-2.2H21z" />,
  trophy: (
    <>
      <path fill="currentColor" d="M7 3h10v6.2a5 5 0 0 1-10 0z" />
      <path {...S} strokeWidth={2} d="M7 5H3.8c0 3 1.4 4.8 3.6 5M17 5h3.2c0 3-1.4 4.8-3.6 5" />
      <path fill="currentColor" d="M10.6 13.5h2.8v3h2.6V20H8v-3.5h2.6z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4.4" fill="currentColor" />
      <path fill="currentColor" d="M3.8 21c.4-4.4 3.7-6.6 8.2-6.6s7.8 2.2 8.2 6.6z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.6" fill="currentColor" />
      <path fill="currentColor" d="M2.2 20c.3-3.8 3-5.6 6.8-5.6s6.5 1.8 6.8 5.6z" />
      <path fill="currentColor" fillOpacity=".65" d="M16 5a3.4 3.4 0 0 1 0 6.6 3.4 3.4 0 0 0 0-6.6zm1 9.6c2.7.4 4.6 2.1 4.8 5.4h-4c0-2.2-.3-4.1-.8-5.4z" />
    </>
  ),
  settings: (
    <>
      <path {...S} strokeWidth={2.4} d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.4" fill="currentColor" />
      <circle cx="9" cy="17" r="2.4" fill="currentColor" />
    </>
  ),
  home: <path fill="currentColor" d="M12 2.8 2.6 11h2.6v9.2h5.1v-5.6h3.4v5.6h5.1V11h2.6z" />,
  chat: <path fill="currentColor" d="M5.5 4h13A3.5 3.5 0 0 1 22 7.5v6A3.5 3.5 0 0 1 18.5 17H12l-5 4v-4h-1.5A3.5 3.5 0 0 1 2 13.5v-6A3.5 3.5 0 0 1 5.5 4z" />,
  wave: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <circle cx="8.8" cy="10" r="1.3" fill="var(--icon-cut, #fff)" />
      <circle cx="15.2" cy="10" r="1.3" fill="var(--icon-cut, #fff)" />
      <path {...S} stroke="var(--icon-cut, #fff)" strokeWidth={2} d="M8 14.3c1 1.7 2.3 2.4 4 2.4s3-.7 4-2.4" />
    </>
  ),
  palette: (
    <>
      <path fill="currentColor" d="M12 2.5a9.5 9.5 0 1 0 0 19c1.6 0 2.3-1 2-2.1-.3-1 .3-2 1.4-2H18a3.5 3.5 0 0 0 3.5-3.5C21.5 8.1 17.2 2.5 12 2.5z" />
      <circle cx="7.6" cy="11" r="1.6" fill="var(--icon-cut, #fff)" />
      <circle cx="10.6" cy="7" r="1.6" fill="var(--icon-cut, #fff)" />
      <circle cx="15.6" cy="7.6" r="1.6" fill="var(--icon-cut, #fff)" />
    </>
  ),
  food: (
    <>
      <path fill="currentColor" d="M12 7.2c-1.2-1.1-3-1.5-4.6-.9C4.8 7.300 3.5 9.800 4 13c.6 3.800 3.200 7.800 5.600 7.800.9 0 1.500-.5 2.400-.5s1.500.5 2.400.5c2.400 0 5-4 5.600-7.800.5-3.200-.8-5.700-3.400-6.700-1.600-.6-3.400-.2-4.600.9z" />
      <path {...S} strokeWidth={2.2} d="M12 7c0-2 .9-3.500 2.600-4.500" />
    </>
  ),
  map: (
    <>
      <path fill="currentColor" d="M12 2.2a7 7 0 0 0-7 7c0 5 7 12.600 7 12.600s7-7.600 7-12.600a7 7 0 0 0-7-7z" />
      <circle cx="12" cy="9.2" r="2.6" fill="var(--icon-cut, #fff)" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.8" fill="currentColor" />
      <path {...S} strokeWidth={2.4} d="M12 2.5v2.4M12 19.100v2.400M2.500 12h2.400M19.100 12h2.400M5.300 5.300l1.700 1.700M17 17l1.700 1.700M5.300 18.700 7 17M17 7l1.700-1.700" />
    </>
  ),
  bell: <path fill="currentColor" d="M12 2.5a6 6 0 0 0-6 6v4L3.800 16.500V18h16.400v-1.500L18 12.500v-4a6 6 0 0 0-6-6zM9.700 19.500a2.400 2.400 0 0 0 4.600 0z" />,
  volume: (
    <>
      <path fill="currentColor" d="M3 9.500h3.500L12 5v14l-5.500-4.500H3z" />
      <path {...S} strokeWidth={2.2} d="M15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9.200" fill="none" stroke="currentColor" strokeWidth="2.200" />
      <path {...S} strokeWidth={2} d="M2.800 12h18.400M12 2.800c2.800 2.700 4 5.800 4 9.200s-1.200 6.500-4 9.200c-2.800-2.700-4-5.800-4-9.200s1.200-6.500 4-9.200z" />
    </>
  ),
  moon: <path fill="currentColor" d="M20.500 14.500A8.500 8.500 0 0 1 9.500 3.500a8.500 8.500 0 1 0 11 11z" />,
  shield: <path fill="currentColor" d="M12 2.500 4.500 5.500v6c0 4.600 3.100 8.200 7.500 10 4.400-1.800 7.500-5.400 7.500-10v-6z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9.500" fill="currentColor" />
      <path {...S} stroke="var(--icon-cut, #fff)" strokeWidth={2.600} d="M12 11v5.500M12 7.500v.1" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9.200" fill="none" stroke="currentColor" strokeWidth="2.400" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2.400" />
      <circle cx="12" cy="12" r="1.800" fill="currentColor" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: string;
  size?: number;
  title?: string;
}

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
  const glyph = ICONS[name] ?? ICONS.star;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {glyph}
    </svg>
  );
}
