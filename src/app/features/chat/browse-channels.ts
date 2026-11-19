import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, catchError, debounceTime, of, startWith, switchMap } from 'rxjs';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { ConversationSummary } from '../../core/chat/chat.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';

/** "Finn kanaler": public channels I am not in, with one-click join (§2.2 browse). */
@Component({
  selector: 'app-chat-browse-channels',
  imports: [TranslocoPipe, Button, EmptyState, Icon, LoadingState],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col bg-bg' },
  template: `
    <div class="flex items-center gap-2 border-b border-border bg-surface px-2 py-2 sm:px-4">
      @if (showBack()) {
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 md:hidden"
          [attr.aria-label]="'chat.header.back' | transloco"
          (click)="back.emit()"
        >
          <app-icon name="back" [size]="18" />
        </button>
      }
      <h1 class="flex-1 font-display text-card font-bold text-fg">
        {{ 'chat.browse.title' | transloco }}
      </h1>
    </div>
    <div class="px-4 py-3">
      <label class="sr-only" for="chat-browse-search">{{ 'chat.browse.search' | transloco }}</label>
      <input
        id="chat-browse-search"
        type="search"
        class="h-10 w-full max-w-md rounded-tile border border-border bg-surface px-3 text-ui text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
        [placeholder]="'chat.browse.search' | transloco"
        (input)="query$.next(valueOf($event))"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6" [attr.aria-busy]="loading()">
      @if (loading() && !items().length) {
        <app-loading-state [rows]="4" />
      } @else if (error()) {
        <p class="text-meta text-fail-ink" role="alert">{{ 'chat.browse.error' | transloco }}</p>
      } @else if (!items().length) {
        <app-empty-state
          icon="comment"
          titleKey="chat.browse.empty.title"
          bodyKey="chat.browse.empty.body"
          [compact]="true"
        />
      } @else {
        <ul class="flex max-w-2xl flex-col gap-2">
          @for (c of items(); track c.id) {
            <li
              class="flex items-center gap-3 rounded-tile border border-border bg-surface px-3 py-2.5"
            >
              <span
                class="flex h-9 w-9 flex-none items-center justify-center rounded-tile bg-accent-soft font-bold text-accent"
                aria-hidden="true"
                >#</span
              >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-ui font-semibold text-fg">#{{ c.name }}</span>
                <span class="truncate text-micro text-fg-subtle">
                  {{ 'chat.browse.members' | transloco: { count: c.member_count } }}
                  @if (c.topic) {
                    · {{ c.topic }}
                  }
                </span>
              </span>
              <app-button
                size="sm"
                variant="secondary"
                [loading]="joining() === c.id"
                (click)="join(c)"
                data-testid="chat-browse-join"
                >{{ 'chat.browse.join' | transloco }}</app-button
              >
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class BrowseChannels {
  private readonly api = inject(ChatApi);
  private readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  readonly showBack = input(false);
  readonly back = output<void>();

  protected readonly query$ = new Subject<string>();
  protected readonly items = signal<readonly ConversationSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly joining = signal<string | null>(null);

  constructor() {
    const sub = this.query$
      .pipe(
        startWith(''),
        debounceTime(200),
        switchMap((q) => {
          const orgId = this.store.orgId();
          this.loading.set(true);
          if (!orgId) {
            return of(null);
          }
          return this.api.browse(orgId, q).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.error.set(res === null);
        this.items.set(res?.items ?? []);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected join(c: ConversationSummary): void {
    this.joining.set(c.id);
    this.store.join(c.id).subscribe({
      next: () => {
        this.joining.set(null);
        void this.router.navigate(['/chat', c.id]);
      },
      error: () => {
        this.joining.set(null);
        this.notifications.error('chat.members.errors.generic');
      },
    });
  }
}
