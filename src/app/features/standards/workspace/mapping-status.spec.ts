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
  let suggests: number;
  let dismissals: number;

  async function setup(inputs: Record<string, unknown>): Promise<void> {
    TestBed.configureTestingModule({
      imports: [
        MappingStatus,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              standards: {
                mapping: { lastMappedOn: 'Last searched with AI {{date}}' },
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
    suggests = 0;
    dismissals = 0;
    fixture.componentInstance.map.subscribe(() => maps++);
    fixture.componentInstance.suggestFromRecords.subscribe(() => suggests++);
    fixture.componentInstance.dismiss.subscribe(() => dismissals++);
    fixture.detectChanges();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  const testId = (id: string) => el.querySelector(`[data-testid="${id}"]`);
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('app-button button')];

  it('never searched: one AI action (same name as the header) and the AI-free suggestions', async () => {
    await setup({ mapping: null, canMap: true });
    expect(testId('mapping-never')?.textContent).toContain('standards.reqs.mapping.never');
    const [ai, records] = buttons();
    expect(ai.textContent).toContain('standards.view.mapWithAi');
    ai.click();
    expect(maps).toBe(1);
    expect(records.textContent).toContain('standards.bulk.suggestAllShort');
    records.click();
    expect(suggests).toBe(1);
  });

  it('can be dismissed', async () => {
    await setup({ mapping: null, canMap: true });
    el.querySelector<HTMLButtonElement>('[data-testid="mapping-dismiss"]')!.click();
    expect(dismissals).toBe(1);
  });

  it('never searched, read-only: the banner without actions', async () => {
    await setup({ mapping: null, canMap: false });
    expect(testId('mapping-never')).not.toBeNull();
    expect(el.querySelector('app-button')).toBeNull();
  });

  it('never searched with AI off: only the AI-free action, with a neutral hint', async () => {
    await setup({ mapping: null, canMap: true, aiOff: true });
    expect(testId('mapping-never')?.textContent).toContain('standards.reqs.mapping.neverHintNoAi');
    expect(buttons().length).toBe(1);
    expect(testId('mapping-suggest-records')).not.toBeNull();
  });

  it('running: a progress line', async () => {
    await setup({ mapping: { ...DONE, status: 'running', finished_at: null } });
    expect(testId('mapping-running')?.textContent).toContain('standards.reqs.mapping.running');
  });

  it('done: only the date (pending suggestions are counted once, in the next step)', async () => {
    await setup({ mapping: DONE });
    const text = testId('mapping-done')?.textContent ?? '';
    expect(text).toContain('Last searched with AI');
    expect(text).toContain('2026');
    expect(text).not.toContain('7');
  });

  it('failed: a note and "try again"', async () => {
    await setup({ mapping: { ...DONE, status: 'failed' }, canMap: true });
    expect(testId('mapping-failed')?.textContent).toContain('standards.mapping.failed');
    el.querySelector<HTMLButtonElement>('[data-testid="mapping-failed"] button')!.click();
    expect(maps).toBe(1);
  });
});
