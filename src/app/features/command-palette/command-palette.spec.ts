import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, Subject, of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import searchEn from '../../../assets/i18n/search/en.json';
import askEn from '../../../assets/i18n/ask/en.json';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { SearchApi } from '../../core/search/search-api';
import { SearchResponse } from '../../core/search/search.models';
import { AskPanelService } from '../ask/ask-panel.service';
import {
  CommandPalette,
  SEARCH_DEBOUNCE_MS,
  displayCode,
  looksLikeQuestion,
} from './command-palette';
import { CommandPaletteService } from './command-palette.service';
import { PlaceIndexService, vocabularyPlaces } from './place-index';

const PLACES = vocabularyPlaces([
  {
    key: 'risk.risks',
    module: 'risk',
    module_enabled: true,
    label: 'Risks and opportunities: risk register',
    route: '/risk/risks',
    query: { view: 'open' },
    url: '/risk/risks?view=open',
    description: '',
    kind: 'register',
    rule_kinds: [],
    states: [],
  },
]);

const DOC_ID = '6a4a1d8e-6a51-4c0e-a4f5-2b0f61b9a8a2';

const RESPONSE: SearchResponse = {
  items: [
    {
      entity_type: 'document',
      entity_id: DOC_ID,
      title: 'Calibration procedure',
      code: 'QP-07',
      snippet: 'How we calibrate',
      url: `/documents/${DOC_ID}`,
      rank: 0.9,
      updated_at: null,
      module: 'documents',
      label_key: 'modules.entities.document',
    },
    {
      entity_type: 'standard_requirement',
      entity_id: 'r1',
      title: 'Monitoring and measuring resources',
      code: '7.1.5',
      snippet: null,
      url: '/standards/iso9001?req=iso9001:7.1.5',
      rank: 0.5,
      updated_at: null,
      module: 'standards',
      label_key: 'modules.entities.standard_requirement',
    },
    {
      entity_type: 'deviation',
      entity_id: 'd1',
      title: 'Unsafe link',
      code: null,
      snippet: null,
      url: 'https://elsewhere.example',
      rank: 0.4,
      updated_at: null,
      module: 'deviations',
      label_key: 'modules.entities.deviation',
    },
  ],
  counts: { document: 4, standard_requirement: 1, deviation: 1 },
};

