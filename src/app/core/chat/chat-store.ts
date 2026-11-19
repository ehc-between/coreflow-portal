import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  EMPTY,
  Observable,
  Subscription,
  catchError,
  expand,
  map,
  of,
  reduce,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ModuleService } from '../modules/module.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { ApiService } from '../http/api.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEnvelope } from '../realtime/realtime.models';
import { ChatApi } from './chat-api';
import { newClientId } from './chat-compose';
import { compareConversations, parseTs, snippetOf, sortBySeq, upsertMessage } from './chat-format';
import {
  AttachmentRef,
  CHAT_LIMITS,
  ChangesResponse,
  ChatMessage,
  ConversationCore,
  ConversationSummary,
  EntityLinkRef,
  LinkPreview,
  Message,
  MessagePage,
  NotifyLevel,
  ReactionSummary,
  SendMessageResponse,
  UserRef,
} from './chat.models';

/** Paged messages of one conversation (top-level only). */
export interface PageState {
  readonly items: readonly ChatMessage[];
  readonly hasMoreBefore: boolean;
  readonly hasMoreAfter: boolean;
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly error: boolean;
  /** `me.last_read_seq` when the conversation was opened: the "new messages" divider. */
  readonly readMarker: number | null;
  /** Message to highlight after a jump (`?m=`). */
  readonly highlightId: string | null;
}

export interface ThreadState {
  readonly conversationId: string;
  readonly root: ChatMessage | null;
  readonly items: readonly ChatMessage[];
  readonly hasMore: boolean;
  readonly following: boolean;
  readonly loading: boolean;
  readonly error: boolean;
}

export interface Typist {
  readonly user: UserRef;
  readonly parentId: string | null;
}

export type PresenceStatus = 'online' | 'away' | 'offline';

/** Pending upload attached to a send (already completed through the attachment service). */
export interface OutgoingAttachment {
  readonly ref: AttachmentRef;
  /** Object URL of a local image preview (revoked by the composer). */
  readonly previewUrl?: string | null;
}

const EMPTY_PAGE: PageState = {
  items: [],
  hasMoreBefore: false,
  hasMoreAfter: false,
  loading: false,
  loaded: false,
  error: false,
  readMarker: null,
  highlightId: null,
};

const TYPING_SHOW_MS = 6_000;
const TYPING_SEND_EVERY_MS = 3_000;
const READ_DEBOUNCE_MS = 1_000;
const GAP_DEBOUNCE_MS = 300;
const PREVIEW_TTL_MS = 60_000;
const LIST_POLL_MS = 60_000;
const CHANGES_POLL_MS = 15_000;

interface PreviewEntry {
  readonly preview: LinkPreview | null;
  readonly at: number;
}

/** The backend error code of a failed call, if any. */
export function chatErrorCode(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const detail = (error.error as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === 'object' && 'code' in detail) {
      return String((detail as { code: unknown }).code);
    }
    if (error.status === 0) {
      return 'network';
    }
  }
  return null;
}

