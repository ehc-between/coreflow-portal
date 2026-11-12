import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AiActionsApi, actionErrorState } from '../../core/ai/ai-actions-api';
import { AiApi, AskStream } from '../../core/ai/ai-api';
import {
  AiActionResult,
  AskAction,
  AskLink,
  AskMode,
  AskProposal,
  AskSource,
  ConversationTurn,
  GuidanceLevel,
} from '../../core/ai/ai.models';
import {
  PageContext,
  PageContextService,
  PageSelection,
  toPageContextDto,
} from '../../core/ai/page-context';
import { SelectedOrgService } from '../../core/org/selected-org.service';

export type AskPanelState = 'chat' | 'not-configured';

/** A pending choice the assistant asked the user to make. */
export interface AskQuestion {
  readonly question: string;
  readonly options: readonly string[];
}

/**
 * Where a proposed change stands on its card. `pending` waits for the user;
 * `confirming` / `rejecting` are in flight; `error` is a transient failure the
 * user can retry; the rest are final.
 */
export type ActionCardState =
  | 'pending'
  | 'confirming'
  | 'rejecting'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'failed'
  | 'forbidden'
  | 'gone'
  | 'error';

/** A confirm-before-write proposal rendered as a Confirm / Discard card. */
export interface AskActionCard extends AskAction {
  readonly state: ActionCardState;
  readonly result?: AiActionResult | null;
  /** The server's user-safe failure message, when it gave one. */
  readonly message?: string | null;
}

/** One turn in the on-screen conversation thread. */
export interface AskTurn {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  text: string;
  sources?: readonly AskSource[];
  proposal?: AskProposal;
  question?: AskQuestion;
  actions?: readonly AskActionCard[];
  links?: readonly AskLink[];
  status?: 'streaming' | 'done' | 'error';
}

/** Per-message extras (selection for "Ask about this"). */
export interface AskSendOptions {
  readonly selection?: PageSelection | null;
}

/**
 * Persistent store for the Ask CoreFlow slide-over. Holds both the open/closed
 * view state AND the conversation itself: the thread, the live stream, and the
 * submit/event-routing logic. Living in root (not the component) is what lets the
 * panel be a minimizable, non-killable view: closing the panel only hides it,
 * while the stream keeps running here and keeps updating the thread in the
 * background. The top bar, the floating button and Ctrl/Cmd+J toggle visibility;
 * the panel reads the signals.
 *
 * F5: every message carries the page context registered by the current page
 * (`providePageContext`), unless the user detached it for this conversation.
 * Tutor mode (`openTutor`) teaches about a topic, adapted to the guidance level.
 * Write proposals stream as `action` events and are confirmed or discarded here
 * through {@link AiActionsApi}; nothing changes until the user confirms.
 */
