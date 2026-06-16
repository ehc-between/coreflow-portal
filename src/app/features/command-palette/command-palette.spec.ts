import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import { AskPanelService } from '../ask/ask-panel.service';
import { CommandPalette } from './command-palette';
import { CommandPaletteService } from './command-palette.service';

function setup() {
  const ask = { show: vi.fn(), hide: vi.fn(), showWith: vi.fn(), streaming: () => false };

  TestBed.configureTestingModule({
    imports: [
      CommandPalette,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      CommandPaletteService,
      { provide: AskPanelService, useValue: ask },
    ],
  });

  const fixture = TestBed.createComponent(CommandPalette);
  fixture.detectChanges();
  const palette = TestBed.inject(CommandPaletteService);
  return { fixture, palette, ask };
}

interface Internal {
  query: { set: (v: string) => void };
  rows: () => { kind: string }[];
  actionRows: () => unknown[];
  navRows: () => unknown[];
  run: (row: { kind: string }) => void;
}

describe('CommandPalette', () => {
  it('shows all agent actions and nav items when the query is empty', () => {
    const { fixture, palette } = setup();
    palette.show();
    const cmp = fixture.componentInstance as unknown as Internal;
    expect(cmp.actionRows().length).toBeGreaterThan(0);
    expect(cmp.navRows().length).toBeGreaterThan(0);
    // No ask row without free text.
    expect(cmp.rows().some((r) => r.kind === 'ask')).toBe(false);
  });

  it('filters both sections by label and surfaces an ask row for free text', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance as unknown as Internal;
    cmp.query.set('risk');
    expect(cmp.actionRows().length).toBe(1);
    expect(cmp.navRows().length).toBe(1);
    expect(cmp.rows()[0].kind).toBe('ask');
  });

  it('selecting an agent action seeds the chat and closes the palette', () => {
    const { fixture, palette, ask } = setup();
    palette.show();
    const cmp = fixture.componentInstance as unknown as Internal;
    const row = cmp.actionRows()[0] as { kind: string };
    cmp.run(row);
    expect(ask.showWith).toHaveBeenCalledOnce();
    expect(palette.open()).toBe(false);
  });

  it('selecting a go-to row navigates and closes the palette', () => {
    const { fixture, palette } = setup();
    palette.show();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as Internal;
    const row = cmp.navRows()[0] as { kind: string };
    cmp.run(row);
    expect(navigate).toHaveBeenCalledOnce();
    expect(palette.open()).toBe(false);
  });
});
