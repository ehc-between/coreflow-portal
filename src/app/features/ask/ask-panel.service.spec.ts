import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import searchEn from '../../../assets/i18n/search/en.json';
import { AiActionsApi } from '../../core/ai/ai-actions-api';
import { AiApi, AskOptions, AskStream } from '../../core/ai/ai-api';
import { AskEvent } from '../../core/ai/ai.models';
import { PageContextService } from '../../core/ai/page-context';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from './ask-panel.service';

const ACTION_ID = '0b4ad2f0-6f43-4d38-9b51-1f0a5e0c9d11';
const DEV_ID = '6a4a1d8e-6a51-4c0e-a4f5-2b0f61b9a8a2';

type ApiFn = (orgId: string, id: string) => Observable<unknown>;

describe('AskPanelService', () => {
  let emit: (event: AskEvent) => void;
  let cancel: ReturnType<typeof vi.fn<() => void>>;
  let lastOptions: AskOptions | undefined;
  let actions: {
    confirm: ReturnType<typeof vi.fn<ApiFn>>;
    reject: ReturnType<typeof vi.fn<ApiFn>>;
    get: ReturnType<typeof vi.fn<ApiFn>>;
  };

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

  it('a status event sets the working label; a delta clears it; done clears it', () => {
    const svc = setup();
    svc.send('draft a policy');
    expect(svc.working()).toBeNull();

    emit({ type: 'status', text: 'Looking through your documents…' });
    expect(svc.working()).toBe('Looking through your documents…');

    emit({ type: 'delta', text: 'Here' });
    expect(svc.working()).toBeNull();

    emit({ type: 'status', text: 'Creating a deviation type…' });
    expect(svc.working()).toBe('Creating a deviation type…');

    emit({ type: 'done' });
    expect(svc.working()).toBeNull();
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
