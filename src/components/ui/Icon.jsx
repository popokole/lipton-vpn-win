// Иконки интерфейса (контур 24×24, как в макетах). <Icon name="home" size={20} />

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  crown: <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="2.5" />,
  restore: <><rect x="5" y="8" width="11" height="11" rx="2" /><path d="M8.5 5H17a2 2 0 0 1 2 2v8.5" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  power: <><path d="M12 3v8" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></>,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v1a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V7" /><path d="M12 12v5" /></>,
  shieldCheck: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  shieldOff: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" /><path d="M4 4l16 16" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 9.7C22 5.9 17.5 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  telegram: <path d="m21 4-18 7 6 2 2 6 3-4 5 4z" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="m10 17 5-5-5-5" /><path d="M15 12H4" /></>,
  // Плитки главной
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 10v3.5l2.5 2" /><path d="M9.5 3h5" /><path d="M12 3v3" /></>,
  gauge: <><path d="M4.2 17.5a9 9 0 1 1 15.6 0" /><path d="m12 14 4-4.5" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></>,
  updown: <><path d="M8 20V4" /><path d="m4 8 4-4 4 4" /><path d="M16 4v16" /><path d="m12 16 4 4 4-4" /></>,
  trend: <><path d="m4 16 5-5 4 4 7-7" /><path d="M15 8h5v5" /></>,
  battery: <><rect x="2.5" y="7" width="16.5" height="10" rx="2.5" /><path d="M21.5 10.5v3" /><path d="M6 10.5v3" /><path d="M9.5 10.5v3" /><path d="M13 10.5v3" /></>,
  chart: <><path d="M4 20h16" /><path d="M7 16v-4" /><path d="M12 16V7" /><path d="M17 16v-7" /></>,
  shieldSlash: <><path d="m3 3 18 18" /><path d="M4.5 8.2V12c0 4.5 3.2 7.8 7.5 9 1.9-.5 3.6-1.5 4.9-2.8" /><path d="M7.6 4.76 12 3l7.5 3v6c0 1-.1 1.9-.4 2.7" /></>,
  lockOpen: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 7.6-1.8" /></>,
  // Серверы и новости
  pulse: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  star: <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  shuffle: <><path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" /><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" /><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" /></>,
  lockKey: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><path d="M12 14.5v2" /></>,
  checks: <><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></>,
  external: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  // Настройки
  send: <><path d="m21.5 2.5-7 19-4-8.5-8.5-4z" /><path d="M21.5 2.5 10.5 13" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
  desktop: <><rect x="2.5" y="4" width="19" height="12.5" rx="2" /><path d="M8 20.5h8" /><path d="M12 16.5v4" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  unlink: <><path d="M9.5 6.5 11 5a4.5 4.5 0 0 1 6.4 6.4L15.9 13" /><path d="M14.5 17.5 13 19a4.5 4.5 0 0 1-6.4-6.4L8.1 11" /><path d="m3.5 3.5 3 3" /><path d="m17.5 17.5 3 3" /></>,
  link: <><path d="M10 13.5a4.5 4.5 0 0 0 6.4.5l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" /><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.5l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" /></>,
  warning: <><path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  contrast: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 8h5.5" /><path d="M12 12h7" /><path d="M12 16h5.5" /></>,
  translate: <><path d="M4 5h9" /><path d="M8.5 3v2" /><path d="M11 5c-1 4.5-4 8-7 9.5" /><path d="M6.5 9.5c1.5 2 3.5 3.5 6 4.5" /><path d="m13 21 4-9 4 9" /><path d="M14.5 18h5" /></>,
  card: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /><path d="M6.5 15h3" /></>,
  list: <><path d="M9.5 6H20" /><path d="M9.5 12H20" /><path d="M9.5 18H17" /><circle cx="5" cy="6" r="1.2" /><circle cx="5" cy="12" r="1.2" /><circle cx="5" cy="18" r="1.2" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  plug: <><path d="M9 2.5v5" /><path d="M15 2.5v5" /><path d="M6 7.5h12V11a6 6 0 0 1-12 0z" /><path d="M12 17v4.5" /></>,
  bolt: <path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12z" />,
  chatDots: <><path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.8A8 8 0 1 1 21 12z" /><path d="M8.5 12h.01" /><path d="M12 12h.01" /><path d="M15.5 12h.01" /></>,
  book: <><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z" /><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20" /><path d="M8.5 7.5h7" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3" /><path d="M12.5 15H17" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  reset: <><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6" /><path d="m15 9-6 6" /></>,
  // Вход, онбординг и подэкраны
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  login: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></>,
  userPlus: <><circle cx="10" cy="8" r="4" /><path d="M3 21a7 7 0 0 1 14 0" /><path d="M19 8v6" /><path d="M16 11h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  tag: <><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  sparkle: <><path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7z" /><path d="M19 15c.2 1.6 1 2.4 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.1 2.3-.9 2.5-2.5z" /></>,
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13.5" width="4" height="6" rx="1.5" /><rect x="17" y="13.5" width="4" height="6" rx="1.5" /><path d="M19 19.5a3 3 0 0 1-3 2.5h-3" /></>,
  paperclip: <path d="m20.5 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />,
  trash: <><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  hourglass: <><path d="M6 3h12" /><path d="M6 21h12" /><path d="M7 3c0 5 10 5 10 9s-10 4-10 9" /><path d="M17 3c0 5-10 5-10 9s10 4 10 9" /></>,
  contactless: <><path d="M8.5 8.5a5 5 0 0 1 0 7" /><path d="M12 6a8.5 8.5 0 0 1 0 12" /><path d="M15.5 3.5a12 12 0 0 1 0 17" /></>,
  infinity: <path d="M7 8.5a3.5 3.5 0 1 0 0 7c3 0 7-7 10-7a3.5 3.5 0 1 1 0 7c-3 0-7-7-10-7z" />,
  thumbUp: <><path d="M7 11v9H4v-9z" /><path d="M7 11l4-7a2 2 0 0 1 2.5 2.3L13 10h5.5a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 17.2 20H7" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  gift: <><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8h14v-8" /><path d="M12 8v12" /><path d="M12 8c-1.5-3-5-3.5-5-1.2C7 8 9 8 12 8z" /><path d="M12 8c1.5-3 5-3.5 5-1.2C17 8 15 8 12 8z" /></>,
}

export default function Icon({ name, size = 16, stroke = 1.8, color, className = '', style }) {
  const p = PATHS[name]
  if (!p) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {p}
    </svg>
  )
}
