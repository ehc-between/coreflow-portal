import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { StandardMapping } from '../../../core/standards/standards.models';
import { MappingStatus } from './mapping-status';
import { mappingState } from './workspace-data';

const DONE: StandardMapping = {
  job_id: 'j-1',
  status: 'done',
  finished_at: '2026-10-18T09:30:00Z',
  suggestions_created: 7,
};

describe('mappingState', () => {
  it('maps last_mapping to the banner state', () => {
    expect(mappingState(null)).toBe('never');
    expect(mappingState(undefined)).toBe('never');
    expect(mappingState({ status: 'queued' })).toBe('running');
    expect(mappingState({ status: 'running' })).toBe('running');
    expect(mappingState({ status: 'done' })).toBe('done');
    expect(mappingState({ status: 'failed' })).toBe('failed');
  });
});

describe('MappingStatus', () => {
  let fixture: ComponentFixture<MappingStatus>;
  let el: HTMLElement;
  let maps: number;
  let shows: number;

  async function setup(inputs: Record<string, unknown>): Promise<void> {
    TestBed.configureTestingModule({
      imports: [
        MappingStatus,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              standards: {
                mapping: {
                  lastMapped: 'Last mapped {{date}} · {{count}} suggestions',
                  showSuggestions: 'Show {{count}} requirements with suggestions',
                },
              },
            },
          },
          translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: APP_CONFIG, useValue: { i18n: { availableLanguages: ['en', 'nb'] } } },
      ],
    });
    fixture = TestBed.createComponent(MappingStatus);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    maps = 0;
    shows = 0;
    fixture.componentInstance.map.subscribe(() => maps++);
    fixture.componentInstance.showSuggestions.subscribe(() => shows++);
    fixture.detectChanges();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  const testId = (id: string) => el.querySelector(`[data-testid="${id}"]`);

  it('never mapped: a banner with a one-click "map existing documents"', async () => {
    await setup({ mapping: null, canMap: true });
    expect(testId('mapping-never')?.textContent).toContain('standards.mapping.never');
    const button = el.querySelector<HTMLButtonElement>('app-button button')!;
    expect(button.textContent).toContain('standards.mapping.mapExisting');
    button.click();
    expect(maps).toBe(1);
  });

  it('never mapped, read-only: the banner without the button', async () => {
    await setup({ mapping: null, canMap: false });
    expect(testId('mapping-never')).not.toBeNull();
    expect(el.querySelector('app-button')).toBeNull();
  });

  it('never mapped with AI off: a neutral hint instead of the button', async () => {
    await setup({ mapping: null, canMap: true, aiOff: true });
    expect(testId('mapping-never')?.textContent).toContain('standards.ai.notConfigured');
    expect(el.querySelector('app-button')).toBeNull();
  });

  it('running: a progress line', async () => {
    await setup({ mapping: { ...DONE, status: 'running', finished_at: null } });
    expect(testId('mapping-running')?.textContent).toContain('standards.mapping.running');
  });

  it('done: last mapped date and count, and a link to the requirements with suggestions', async () => {
    await setup({ mapping: DONE, pendingCount: 3 });
    const text = testId('mapping-done')?.textContent ?? '';
    expect(text).toContain('Last mapped');
    expect(text).toContain('2026');
    expect(text).toContain('· 7 suggestions');
    const show = el.querySelector<HTMLButtonElement>('[data-testid="mapping-show-suggestions"]')!;
    expect(show.textContent).toContain('Show 3 requirements with suggestions');
    show.click();
    expect(shows).toBe(1);
  });

  it('done with nothing left to review: no filter link', async () => {
    await setup({ mapping: DONE, pendingCount: 0 });
    expect(testId('mapping-done')).not.toBeNull();
    expect(testId('mapping-show-suggestions')).toBeNull();
  });

  it('failed: a note and "try again"', async () => {
    await setup({ mapping: { ...DONE, status: 'failed' }, canMap: true });
    expect(testId('mapping-failed')?.textContent).toContain('standards.mapping.failed');
    el.querySelector<HTMLButtonElement>('[data-testid="mapping-failed"] button')!.click();
    expect(maps).toBe(1);
  });
});
