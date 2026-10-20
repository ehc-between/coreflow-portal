import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ActionListItem } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ActionListRow } from './action-list-row';
import {
  ActionListQuery,
  ActionOwnerScope,
  ActionScope,
  actionListQueryParams,
  parseActionListQuery,
  toActionFilters,
} from './actions-list-data';

const PAGE_SIZE = 25;

/**
 * CAPA actions across every deviation the user may view, soonest due first —
 * the drill-down behind the dashboard's open / overdue action tiles. Filters:
 * open vs overdue, and everyone's vs mine; both are mirrored in the URL
 * (`?overdue=true`, `?owner_user_id=me`). Reloads on org switch.
 */
@Component({
  selector: 'app-actions-list',
  imports: [FormsModule, RouterLink, TranslocoPipe, Button, Card, Icon, ActionListRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-8 pt-7 pb-12">
      <a
        routerLink="/deviations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.backToList' | transloco }}
      </a>
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'deviations.actionsList.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">
          {{ 'deviations.actionsList.subtitle' | transloco }}
        </div>
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2.5 sm:max-w-[480px]">
        <div class="cf-select">
          <select
            [ngModel]="query().scope"
            (ngModelChange)="onScopeChange($event)"
            [attr.aria-label]="'deviations.actionsList.scope' | transloco"
          >
            <option value="open">{{ 'deviations.actionsList.scopeOpen' | transloco }}</option>
            <option value="overdue">
              {{ 'deviations.actionsList.scopeOverdue' | transloco }}
            </option>
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="query().owner"
            (ngModelChange)="onOwnerChange($event)"
            [attr.aria-label]="'deviations.filters.owner' | transloco"
          >
            <option value="all">{{ 'deviations.filters.allOwners' | transloco }}</option>
            <option value="me">{{ 'deviations.actionsList.ownerMe' | transloco }}</option>
          </select>
        </div>
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <div class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        } @else if (failed()) {
          <div class="px-4 py-10 text-center text-[14px] text-fail">
            {{ 'myWork.loadFailed' | transloco }}
          </div>
        } @else if (items().length === 0) {
          <div class="px-4 py-12 text-center text-[14px] text-fg-muted">
            {{ 'deviations.actionsList.empty' | transloco }}
          </div>
        } @else {
          <ul class="divide-y divide-border">
            @for (action of items(); track action.id) {
              <li><app-action-list-row [action]="action" [showOwner]="true" /></li>
            }
          </ul>
        }
      </app-card>

      @if (!loading() && total() > pageSize) {
        <div class="mt-4 flex items-center justify-between gap-4">
          <span class="text-[13px] text-fg-subtle">
            {{
              'deviations.pagination.range'
                | transloco: { from: rangeFrom(), to: rangeTo(), total: total() }
            }}
          </span>
          <div class="flex items-center gap-2">
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="offset() === 0"
              (click)="goTo(offset() - pageSize)"
            >
              {{ 'deviations.pagination.prev' | transloco }}
            </app-button>
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="rangeTo() >= total()"
              (click)="goTo(offset() + pageSize)"
            >
              {{ 'deviations.pagination.next' | transloco }}
            </app-button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ActionsList {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly pageSize = PAGE_SIZE;

  protected readonly query = signal<ActionListQuery>(
    parseActionListQuery(this.route.snapshot.queryParamMap),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly ActionListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly rangeFrom = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  protected readonly rangeTo = computed(() =>
    Math.min(this.offset() + this.items().length, this.total()),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.offset.set(0);
        this.load(orgId);
      });
    });
  }

  protected onScopeChange(scope: ActionScope): void {
    this.update({ ...this.query(), scope });
  }

  protected onOwnerChange(owner: ActionOwnerScope): void {
    this.update({ ...this.query(), owner });
  }

  protected goTo(offset: number): void {
    this.offset.set(Math.max(0, offset));
    this.load(this.selectedOrg.currentOrgId());
  }

  private update(query: ActionListQuery): void {
    this.query.set(query);
    this.offset.set(0);
    // Mirror the filters in the URL so the view can be shared / reloaded.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: actionListQueryParams(query),
      replaceUrl: true,
    });
    this.load(this.selectedOrg.currentOrgId());
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    this.items.set([]);
    this.total.set(0);
    this.failed.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.api
      .listActions(orgId, toActionFilters(this.query(), this.pageSize, this.offset()))
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }
}