/**
 * Chat state for the whole app (docs/chat-design.md §4.2), signals only.
 *
 * Activates for the selected org when the user holds `chat:use` and the
 * `chat` module is on: loads the conversation list, starts the shared socket
 * and applies realtime events with the per-conversation seq rule (ignore
 * duplicates, apply, fetch `changes` to fill gaps). Reconnects trigger a
 * catch-up; while the socket is down it polls. Sends are optimistic and
 * idempotent (`client_id`).
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ChatApi);
  private readonly rawApi = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly realtime = inject(RealtimeService);
  private readonly document = inject(DOCUMENT);

  /** The user may use chat in the selected org (permission + module). */
  readonly available = computed(
    () =>
      this.auth.isAuthenticated() &&
      !!this.selectedOrg.currentOrg()?.permissions.includes('chat:use') &&
      this.modules.isEnabled('chat'),
  );

  readonly orgId = computed(() => (this.available() ? this.selectedOrg.currentOrgId() : null));
  readonly meId = computed(() => this.auth.user()?.id ?? null);
  readonly isChatAdmin = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('chat:admin'),
  );
  readonly connection = this.realtime.state;

  private readonly _list = signal<ReadonlyMap<string, ConversationSummary>>(new Map());
  private readonly _listState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private loadedOrg: string | null = null;
  readonly listState = this._listState.asReadonly();

  /** Memberships (and joined public channels), newest activity first. */
  readonly conversations: Signal<readonly ConversationSummary[]> = computed(() =>
    [...this._list().values()].filter((c) => c.me !== null).sort(compareConversations),
  );

  private readonly _currentId = signal<string | null>(null);
  readonly currentId = this._currentId.asReadonly();
  readonly current = computed(() => {
    const id = this._currentId();
    return id ? (this._list().get(id) ?? null) : null;
  });

  /** Nav badge (D-14): unread in DMs/groups (not muted) + mentions in channels. */
  readonly unreadBadge = computed(() => {
    let total = 0;
    for (const c of this._list().values()) {
      if (!c.me || c.archived_at) {
        continue;
      }
      if (c.kind === 'channel') {
        total += c.mention_count;
      } else if (c.me.notify_level !== 'none') {
        total += c.unread_count;
      }
    }
    return total;
  });

  private readonly _pages = signal<ReadonlyMap<string, PageState>>(new Map());
  private readonly _threads = signal<ReadonlyMap<string, ThreadState>>(new Map());
  private readonly _typing = signal<ReadonlyMap<string, readonly Typist[]>>(new Map());
  private readonly _presence = signal<ReadonlyMap<string, PresenceStatus>>(new Map());
  private readonly _previews = signal<ReadonlyMap<string, PreviewEntry>>(new Map());

  /** Highest applied seq per conversation (the §3.4 ordering rule). */
  private readonly known = new Map<string, number>();
  private readonly gapFrom = new Map<string, number>();
  private readonly gapTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastTypingSent = new Map<string, number>();
  private readTimer: ReturnType<typeof setTimeout> | null = null;
  private previewQueue = new Map<string, EntityLinkRef>();
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimers: ReturnType<typeof setInterval>[] = [];
  private visible = false;
  private readonly subs = new Subscription();

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      untracked(() => this.activate(orgId));
    });
    effect(() => {
      const degraded = this.realtime.degraded() && this.orgId() !== null;
      untracked(() => this.setPolling(degraded));
    });
    this.subs.add(this.realtime.events('chat.').subscribe((e) => this.onEvent(e)));
    this.subs.add(this.realtime.events('presence.').subscribe((e) => this.onPresence(e)));
    this.subs.add(this.realtime.events('resync').subscribe(() => this.resyncAll()));
    this.subs.add(this.realtime.reconnected.subscribe(() => this.catchUp()));

    const win = this.document.defaultView;
    const onFocus = () => this.onWindowFocus();
    win?.addEventListener('focus', onFocus);
    win?.addEventListener('blur', onFocus);
    this.document.addEventListener('visibilitychange', onFocus);
    inject(DestroyRef).onDestroy(() => {
      this.subs.unsubscribe();
      win?.removeEventListener('focus', onFocus);
      win?.removeEventListener('blur', onFocus);
      this.document.removeEventListener('visibilitychange', onFocus);
      this.setPolling(false);
    });
  }

  // --- selectors ---

  conversation(id: string | null | undefined): ConversationSummary | null {
    return id ? (this._list().get(id) ?? null) : null;
  }

  page(id: string | null | undefined): PageState {
    return (id && this._pages().get(id)) || EMPTY_PAGE;
  }

  thread(rootId: string | null | undefined): ThreadState | null {
    return rootId ? (this._threads().get(rootId) ?? null) : null;
  }

  typing(
    conversationId: string | null | undefined,
    parentId: string | null = null,
  ): readonly Typist[] {
    if (!conversationId) {
      return [];
    }
    return (this._typing().get(conversationId) ?? []).filter((t) => t.parentId === parentId);
  }

  presence(userId: string | null | undefined): PresenceStatus {
    return (userId && this._presence().get(userId)) || 'offline';
  }

  /**
   * Permission-aware preview of a record link (batched, cached 60 s).
   * `undefined` while loading; `visible: false` when the viewer cannot read it.
   */
  linkPreview(ref: EntityLinkRef): LinkPreview | undefined {
    const key = previewKey(ref);
    const entry = this._previews().get(key);
    if (!entry || Date.now() - entry.at > PREVIEW_TTL_MS) {
      this.queuePreview(key, ref);
    }
    if (!entry) {
      return undefined;
    }
    return entry.preview ?? { ...ref, visible: false };
  }

  /** Resolve previews now (e.g. for a pasted link before turning it into a card). */
  fetchPreviews(refs: readonly EntityLinkRef[]): Observable<readonly LinkPreview[]> {
    const orgId = this.orgId();
    if (!orgId || refs.length === 0) {
      return of([]);
    }
    return this.api.linkPreviews(orgId, refs.slice(0, 50)).pipe(
      map((res) => res.items),
      tap((items) => this.storePreviews(refs, items)),
      catchError(() => of([])),
    );
  }

  // --- lifecycle ---

  private activate(orgId: string | null): void {
    if (orgId === this.loadedOrg) {
      return;
    }
    this.reset();
    this.loadedOrg = orgId;
    if (!orgId) {
      this.realtime.stop();
      return;
    }
    this.realtime.start();
    this.loadList();
  }

  private reset(): void {
    this._list.set(new Map());
    this._pages.set(new Map());
    this._threads.set(new Map());
    this._typing.set(new Map());
    this._previews.set(new Map());
    this._listState.set('idle');
    this.known.clear();
    this.gapFrom.clear();
    for (const timer of this.gapTimers.values()) {
      clearTimeout(timer);
    }
    this.gapTimers.clear();
  }

  /** (Re)load the conversation list of the active org. */
  loadList(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    if (this._list().size === 0) {
      this._listState.set('loading');
    }
    this.api.listConversations(orgId).subscribe({
      next: (res) => {
        if (this.orgId() !== orgId) {
          return;
        }
        const next = new Map<string, ConversationSummary>();
        // Keep joined-on-the-fly public channels the server only lists in browse.
        for (const c of this._list().values()) {
          if (c.me === null) {
            next.set(c.id, c);
          }
        }
        for (const c of res.items) {
          next.set(c.id, this.withLocalRead(c));
          if (!this.known.has(c.id)) {
            this.known.set(c.id, c.last_seq);
          }
        }
        this._list.set(next);
        this._listState.set('ready');
        this.queryPresence();
      },
      error: () => {
        if (this.orgId() === orgId) {
          this._listState.set(this._list().size ? 'ready' : 'error');
        }
      },
    });
  }

  /** A summary from the server, with unread cleared when the conversation is on screen. */
  private withLocalRead(c: ConversationSummary): ConversationSummary {
    if (c.id === this._currentId() && this.isFocused() && c.unread_count > 0) {
      this.scheduleRead();
    }
    return c;
  }

  /** Make sure a conversation summary is known (deep link to a public channel or a new DM). */
  ensureConversation(id: string): Observable<ConversationSummary | null> {
    const orgId = this.orgId();
    const existing = this._list().get(id);
    if (existing) {
      return of(existing);
    }
    if (!orgId) {
      return of(null);
    }
    return this.api.getConversation(orgId, id).pipe(
      tap((c) => this.putConversation(c)),
      catchError(() => of(null)),
    );
  }

  putConversation(c: ConversationSummary): void {
    this._list.update((list) => new Map(list).set(c.id, c));
    const known = this.known.get(c.id);
    if (known === undefined || known < c.last_seq) {
      // A page loaded later starts from this seq; a loaded page catches up below.
      if (known !== undefined && this._pages().get(c.id)?.loaded) {
        this.scheduleGap(c.id, known);
      } else {
        this.known.set(c.id, c.last_seq);
      }
    }
  }

  private patchConversation(
    id: string,
    patch: (c: ConversationSummary) => ConversationSummary,
  ): void {
    const c = this._list().get(id);
    if (c) {
      this._list.update((list) => new Map(list).set(id, patch(c)));
    }
  }

  private removeConversation(id: string): void {
    this._list.update((list) => {
      const next = new Map(list);
      next.delete(id);
      return next;
    });
    this._pages.update((pages) => {
      const next = new Map(pages);
      next.delete(id);
      return next;
    });
    this.known.delete(id);
  }

  // --- visible conversation, read state, focus ---

  /** The conversation now on screen (null when none). Sends `chat.focus`. */
  setCurrent(id: string | null): void {
    if (this._currentId() === id) {
      return;
    }
    this._currentId.set(id);
    this.visible = id !== null;
    this.sendFocus();
    if (id) {
      this.scheduleRead();
    }
  }

  private isFocused(): boolean {
    const doc = this.document;
    return (
      doc.visibilityState !== 'hidden' && (typeof doc.hasFocus !== 'function' || doc.hasFocus())
    );
  }

  private onWindowFocus(): void {
    this.sendFocus();
    if (this.isFocused()) {
      this.scheduleRead();
    }
  }

  private sendFocus(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const id = this.visible && this.isFocused() ? this._currentId() : null;
    this.realtime.send('chat.focus', { org_id: orgId, conversation_id: id });
  }

  /** Mark the visible conversation read up to its newest loaded message (debounced 1 s). */
  scheduleRead(): void {
    if (this.readTimer) {
      clearTimeout(this.readTimer);
    }
    this.readTimer = setTimeout(() => {
      this.readTimer = null;
      this.markVisibleRead();
    }, READ_DEBOUNCE_MS);
  }

  private markVisibleRead(): void {
    const orgId = this.orgId();
    const id = this._currentId();
    if (!orgId || !id || !this.isFocused()) {
      return;
    }
    const conversation = this._list().get(id);
    const page = this._pages().get(id);
    if (!conversation?.me || !page?.loaded || page.hasMoreAfter) {
      return;
    }
    const newest = [...page.items].reverse().find((m) => !m.localState);
    const seq = Math.max(newest?.seq ?? 0, conversation.me.last_read_seq);
    if (
      conversation.unread_count === 0 &&
      conversation.mention_count === 0 &&
      seq <= conversation.me.last_read_seq
    ) {
      return;
    }
    this.patchConversation(id, (c) => ({
      ...c,
      unread_count: 0,
      mention_count: 0,
      me: c.me ? { ...c.me, last_read_seq: Math.max(c.me.last_read_seq, seq) } : c.me,
    }));
    this.api.markRead(orgId, id, seq).subscribe({ error: () => undefined });
  }

  // --- messages ---

  /** Load the latest page (or the page around `messageId`) unless already loaded. */
  open(id: string, messageId: string | null = null): void {
    const page = this._pages().get(id);
    if (messageId) {
      const present = page?.items.some((m) => m.id === messageId);
      if (present) {
        this.setPage(id, { ...page!, highlightId: messageId });
        return;
      }
      this.loadAround(id, messageId);
      return;
    }
    if (!page?.loaded && !page?.loading) {
      this.loadLatest(id);
    }
  }

  /** Reload the newest page ("Hopp til nyeste", catch-up reset). */
  loadLatest(id: string): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const before = this._pages().get(id);
    this.setPage(id, { ...(before ?? EMPTY_PAGE), loading: true, error: false });
    this.api.messages(orgId, id, { limit: CHAT_LIMITS.pageSize }).subscribe({
      next: (res) => {
        const conversation = this._list().get(id);
        const pending = (before?.items ?? []).filter((m) => m.localState);
        this.applyLatest(id, res, pending, conversation);
      },
      error: () =>
        this.setPage(id, { ...(this._pages().get(id) ?? EMPTY_PAGE), loading: false, error: true }),
    });
  }

  private applyLatest(
    id: string,
    res: MessagePage,
    pending: readonly ChatMessage[],
    conversation: ConversationSummary | undefined,
  ): void {
    const maxSeq = res.items.reduce((max, m) => Math.max(max, m.change_seq, m.seq), 0);
    this.known.set(id, Math.max(this.known.get(id) ?? 0, conversation?.last_seq ?? 0, maxSeq));
    const prev = this._pages().get(id);
    this.setPage(id, {
      items: sortBySeq([...res.items, ...pending]),
      hasMoreBefore: res.has_more_before,
      hasMoreAfter: false,
      loading: false,
      loaded: true,
      error: false,
      readMarker: prev?.readMarker ?? conversation?.me?.last_read_seq ?? null,
      highlightId: null,
    });
    this.requestPreviewsFor(res.items);
    if (id === this._currentId()) {
      this.scheduleRead();
    }
  }

  private loadAround(id: string, messageId: string): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const before = this._pages().get(id);
    this.setPage(id, { ...(before ?? EMPTY_PAGE), loading: true, error: false });
    this.api
      .locate(orgId, messageId)
      .pipe(
        switchMap((loc) => {
          // A reply: open its root and let the page open the thread.
          const target = loc.parent_id ?? messageId;
          const seq$ = loc.parent_id
            ? this.api.locate(orgId, loc.parent_id).pipe(map((root) => root.seq))
            : of(loc.seq);
          return seq$.pipe(
            switchMap((seq) =>
              this.api.messages(orgId, id, { around_seq: seq, limit: CHAT_LIMITS.pageSize }),
            ),
            map((res) => ({ res, target })),
          );
        }),
      )
      .subscribe({
        next: ({ res, target }) => {
          const conversation = this._list().get(id);
          const maxSeq = res.items.reduce((max, m) => Math.max(max, m.change_seq), 0);
          if (!this.known.has(id)) {
            this.known.set(id, Math.max(conversation?.last_seq ?? 0, maxSeq));
          }
          this.setPage(id, {
            items: sortBySeq([...res.items]),
            hasMoreBefore: res.has_more_before,
            hasMoreAfter: res.has_more_after,
            loading: false,
            loaded: true,
            error: false,
            readMarker: before?.readMarker ?? conversation?.me?.last_read_seq ?? null,
            highlightId: target,
          });
          this.requestPreviewsFor(res.items);
        },
        error: () => {
          // The message is gone or unreadable: fall back to the latest page.
          this.loadLatest(id);
        },
      });
  }

  /** Older page (top sentinel). Trims the newest end beyond the DOM window. */
  loadOlder(id: string): void {
    const orgId = this.orgId();
    const page = this._pages().get(id);
    const first = page?.items.find((m) => !m.localState);
    if (!orgId || !page || page.loading || !page.hasMoreBefore || !first) {
      return;
    }
    this.setPage(id, { ...page, loading: true });
    this.api.messages(orgId, id, { before_seq: first.seq, limit: CHAT_LIMITS.pageSize }).subscribe({
      next: (res) => {
        const current = this._pages().get(id) ?? page;
        let items = sortBySeq([...res.items, ...current.items]);
        let hasMoreAfter = current.hasMoreAfter;
        if (items.length > CHAT_LIMITS.domWindow) {
          items = items.filter((m) => !m.localState).slice(0, CHAT_LIMITS.domWindow);
          hasMoreAfter = true;
        }
        this.setPage(id, {
          ...current,
          items,
          hasMoreBefore: res.has_more_before,
          hasMoreAfter,
          loading: false,
        });
        this.requestPreviewsFor(res.items);
      },
      error: () => this.setPage(id, { ...(this._pages().get(id) ?? page), loading: false }),
    });
  }

  /** Newer page (bottom sentinel, after a jump). Trims the oldest end beyond the window. */
  loadNewer(id: string): void {
    const orgId = this.orgId();
    const page = this._pages().get(id);
    const last = page ? [...page.items].reverse().find((m) => !m.localState) : undefined;
    if (!orgId || !page || page.loading || !page.hasMoreAfter || !last) {
      return;
    }
    this.setPage(id, { ...page, loading: true });
    this.api.messages(orgId, id, { after_seq: last.seq, limit: CHAT_LIMITS.pageSize }).subscribe({
      next: (res) => {
        const current = this._pages().get(id) ?? page;
        let items = sortBySeq([...current.items, ...res.items]);
        let hasMoreBefore = current.hasMoreBefore;
        if (items.length > CHAT_LIMITS.domWindow) {
          items = items.slice(items.length - CHAT_LIMITS.domWindow);
          hasMoreBefore = true;
        }
        this.setPage(id, {
          ...current,
          items,
          hasMoreBefore,
          hasMoreAfter: res.has_more_after,
          loading: false,
        });
        this.requestPreviewsFor(res.items);
        if (!res.has_more_after && id === this._currentId()) {
          this.scheduleRead();
        }
      },
      error: () => this.setPage(id, { ...(this._pages().get(id) ?? page), loading: false }),
    });
  }

  clearHighlight(id: string): void {
    const page = this._pages().get(id);
    if (page?.highlightId) {
      this.setPage(id, { ...page, highlightId: null });
    }
  }

  /** Forget the "new messages" divider (after the user has seen it). */
  resetReadMarker(id: string): void {
    const page = this._pages().get(id);
    const c = this._list().get(id);
    if (page) {
      this.setPage(id, { ...page, readMarker: c?.me?.last_read_seq ?? null });
    }
  }

  private setPage(id: string, page: PageState): void {
    this._pages.update((pages) => new Map(pages).set(id, page));
  }

  private setThread(rootId: string, thread: ThreadState): void {
    this._threads.update((threads) => new Map(threads).set(rootId, thread));
  }

  // --- sending ---

  /**
   * Optimistic send: a pending message appears at once and is replaced by the
   * server echo (matched on `client_id`). Errors mark it failed; {@link retry}
   * reuses the `client_id`, so the server never stores it twice.
   */
  send(
    conversationId: string,
    body: string,
    options: { parentId?: string | null; attachments?: readonly OutgoingAttachment[] } = {},
  ): Observable<SendMessageResponse> {
    const me = this.auth.user();
    const pending: ChatMessage = {
      id: `local-${newClientId()}`,
      conversation_id: conversationId,
      seq: Number.MAX_SAFE_INTEGER,
      change_seq: 0,
      parent_id: options.parentId ?? null,
      client_id: newClientId(),
      kind: 'user',
      system: null,
      sender: me ? { id: me.id, name: me.full_name ?? me.email } : null,
      body,
      mentions: [],
      tags: [],
      entity_links: [],
      attachments: (options.attachments ?? []).map((a) => a.ref),
      reactions: [],
      reply_count: 0,
      last_reply_at: null,
      reply_user_ids: [],
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      deleted_reason: null,
      localState: 'pending',
      localPreviews: (options.attachments ?? []).map((a) => a.previewUrl ?? '').filter(Boolean),
    };
    this.placeLocal(pending);
    return this.deliver(pending);
  }

  /** Re-send a failed message with the same `client_id`. */
  retry(message: ChatMessage): Observable<SendMessageResponse> {
    const pending: ChatMessage = { ...message, localState: 'pending' };
    this.placeLocal(pending);
    return this.deliver(pending);
  }

  /** Drop a failed message that will not be retried. */
  discard(message: ChatMessage): void {
    this.removeLocal(message);
  }

  private deliver(pending: ChatMessage): Observable<SendMessageResponse> {
    const orgId = this.orgId();
    if (!orgId) {
      return throwError(() => new Error('chat unavailable'));
    }
    return this.api
      .send(orgId, pending.conversation_id, {
        client_id: pending.client_id!,
        body: pending.body,
        parent_id: pending.parent_id,
        attachment_ids: pending.attachments.map((a) => a.id),
      })
      .pipe(
        tap((res) => {
          this.applyMessage(res.message, null, true);
          this.patchConversation(pending.conversation_id, (c) => ({
            ...c,
            me: c.me
              ? { ...c.me, last_read_seq: Math.max(c.me.last_read_seq, res.message.seq) }
              : c.me,
          }));
        }),
        catchError((error: unknown) => {
          this.placeLocal({ ...pending, localState: 'failed' });
          return throwError(() => error);
        }),
      );
  }

  private placeLocal(message: ChatMessage): void {
    if (message.parent_id) {
      const thread = this._threads().get(message.parent_id);
      if (thread) {
        this.setThread(message.parent_id, { ...thread, items: upsertLocal(thread.items, message) });
      }
      return;
    }
    const page = this._pages().get(message.conversation_id) ?? { ...EMPTY_PAGE, loaded: true };
    this.setPage(message.conversation_id, { ...page, items: upsertLocal(page.items, message) });
  }

  private removeLocal(message: ChatMessage): void {
    const drop = (items: readonly ChatMessage[]) =>
      items.filter((m) => m.client_id !== message.client_id || !m.localState);
    if (message.parent_id) {
      const thread = this._threads().get(message.parent_id);
      if (thread) {
        this.setThread(message.parent_id, { ...thread, items: drop(thread.items) });
      }
      return;
    }
    const page = this._pages().get(message.conversation_id);
    if (page) {
      this.setPage(message.conversation_id, { ...page, items: drop(page.items) });
    }
  }

  edit(message: Message, body: string): Observable<SendMessageResponse> {
    const orgId = this.orgId();
    if (!orgId) {
      return throwError(() => new Error('chat unavailable'));
    }
    return this.api
      .edit(orgId, message.conversation_id, message.id, body)
      .pipe(tap((res) => this.applyMessage(res.message, null, true)));
  }

  delete(message: Message): Observable<void> {
    const orgId = this.orgId();
    if (!orgId) {
      return throwError(() => new Error('chat unavailable'));
    }
    return this.api.deleteMessage(orgId, message.conversation_id, message.id).pipe(
      tap(() => {
        const me = this.meId();
        this.applyMessage(
          {
            ...message,
            body: '',
            entity_links: [],
            mentions: [],
            tags: [],
            attachments: [],
            reactions: [],
            deleted_at: new Date().toISOString(),
            deleted_reason: message.sender?.id === me ? 'author' : 'moderator',
            change_seq: message.change_seq + 1,
          },
          null,
          true,
        );
      }),
    );
  }

  /** Toggle my reaction (optimistic; reverted on error). */
  toggleReaction(message: Message, emoji: string): void {
    const orgId = this.orgId();
    const me = this.meId();
    if (!orgId || !me || message.deleted_at) {
      return;
    }
    const existing = message.reactions.find((r) => r.emoji === emoji);
    const on = !existing?.user_ids.includes(me);
    const before = message.reactions;
    const after = toggledReactions(before, emoji, me, on);
    this.setReactions(message.conversation_id, message.id, message.parent_id, after);
    this.api.react(orgId, message.conversation_id, message.id, emoji, on).subscribe({
      error: () =>
        this.setReactions(message.conversation_id, message.id, message.parent_id, before),
    });
  }

  private setReactions(
    conversationId: string,
    messageId: string,
    parentId: string | null,
    reactions: readonly ReactionSummary[],
  ): void {
    const patch = (items: readonly ChatMessage[]) =>
      items.map((m) => (m.id === messageId ? { ...m, reactions } : m));
    const page = this._pages().get(conversationId);
    if (page && !parentId) {
      this.setPage(conversationId, { ...page, items: patch(page.items) });
    }
    const threadId = parentId ?? messageId;
    const thread = this._threads().get(threadId);
    if (thread) {
      this.setThread(threadId, {
        ...thread,
        root:
          thread.root && thread.root.id === messageId ? { ...thread.root, reactions } : thread.root,
        items: patch(thread.items),
      });
    }
  }

  // --- threads ---

  openThread(conversationId: string, rootId: string): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const existing = this._threads().get(rootId);
    const fromPage =
      this._pages()
        .get(conversationId)
        ?.items.find((m) => m.id === rootId) ?? null;
    this.setThread(rootId, {
      conversationId,
      root: existing?.root ?? fromPage,
      items: existing?.items ?? [],
      hasMore: false,
      following: existing?.following ?? false,
      loading: true,
      error: false,
    });
    this.api
      .thread(orgId, conversationId, rootId)
      .pipe(
        expand((res) =>
          res.has_more && res.items.length
            ? this.api.thread(orgId, conversationId, rootId, res.items[res.items.length - 1].seq)
            : EMPTY,
        ),
        reduce((acc, res) => ({ ...res, items: [...acc.items, ...res.items] }), {
          items: [] as Message[],
        } as { items: Message[]; root?: Message; following?: boolean; has_more?: boolean }),
      )
      .subscribe({
        next: (res) => {
          const local = (this._threads().get(rootId)?.items ?? []).filter((m) => m.localState);
          this.setThread(rootId, {
            conversationId,
            root: res.root ?? fromPage,
            items: sortBySeq([...res.items, ...local]),
            hasMore: false,
            following: !!res.following,
            loading: false,
            error: false,
          });
          this.requestPreviewsFor([...(res.root ? [res.root] : []), ...res.items]);
          const last = res.items[res.items.length - 1];
          if (last) {
            this.api
              .markThreadRead(orgId, conversationId, rootId, last.seq)
              .subscribe({ error: () => undefined });
          }
        },
        error: () => {
          const current = this._threads().get(rootId);
          if (current) {
            this.setThread(rootId, { ...current, loading: false, error: true });
          }
        },
      });
  }

  followThread(conversationId: string, rootId: string, follow: boolean): void {
    const orgId = this.orgId();
    const thread = this._threads().get(rootId);
    if (!orgId || !thread) {
      return;
    }
    this.setThread(rootId, { ...thread, following: follow });
    this.api.followThread(orgId, conversationId, rootId, follow).subscribe({
      error: () => {
        const current = this._threads().get(rootId);
        if (current) {
          this.setThread(rootId, { ...current, following: !follow });
        }
      },
    });
  }

  // --- typing, presence ---

  /** Tell the others I am typing (throttled to one frame per 3 s per conversation). */
  notifyTyping(conversationId: string, parentId: string | null = null): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const key = `${conversationId}:${parentId ?? ''}`;
    const now = Date.now();
    if (now - (this.lastTypingSent.get(key) ?? 0) < TYPING_SEND_EVERY_MS) {
      return;
    }
    this.lastTypingSent.set(key, now);
    this.realtime.send('chat.typing', {
      org_id: orgId,
      conversation_id: conversationId,
      parent_id: parentId,
    });
  }

  private queryPresence(): void {
    const orgId = this.orgId();
    const me = this.meId();
    if (!orgId) {
      return;
    }
    const ids = new Set<string>();
    for (const c of this._list().values()) {
      if (c.kind === 'dm') {
        for (const id of c.dm_user_ids ?? []) {
          if (id !== me) {
            ids.add(id);
          }
        }
      }
    }
    const userIds = [...ids].slice(0, 200);
    if (!userIds.length) {
      return;
    }
    if (this.realtime.isOpen()) {
      this.realtime.send('presence.query', { org_id: orgId, user_ids: userIds });
      return;
    }
    // Socket down: the REST fallback (§3.8) — never errors loudly.
    this.rawApi
      .get<{ users: Record<string, PresenceStatus> }>(
        `v1/orgs/${encodeURIComponent(orgId)}/realtime/presence`,
        { params: { user_ids: userIds.join(',') } },
      )
      .pipe(catchError(() => of({ users: {} as Record<string, PresenceStatus> })))
      .subscribe((res) => this.mergePresence(res.users));
  }

  private mergePresence(users: Readonly<Record<string, string>>): void {
    this._presence.update((current) => {
      const next = new Map(current);
      for (const [id, status] of Object.entries(users)) {
        if (status === 'online' || status === 'away' || status === 'offline') {
          next.set(id, status);
        }
      }
      return next;
    });
  }

  private onPresence(event: RealtimeEnvelope): void {
    const payload = event.payload as Record<string, unknown>;
    if (payload['org_id'] !== this.orgId()) {
      return;
    }
    if (event.type === 'presence.state') {
      this.mergePresence((payload['users'] ?? {}) as Record<string, string>);
    } else if (event.type === 'presence.changed') {
      const userId = payload['user_id'];
      if (typeof userId === 'string') {
        this.mergePresence({ [userId]: String(payload['status']) });
      }
    }
  }

  // --- conversation settings ---

  setNotifyLevel(id: string, level: NotifyLevel): Observable<ConversationSummary> {
    const orgId = this.orgId();
    if (!orgId) {
      return throwError(() => new Error('chat unavailable'));
    }
    return this.api.setNotifyLevel(orgId, id, level).pipe(tap((c) => this.putConversation(c)));
  }

  join(id: string): Observable<ConversationSummary> {
    const orgId = this.orgId();
    if (!orgId) {
      return throwError(() => new Error('chat unavailable'));
    }
    return this.api.join(orgId, id).pipe(tap((c) => this.putConversation(c)));
  }

  leave(id: string): Observable<void> {
    const orgId = this.orgId();
    if (!orgId) {
      return throwError(() => new Error('chat unavailable'));
    }
    return this.api.leave(orgId, id).pipe(tap(() => this.removeConversation(id)));
  }

  // --- realtime events (§3.4) ---

  private onEvent(event: RealtimeEnvelope): void {
    const orgId = this.orgId();
    if (!orgId || (event.org_id && event.org_id !== orgId)) {
      return;
    }
    const payload = event.payload as Record<string, unknown>;
    const conversationId = event.conversation_id ?? null;

    // Personal / ephemeral events carry no seq.
    switch (event.type) {
      case 'chat.typing':
        if (conversationId) {
          this.onTyping(conversationId, payload);
        }
        return;
      case 'chat.read':
        if (conversationId) {
          this.onRead(conversationId, Number(payload['last_read_seq']));
        }
        return;
      case 'chat.thread.read':
        return;
      case 'chat.resync':
        if (typeof payload['conversation_id'] === 'string') {
          this.resyncConversation(payload['conversation_id']);
        } else {
          this.resyncAll();
        }
        return;
      case 'chat.conversation.removed': {
        const id = (payload['conversation_id'] as string | undefined) ?? conversationId;
        if (id) {
          this.removeConversation(id);
        }
        return;
      }
    }

    if (!conversationId) {
      return;
    }
    if (!this._list().has(conversationId)) {
      // A conversation I just joined or was added to: fetch my view of it.
      this.ensureConversation(conversationId).subscribe((c) => {
        if (c && this._pages().get(conversationId)?.loaded) {
          this.scheduleGap(conversationId, this.known.get(conversationId) ?? 0);
        }
      });
      return;
    }
    const seq = typeof event.seq === 'number' ? event.seq : null;
    if (seq !== null) {
      const known = this.known.get(conversationId) ?? 0;
      if (seq <= known) {
        return;
      }
      if (seq > known + 1) {
        this.scheduleGap(conversationId, known);
      }
      this.known.set(conversationId, seq);
      this.patchConversation(conversationId, (c) => ({
        ...c,
        last_seq: Math.max(c.last_seq, seq),
      }));
    }

    switch (event.type) {
      case 'chat.message.created':
        this.applyMessage(
          payload['message'] as Message,
          (payload['root'] as Message | null) ?? null,
          false,
          true,
        );
        break;
      case 'chat.message.updated':
      case 'chat.message.deleted':
        this.applyMessage(payload['message'] as Message, null, false);
        break;
      case 'chat.reaction.changed':
        this.setReactions(
          conversationId,
          String(payload['message_id']),
          (payload['parent_id'] as string | null) ?? null,
          (payload['reactions'] as ReactionSummary[]) ?? [],
        );
        break;
      case 'chat.conversation.created':
      case 'chat.conversation.updated':
      case 'chat.conversation.member_added': {
        const core = payload['conversation'] as ConversationCore | undefined;
        if (core) {
          this.patchConversation(conversationId, (c) => ({
            ...c,
            ...core,
            last_seq: Math.max(c.last_seq, core.last_seq),
          }));
        }
        break;
      }
    }
  }

  /**
   * Put a message (and an updated thread root) into the loaded page/thread
   * and the conversation summary. `fresh` marks a newly created message.
   */
  private applyMessage(
    message: Message,
    root: Message | null,
    fromRest: boolean,
    fresh = false,
  ): void {
    if (!message) {
      return;
    }
    const id = message.conversation_id;
    const me = this.meId();
    const page = this._pages().get(id);
    if (!message.parent_id) {
      const inPage = page?.items.some(
        (m) => m.id === message.id || (!!message.client_id && m.client_id === message.client_id),
      );
      if (page && (inPage || (page.loaded && !page.hasMoreAfter))) {
        this.setPage(id, { ...page, items: upsertMessage(page.items, message) });
      } else if (page && page.loaded && page.hasMoreAfter) {
        // Viewing older history: the new message arrives with the next "newer" page.
      }
    } else {
      const thread = this._threads().get(message.parent_id);
      if (thread) {
        this.setThread(message.parent_id, {
          ...thread,
          items: upsertMessage(thread.items, message),
        });
      }
    }
    if (root) {
      if (page) {
        const current = this._pages().get(id) ?? page;
        if (current.items.some((m) => m.id === root.id)) {
          this.setPage(id, { ...current, items: upsertMessage(current.items, root) });
        }
      }
      const thread = this._threads().get(root.id);
      if (thread) {
        this.setThread(root.id, { ...thread, root });
      }
    }
    this.requestPreviewsFor([message]);
    if (fresh && message.sender) {
      this.clearTypist(id, message.sender.id);
    }

    if (!message.parent_id) {
      const isNewTop = fresh || fromRest;
      this.patchConversation(id, (c) => {
        const mine = message.sender?.id === me;
        const deleted = !!message.deleted_at;
        let next: ConversationSummary = c;
        if (
          isNewTop &&
          !deleted &&
          (!c.last_message ||
            c.last_message.id === message.id ||
            parseTs(message.created_at) >= parseTs(c.last_message.created_at))
        ) {
          next = {
            ...next,
            last_message_at: message.created_at,
            last_message: {
              id: message.id,
              sender: message.sender,
              snippet: snippetOf(message.body),
              created_at: message.created_at,
              deleted: false,
              has_attachments: message.attachments.length > 0,
            },
          };
        } else if (c.last_message?.id === message.id) {
          next = {
            ...next,
            last_message: { ...c.last_message, snippet: snippetOf(message.body), deleted },
          };
        }
        if (fresh && !mine && !deleted && next.me && message.kind === 'user') {
          const onScreen = this._currentId() === id && this.isFocused();
          if (!onScreen && message.seq > next.me.last_read_seq) {
            const mentioned = message.mentions.some((m) => m.type === 'user' && m.id === me);
            next = {
              ...next,
              unread_count: Math.min(next.unread_count + 1, 100),
              mention_count: next.mention_count + (mentioned ? 1 : 0),
            };
          }
        }
        return next;
      });
      if (fresh && this._currentId() === id && message.sender?.id !== me) {
        this.scheduleRead();
      }
    }
  }

  private onRead(conversationId: string, lastReadSeq: number): void {
    if (!Number.isFinite(lastReadSeq)) {
      return;
    }
    this.patchConversation(conversationId, (c) => {
      if (!c.me) {
        return c;
      }
      const page = this._pages().get(conversationId);
      const me = this.meId();
      let unread = 0;
      if (page?.loaded && !page.hasMoreAfter) {
        unread = page.items.filter(
          (m) =>
            !m.localState &&
            !m.deleted_at &&
            m.kind === 'user' &&
            m.seq > lastReadSeq &&
            m.sender?.id !== me,
        ).length;
      } else if (lastReadSeq < c.last_seq) {
        unread = c.unread_count;
      }
      return {
        ...c,
        unread_count: unread,
        mention_count: unread === 0 ? 0 : c.mention_count,
        me: { ...c.me, last_read_seq: Math.max(c.me.last_read_seq, lastReadSeq) },
      };
    });
  }

  private onTyping(conversationId: string, payload: Record<string, unknown>): void {
    const user = payload['user'] as UserRef | undefined;
    if (!user || user.id === this.meId()) {
      return;
    }
    const parentId = (payload['parent_id'] as string | null) ?? null;
    const key = `${conversationId}:${parentId ?? ''}:${user.id}`;
    const update = (add: boolean) =>
      this._typing.update((all) => {
        const next = new Map(all);
        const list = (next.get(conversationId) ?? []).filter(
          (t) => !(t.user.id === user.id && t.parentId === parentId),
        );
        next.set(conversationId, add ? [...list, { user, parentId }] : list);
        return next;
      });
    update(true);
    const existing = this.typingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.typingTimers.set(
      key,
      setTimeout(() => {
        this.typingTimers.delete(key);
        update(false);
      }, TYPING_SHOW_MS),
    );
  }

  /** A message from the typist ends their indicator early. */
  private clearTypist(conversationId: string, userId: string): void {
    const list = this._typing().get(conversationId);
    if (list?.some((t) => t.user.id === userId)) {
      this._typing.update((all) =>
        new Map(all).set(
          conversationId,
          list.filter((t) => t.user.id !== userId),
        ),
      );
    }
  }

  // --- catch-up ---

  private scheduleGap(conversationId: string, since: number): void {
    const from = Math.min(this.gapFrom.get(conversationId) ?? since, since);
    this.gapFrom.set(conversationId, from);
    if (this.gapTimers.has(conversationId)) {
      return;
    }
    this.gapTimers.set(
      conversationId,
      setTimeout(() => {
        this.gapTimers.delete(conversationId);
        const sinceSeq = this.gapFrom.get(conversationId) ?? since;
        this.gapFrom.delete(conversationId);
        this.fetchChanges(conversationId, sinceSeq).subscribe();
      }, GAP_DEBOUNCE_MS),
    );
  }

  /** Apply `changes?since_seq` (all pages). `reset` reloads the latest page. */
  fetchChanges(conversationId: string, sinceSeq: number): Observable<void> {
    const orgId = this.orgId();
    if (!orgId) {
      return of(undefined);
    }
    const page$ = (since: number) => this.api.changes(orgId, conversationId, since);
    return page$(sinceSeq).pipe(
      expand((res: ChangesResponse) =>
        res.has_more && !res.reset ? page$(lastChangeSeq(res, sinceSeq)) : EMPTY,
      ),
      tap((res) => this.applyChanges(conversationId, res)),
      map(() => undefined),
      catchError(() => of(undefined)),
      reduce(() => undefined, undefined as void),
    );
  }

  private applyChanges(conversationId: string, res: ChangesResponse): void {
    this.putConversation(res.conversation);
    if (res.reset) {
      this.known.set(conversationId, res.last_seq);
      this.loadLatest(conversationId);
      return;
    }
    for (const message of res.items) {
      this.applyMessage(message, null, false, false);
    }
    this.known.set(conversationId, Math.max(this.known.get(conversationId) ?? 0, res.last_seq));
  }

  /** After a reconnect: reload the list, then catch up every loaded page. */
  catchUp(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.api.listConversations(orgId).subscribe({
      next: (res) => {
        for (const c of res.items) {
          const page = this._pages().get(c.id);
          const known = this.known.get(c.id) ?? 0;
          this._list.update((list) => new Map(list).set(c.id, c));
          if (page?.loaded && known < c.last_seq) {
            this.fetchChanges(c.id, known).subscribe();
          } else if (!page?.loaded) {
            this.known.set(c.id, c.last_seq);
          }
        }
        const ids = new Set(res.items.map((c) => c.id));
        for (const c of [...this._list().values()]) {
          if (c.me && !ids.has(c.id)) {
            this.removeConversation(c.id);
          }
        }
        this._listState.set('ready');
        this.queryPresence();
      },
      error: () => undefined,
    });
  }

  private resyncAll(): void {
    const current = this._currentId();
    this._pages.set(new Map());
    this._threads.set(new Map());
    this.known.clear();
    this.loadList();
    if (current) {
      this.loadLatest(current);
    }
  }

  private resyncConversation(id: string): void {
    this._pages.update((pages) => {
      const next = new Map(pages);
      next.delete(id);
      return next;
    });
    this.ensureConversation(id).subscribe();
    if (id === this._currentId()) {
      this.loadLatest(id);
    }
  }

  private setPolling(on: boolean): void {
    for (const timer of this.pollTimers) {
      clearInterval(timer);
    }
    this.pollTimers = [];
    if (!on) {
      return;
    }
    this.pollTimers.push(setInterval(() => this.loadList(), LIST_POLL_MS));
    this.pollTimers.push(
      setInterval(() => {
        const id = this._currentId();
        const page = id ? this._pages().get(id) : undefined;
        if (id && page?.loaded) {
          this.fetchChanges(id, this.known.get(id) ?? 0).subscribe();
        }
      }, CHANGES_POLL_MS),
    );
  }

  // --- link previews ---

  private requestPreviewsFor(messages: readonly Message[]): void {
    const now = Date.now();
    const cache = this._previews();
    for (const message of messages) {
      for (const ref of message.entity_links ?? []) {
        const key = previewKey(ref);
        const entry = cache.get(key);
        if (!entry || now - entry.at > PREVIEW_TTL_MS) {
          this.queuePreview(key, ref);
        }
      }
    }
  }

  private queuePreview(key: string, ref: EntityLinkRef): void {
    if (this.previewQueue.has(key)) {
      return;
    }
    this.previewQueue.set(key, ref);
    if (!this.previewTimer) {
      // Outside the current change detection pass: never write signals while rendering.
      this.previewTimer = setTimeout(() => this.flushPreviews(), 30);
    }
  }

  private flushPreviews(): void {
    this.previewTimer = null;
    const refs = [...this.previewQueue.values()];
    this.previewQueue = new Map();
    const orgId = this.orgId();
    if (!orgId || !refs.length) {
      return;
    }
    // Mark as requested (keeps the old value) so renders don't re-queue meanwhile.
    for (let i = 0; i < refs.length; i += 50) {
      const batch = refs.slice(i, i + 50);
      this.api
        .linkPreviews(orgId, batch)
        .pipe(catchError(() => of({ items: [] as LinkPreview[] })))
        .subscribe((res) => this.storePreviews(batch, res.items));
    }
  }

  private storePreviews(refs: readonly EntityLinkRef[], items: readonly LinkPreview[]): void {
    const at = Date.now();
    this._previews.update((current) => {
      const next = new Map(current);
      for (const ref of refs) {
        const key = previewKey(ref);
        const found = items.find((p) => previewKey(p) === key) ?? null;
        next.set(key, { preview: found, at });
      }
      return next;
    });
  }
}