@Injectable({ providedIn: 'root' })
export class AskPanelService {
  private readonly ai = inject(AiApi);
  private readonly actionsApi = inject(AiActionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly pageContextService = inject(PageContextService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  private readonly _open = signal(false);
  private readonly _state = signal<AskPanelState>('chat');
  private readonly _thread = signal<readonly AskTurn[]>([]);
  private readonly _working = signal<string | null>(null);
  private readonly _mode = signal<AskMode>('ask');
  private readonly _topic = signal<string | null>(null);
  private readonly _usePageContext = signal(true);
  private readonly _guidanceLevel = signal<GuidanceLevel | null>(null);

  /** Whether the Ask CoreFlow panel is currently shown. */
  readonly open = this._open.asReadonly();
  readonly state = this._state.asReadonly();
  readonly thread = this._thread.asReadonly();

  /** The latest backend status label for the in-flight turn, or null. Set by a
   *  `status` event during the silent tool-execution gap; cleared once the
   *  assistant text starts streaming and when the turn finishes. */
  readonly working = this._working.asReadonly();

  /** `ask` or `tutor` for the current conversation. */
  readonly mode = this._mode.asReadonly();
  /** The tutor topic (e.g. `iso9001:6.1`), or null. */
  readonly topic = this._topic.asReadonly();
  /** Whether the page context goes along with messages (the user may detach it). */
  readonly usePageContext = this._usePageContext.asReadonly();
  /** The guidance level sent with requests (set by the guidance framework), or null. */
  readonly guidanceLevel = this._guidanceLevel.asReadonly();

  /** The page the assistant would be told about, or null. */
  readonly pageContext = computed<PageContext | null>(() => this.pageContextService.current());

  /** True while the latest assistant turn is still streaming. */
  readonly streaming = computed(() => this._thread().at(-1)?.status === 'streaming');

  /** True when there's a conversation worth reopening (e.g. while minimized). */
  readonly hasConversation = computed(() => this._thread().length > 0);

  private nextId = 0;
  private stream: AskStream | null = null;

  show(): void {
    this._open.set(true);
  }

  /** Open the panel and immediately submit `prompt` (e.g. from a command-palette action). */
  showWith(prompt: string): void {
    this._open.set(true);
    this.send(prompt);
  }

  /**
   * "Ask about this": open the panel and ask `prompt` about the current page,
   * optionally naming what is selected (a field, some text, record ids).
   */
  askAbout(prompt: string, selection?: PageSelection): void {
    this._open.set(true);
    // Asking about the page re-attaches the page context if it was detached.
    this._usePageContext.set(true);
    this.send(prompt, { selection: selection ?? null });
  }

  /**
   * Open the assistant in tutor mode about `topic` (a guidance topic such as
   * `risk.list`, or a clause such as `iso9001:6.1`). Without a topic it teaches
   * about the current page. Starts a fresh conversation.
   */
  openTutor(topic?: string): void {
    const resolved = topic?.trim() || this.pageTopic();
    this.newChat();
    this._mode.set('tutor');
    this._topic.set(resolved);
    this._open.set(true);
    const key = resolved ? 'tutor.startTopic' : 'tutor.start';
    void firstValueFrom(
      this.transloco.selectTranslate<string>(key, { topic: resolved ?? '' }, { scope: 'search' }),
    ).then((prompt) => {
      // The user may have left tutor mode before the text loaded.
      if (this._mode() === 'tutor' && this._topic() === resolved && !this.hasConversation()) {
        this.send(prompt);
      }
    });
  }

  /** Leave tutor mode; the conversation continues as a normal Ask. */
  exitTutor(): void {
    this._mode.set('ask');
    this._topic.set(null);
  }

  /** Attach / detach the page context for this conversation. */
  setUsePageContext(use: boolean): void {
    this._usePageContext.set(use);
  }

  /** The guidance level to send (F6 wires the user's effective level here). */
  setGuidanceLevel(level: GuidanceLevel | null): void {
    this._guidanceLevel.set(level);
  }

  /** Minimize: hide the view only. The stream keeps running and the thread is kept. */
  hide(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update((open) => !open);
  }

  /** Submit a new user message (or a picked option chip). */
  send(text: string, options: AskSendOptions = {}): void {
    const value = text.trim();
    const orgId = this.selectedOrg.currentOrgId();
    if (!value || !orgId || this.streaming()) {
      return;
    }

    this.stream?.cancel();
    this._working.set(null);

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

    this.stream = this.ai.ask(
      messages,
      orgId,
      (event) => {
        switch (event.type) {
          case 'status':
            this._working.set(event.text);
            break;
          case 'delta':
            // Visible text is now the progress signal; retire the status label.
            this._working.set(null);
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
          case 'action': {
            const card: AskActionCard = {
              action_id: event.action_id,
              tool: event.tool,
              summary: event.summary,
              preview: {
                title: event.preview?.title ?? '',
                fields: event.preview?.fields ?? [],
              },
              state: 'pending',
            };
            this.patch(assistantId, (turn) => ({
              ...turn,
              actions: [
                ...(turn.actions ?? []).filter((a) => a.action_id !== card.action_id),
                card,
              ],
            }));
            break;
          }
          case 'link': {
            const link: AskLink = {
              entity_type: event.entity_type,
              entity_id: event.entity_id,
              title: event.title,
              code: event.code ?? null,
              url: event.url,
            };
            this.patch(assistantId, (turn) => ({
              ...turn,
              links: [
                ...(turn.links ?? []).filter(
                  (l) => !(l.entity_type === link.entity_type && l.entity_id === link.entity_id),
                ),
                link,
              ],
            }));
            break;
          }
          case 'done':
            this._working.set(null);
            this.patch(assistantId, (turn) => ({ ...turn, status: 'done' }));
            this.stream = null;
            break;
          case 'error':
            this._working.set(null);
            this.patch(assistantId, (turn) => ({ ...turn, status: 'error' }));
            this.stream = null;
            break;
          case 'not-configured':
            // A 503 at request start: drop the just-added user+assistant turns so
            // no phantom error bubble lingers, then show the calm "not set up" view.
            this._working.set(null);
            this.stream?.cancel();
            this.stream = null;
            this._thread.update((turns) =>
              turns.filter((turn) => turn.id !== userId && turn.id !== assistantId),
            );
            this._state.set('not-configured');
            break;
        }
      },
      {
        pageContext: this.wirePageContext(options.selection ?? null),
        mode: this._mode(),
        topic: this._topic(),
        guidanceLevel: this._guidanceLevel(),
      },
    );
  }

  /** Confirm a proposed change: the server runs it now (as AI-initiated). */
  confirmAction(actionId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canDecide(actionId)) {
      return;
    }
    this.patchAction(actionId, (card) => ({ ...card, state: 'confirming', message: null }));
    this.actionsApi.confirm(orgId, actionId).subscribe({
      next: (response) =>
        this.patchAction(actionId, (card) => ({
          ...card,
          state: 'confirmed',
          result: response.result,
        })),
      error: (error: unknown) => this.onDecisionError(orgId, actionId, error),
    });
  }

  /** Discard a proposed change. */
  rejectAction(actionId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canDecide(actionId)) {
      return;
    }
    this.patchAction(actionId, (card) => ({ ...card, state: 'rejecting', message: null }));
    this.actionsApi.reject(orgId, actionId).subscribe({
      next: () => this.patchAction(actionId, (card) => ({ ...card, state: 'rejected' })),
      error: (error: unknown) => this.onDecisionError(orgId, actionId, error),
    });
  }

