import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Circle {
  readonly c: readonly [number, number, number];
}
type IconPart = string | Circle;
interface IconDef {
  readonly parts: readonly IconPart[];
  readonly fill?: boolean;
}

/** Stroke-icon set ported verbatim from the CoreFlow design prototype. */
const ICONS: Record<string, IconDef> = {
  spark: {
    fill: true,
    parts: [
      'M12 2.5l1.9 5.2 5.2 1.9-5.2 1.9L12 16.7l-1.9-5.2L4.9 9.6l5.2-1.9z',
      'M18.6 14.4l.72 1.98 1.98.72-1.98.72-.72 1.98-.72-1.98-1.98-.72 1.98-.72z',
    ],
  },
  reports: { parts: ['M5 20v-5', 'M12 20V8', 'M19 20v-9', 'M3.5 20h17'] },
  qa: { parts: ['M12 3l7 3v5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z', 'M9 12l2 2 4-4'] },
  iso: { parts: ['M9 13.5L7.5 21l4.5-2.2L16.5 21 15 13.5', { c: [12, 9, 5.4] }] },
  projects: { parts: ['M4 5h6v14H4z', 'M14 5h6v9h-6z'] },
  documents: { parts: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'] },
  procedures: {
    parts: [
      'M10 6h10',
      'M10 12h10',
      'M10 18h10',
      'M4 6.2l1.3 1.3L7.5 4.7',
      'M4 12.2l1.3 1.3L7.5 10.7',
      'M4 18.2l1.3 1.3L7.5 16.7',
    ],
  },
  people: {
    parts: [
      'M9 11.5a3.3 3.3 0 100-6.6 3.3 3.3 0 000 6.6z',
      'M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2',
      'M16.5 5.2a3 3 0 010 6',
      'M21 20c0-2.5-1.5-4.2-3.6-4.9',
    ],
  },
  training: {
    parts: ['M12 4L2.5 8.5 12 13l9.5-4.5L12 4z', 'M6 10.5V16c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-5.5'],
  },
  search: { parts: ['M11 18.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15z', 'M21 21l-4.3-4.3'] },
  bell: {
    parts: [
      'M18 8.5a6 6 0 10-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5',
      'M13.5 20.5a2 2 0 01-3 0',
    ],
  },
  sun: {
    parts: [
      { c: [12, 12, 4.4] },
      'M12 2v2.4',
      'M12 19.6V22',
      'M3.6 3.6l1.7 1.7',
      'M18.7 18.7l1.7 1.7',
      'M2 12h2.4',
      'M19.6 12H22',
      'M3.6 20.4l1.7-1.7',
      'M18.7 5.3l1.7-1.7',
    ],
  },
  moon: { parts: ['M21 13A9 9 0 1111 3a7 7 0 0010 10z'] },
  send: { parts: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'] },
  check: { parts: ['M5 12.5l4.5 4.5L19 6.5'] },
  x: { parts: ['M6 6l12 12', 'M18 6L6 18'] },
  plus: { parts: ['M12 5v14', 'M5 12h14'] },
  chevron: { parts: ['M6 9.5l6 6 6-6'] },
  clock: { parts: [{ c: [12, 12, 9] }, 'M12 7.5V12l3 2'] },
  sliders: {
    parts: [
      'M4 7h9',
      'M17 7h3',
      'M4 12h3',
      'M11 12h9',
      'M4 17h6',
      'M14 17h6',
      { c: [14.5, 7, 2] },
      { c: [8.5, 12, 2] },
      { c: [11.5, 17, 2] },
    ],
  },
  arrow: { parts: ['M5 12h14', 'M13 6l6 6-6 6'] },
  back: { parts: ['M19 12H5', 'M11 6l-6 6 6 6'] },
  lock: { parts: ['M6 11h12v9H6z', 'M9 11V8a3 3 0 016 0v3'] },
  logout: { parts: ['M10 4H5v16h5', 'M15 8l4 4-4 4', 'M19 12H9'] },
  devices: { parts: ['M3 5h13v9H3z', 'M7 18h5', 'M9.5 14v4', 'M18 9h3v10h-3z'] },
  comment: { parts: ['M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z'] },
  history: {
    parts: [{ c: [12, 12, 8.5] }, 'M12 7.5V12l3.2 1.8', 'M3.5 7.5l1 1.6 1.7-.8'],
  },
  alert: {
    parts: [
      'M10.3 4.4L2.7 17.7A1.7 1.7 0 004.2 20.3h15.6a1.7 1.7 0 001.5-2.6L13.7 4.4a1.9 1.9 0 00-3.4 0z',
      'M12 9.5v4',
      'M12 16.9v.01',
    ],
  },
  risk: { parts: ['M3 12h3.4l2.1-6 3.6 12 2.2-9H21'] },
  audit: { parts: ['M8 5H6v15h12V5h-2', 'M9 4h6v3H9z', 'M9 13l1.8 1.8L15 11.3'] },
  userplus: {
    parts: [
      'M9 11.5a3.3 3.3 0 100-6.6 3.3 3.3 0 000 6.6z',
      'M3 20c0-3.2 2.7-5.2 6-5.2 1.5 0 2.9.4 4 1',
      'M18 14v6',
      'M15 17h6',
    ],
  },
  link: {
    parts: [
      'M9.5 14.5l5-5',
      'M11 7.5l1-1a3.5 3.5 0 015 5l-1 1',
      'M13 16.5l-1 1a3.5 3.5 0 01-5-5l1-1',
    ],
  },
  flag: { parts: ['M5 21V4', 'M5 4.5h11l-2 3.5 2 3.5H5'] },
  calendar: { parts: ['M5 5.5h14v14H5z', 'M5 9.5h14', 'M9 3.5v4', 'M15 3.5v4'] },
  inbox: {
    parts: ['M4 13l2.2-7.5h11.6L20 13', 'M4 13v6h16v-6', 'M4 13h4l1.2 2.2h5.6L16 13h4'],
  },
  trash: {
    parts: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l.9 12.5h9.2L17.5 7', 'M10 11v5', 'M14 11v5'],
  },
  checkcircle: { parts: [{ c: [12, 12, 9] }, 'M8.5 12l2.3 2.3L15.6 9.4'] },
  upload: { parts: ['M12 16V5', 'M8 9l4-4 4 4', 'M5 19h14'] },
  download: { parts: ['M12 5v11', 'M8 12l4 4 4-4', 'M5 19h14'] },
  pencil: { parts: ['M4 20l4.2-1 10.3-10.3a2.1 2.1 0 0 0-3-3L5.2 16 4 20z', 'M13.5 7.5l3 3'] },
  grip: {
    parts: ['M9 6h.01', 'M9 12h.01', 'M9 18h.01', 'M15 6h.01', 'M15 12h.01', 'M15 18h.01'],
  },
  // Design-system additions (P3): shell, page header and distinct module icons.
  menu: { parts: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  grid: { parts: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'] },
  more: {
    fill: true,
    parts: [{ c: [5.5, 12, 1.6] }, { c: [12, 12, 1.6] }, { c: [18.5, 12, 1.6] }],
  },
  gear: {
    parts: [
      'M10.3 3.6a1.8 1.8 0 013.4 0l.3.9a1.8 1.8 0 002.4 1l.9-.4a1.8 1.8 0 012.4 2.4l-.4.9a1.8 1.8 0 001 2.4l.9.3a1.8 1.8 0 010 3.4l-.9.3a1.8 1.8 0 00-1 2.4l.4.9a1.8 1.8 0 01-2.4 2.4l-.9-.4a1.8 1.8 0 00-2.4 1l-.3.9a1.8 1.8 0 01-3.4 0l-.3-.9a1.8 1.8 0 00-2.4-1l-.9.4a1.8 1.8 0 01-2.4-2.4l.4-.9a1.8 1.8 0 00-1-2.4l-.9-.3a1.8 1.8 0 010-3.4l.9-.3a1.8 1.8 0 001-2.4l-.4-.9a1.8 1.8 0 012.4-2.4l.9.4a1.8 1.8 0 002.4-1z',
      { c: [12, 12, 3] },
    ],
  },
  home: { parts: ['M4 11l8-6.5 8 6.5', 'M6.5 9.5V20h11V9.5', 'M10 20v-5h4v5'] },
  target: { parts: [{ c: [12, 12, 8.5] }, { c: [12, 12, 4.5] }, { c: [12, 12, 0.8] }] },
  scale: {
    parts: [
      'M12 4v16',
      'M7 20h10',
      'M5 7h14',
      'M5 7l-2.5 6a2.5 2.5 0 005 0z',
      'M19 7l-2.5 6a2.5 2.5 0 005 0z',
    ],
  },
  contract: {
    parts: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M9.5 17.5c1.2-1.6 2.2-1.6 3 0s1.8 1.6 3 0'],
  },
  shield: {
    parts: [
      'M12 3l7 3v5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z',
      'M9.5 11.5h5v4h-5z',
      'M10.5 11.5V10a1.5 1.5 0 013 0v1.5',
    ],
  },
  hardhat: { parts: ['M3.5 17.5h17', 'M5 17.5a7 7 0 0114 0', 'M10 10.8V8h4v2.8'] },
  leaf: { parts: ['M5 19c0-8 5-13 14-14-1 9-6 14-14 14z', 'M5 19l7-7'] },
  book: {
    parts: [
      'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z',
      'M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5',
    ],
  },
  smile: { parts: [{ c: [12, 12, 9] }, 'M8.5 14.5c1.8 2 5.2 2 7 0', 'M9 9.5h.01', 'M15 9.5h.01'] },
  help: {
    parts: [{ c: [12, 12, 9] }, 'M9.6 9.3a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.6', 'M12 17h.01'],
  },
  pin: { parts: ['M9 4h6', 'M10 4v5.5L7 13h10l-3-3.5V4', 'M12 13v7'] },
  building: {
    parts: ['M4 20.5h16', 'M6 20.5V5l8-2v17.5', 'M14 9h4v11.5', 'M9 8h2', 'M9 11.5h2', 'M9 15h2'],
  },
};

/**
 * Renders a single design-system SVG icon by name (24×24 viewBox, stroke-width
 * 1.7, round caps/joins). `fill` icons (e.g. spark) use currentColor fill, the
 * rest use currentColor stroke. Colour comes from the parent's `color`.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="def() && def()!.fill ? 'currentColor' : 'none'"
      [attr.stroke]="def() && def()!.fill ? 'none' : 'currentColor'"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="block shrink-0"
      aria-hidden="true"
    >
      @for (part of paths(); track $index) {
        <path [attr.d]="part" />
      }
      @for (circle of circles(); track $index) {
        <circle [attr.cx]="circle[0]" [attr.cy]="circle[1]" [attr.r]="circle[2]" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(18);

  protected readonly def = computed<IconDef | undefined>(() => ICONS[this.name()]);

  protected readonly paths = computed<string[]>(() =>
    (this.def()?.parts ?? []).filter((p): p is string => typeof p === 'string'),
  );

  protected readonly circles = computed<readonly (readonly [number, number, number])[]>(() =>
    (this.def()?.parts ?? []).filter((p): p is Circle => typeof p !== 'string').map((p) => p.c),
  );
}
