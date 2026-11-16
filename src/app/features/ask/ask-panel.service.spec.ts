import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import searchEn from '../../../assets/i18n/search/en.json';
import { AiActionsApi } from '../../core/ai/ai-actions-api';
import { AiApi, AskOptions, AskStream } from '../../core/ai/ai-api';
import { AiFeedbackApi } from '../../core/ai/ai-feedback-api';
import { AnswerFeedbackBody, AskEvent } from '../../core/ai/ai.models';
import { PageContextService } from '../../core/ai/page-context';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService, joinText } from './ask-panel.service';

const ACTION_ID = '0b4ad2f0-6f43-4d38-9b51-1f0a5e0c9d11';
const DEV_ID = '6a4a1d8e-6a51-4c0e-a4f5-2b0f61b9a8a2';

const RUN_ID = '9c1f2a3b-4d5e-4f60-8a7b-6c5d4e3f2a1b';

type ApiFn = (orgId: string, id: string) => Observable<unknown>;
type RateFn = (orgId: string, runId: string, body: AnswerFeedbackBody) => Observable<void>;

describe('AskPanelService', () => {
  let emit: (event: AskEvent) => void;
  let cancel: ReturnType<typeof vi.fn<() => void>>;
  let lastOptions: AskOptions | undefined;
  let actions: {
    confirm: ReturnType<typeof vi.fn<ApiFn>>;
    reject: ReturnType<typeof vi.fn<ApiFn>>;
    get: ReturnType<typeof vi.fn<ApiFn>>;
  };
  let feedback: { rate: ReturnType<typeof vi.fn<RateFn>> };

  function setup(url = '/deviations') {
    cancel = vi.fn<() => void>();
    lastOptions = undefined;
    const ai = {
      ask: (
        _messages: unknown,
        _orgId: string,
        onEvent: (event: AskEvent) => void,
        options?: AskOptions,
      ): AskStream => {
        emit = onEvent;
        lastOptions = options;
        return { cancel: () => cancel() };
      },
    };
    actions = { confirm: vi.fn<ApiFn>(), reject: vi.fn<ApiFn>(), get: vi.fn<ApiFn>() };
    feedback = { rate: vi.fn<RateFn>() };
    const org = { currentOrgId: () => 'org-1' };
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
        AskPanelService,
        { provide: AiApi, useValue: ai },
        { provide: AiActionsApi, useValue: actions },
        { provide: AiFeedbackApi, useValue: feedback },
        { provide: SelectedOrgService, useValue: org },
        { provide: Router, useValue: { url } },
      ],
    });
    return TestBed.inject(AskPanelService);
  }

  function proposeAction(svc: AskPanelService): void {
    svc.send('register a deviation');
    emit({
      type: 'action',
      action_id: ACTION_ID,
      tool: 'create_deviation',
      summary: 'Register deviation Late delivery',
      preview: { title: 'Late delivery', fields: [{ label: 'Severity', value: 'High' }] },
    });
    emit({ type: 'done' });
  }

  const card = (svc: AskPanelService) => svc.thread().at(-1)?.actions?.[0];

  it('streams a turn and exposes the streaming state', () => {
    const svc = setup();
    svc.send('draft a policy');

    expect(svc.thread().length).toBe(2);
    expect(svc.streaming()).toBe(true);

    emit({ type: 'delta', text: 'Working' });
    emit({ type: 'done' });

    expect(svc.streaming()).toBe(false);
    expect(svc.thread().at(-1)?.text).toBe('Working');
  });

  it('a status event sets the working status; a delta clears it; done clears it', () => {
    const svc = setup();
    svc.send('draft a policy');
    expect(svc.working()).toBeNull();

    emit({ type: 'status', text: 'Looking through your documents…' });
    expect(svc.working()?.text).toBe('Looking through your documents…');
    expect(svc.working()?.category).toBeNull();

    emit({ type: 'delta', text: 'Here' });
    expect(svc.working()).toBeNull();

    emit({
      type: 'status',
      text: 'Looking through your records…',
      key: 'ai.status.list_records',
      category: 'listing',
      params: { entity_type: 'supplier' },
    });
    expect(svc.working()).toEqual({
      text: 'Looking through your records…',
      key: 'ai.status.list_records',
      category: 'listing',
      params: { entity_type: 'supplier' },
    });

    emit({ type: 'done' });
    expect(svc.working()).toBeNull();
  });

  it('separates text from separate model turns, without doubling server breaks', () => {
    const svc = setup();
    svc.send('which suppliers?');
    emit({ type: 'delta', text: 'Let me check.' });
    emit({ type: 'status', text: 'Working…', category: 'listing' });
    emit({ type: 'delta', text: 'There are 4.' });
    expect(svc.thread().at(-1)?.text).toBe('Let me check.\n\nThere are 4.');

    emit({ type: 'status', text: 'Working…', category: 'reading' });
    emit({ type: 'delta', text: '\n\nThe first one' });
    emit({ type: 'delta', text: ' is SUP-0002.' });
    expect(svc.thread().at(-1)?.text).toBe(
      'Let me check.\n\nThere are 4.\n\nThe first one is SUP-0002.',
    );
  });

  it('joinText only separates after tools, and never at an existing seam', () => {
    expect(joinText('a.', 'B', false)).toBe('a.B');
    expect(joinText('a.', 'B', true)).toBe('a.\n\nB');
    expect(joinText('a.\n', 'B', true)).toBe('a.\nB');
    expect(joinText('a.', ' B', true)).toBe('a. B');
    expect(joinText('', 'B', true)).toBe('B');
  });

  it('keeps the run id from done, and rates the answer through the feedback API', () => {
    const svc = setup();
    svc.send('how many open deviations?');
    emit({ type: 'delta', text: 'Seven.' });
    emit({ type: 'done', run_id: RUN_ID });
    const turn = svc.thread().at(-1)!;
    expect(turn.runId).toBe(RUN_ID);

    feedback.rate.mockReturnValue(of(undefined));
    svc.rateAnswer(turn.id, 'down', { reason: 'incomplete', comment: 'Missing two' });
    expect(feedback.rate).toHaveBeenCalledWith('org-1', RUN_ID, {
      rating: 'down',
      reason: 'incomplete',
      comment: 'Missing two',
    });
    expect(svc.thread().at(-1)?.feedback).toMatchObject({ rating: 'down', state: 'saved' });

    feedback.rate.mockReturnValue(throwError(() => ({ status: 0 })));
    svc.rateAnswer(turn.id, 'up');
    expect(svc.thread().at(-1)?.feedback).toMatchObject({ rating: 'up', state: 'error' });
  });

  it('does not rate an answer without a run id (older servers) or still streaming', () => {
    const svc = setup();
    svc.send('hi');
    const id = svc.thread().at(-1)!.id;
    svc.rateAnswer(id, 'up');
    emit({ type: 'done' });
    svc.rateAnswer(id, 'up');
    expect(feedback.rate).not.toHaveBeenCalled();
    expect(svc.thread().at(-1)?.runId).toBeNull();
  });

  it('hide() minimizes without aborting the stream or clearing the thread', () => {
    const svc = setup();
    svc.show();
    svc.send('long draft');

    svc.hide();

    expect(svc.open()).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(svc.streaming()).toBe(true);
    expect(svc.hasConversation()).toBe(true);

    // Stream keeps updating the thread while minimized.
    emit({ type: 'delta', text: 'done draft' });
    expect(svc.thread().at(-1)?.text).toBe('done draft');
  });

  it('stop() aborts the stream but keeps the thread', () => {
    const svc = setup();
    svc.send('draft');
    emit({ type: 'delta', text: 'partial' });

    svc.stop();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(svc.streaming()).toBe(false);
    expect(svc.hasConversation()).toBe(true);
    expect(svc.thread().at(-1)?.text).toBe('partial');
  });

  it('a not-configured response shows the calm state with no phantom turns', () => {
    const svc = setup();
    svc.send('draft');
    expect(svc.thread().length).toBe(2);

    emit({ type: 'not-configured' });

    expect(svc.state()).toBe('not-configured');
    expect(svc.thread().length).toBe(0);
    expect(svc.streaming()).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('newChat() aborts the stream and resets the thread', () => {
    const svc = setup();
    svc.send('draft');

    svc.newChat();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(svc.thread().length).toBe(0);
    expect(svc.hasConversation()).toBe(false);
    expect(svc.state()).toBe('chat');
  });

  it('sends the registered page context (snake_case, with route) with every message', () => {
    const svc = setup('/deviations/' + DEV_ID);
    TestBed.inject(PageContextService).set(
      {},
      {
        module: 'deviations',
        entityType: 'deviation',
        entityId: DEV_ID,
        view: 'detail',
        title: 'Late delivery',
      },
    );

    svc.send('what is missing here?');

    expect(lastOptions?.mode).toBe('ask');
    expect(lastOptions?.pageContext).toEqual({
      module: 'deviations',
      entity_type: 'deviation',
      entity_id: DEV_ID,
      view: 'detail',
      route: '/deviations/' + DEV_ID,
      title: 'Late delivery',
      selection: null,
      requirements: [],
      standard_key: null,
    });
  });

  it('falls back to a URL-derived context and can be detached', () => {
    const svc = setup('/risk?status=open');
    svc.send('first');
    expect(lastOptions?.pageContext).toMatchObject({ module: 'risk', view: 'other' });
    emit({ type: 'done' });

    svc.setUsePageContext(false);
    svc.send('second');
    expect(lastOptions?.pageContext).toBeNull();
  });

  it('askAbout() opens the panel and sends the selection', () => {
    const svc = setup('/documents/' + DEV_ID);
    TestBed.inject(PageContextService).set(
      {},
      { module: 'documents', entityType: 'document', entityId: DEV_ID, view: 'detail' },
    );

    svc.askAbout('Explain this field', { field: 'owner' });

    expect(svc.open()).toBe(true);
    expect(svc.thread()[0].text).toBe('Explain this field');
    expect(lastOptions?.pageContext?.selection).toEqual({ text: null, field: 'owner', ids: [] });
  });

  it('askAbout() merges the field requirement refs before the page ones', () => {
    const svc = setup('/risk/risks/' + DEV_ID);
    TestBed.inject(PageContextService).set(
      {},
      {
        module: 'risk',
        entityType: 'risk',
        entityId: DEV_ID,
        view: 'detail',
        requirements: ['iso27001:6.1.2', 'iso27001:A.8.13'],
      },
    );

    svc.askAbout(
      'Which requirement does this prove?',
      { field: 'Controls' },
      {
        requirements: ['iso27001:A.8.13', 'iso27001:A.5.30'],
      },
    );

    expect(lastOptions?.pageContext?.requirements).toEqual([
      'iso27001:A.8.13',
      'iso27001:A.5.30',
      'iso27001:6.1.2',
    ]);
  });

  it('askAbout() passes the refs even when no page registered a context', () => {
    const svc = setup('/risk');
    svc.askAbout('Explain', undefined, { requirements: ['gdpr:30'] });
    expect(lastOptions?.pageContext).toMatchObject({
      module: 'risk',
      requirements: ['gdpr:30'],
    });
  });

  it('openTutor() starts a tutor conversation about the topic', async () => {
    const svc = setup();
    svc.openTutor('iso9001:6.1');
    await vi.waitFor(() => expect(svc.thread().length).toBe(2));

    expect(svc.mode()).toBe('tutor');
    expect(svc.topic()).toBe('iso9001:6.1');
    expect(svc.thread()[0].text).toBe('Teach me about iso9001:6.1, step by step.');
    expect(lastOptions).toMatchObject({ mode: 'tutor', topic: 'iso9001:6.1' });

    svc.newChat();
    expect(svc.mode()).toBe('ask');
    expect(svc.topic()).toBeNull();
  });

  it('renders link events once per record', () => {
    const svc = setup();
    svc.send('open the late delivery deviation');
    const link = {
      type: 'link' as const,
      entity_type: 'deviation',
      entity_id: DEV_ID,
      title: 'Late delivery',
      code: 'DEV-7',
      url: '/deviations/' + DEV_ID,
    };
    emit(link);
    emit(link);
    expect(svc.thread().at(-1)?.links?.length).toBe(1);
    expect(svc.thread().at(-1)?.links?.[0].code).toBe('DEV-7');
  });

  it('an action event becomes a pending card; confirm applies it once', () => {
    const svc = setup();
    proposeAction(svc);
    expect(card(svc)?.state).toBe('pending');
    expect(card(svc)?.preview.fields[0]).toEqual({ label: 'Severity', value: 'High' });

    const result = {
      message: 'Deviation DEV-7 registered.',
      entity_type: 'deviation',
      entity_id: DEV_ID,
      url: '/deviations/' + DEV_ID,
    };
    actions.confirm.mockReturnValue(of({ status: 'confirmed', result }));
    svc.confirmAction(ACTION_ID);

    expect(actions.confirm).toHaveBeenCalledWith('org-1', ACTION_ID);
    expect(card(svc)?.state).toBe('confirmed');
    expect(card(svc)?.result).toEqual(result);

    // A decided card is not sent again.
    svc.confirmAction(ACTION_ID);
    expect(actions.confirm).toHaveBeenCalledTimes(1);
  });

  it('discard rejects the proposal', () => {
    const svc = setup();
    proposeAction(svc);
    actions.reject.mockReturnValue(of(undefined));
    svc.rejectAction(ACTION_ID);
    expect(actions.reject).toHaveBeenCalledWith('org-1', ACTION_ID);
    expect(card(svc)?.state).toBe('rejected');
  });

  it('an expired proposal (410) shows as expired', () => {
    const svc = setup();
    proposeAction(svc);
    actions.confirm.mockReturnValue(throwError(() => ({ status: 410 })));
    svc.confirmAction(ACTION_ID);
    expect(card(svc)?.state).toBe('expired');
  });

  it('shows the server message when the change failed (422 action_failed)', () => {
    const svc = setup();
    proposeAction(svc);
    actions.confirm.mockReturnValue(
      throwError(() => ({
        status: 422,
        error: { detail: { code: 'action_failed', message: 'The type no longer exists.' } },
      })),
    );
    svc.confirmAction(ACTION_ID);
    expect(card(svc)?.state).toBe('failed');
    expect(card(svc)?.message).toBe('The type no longer exists.');
  });

  it('a transient error can be retried', () => {
    const svc = setup();
    proposeAction(svc);
    actions.confirm.mockReturnValueOnce(throwError(() => ({ status: 0 })));
    svc.confirmAction(ACTION_ID);
    expect(card(svc)?.state).toBe('error');

    actions.confirm.mockReturnValueOnce(
      of({
        status: 'confirmed',
        result: { message: 'ok', entity_type: null, entity_id: null, url: null },
      }),
    );
    svc.confirmAction(ACTION_ID);
    expect(card(svc)?.state).toBe('confirmed');
  });

  it('re-syncs the card from the server when it was already decided (409)', () => {
    const svc = setup();
    proposeAction(svc);
    actions.confirm.mockReturnValue(throwError(() => ({ status: 409 })));
    actions.get.mockReturnValue(
      of({ id: ACTION_ID, status: 'rejected', result: null, error: null }),
    );
    svc.confirmAction(ACTION_ID);
    expect(actions.get).toHaveBeenCalledWith('org-1', ACTION_ID);
    expect(card(svc)?.state).toBe('rejected');
  });
});
