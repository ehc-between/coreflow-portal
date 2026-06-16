import { Injectable, computed, inject, signal } from '@angular/core';
import { AiApi, AskStream } from '../../core/ai/ai-api';
import { AskProposal, AskSource, ConversationTurn } from '../../core/ai/ai.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';

export type AskPanelState = 'chat' | 'not-configured';

/** A pending choice the assistant asked the user to make. */
export interface AskQuestion {
  readonly question: string;
  readonly options: readonly string[];
}

/** One turn in the on-screen conversation thread. */
export interface AskTurn {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  text: string;
  sources?: readonly AskSource[];
  proposal?: AskProposal;
  question?: AskQuestion;
  status?: 'streaming' | 'done' | 'error';
}

/**
 * Persistent store for the Ask CoreFlow slide-over. Holds both the open/closed
 * view state AND the conversation itself — the thread, the live stream, and the
 * submit/event-routing logic. Living in root (not the component) is what lets the
 * panel be a minimizable, non-killable view: closing the panel only hides it,
 * while the stream keeps running here and keeps updating the thread in the
 * background. The top bar (and ⌘K) toggle visibility; the panel reads the signals.
 */
@Injectable({ providedIn: 'root' })
export class AskPanelService {
  private readonly ai = inject(AiApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly _open = signal(false);
  private readonly _state = signal<AskPanelState>('chat');
  private readonly _thread = signal<readonly AskTurn[]>([]);

  /** Whether the Ask CoreFlow panel is currently shown. */
  readonly open = this._open.asReadonly();
  readonly state = this._state.asReadonly();
  readonly thread = this._thread.asReadonly();

  /** True while the latest assistant turn is still streaming. */
  readonly streaming = computed(() => this._thread().at(-1)?.status === 'streaming');

  /** True when there's a conversation worth reopening (e.g. while minimized). */
  readonly hasConversation = computed(() => this._thread().length > 0);

  private nextId = 0;
  private stream: AskStream | null = null;

  show(): void {
    this._open.set(true);
  }

  /** Minimize: hide the view only. The stream keeps running and the thread is kept. */
  hide(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update((open) => !open);
  }

  /** Submit a new user message (or a picked option chip). */
  send(text: string): void {
    const value = text.trim();
    const orgId = this.selectedOrg.currentOrgId();
    if (!value || !orgId || this.streaming()) {
      return;
    }

    this.stream?.cancel();

    const userTurn: AskTurn = { id: this.nextId++, role: 'user', text: value };
    const assistantTurn: AskTurn = {
      id: this.nextId++,
      role: 'assistant',
      text: '',
      status: 'streaming',
    };
    this._thread.update((turns) => [...turns, userTurn, assistantTurn]);

    const messages = this.toMessages();
    const userId = userTurn.id;
    const assistantId = assistantTurn.id;

    this.stream = this.ai.ask(messages, orgId, (event) => {
      switch (event.type) {
        case 'delta':
          this.patch(assistantId, (turn) => ({ ...turn, text: turn.text + event.text }));
          break;
        case 'sources':
          this.patch(assistantId, (turn) => ({ ...turn, sources: event.sources }));
          break;
        case 'proposal':
          this.patch(assistantId, (turn) => ({
            ...turn,
            proposal: { proposal_id: event.proposal_id, title: event.title },
          }));
          break;
        case 'question':
          this.patch(assistantId, (turn) => ({
            ...turn,
            question: { question: event.question, options: event.options },
          }));
          break;
        case 'done':
          this.patch(assistantId, (turn) => ({ ...turn, status: 'done' }));
          this.stream = null;
          break;
        case 'error':
          this.patch(assistantId, (turn) => ({ ...turn, status: 'error' }));
          this.stream = null;
          break;
        case 'not-configured':
          // A 503 at request start: drop the just-added user+assistant turns so
          // no phantom error bubble lingers, then show the calm "not set up" view.
          this.stream?.cancel();
          this.stream = null;
          this._thread.update((turns) =>
            turns.filter((turn) => turn.id !== userId && turn.id !== assistantId),
          );
          this._state.set('not-configured');
          break;
      }
    });
  }

  /** Abort the in-flight stream but keep the thread. */
  stop(): void {
    this.stream?.cancel();
    this.stream = null;
    this._thread.update((turns) =>
      turns.map((turn) =>
        turn.status === 'streaming'
          ? { ...turn, status: turn.text || turn.question ? 'done' : 'error' }
          : turn,
      ),
    );
  }

  /** Abort the stream and reset the conversation to the intro. */
  newChat(): void {
    this.stop();
    this._thread.set([]);
    this._state.set('chat');
  }

  /** Map the on-screen thread to the wire format: drop empty-content turns; for
   *  an assistant turn that only asked a question, use the question as content. */
  private toMessages(): ConversationTurn[] {
    const messages: ConversationTurn[] = [];
    for (const turn of this._thread()) {
      const content =
        turn.role === 'assistant' && !turn.text ? (turn.question?.question ?? '') : turn.text;
      if (content.trim()) {
        messages.push({ role: turn.role, content });
      }
    }
    return messages;
  }

  private patch(id: number, update: (turn: AskTurn) => AskTurn): void {
    this._thread.update((turns) => turns.map((turn) => (turn.id === id ? update(turn) : turn)));
  }
}
