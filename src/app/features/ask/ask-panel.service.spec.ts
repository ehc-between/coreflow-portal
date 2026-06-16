import { TestBed } from '@angular/core/testing';
import { AiApi, AskStream } from '../../core/ai/ai-api';
import { AskEvent } from '../../core/ai/ai.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from './ask-panel.service';

describe('AskPanelService', () => {
  let emit: (event: AskEvent) => void;
  let cancel: ReturnType<typeof vi.fn<() => void>>;

  function setup() {
    cancel = vi.fn<() => void>();
    const ai = {
      ask: (_messages: unknown, _orgId: string, onEvent: (event: AskEvent) => void): AskStream => {
        emit = onEvent;
        return { cancel: () => cancel() };
      },
    };
    const org = { currentOrgId: () => 'org-1' };
    TestBed.configureTestingModule({
      providers: [
        AskPanelService,
        { provide: AiApi, useValue: ai },
        { provide: SelectedOrgService, useValue: org },
      ],
    });
    return TestBed.inject(AskPanelService);
  }

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
});
