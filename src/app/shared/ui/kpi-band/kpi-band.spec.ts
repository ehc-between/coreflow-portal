import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import nb from '../../../../assets/i18n/nb.json';
import { KpiTile } from '../kpi-tile/kpi-tile';
import { KpiBand } from './kpi-band';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

@Component({
  imports: [KpiBand, KpiTile],
  template: `
    <app-kpi-band [scope]="scope">
      <div class="contents">
        @for (n of tiles(); track n) {
          <a href="#" [attr.data-testid]="'tile-' + n"
            ><app-kpi-tile [label]="'T' + n" [value]="n"
          /></a>
        }
      </div>
      @if (card()) {
        <div data-testid="card">Plan</div>
      }
    </app-kpi-band>
  `,
})
class Host {
  scope: string | null = 'test.list';
  readonly tiles = signal<readonly number[]>([1, 2, 3, 4, 5, 6]);
  readonly card = signal(false);
}

async function setup(configure?: (host: Host) => void) {
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  configure?.(fixture.componentInstance);
  await fixture.whenStable();
  await tick();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const hidden = () =>
    Array.from(el.querySelectorAll('[data-testid^="tile-"]'))
      .filter((t) => t.hasAttribute('data-kpi-extra'))
      .map((t) => t.getAttribute('data-testid'));
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, el, hidden, q };
}

describe('KpiBand (U30)', () => {
  beforeEach(() => localStorage.clear());

  it('shows at most four tiles and offers "Show all"', async () => {
    const { fixture, hidden, q } = await setup();
    expect(hidden()).toEqual(['tile-5', 'tile-6']);
    expect(q('kpi-band-all')!.textContent?.trim()).toBe('Show all (6)');
    q('kpi-band-all')!.click();
    await fixture.whenStable();
    await tick();
    expect(hidden()).toEqual([]);
    expect(q('kpi-band-all')!.textContent?.trim()).toBe('Show fewer');
  });

  it('has no "Show all" with four tiles or fewer', async () => {
    const { hidden, q } = await setup((h) => h.tiles.set([1, 2, 3]));
    expect(hidden()).toEqual([]);
    expect(q('kpi-band-all')).toBeNull();
  });

  it('collapses and remembers it per page', async () => {
    const first = await setup();
    const toggle = first.q('kpi-band-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    await first.fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(first.el.querySelector('[role="group"]')!.hasAttribute('hidden')).toBe(true);
    expect(toggle.textContent).toContain('(6)');
    expect(localStorage.getItem('coreflow.kpis.test.list')).toBe('collapsed');

    TestBed.resetTestingModule();
    const again = await setup();
    expect(again.q('kpi-band-toggle')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('never hides or counts content that is not a tile', async () => {
    const { hidden, q } = await setup((h) => h.card.set(true));
    expect(q('card')!.hasAttribute('data-kpi-extra')).toBe(false);
    expect(hidden()).toEqual(['tile-5', 'tile-6']);
  });

  it('hides itself when nothing is projected', async () => {
    const { el } = await setup((h) => h.tiles.set([]));
    const band = el.querySelector('app-kpi-band')!;
    expect(band.classList.contains('hidden')).toBe(true);
    expect(band.querySelector('[data-testid="kpi-band-toggle"]')).toBeNull();
  });
});