function previewKey(ref: EntityLinkRef): string {
  return `${ref.entity_type}:${ref.entity_id}`;
}

function lastChangeSeq(res: ChangesResponse, fallback: number): number {
  return res.items.length ? res.items[res.items.length - 1].change_seq : fallback;
}

function upsertLocal(items: readonly ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = items.findIndex((m) => m.client_id === message.client_id);
  if (index >= 0) {
    if (!items[index].localState) {
      // The server echo already arrived: keep it.
      return [...items];
    }
    const next = [...items];
    next[index] = message;
    return sortBySeq(next);
  }
  return sortBySeq([...items, message]);
}

/** Reactions with my `emoji` toggled on/off. */
export function toggledReactions(
  reactions: readonly ReactionSummary[],
  emoji: string,
  me: string,
  on: boolean,
): ReactionSummary[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (on) {
    if (existing) {
      return reactions.map((r) =>
        r.emoji === emoji && !r.user_ids.includes(me)
          ? { ...r, count: r.count + 1, user_ids: [...r.user_ids, me] }
          : r,
      );
    }
    return [...reactions, { emoji, count: 1, user_ids: [me] }];
  }
  return reactions
    .map((r) =>
      r.emoji === emoji && r.user_ids.includes(me)
        ? { ...r, count: r.count - 1, user_ids: r.user_ids.filter((id) => id !== me) }
        : r,
    )
    .filter((r) => r.count > 0);
}
