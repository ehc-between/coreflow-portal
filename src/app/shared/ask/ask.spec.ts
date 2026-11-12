import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import searchEn from '../../../assets/i18n/search/en.json';
import { AiAssistApi } from '../../core/ai/ai-assist-api';
import { AiAvailability } from '../../core/ai/ai-availability';
import { AssistEvent, AssistRequestBody } from '../../core/ai/ai.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { AiAssistButton } from './ai-assist-button';
import { AskAbout } from './ask-about';

const ID = '6a4a1d8e-6a51-4c0e-a4f5-2b0f61b9a8a2';

function configure(providers: unknown[]) {
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, 'search/en': searchEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      { provide: SelectedOrgService, useValue: { currentOrgId: () => 'org-1' } },
      ...(providers as never[]),
    ],
  });
}

describe('AskAbout', () => {
  it('asks the given prompt about the page, naming the field', async () => {
    const panel = { askAbout: vi.fn() };
    configure([{ provide: AskPanelService, useValue: panel }]);
    const fixture = TestBed.createComponent(AskAbout);
    fixture.componentRef.setInput('prompt', 'Why is likelihood scored 1-5?');
    fixture.componentRef.setInput('field', 'likelihood');
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Ask about this');
    button.click();
    expect(panel.askAbout).toHaveBeenCalledWith('Why is likelihood scored 1-5?', {
      field: 'likelihood',
    });
  });

  it('uses a neutral question without a prompt, and hides once AI is off', async () => {
    const panel = { askAbout: vi.fn() };
    configure([{ provide: AskPanelService, useValue: panel }]);
    const fixture = TestBed.createComponent(AskAbout);
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(panel.askAbout).toHaveBeenCalledWith(searchEn.askAbout.prompt, undefined);

    TestBed.inject(AiAvailability).markUnavailable();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});

describe('AiAssistButton', () => {
  let emit: (event: AssistEvent) => void;
  let run: ReturnType<
    typeof vi.fn<
      (
        orgId: string,
        key: string,
        body: AssistRequestBody,
        cb: (e: AssistEvent) => void,
      ) => {
        cancel: () => void;
      }
    >
  >;
  const cancel = vi.fn();

  async function setup() {
    run = vi.fn((_o, _k, _b, cb) => {
      emit = cb;
      return { cancel };
    });
    configure([{ provide: AiAssistApi, useValue: { run } }]);
    const fixture = TestBed.createComponent(AiAssistButton);
    fixture.componentRef.setInput('assist', 'risk.suggest_controls');
    fixture.componentRef.setInput('labelKey', 'search.assist.defaultLabel');
    fixture.componentRef.setInput('input', { title: 'Supplier failure' });
    await fixture.whenStable();
    const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  }

  it('runs the assist with the entity pair and streams text', async () => {
    const { fixture, button } = await setup();
    fixture.componentRef.setInput('entityType', 'risk');
    fixture.componentRef.setInput('entityId', ID);
    const texts: string[] = [];
    fixture.componentInstance.text.subscribe((t) => texts.push(t));
    await fixture.whenStable();
    expect(button().textContent).toContain('Suggest');

    button().click();
    expect(run).toHaveBeenCalledWith(
      'org-1',
      'risk.suggest_controls',
      { input: { title: 'Supplier failure' }, entity_type: 'risk', entity_id: ID },
      expect.any(Function),
    );
    await fixture.whenStable();
    expect(button().textContent).toContain('Working');

    emit({ type: 'delta', text: 'Add a ' });
    emit({ type: 'delta', text: 'backup supplier.' });
    emit({ type: 'done' });
    await fixture.whenStable();
    expect(texts.at(-1)).toBe('Add a backup supplier.');
    expect(button().textContent).toContain('Suggest');
  });

  it('emits a JSON result, and shows an inline error on failure', async () => {
    const { fixture, button } = await setup();
    const results: unknown[] = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));

    button().click();
    expect(run.mock.calls[0][2]).toEqual({ input: { title: 'Supplier failure' } });
    emit({ type: 'result', data: { controls: ['Dual sourcing'] } });
    emit({ type: 'done' });
    expect(results).toEqual([{ controls: ['Dual sourcing'] }]);

    button().click();
    emit({ type: 'error', message: '' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(searchEn.assist.failed);
  });

  it('a not-configured response hides AI for the session', async () => {
    const { fixture, button } = await setup();
    button().click();
    emit({ type: 'not-configured' });
    await fixture.whenStable();
    expect(TestBed.inject(AiAvailability).unavailable()).toBe(true);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
