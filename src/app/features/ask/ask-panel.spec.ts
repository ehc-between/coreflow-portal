import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import nb from '../../../assets/i18n/nb.json';
import searchNb from '../../../assets/i18n/search/nb.json';
import askNb from '../../../assets/i18n/ask/nb.json';
import kitNb from '../../../assets/i18n/kit/nb.json';
import { AiActionsApi } from '../../core/ai/ai-actions-api';
import { AiApi, AskOptions, AskStream } from '../../core/ai/ai-api';
import { AiFeedbackApi } from '../../core/ai/ai-feedback-api';
import { AnswerFeedbackBody, AskEvent } from '../../core/ai/ai.models';
import { PageContextService } from '../../core/ai/page-context';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanel } from './ask-panel';
import { AskPanelService } from './ask-panel.service';

const RUN_ID = '9c1f2a3b-4d5e-4f60-8a7b-6c5d4e3f2a1b';
const SUP_ID = '6a4a1d8e-6a51-4c0e-a4f5-2b0f61b9a8a2';

describe('AskPanel (P2)', () => {
  let emit: (event: AskEvent) => void;
  let lastOptions: AskOptions | undefined;
  let rate: ReturnType<
    typeof vi.fn<(org: string, run: string, body: AnswerFeedbackBody) => Observable<void>>
  >;

  async function setup() {
    rate = vi.fn(() => of(undefined));
    const ai = {
      ask: (
        _m: unknown,
        _o: string,
        onEvent: (event: AskEvent) => void,
        options?: AskOptions,
      ): AskStream => {
        emit = onEvent;
        lastOptions = options;
        return { cancel: () => undefined };
      },
    };
    TestBed.configureTestingModule({
      imports: [
        AskPanel,
        TranslocoTestingModule.forRoot({
          langs: { nb, 'search/nb': searchNb, 'ask/nb': askNb, 'kit/nb': kitNb },
          translocoConfig: { availableLangs: ['nb'], defaultLang: 'nb' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AiApi, useValue: ai },
        { provide: AiActionsApi, useValue: {} },
        { provide: AiFeedbackApi, useValue: { rate } },
        { provide: SelectedOrgService, useValue: { currentOrgId: () => 'org-1' } },
        {
          provide: EntityTypesService,
          useValue: {
            types: signal([
              {
                entity_type: 'supplier',
                module: 'suppliers',
                label_key: null,
                linkable: true,
                commentable: true,
                attachable: true,
                revisioned: false,
                searchable: true,
              },
            ]),
            ensureLoaded: vi.fn(),
            label: (type: string) => (type === 'supplier' ? 'Leverandør' : type),
            statusLabel: (status: string) => status,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AskPanel);
    const service = TestBed.inject(AskPanelService);
    service.show();
    await fixture.whenStable();
    return { fixture, service, el: fixture.nativeElement as HTMLElement };
  }

  it('offers suggestions that fit the page, and sends the one picked', async () => {
    const { fixture, el } = await setup();
    TestBed.inject(PageContextService).set(
      {},
      { module: 'standards', entityType: 'standard_requirement', view: 'detail', title: 'A.8.13' },
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('Forslag for denne siden');
    const first = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(askNb.suggest.reqMissing),
    );
    expect(first).toBeTruthy();
    first!.click();
    await fixture.whenStable();
    expect(el.textContent).toContain(askNb.suggest.reqMissing);
    expect(lastOptions?.pageContext?.entity_type).toBe('standard_requirement');
  });

  it('shows the status in Norwegian, naming the register', async () => {
    const { fixture, service, el } = await setup();
    service.send('Hvilke leverandører har vi?');
    emit({
      type: 'status',
      text: 'Looking through your records…',
      key: 'ai.status.list_records',
      category: 'listing',
      params: { entity_type: 'supplier' },
    });
    await fixture.whenStable();
    expect(el.textContent).toContain('Går gjennom registeret «Leverandør» …');
    expect(el.textContent).not.toContain('Looking through your records');
  });

  it('renders the records of an answer as entity chips and rates the answer', async () => {
    const { fixture, service, el } = await setup();
    service.send('Hvilke leverandører har vi?');
    emit({ type: 'delta', text: 'Dere har én leverandør.' });
    emit({
      type: 'link',
      entity_type: 'supplier',
      entity_id: SUP_ID,
      title: 'Fjord Cloud Hosting',
      code: 'SUP-0002',
      url: `/suppliers/${SUP_ID}`,
    });
    emit({ type: 'done', run_id: RUN_ID });
    await fixture.whenStable();

    expect(el.textContent).toContain('Poster og kilder');
    const chip = el.querySelector('app-entity-chip a') as HTMLAnchorElement;
    expect(chip.getAttribute('href')).toBe(`/suppliers/${SUP_ID}`);
    expect(chip.textContent).toContain('SUP-0002');

    const down = el.querySelector('button[aria-label="Ikke nyttig"]') as HTMLButtonElement;
    down.click();
    await fixture.whenStable();
    expect(rate).toHaveBeenCalledWith('org-1', RUN_ID, { rating: 'down' });
    expect(el.textContent).toContain('Hva var galt?');

    const reason = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Mangler lenker til postene'),
    )!;
    reason.click();
    await fixture.whenStable();
    (el.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(rate).toHaveBeenLastCalledWith('org-1', RUN_ID, {
      rating: 'down',
      reason: 'missing_links',
      comment: undefined,
    });
  });

  it('follows record links inside the answer in-app and minimises the panel', async () => {
    const { fixture, service, el } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    service.send('Vis risikoene');
    emit({ type: 'delta', text: `Se [RSK-0001 Backup](/risk/risks/${SUP_ID}).` });
    emit({ type: 'done' });
    await fixture.whenStable();

    const link = el.querySelector('.cf-prose a') as HTMLAnchorElement;
    link.click();
    expect(navigate).toHaveBeenCalledWith(`/risk/risks/${SUP_ID}`);
    expect(service.open()).toBe(false);
  });

  it('hides the thumbs when the server sent no run id', async () => {
    const { fixture, service, el } = await setup();
    service.send('Hei');
    emit({ type: 'delta', text: 'Hei!' });
    emit({ type: 'done' });
    await fixture.whenStable();
    expect(el.querySelector('button[aria-label="Nyttig"]')).toBeNull();
    // Copy is still offered.
    expect(el.querySelector('button[aria-label="Kopier svaret"]')).not.toBeNull();
  });
});
