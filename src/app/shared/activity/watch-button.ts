import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { WatchersRead } from '../../core/notifications/activity.models';
import { isUnsupportedEntity } from '../../core/notifications/activity-errors';
import { NotificationService } from '../../core/notifications/notification.service';
import { WatchersApi } from '../../core/notifications/watchers-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../ui/icon/icon';

/**
 * Follow / unfollow toggle for any record. Followers are notified of the
 * record's events wherever an org rule (or the kind's default) includes
 * watchers. Hides itself when the record type can't be followed here (type
 * not registered, module disabled, no read access), so any detail page can
 * mount it safely.
 *
 *   <app-watch-button entityType="deviation" [entityId]="dev.id" />
 */
@Component({
  selector: 'app-watch-button',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (state(); as s) {
      <button
        type="button"
        data-testid="watch-button"
        [attr.aria-pressed]="s.watching"
        [attr.title]="followersTitle()"
        [disabled]="busy()"
        (click)="toggle()"
        class="inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
        [class]="
          s.watching
            ? 'border-accent-border bg-accent-soft text-accent hover:bg-accent-soft/70'
            : 'border-border bg-surface text-fg hover:bg-surface-2'
        "
      >
        <app-icon name="bell" [size]="15" />
        <span>{{
          (s.watching ? 'notifications.watch.following' : 'notifications.watch.follow') | transloco
        }}</span>
        @if (s.count > 0) {
          <span
            aria-hidden="true"
            class="rounded-full bg-surface-2 px-1.5 text-[11.5px] text-fg-muted tabular-nums"
            >{{ s.count }}</span
          >
          <span class="sr-only">{{
            'notifications.watch.followerCount' | transloco: { count: s.count }
          }}</span>
        }
      </button>
    }
  `,
})
export class WatchButton {
  private readonly api = inject(WatchersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();

  /** Null while loading or when the record can't be followed (the button is hidden). */
  protected readonly state = signal<WatchersRead | null>(null);
  protected readonly busy = signal(false);
  /** Incremented per load so a stale response (previous record / org) is dropped. */
  private generation = 0;

  protected readonly followersTitle = computed(() => {
    const users = this.state()?.users ?? [];
    if (users.length === 0) {
      return this.language.translate('notifications.watch.noFollowers');
    }
    const names = formatList(
      users.map((u) => u.name),
      this.language.active(),
    );
    return this.language.translate('notifications.watch.followedBy', { names });
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(orgId, entityType, entityId));
    });
  }

  private load(orgId: string | null, entityType: string, entityId: string): void {
    const generation = ++this.generation;
    this.state.set(null);
    if (!orgId || !entityType || !entityId) {
      return;
    }
    this.api.get(orgId, entityType, entityId).subscribe({
      next: (state) => {
        if (generation === this.generation) this.state.set(state);
      },
      // Unsupported / inaccessible records simply don't offer following.
      error: () => undefined,
    });
  }

  protected toggle(): void {
    const current = this.state();
    const orgId = this.selectedOrg.currentOrgId();
    if (!current || !orgId || this.busy()) {
      return;
    }
    const generation = this.generation;
    this.busy.set(true);
    const call = current.watching
      ? this.api.unwatch(orgId, this.entityType(), this.entityId())
      : this.api.watch(orgId, this.entityType(), this.entityId());
    call.subscribe({
      next: (state) => {
        this.busy.set(false);
        if (generation !== this.generation) return;
        this.state.set(state);
        this.toasts.success(
          state.watching ? 'notifications.watch.followed' : 'notifications.watch.unfollowed',
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (generation !== this.generation) return;
        if (isUnsupportedEntity(error)) {
          this.state.set(null);
        }
        this.toasts.error('notifications.watch.failed');
      },
    });
  }
}

/** "Ada, Bob and Cy" in the UI language (falls back to a comma list). */
function formatList(items: readonly string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}
