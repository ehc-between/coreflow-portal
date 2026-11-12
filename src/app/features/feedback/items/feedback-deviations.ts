import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { EntityRefDto } from '../../../core/entities/entity.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';

/**
 * Complaint linkage to deviations (M03): the deviations a feedback record is
 * linked to, a search to link an existing one, and a shortcut to register a new
 * deviation (which is then linked from here). Only deviations the user may read
 * are listed by the server.
 */
@Component({
  selector: 'app-feedback-deviations',
  imports: [RouterLink, TranslocoPipe, EntityChip, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[15px] font-bold text-fg">
          {{ 'feedback.deviations.title' | transloco }}
        </h2>
        @if (canEdit() && !picking()) {
          <div class="flex flex-wrap gap-2">
            <app-button
              size="sm"
              variant="secondary"
              (click)="picking.set(true)"
              data-testid="link-deviation"
            >
              <app-icon name="link" [size]="14" />
              {{ 'feedback.deviations.link' | transloco }}
            </app-button>
            <a
              routerLink="/deviations/new"
              class="inline-flex h-8 items-center gap-1.5 rounded-tile px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'feedback.deviations.register' | transloco }}
            </a>
          </div>
        }
      </div>
      <p class="mb-3 text-[12.5px] text-fg-muted">
        {{
          (isComplaint() ? 'feedback.deviations.hintComplaint' : 'feedback.deviations.hint')
            | transloco
        }}
      </p>

      @if (picking()) {
        <div class="mb-3 rounded-tile border border-border bg-surface-2 p-3">
          <label
            for="cf-fb-dev-search"
            class="mb-1.5 block text-[13px] font-semibold text-fg-muted"
          >
            {{ 'feedback.deviations.searchLabel' | transloco }}
          </label>
          <input
            id="cf-fb-dev-search"
            type="search"
            class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
            [placeholder]="'feedback.deviations.searchPlaceholder' | transloco"
            [value]="query()"
            (input)="onQuery($any($event.target).value)"
            (keydown.escape)="cancel()"
            data-testid="deviation-search"
          />
          @if (searching()) {
            <p class="mt-2 text-[12.5px] text-fg-muted" role="status">
              {{ 'feedback.common.loading' | transloco }}
            </p>
          } @else if (query().trim() && hits().length === 0) {
            <p class="mt-2 text-[12.5px] text-fg-muted">
              {{ 'feedback.deviations.noHits' | transloco }}
            </p>
          }
          @if (hits().length) {
            <ul class="mt-2 flex flex-col gap-1" data-testid="deviation-hits">
              @for (hit of hits(); track hit.entity_id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-tile px-2 py-1.5 text-left text-[13px] hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent outline-none disabled:opacity-50"
                    [disabled]="busy() || isLinked(hit.entity_id)"
                    (click)="link(hit)"
                  >
                    @if (hit.code) {
                      <span class="font-mono text-[12px] text-fg-subtle">{{ hit.code }}</span>
                    }
                    <span class="truncate text-fg">{{ hit.title }}</span>
                    @if (isLinked(hit.entity_id)) {
                      <span class="ml-auto text-[12px] text-fg-subtle">
                        {{ 'feedback.deviations.alreadyLinked' | transloco }}
                      </span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
          <div class="mt-2 flex justify-end">
            <app-button size="sm" variant="ghost" (click)="cancel()">
              {{ 'common.cancel' | transloco }}
            </app-button>
          </div>
        </div>
      }

      @if (links().length === 0) {
        <p class="text-[13px] text-fg-subtle" data-testid="no-deviations">
          {{ 'feedback.deviations.none' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col gap-2" data-testid="deviation-links">
          @for (ref of links(); track ref.entity_id) {
            <li class="flex flex-wrap items-center gap-2">
              <app-entity-chip [ref]="ref" />
              @if (canEdit()) {
                <button
                  type="button"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle outline-none hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent"
                  [attr.aria-label]="'feedback.deviations.unlink' | transloco: { title: ref.title }"
                  [disabled]="busy()"
                  (click)="unlink(ref)"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class FeedbackDeviations {
  private readonly api = inject(FeedbackApi);
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly feedbackId = input.required<string>();
  readonly links = input<readonly EntityRefDto[]>([]);
  readonly canEdit = input(false);
  readonly isComplaint = input(false);
  /** The links changed (the page reloads the record). */
  readonly changed = output<readonly EntityRefDto[]>();

  private static nextId = 0;
  protected readonly headingId = `cf-fb-deviations-${FeedbackDeviations.nextId++}`;
  protected readonly picking = signal(false);
  protected readonly query = signal('');
  protected readonly hits = signal<readonly SearchItem[]>([]);
  protected readonly searching = signal(false);
  protected readonly busy = signal(false);
  private readonly linkedIds = computed(() => new Set(this.links().map((l) => l.entity_id)));

  private readonly queries = new Subject<string>();
  private readonly searchSub: Subscription;

  constructor() {
    this.searchSub = this.queries
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          this.searching.set(!!q.trim() && !!orgId);
          return this.search.search(orgId ?? '', orgId ? q : '', {
            types: ['deviation'],
            limit: 10,
          });
        }),
      )
      .subscribe({
        next: (res) => {
          this.searching.set(false);
          this.hits.set(res.items.filter((i) => i.entity_type === 'deviation'));
        },
        error: () => {
          this.searching.set(false);
          this.hits.set([]);
        },
      });
    inject(DestroyRef).onDestroy(() => this.searchSub.unsubscribe());
  }

  protected isLinked(id: string): boolean {
    return this.linkedIds().has(id);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.queries.next(value);
  }

  protected cancel(): void {
    this.picking.set(false);
    this.query.set('');
    this.hits.set([]);
  }

  protected link(hit: SearchItem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.linkDeviation(orgId, this.feedbackId(), hit.entity_id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.cancel();
        this.notifications.success('feedback.notices.deviationLinked');
        this.changed.emit(res.items);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected unlink(ref: EntityRefDto): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.unlinkDeviation(orgId, this.feedbackId(), ref.entity_id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('feedback.notices.deviationUnlinked');
        this.changed.emit(this.links().filter((l) => l.entity_id !== ref.entity_id));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }
}
