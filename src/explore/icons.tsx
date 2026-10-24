// Line icons in the map controls' style: 20×20 grid, 1.5 stroke, round caps.
type IconName =
  | 'back'
  | 'search'
  | 'close'
  | 'plus'
  | 'minus'
  | 'globe'
  | 'play'
  | 'pause'
  | 'resume'
  | 'next'
  | 'restart'
  | 'camera'
  | 'exit'
  | 'map'
  | 'flag'
  | 'check';

const PATHS: Record<IconName, JSX.Element> = {
  back: <path d="M11.5 4.5 6 10l5.5 5.5M6.5 10H16" />,
  search: (
    <>
      <circle cx="8.8" cy="8.8" r="5" />
      <path d="m12.6 12.6 4 4" />
    </>
  ),
  close: <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  minus: <path d="M4.5 10h11" />,
  globe: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M3.5 10h13M10 3.5c-2.2 2.4-2.2 10.6 0 13M10 3.5c2.2 2.4 2.2 10.6 0 13" />
    </>
  ),
  play: <path d="M7 4.8v10.4L15.2 10z" className="bt-fill" />,
  pause: <path d="M7.2 5v10M12.8 5v10" />,
  resume: (
    <>
      <path d="M5.5 5v10" />
      <path d="M9 5.2v9.6L16 10z" className="bt-fill" />
    </>
  ),
  next: (
    <>
      <path d="M4.5 5.2v9.6L11 10z" className="bt-fill" />
      <path d="M11 5.2v9.6L17.5 10z" className="bt-fill" />
    </>
  ),
  restart: <path d="M4.8 10a5.2 5.2 0 1 0 1.6-3.8M4.8 4.2v3.4h3.4" />,
  camera: (
    <>
      <path d="M3.5 7h3l1.4-2h4.2l1.4 2h3v8h-13z" />
      <circle cx="10" cy="11" r="2.4" />
    </>
  ),
  exit: <path d="M8 4.5H4.5v11H8M11.5 6.5 15 10l-3.5 3.5M15 10H7.5" />,
  map: <path d="M3.5 5.5 7.8 4l4.4 1.5L16.5 4v10.5L12.2 16l-4.4-1.5L3.5 16zM7.8 4v10.5M12.2 5.5V16" />,
  flag: <path d="M5.5 16.5v-12M5.5 4.5h9l-2 3 2 3h-9" />,
  check: <path d="m4.8 10.4 3.4 3.3 7-7.2" />,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="bt-icon">
      {PATHS[name]}
    </svg>
  );
}
