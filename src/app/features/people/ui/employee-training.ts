import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { PeopleApi } from '../data/people-api';
import { EmployeeHandover, EmployeeTraining } from '../data/people.models';

/**
 * The person's training from the Training module (M11): courses assigned to their
 * user account (with due dates and overdue marks) and completed courses (records,
 * with expiry). Training reaches people through their user account, so a person
 * without one sees how to fix that instead.
 */
@Component({
  selector: 'app-people-employee-training',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, ErrorState, LoadingState, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-tr-h" id="training">
      <h2 id="cf-emp-tr-h" class="mb-1 text-card font-bold text-fg">
        {{ 'people.training.title' | transloco }}
      </h2>
      <p class="mb-3 text-meta text-fg-muted">{{ 'people.training.subtitle' | transloco }}</p>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (data(); as t) {
            @if (!t.linked) {
              <p class="text-ui text-fg-muted" data-testid="training-unlinked">
                {{ 'people.training.noUser' | transloco }}
              </p>
            } @else if (!t.visible) {
              <p class="text-ui text-fg-muted">{{ 'people.training.hidden' | transloco }}</p>
            } @else if (!t.assignments.length && !t.records.length) {
              <p class="text-ui text-fg-muted" data-testid="training-empty">
                {{ 'people.training.empty' | transloco }}
              </p>
            } @else {
              @if (t.assignments.length) {
                <h3 class="mb-1 text-meta font-semibold text-fg-subtle uppercase">
                  {{ 'people.training.assigned' | transloco }}
                </h3>
                <ul class="mb-3 divide-y divide-border" data-testid="training-assignments">
                  @for (a of t.assignments; track a.id) {
                    <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                      <a [routerLink]="a.url" class="min-w-0 flex-1 text-fg hover:underline">
                        <span class="font-mono text-meta text-fg-subtle">{{ a.course.code }}</span>
                        {{ a.course.title }}
                      </a>
                      @if (a.due_at) {
                        <span
                          class="text-meta"
                          [class]="a.overdue ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
                        >
                          {{
                            'people.checklists.due'
                              | transloco: { date: (a.due_at | localDate: 'mediumDate') }
                          }}
                        </span>
                      }
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="a.overdue ? 'overdue' : a.status"
                        [labelKey]="
                          a.overdue ? 'common.status.overdue' : 'people.training.status.' + a.status
                        "
                      />
                    </li>
                  }
                </ul>
              }
              @if (t.records.length) {
                <h3 class="mb-1 text-meta font-semibold text-fg-subtle uppercase">
                  {{ 'people.training.completed' | transloco }}
                </h3>
                <ul class="divide-y divide-border" data-testid="training-records">
                  @for (r of t.records; track r.id) {
                    <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                      <a [routerLink]="r.url" class="min-w-0 flex-1 text-fg hover:underline">
                        <span class="font-mono text-meta text-fg-subtle">{{ r.course.code }}</span>
                        {{ r.course.title }}
                      </a>
                      <span class="text-meta text-fg-muted">
                        {{
                          'people.training.completedOn'
                            | transloco: { date: (r.completed_at | localDate: 'mediumDate') }
                        }}
                        @if (r.expires_at) {
                          ·
                          {{
                            'people.competences.expires'
                              | transloco: { date: (r.expires_at | localDate: 'mediumDate') }
                          }}
                        }
                      </span>
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="r.passed ? 'passed' : 'failed'"
                        [labelKey]="
                          r.passed ? 'people.training.passed' : 'people.training.notPassed'
                        "
                      />
                    </li>
                  }
                </ul>
              }
            }
          }
        }
      }
    </section>
  `,
})
export class EmployeeTrainingSection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly employeeId = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<EmployeeTraining | null>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.employeeId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.employeeId());
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.training(orgId, id).subscribe({
      next: (data) => {
        this.data.set(data);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

/**
 * "Utstyr og tilganger" for a leaver (A.5.11 return of assets, A.5.18 access rights):
 * the assets registered to the person and the access-review entries about them, so
 * HR can see what to recover and remove before the offboarding is completed. Assets
 * are returned in the assets module; "Utstyr levert tilbake" is refused there while
 * any is still registered to the person.
 */
@Component({
  selector: 'app-people-employee-handover',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, ErrorState, LoadingState, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-ho-h" id="handover">
      <h2 id="cf-emp-ho-h" class="mb-1 text-card font-bold text-fg">
        {{ 'people.handover.title' | transloco }}
      </h2>
      <p class="mb-3 text-meta text-fg-muted">{{ 'people.handover.subtitle' | transloco }}</p>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (data(); as h) {
            <p class="mb-3 text-ui" data-testid="handover-account">
              @if (!h.linked) {
                <span class="text-fg-muted">{{ 'people.handover.noUser' | transloco }}</span>
              } @else if (h.access_revoked_at) {
                <span class="text-pass">{{
                  'people.detail.accessRevokedOn'
                    | transloco: { date: (h.access_revoked_at | localDate) }
                }}</span>
              } @else if (h.user_active) {
                <span class="font-semibold text-warn-ink">{{
                  'people.handover.userActive' | transloco
                }}</span>
              }
            </p>
            <h3 class="mb-1 text-meta font-semibold text-fg-subtle uppercase">
              {{ 'people.handover.assets' | transloco }}
            </h3>
            @if (h.assets.length) {
              <ul class="mb-3 divide-y divide-border" data-testid="handover-assets">
                @for (a of h.assets; track a.id) {
                  <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                    <a [routerLink]="a.url" class="min-w-0 flex-1 text-fg hover:underline">
                      <span class="font-mono text-meta text-fg-subtle">{{ a.code }}</span>
                      {{ a.name }}
                    </a>
                    <a
                      [routerLink]="a.url"
                      class="text-meta font-semibold text-accent hover:underline"
                    >
                      {{ 'people.handover.returnAsset' | transloco }}
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <p class="mb-3 text-ui text-fg-muted">{{ 'people.handover.noAssets' | transloco }}</p>
            }
            <h3 class="mb-1 text-meta font-semibold text-fg-subtle uppercase">
              {{ 'people.handover.access' | transloco }}
            </h3>
            @if (h.access.length) {
              <ul class="divide-y divide-border" data-testid="handover-access">
                @for (x of h.access; track x.id) {
                  <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                    <a [routerLink]="x.url" class="min-w-0 flex-1 text-fg hover:underline">
                      {{ x.system ?? x.review.title }}
                      @if (x.account) {
                        <span class="text-meta text-fg-muted">({{ x.account }})</span>
                      }
                    </a>
                    <span class="font-mono text-meta text-fg-subtle">{{ x.review.code }}</span>
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="x.removed ? 'done' : 'open'"
                      [labelKey]="
                        x.removed ? 'people.handover.removed' : 'people.handover.notRemoved'
                      "
                    />
                  </li>
                }
              </ul>
            } @else {
              <p class="text-ui text-fg-muted">{{ 'people.handover.noAccess' | transloco }}</p>
            }
          }
        }
      }
    </section>
  `,
})
export class EmployeeHandoverSection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly employeeId = input.required<string>();
  readonly refresh = input(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<EmployeeHandover | null>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.employeeId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.employeeId());
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.handover(orgId, id).subscribe({
      next: (data) => {
        this.data.set(data);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
