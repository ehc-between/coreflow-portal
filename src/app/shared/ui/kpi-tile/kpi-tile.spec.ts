import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
// @ts-expect-error Node built-in: the spec build has no @types/node, the runner has fs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { KpiTile } from './kpi-tile';

interface Fs {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
  statSync: (path: string) => { isDirectory(): boolean };
}
const fs: Fs = { readdirSync, readFileSync, statSync };

function sources(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (fs.statSync(path).isDirectory()) {
      return sources(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The tile's own attributes: from `<app-kpi-tile` to its closing `/>` or `>`. */
function tileAttributes(text: string, start: number): string {
  const end = text.indexOf('/>', start);
  return text.slice(start, end === -1 ? undefined : end);
}

/** True when the nearest unclosed element around the tile is a link or a filter button. */
function insideDoor(before: string): boolean {
  const lastOpen = Math.max(before.lastIndexOf('<a\n'), before.lastIndexOf('<a '));
  const lastButton = before.lastIndexOf('<button');
  const opener = Math.max(lastOpen, lastButton);
  const closer = Math.max(before.lastIndexOf('</a>'), before.lastIndexOf('</button>'));
  if (opener <= closer) {
    return false;
  }
  const tag = before.slice(opener);
  return opener === lastButton ? tag.includes('(click)') : /routerLink|href/.test(tag);
}

/**
 * U24 "Every number is a door": every stat tile in a template either opens the
 * filtered list it counts (`link` + `queryParams`, or the page's own filter button
 * around it), or says why it cannot (`noLink="average" | "measurement"`).
 */
describe('KpiTile: every number is a door (source scan)', () => {
  it('finds no tile without a link, a filter button or an explicit noLink reason', () => {
    const offenders: string[] = [];
    let tiles = 0;
    for (const file of sources('src/app')) {
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      let index = text.indexOf('<app-kpi-tile');
      while (index !== -1) {
        tiles++;
        const attrs = tileAttributes(text, index);
        const linked = /\s\[?link\]?=/.test(attrs);
        const optedOut = /\s\[?noLink\]?=/.test(attrs);
        if (!linked && !optedOut && !insideDoor(text.slice(0, index))) {
          const line = text.slice(0, index).split('\n').length;
          offenders.push(`${file}:${line}`);
        }
        index = text.indexOf('<app-kpi-tile', index + 1);
      }
    }
    expect(tiles).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});

@Component({
  imports: [KpiTile],
  template: `
    <app-kpi-tile
      label="Open"
      [value]="3"
      link="/risk/treatments"
      [queryParams]="{ status: 'open' }"
    />
    <app-kpi-tile label="Median" value="4 d" noLink="average" />
  `,
})
class Host {}

describe('KpiTile', () => {
  it('renders a link with the filter, or a plain tile with its opt-out reason', async () => {
    TestBed.configureTestingModule({
      imports: [
        Host,
        TranslocoTestingModule.forRoot({
          langs: { en: {}, nb: {} },
          translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('a[data-stat-tile="link"]');
    expect(link?.getAttribute('href')).toBe('/risk/treatments?status=open');
    expect(link?.textContent).toContain('3');
    expect(el.querySelector('[data-stat-tile="average"]')?.textContent).toContain('4 d');
  });
});