  /** Abort the in-flight stream but keep the thread. */
  stop(): void {
    this.stream?.cancel();
    this.stream = null;
    this._working.set(null);
    this._thread.update((turns) =>
      turns.map((turn) =>
        turn.status === 'streaming'
          ? {
              ...turn,
              status: turn.text || turn.question || turn.actions?.length ? 'done' : 'error',
            }
          : turn,
      ),
    );
  }

  /** Abort the stream and reset the conversation to the intro (and to Ask mode). */
  newChat(): void {
    this.stop();
    this._thread.set([]);
    this._state.set('chat');
    this._mode.set('ask');
    this._topic.set(null);
    this._usePageContext.set(true);
  }

  private wirePageContext(selection: PageSelection | null) {
    if (!this._usePageContext()) {
      return null;
    }
    const ctx = this.pageContextService.current();
    const withSelection = selection && ctx ? { ...ctx, selection } : ctx;
    const dto = toPageContextDto(withSelection, this.router.url);
    if (dto && selection && !ctx) {
      // No page registered: still pass what the user pointed at.
      return toPageContextDto({ module: dto.module, view: dto.view, selection }, this.router.url);
    }
    return dto;
  }

  /** A tutor topic for the current page: `<module>.<view>`, or null. */
  private pageTopic(): string | null {
    const ctx = this.pageContextService.current();
    if (!ctx?.module) {
      return null;
    }
    return `${ctx.module}.${ctx.view}`;
  }

  private canDecide(actionId: string): boolean {
    const card = this.findAction(actionId);
    return card?.state === 'pending' || card?.state === 'error';
  }

  private onDecisionError(orgId: string, actionId: string, error: unknown): void {
    const state = actionErrorState(error);
    switch (state.kind) {
      case 'not-pending':
        // Decided elsewhere (another tab): re-sync the card from the server.
        this.actionsApi.get(orgId, actionId).subscribe({
          next: (dto) =>
            this.patchAction(actionId, (card) => ({
              ...card,
              state: dto.status,
              result: dto.result,
              message: dto.error,
            })),
          error: () => this.patchAction(actionId, (card) => ({ ...card, state: 'gone' })),
        });
        break;
      case 'failed':
        this.patchAction(actionId, (card) => ({
          ...card,
          state: 'failed',
          message: state.message,
        }));
        break;
      default:
        this.patchAction(actionId, (card) => ({ ...card, state: state.kind }));
    }
  }

  private findAction(actionId: string): AskActionCard | undefined {
    for (const turn of this._thread()) {
      const card = turn.actions?.find((a) => a.action_id === actionId);
      if (card) {
        return card;
      }
    }
    return undefined;
  }

  private patchAction(actionId: string, update: (card: AskActionCard) => AskActionCard): void {
    this._thread.update((turns) =>
      turns.map((turn) =>
        turn.actions?.some((a) => a.action_id === actionId)
          ? {
              ...turn,
              actions: turn.actions.map((a) => (a.action_id === actionId ? update(a) : a)),
            }
          : turn,
      ),
    );
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