function setup(search: (orgId: string, q: string) => Observable<SearchResponse>) {
  const ask = { show: vi.fn(), hide: vi.fn(), showWith: vi.fn(), streaming: () => false };
  const searchApi = { search: vi.fn(search) };

  TestBed.configureTestingModule({
    imports: [
      CommandPalette,
      TranslocoTestingModule.forRoot({
        langs: { en, 'search/en': searchEn, 'ask/en': askEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      CommandPaletteService,
      { provide: AskPanelService, useValue: ask },
      { provide: SearchApi, useValue: searchApi },
      { provide: SelectedOrgService, useValue: { currentOrgId: () => 'org-1' } },
      { provide: PlaceIndexService, useValue: { places: () => PLACES, ensure: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(CommandPalette);
  fixture.detectChanges();
  const palette = TestBed.inject(CommandPaletteService);
  return { fixture, palette, ask, searchApi };
}

interface Internal {
  query: { set: (v: string) => void };
  rows: () => { kind: string }[];
  actionRows: () => unknown[];
  howtoRows: () => { kind: string; entry: { key: string } }[];
  highlighted: () => { kind: string } | null;
  onKeydown: (event: KeyboardEvent) => void;
  navRows: () => unknown[];
  placeRows: () => { kind: string; place: { url: string } }[];
  recordGroups: () => {
    entityType: string;
    label: string;
    total: number;
    rows: { kind: string }[];
  }[];
  searchStatus: () => string;
  run: (row: { kind: string }) => void;
}

/** Let the debounced search run (zoneless: flush effects, then advance timers). */
async function typeAndSettle(fixture: { detectChanges(): void }, cmp: Internal, text: string) {
  // Run pending effects first (opening the palette resets the query).
  TestBed.tick();
  cmp.query.set(text);
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10);
  fixture.detectChanges();
}

describe('CommandPalette', () => {
  afterEach(() => vi.useRealTimers());

  it('shows all agent actions and nav items when the query is empty', () => {
    const { fixture, palette } = setup(() => of(RESPONSE));
    palette.show();
    const cmp = fixture.componentInstance as unknown as Internal;
    expect(cmp.actionRows().length).toBeGreaterThan(0);
    expect(cmp.navRows().length).toBeGreaterThan(0);
    // No ask row without free text.
    expect(cmp.rows().some((r) => r.kind === 'ask')).toBe(false);
  });

  it('answers a search term with places first and ends with an ask row', () => {
    const { fixture } = setup(() => of({ items: [], counts: {} }));
    const cmp = fixture.componentInstance as unknown as Internal;
    cmp.query.set('risk');
    expect(cmp.placeRows().map((r) => r.place.url)).toEqual(['/risk/risks?view=open']);
    expect(cmp.actionRows().length).toBe(1);
    // "Gå til" is the empty-query list; once typed, the place hits answer instead.
    expect(cmp.navRows().length).toBe(0);
    expect(cmp.rows().at(-1)?.kind).toBe('ask');
    // A search term highlights the first place, not the ask row.
    TestBed.tick();
    expect(cmp.highlighted()?.kind).toBe('place');
  });

  it('opening a place navigates to its path with the query params', () => {
    const { fixture, palette } = setup(() => of({ items: [], counts: {} }));
    palette.show();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as Internal;
    cmp.query.set('risiko register risk');
    cmp.run(cmp.placeRows()[0]);
    expect(navigate).toHaveBeenCalledWith(['/risk/risks'], { queryParams: { view: 'open' } });
    expect(palette.open()).toBe(false);
  });

  it('a question highlights "Ask CoreFlow", so Enter asks', () => {
    const { fixture, palette, ask } = setup(() => of({ items: [], counts: {} }));
    palette.show();
    TestBed.tick();
    const cmp = fixture.componentInstance as unknown as Internal;
    cmp.query.set('Which suppliers process personal data?');
    TestBed.tick();
    expect(cmp.highlighted()?.kind).toBe('ask');
    cmp.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ask.showWith).toHaveBeenCalledWith('Which suppliers process personal data?');
  });

  it('Ctrl+Enter always asks, whatever is highlighted', () => {
    const { fixture, palette, ask } = setup(() => of({ items: [], counts: {} }));
    palette.show();
    TestBed.tick();
    const cmp = fixture.componentInstance as unknown as Internal;
    cmp.query.set('risk');
    TestBed.tick();
    cmp.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(ask.showWith).toHaveBeenCalledWith('risk');
  });

  it('selecting an agent action sends its translated prompt and closes the palette', () => {
    const { fixture, palette, ask } = setup(() => of(RESPONSE));
    palette.show();
    const cmp = fixture.componentInstance as unknown as Internal;
    const row = cmp.actionRows()[0] as { kind: string };
    cmp.run(row);
    expect(ask.showWith).toHaveBeenCalledWith(askEn.palette.actions.whatNow.prompt);
    expect(palette.open()).toBe(false);
  });

  it('matches how-to topics and opens their page without asking the assistant', () => {
    const { fixture, palette, ask } = setup(() => of({ items: [], counts: {} }));
    palette.show();
    TestBed.tick();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as Internal;
    cmp.query.set('how do I approve a document');
    expect(cmp.howtoRows()[0]?.entry.key).toBe('approveDocument');
    cmp.run(cmp.howtoRows()[0]);
    expect(navigate).toHaveBeenCalledWith('/review');
    expect(ask.showWith).not.toHaveBeenCalled();
  });

  it('tells questions from search terms', () => {
    expect(looksLikeQuestion('kalib')).toBe(false);
    expect(looksLikeQuestion('RSK-0001')).toBe(false);
    expect(looksLikeQuestion('backup procedure')).toBe(false);
    expect(looksLikeQuestion('hvilke leverandører har vi')).toBe(true);
    expect(looksLikeQuestion('suppliers?')).toBe(true);
    expect(looksLikeQuestion('list open deviations')).toBe(true);
  });

  it('selecting a go-to row navigates and closes the palette', () => {
    const { fixture, palette } = setup(() => of(RESPONSE));
    palette.show();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as Internal;
    const row = cmp.navRows()[0] as { kind: string };
    cmp.run(row);
    expect(navigate).toHaveBeenCalledOnce();
    expect(palette.open()).toBe(false);
  });

  it('searches records after a pause and groups them by type (unsafe links dropped)', async () => {
    vi.useFakeTimers();
    const { fixture, palette, searchApi } = setup(() => of(RESPONSE));
    palette.show();
    const cmp = fixture.componentInstance as unknown as Internal;

    await typeAndSettle(fixture, cmp, 'calib');

    expect(searchApi.search).toHaveBeenCalledWith('org-1', 'calib', { limit: 20 });
    const groups = cmp.recordGroups();
    expect(groups.map((g) => g.entityType)).toEqual(['document', 'standard_requirement']);
    // The module registry's singular entity label (modules.entities.document) wins.
    expect(groups[0].label).toBe('Document');
    expect(groups[0].total).toBe(4);
    // Records first, the ask row last.
    expect(cmp.rows()[0].kind).toBe('record');
    expect(cmp.rows().at(-1)?.kind).toBe('ask');
    expect(fixture.nativeElement.textContent).toContain('Calibration procedure');
  });

  it('ranks requirements below every record type and shows at most three', async () => {
    vi.useFakeTimers();
    const requirement = RESPONSE.items[1];
    const many: SearchResponse = {
      items: [
        ...[1, 2, 3, 4, 5].map((i) => ({ ...requirement, entity_id: `r${i}`, rank: 1 })),
        RESPONSE.items[0],
      ],
      counts: { standard_requirement: 5, document: 1 },
    };
    const { fixture, palette } = setup(() => of(many));
    palette.show();
    const cmp = fixture.componentInstance as unknown as Internal;
    await typeAndSettle(fixture, cmp, 'monitoring');
    const groups = cmp.recordGroups();
    expect(groups.map((g) => g.entityType)).toEqual(['document', 'standard_requirement']);
    expect(groups[1].rows.length).toBe(3);
    expect(groups[1].total).toBe(5);
  });

  it('opening a record navigates to its path with the query params', async () => {
    vi.useFakeTimers();
    const { fixture, palette } = setup(() => of(RESPONSE));
    palette.show();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as Internal;
    await typeAndSettle(fixture, cmp, 'monitoring');

    cmp.run(cmp.recordGroups()[1].rows[0]);
    expect(navigate).toHaveBeenCalledWith(['/standards/iso9001'], {
      queryParams: { req: 'iso9001:7.1.5' },
    });
    expect(palette.open()).toBe(false);
  });

  it('does not search for one character and shows searching while in flight', async () => {
    vi.useFakeTimers();
    const pending = new Subject<SearchResponse>();
    const { fixture, searchApi } = setup(() => pending);
    const cmp = fixture.componentInstance as unknown as Internal;

    await typeAndSettle(fixture, cmp, 'c');
    expect(searchApi.search).not.toHaveBeenCalled();
    expect(cmp.searchStatus()).toBe('idle');

    await typeAndSettle(fixture, cmp, 'ca');
    expect(cmp.searchStatus()).toBe('loading');
    pending.next({ items: [], counts: {} });
    pending.complete();
    fixture.detectChanges();
    expect(cmp.searchStatus()).toBe('done');
    expect(cmp.recordGroups()).toEqual([]);
  });
});

describe('displayCode', () => {
  it('shows record codes but hides raw requirement refs', () => {
    expect(displayCode('QP-07')).toBe('QP-07');
    expect(displayCode('7.1.5')).toBe('7.1.5');
    expect(displayCode('iso27001-2022:A.5.19.r1')).toBeNull();
    expect(displayCode('iso9001-2026:8.4.1.r12')).toBeNull();
    expect(displayCode('  ')).toBeNull();
    expect(displayCode(null)).toBeNull();
  });
});
