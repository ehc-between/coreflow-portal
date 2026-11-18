import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PeopleApi } from './data/people-api';
import { cellLook } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { EmployeeCompetences, HeldCompetence } from './data/people.models';
import { AssessDialog, AssessTarget } from './ui/assess-dialog';
import { GapActionDialog, GapTarget } from './ui/gap-action-dialog';
import { GapActions } from './ui/gap-actions';

/** Whether a row is a gap that can be acted on (below the level, missing or expired). */
export function isGap(row: HeldCompetence): boolean {
  return row.status === 'gap' || row.status === 'missing' || row.status === 'expired';
}

/**
 * The competences of one person: what their position requires and what they hold,
 * each with its status. For every gap the person's page offers "Lukk gapet" (assign
 * a course, create a task or plan a new assessment) and shows the open actions until
 * a new assessment proves they worked (HS 7.2 c). Each assessment shows how it was
 * made, by whom and the training record it rests on (HS 7.2 d).
 */
@Component({
  selector: 'app-people-employee-competences',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    ConfirmDialog,
    ErrorState,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    StatusBadge,
    AssessDialog,
    GapActionDialog,
    GapActions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-comp-h" id="competences">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-comp-h" class="text-card font-bold text-fg">
          {{ 'people.competences.heldTitle' | transloco }}
        </h2>
        @if (canEdit()) {
          <app-button
            size="sm"
            variant="secondary"
            (click)="openAssess(null)"
            data-testid="assess-new"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'people.competences.assess' | transloco }}
          </app-button>
        }
      </div>
      <p class="mb-3 text-meta text-fg-muted">
        {{ 'people.competences.heldSubtitle' | transloco }}
      </p>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (data(); as d) {
            @if (!d.position_id) {
              <p class="mb-2 text-meta text-fg-muted">
                {{ 'people.competences.noPosition' | transloco }}
              </p>
            }
            @if (d.items.length === 0) {
              <p class="py-3 text-ui text-fg-muted" data-testid="competences-empty">
                {{ 'people.competences.heldEmpty' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="held-rows">
                @for (row of d.items; track row.competence_id) {
                  <li class="py-2.5" [attr.data-testid]="'held-' + row.competence_id">
                    <div class="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                      <div class="min-w-0 flex-1">
                        <p class="flex flex-wrap items-center gap-1.5">
                          <a
                            [routerLink]="['/people/competences', row.competence_id]"
                            class="text-body font-semibold text-fg hover:underline"
                            >{{ row.competence_name }}</a
                          >
                          @if (row.mandatory && row.required_level !== null) {
                            <app-badge tone="neutral">{{
                              'people.competences.mandatory' | transloco
                            }}</app-badge>
                          }
                        </p>
                        <p
                          class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-fg-muted"
                        >
                          <span>
                            {{ 'people.competences.levelShort' | transloco }}
                            <span
                              class="font-semibold text-fg"
                              [title]="
                                row.level !== null ? ('people.levels.' + row.level | transloco) : ''
                              "
                              >{{ row.level ?? '–' }}</span
                            >
                            @if (row.required_level !== null) {
                              {{
                                'people.competences.ofRequired'
                                  | transloco: { level: row.required_level }
                              }}
                            }
                          </span>
                          @if (row.assessed_on) {
                            <span>
                              {{
                                'people.competences.assessedOn'
                                  | transloco: { date: (row.assessed_on | localDay) }
                              }}
                              @if (row.method) {
                                · {{ 'people.methods.' + row.method | transloco }}
                              }
                              @if (row.assessed_by?.name; as by) {
                                · {{ 'people.competences.assessedBy' | transloco: { name: by } }}
                              }
                            </span>
                          }
                          @if (row.expires_on) {
                            <span>{{
                              'people.competences.expires'
                                | transloco: { date: (row.expires_on | localDay) }
                            }}</span>
                          }
                          @if (row.training_record; as tr) {
                            <a [routerLink]="tr.url" class="text-accent hover:underline">
                              {{
                                'people.competences.basedOn'
                                  | transloco: { course: tr.course_code ?? '' }
                              }}
                            </a>
                          }
                        </p>
                        @if (row.evidence_note) {
                          <p class="mt-0.5 text-meta text-fg-subtle">{{ row.evidence_note }}</p>
                        }
                      </div>
                      <span class="flex items-center gap-1.5">
                        <app-status-badge
                          [meaning]="look(row.status).meaning"
                          [value]="look(row.status).value"
                          [labelKey]="'people.cellStatus.' + row.status"
                        />
                        @if (canEdit() && isGap(row) && !(row.actions ?? []).length) {
                          <app-button
                            size="sm"
                            variant="secondary"
                            (click)="openGap(row)"
                            [attr.data-testid]="'close-gap-' + row.competence_id"
                          >
                            {{ 'people.gapActions.open' | transloco }}
                          </app-button>
                        }
                        @if (canEdit()) {
                          <app-overflow-menu
                            [iconOnly]="true"
                            labelKey="people.competences.rowMenu"
                            [attr.data-testid]="'row-menu-' + row.competence_id"
                          >
                            <button appMenuItem type="button" (click)="openAssess(row)">
                              {{ 'people.competences.assess' | transloco }}
                            </button>
                            @if (isGap(row)) {
                              <button appMenuItem type="button" (click)="openGap(row)">
                                {{ 'people.gapActions.open' | transloco }}
                              </button>
                            }
                            @if (row.level !== null) {
                              <button
                                appMenuItem
                                type="button"
                                [danger]="true"
                                (click)="removing.set(row)"
                              >
                                {{ 'people.competences.remove' | transloco }}
                              </button>
                            }
                          </app-overflow-menu>
                        }
                      </span>
                    </div>
                    <app-people-gap-actions
                      [actions]="row.actions ?? []"
                      [canEdit]="canEdit()"
                      (changed)="reload(); changed.emit()"
                    />
                  </li>
                }
              </ul>
            }
          }
        }
      }
    </section>

    <app-people-assess-dialog
      [target]="assessing()"
      [listed]="data()?.items ?? []"
      (saved)="onAssessed($event)"
      (closed)="assessing.set(null)"
    />

    <app-people-gap-action-dialog
      [target]="closingGap()"
      (created)="onGapAction()"
      (closed)="closingGap.set(null)"
    />

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'people.competences.removeTitle' | transloco"
      [message]="
        'people.competences.removeMessage' | transloco: { name: removing()?.competence_name ?? '' }
      "
      [confirmLabel]="'people.competences.remove' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class EmployeeCompetencesSection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly employeeId = input.required<string>();
  readonly employeeName = input('');
  /** Whether the person has a user account (training reaches users). */
  readonly hasUser = input(false);
  readonly canEdit = input(false);
  /** Bumped by the page to force a reload (e.g. after the position changed). */
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly look = cellLook;
  protected readonly isGap = isGap;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<EmployeeCompetences | null>(null);
  protected readonly assessing = signal<AssessTarget | null>(null);
  protected readonly closingGap = signal<GapTarget | null>(null);
  protected readonly removing = signal<HeldCompetence | null>(null);
  protected readonly busy = signal(false);

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

  /** Opened from the page (e.g. "Registrer vurdering" in the compliance card). */
  openAssess(row: HeldCompetence | null): void {
    this.assessing.set({
      employeeId: this.employeeId(),
      employeeName: this.employeeName(),
      row,
    });
  }

  protected openGap(row: HeldCompetence): void {
    this.closingGap.set({
      employeeId: this.employeeId(),
      employeeName: this.employeeName(),
      competenceId: row.competence_id,
      competenceName: row.competence_name,
      hasUser: this.hasUser(),
    });
  }

  protected onAssessed(data: EmployeeCompetences): void {
    this.assessing.set(null);
    this.data.set(data);
    this.changed.emit();
  }

  protected onGapAction(): void {
    this.closingGap.set(null);
    this.reload();
    this.changed.emit();
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.employeeId());
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const row = this.removing();
    if (!orgId || !row || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeCompetence(orgId, this.employeeId(), row.competence_id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.success('people.notices.competenceRemoved');
        this.reload();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.data()) {
      this.state.set('loading');
    }
    this.request = this.api.employeeCompetences(orgId, id).subscribe({
      next: (data) => {
        this.data.set(data);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
