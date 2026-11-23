import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PeopleApi } from './data/people-api';
import { textOrNull } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { Checklist, ChecklistCreate, ChecklistKind } from './data/people.models';
import { DateInput } from '../../shared/ui/date-input/date-input';

export interface StartDraft {
  readonly kind: ChecklistKind;
  readonly title: string;
  readonly due_date: string;
  /** The last working day; offboarding only (access is revoked on this day). */
  readonly end_date: string;
  readonly assignee: string;
}

/** Whether the start dialog can be confirmed: offboarding needs a last working day. */
export function startDraftValid(draft: StartDraft): boolean {
  return draft.kind !== 'offboarding' || draft.end_date !== '';
}

/** The `POST .../checklists` body for a start dialog draft. */
export function toChecklistCreate(draft: StartDraft): ChecklistCreate {
  return {
    kind: draft.kind,
    title: textOrNull(draft.title) ?? undefined,
    due_date: draft.due_date || undefined,
    end_date: draft.kind === 'offboarding' && draft.end_date ? draft.end_date : undefined,
    assignee: assigneeFromValue(draft.assignee),
  };
}

/** `user:<id>` / `role:<key>` / `department:<id>` -> the checklist `assignee` body. */
export function assigneeFromValue(value: string): ChecklistCreate['assignee'] {
  const at = value.indexOf(':');
  if (at <= 0) {
    return undefined;
  }
  const type = value.slice(0, at);
  if (type !== 'user' && type !== 'role' && type !== 'department') {
    return undefined;
  }
  return { type, value: value.slice(at + 1) };
}

/**
 * The onboarding and offboarding checklists of one employee, with progress, and a
 * dialog to start one from the default template (assigned as a platform task).
 */
@Component({
  selector: 'app-people-employee-checklists',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    FieldHelp,
    AssigneeSelect,
    Button,
    ErrorState,
    LoadingState,
    StatusBadge,
    ConfirmDialog,
    FormField,
    Icon,
    ProgressBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-cl-h" id="checklists">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-cl-h" class="text-card font-bold text-fg">
          {{ 'people.checklists.employeeTitle' | transloco }}
        </h2>
        @if (canEdit() && !hasOpen('onboarding') && !items().length) {
          <app-button
            size="sm"
            variant="secondary"
            (click)="openStart('onboarding')"
            data-testid="start-onboarding-inline"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'people.checklists.start.onboarding' | transloco }}
          </app-button>
        }
      </div>
      <p class="mb-3 text-meta text-fg-muted">
        {{ 'people.checklists.employeeSubtitle' | transloco }}
      </p>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (items().length === 0) {
            <p class="py-3 text-ui text-fg-muted">
              {{ 'people.checklists.employeeEmpty' | transloco }}
            </p>
          } @else {
            <ul class="divide-y divide-border" data-testid="employee-checklists">
              @for (c of items(); track c.id) {
                <li class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/people/checklists', c.id]"
                      class="text-body font-semibold text-fg hover:underline"
                      >{{ c.title }}</a
                    >
                    <p class="text-meta text-fg-muted">
                      {{ 'people.checklistKinds.' + c.kind | transloco }}
                      @if (c.due_date) {
                        ·
                        {{ 'people.checklists.due' | transloco: { date: (c.due_date | localDay) } }}
                      }
                    </p>
                  </div>
                  <div class="w-full sm:w-[160px]">
                    <app-progress-bar
                      [value]="c.items_total ? (c.items_done / c.items_total) * 100 : 0"
                      [label]="
                        'people.checklists.progress'
                          | transloco: { done: c.items_done, total: c.items_total }
                      "
                    />
                    <p class="mt-1 text-meta text-fg-subtle">
                      {{
                        'people.checklists.progress'
                          | transloco: { done: c.items_done, total: c.items_total }
                      }}
                    </p>
                  </div>
                  <app-status-badge
                    meaning="lifecycle"
                    [value]="c.status"
                    [labelKey]="'people.checklistStatus.' + c.status"
                  />
                </li>
              }
            </ul>
          }
        }
      }
    </section>

    <app-confirm-dialog
      [open]="draft() !== null"
      [title]="'people.checklists.start.' + (draft()?.kind ?? 'onboarding') | transloco"
      [message]="'people.checklists.startMessage' | transloco"
      [confirmLabel]="'people.checklists.startConfirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!draftValid()"
      [initialFocus]="draft()?.kind === 'offboarding' ? '#cf-cl-end' : '#cf-cl-due'"
      (confirmed)="start()"
      (cancelled)="draft.set(null)"
    >
      @if (draft(); as d) {
        <div class="mt-4 flex flex-col gap-4">
          @if (d.kind === 'offboarding') {
            <app-form-field
              [label]="'people.checklists.lastWorkingDay' | transloco"
              inputId="cf-cl-end"
              [hint]="'people.checklists.lastWorkingDayHint' | transloco"
            >
              <app-date-input
                inputId="cf-cl-end"
                [required]="true"
                [value]="d.end_date"
                (valueChange)="patch({ end_date: $event ?? '' })"
                data-testid="start-end-date"
              />
            </app-form-field>
          }
          <app-form-field
            [label]="'people.fields.checklistTitle' | transloco"
            inputId="cf-cl-title"
          >
            <input
              id="cf-cl-title"
              type="text"
              maxlength="255"
              [placeholder]="'people.checklists.titlePlaceholder' | transloco"
              [value]="d.title"
              (input)="patch({ title: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'people.fields.dueDate' | transloco" inputId="cf-cl-due">
            <app-date-input
              inputId="cf-cl-due"
              [value]="d.due_date"
              (valueChange)="patch({ due_date: $event ?? '' })"
            />
          </app-form-field>
          <app-form-field [label]="'people.fields.assignee' | transloco" inputId="cf-cl-assignee">
            <app-field-help
              label-suffix
              scope="people"
              page="detail"
              field="checklist_assignee"
              [label]="'people.fields.assignee' | transloco"
            />
            <app-assignee-select
              inputId="cf-cl-assignee"
              [value]="d.assignee"
              (valueChange)="patch({ assignee: $event })"
            />
          </app-form-field>
          @if (d.kind === 'offboarding') {
            <p class="text-meta text-fg-muted">
              {{ 'people.checklists.offboardingHint' | transloco }}
            </p>
          }
        </div>
      }
    </app-confirm-dialog>
  `,
})
export class EmployeeChecklistsSection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly employeeId = input.required<string>();
  readonly canEdit = input(false);
  /** The employee's current end date, prefilled as the last working day of an offboarding. */
  readonly endDate = input<string | null>(null);
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Checklist[]>([]);
  protected readonly draft = signal<StartDraft | null>(null);
  protected readonly busy = signal(false);
  protected readonly draftValid = computed(() => {
    const d = this.draft();
    return d !== null && startDraftValid(d);
  });

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

  /** Whether an open checklist of that kind exists. */
  protected hasOpen(kind: ChecklistKind): boolean {
    return this.items().some((c) => c.kind === kind && c.status === 'open');
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.employeeId());
  }

  /** Opened from the page header ("Start oppstart" / "Start avslutning"). */
  openStart(kind: ChecklistKind): void {
    this.draft.set({
      kind,
      title: '',
      due_date: '',
      end_date: kind === 'offboarding' ? (this.endDate() ?? '') : '',
      assignee: '',
    });
  }

  protected patch(patch: Partial<StartDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected start(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || this.busy() || !startDraftValid(d)) {
      return;
    }
    const body = toChecklistCreate(d);
    this.busy.set(true);
    this.api.startChecklist(orgId, this.employeeId(), body).subscribe({
      next: (checklist) => {
        this.busy.set(false);
        this.draft.set(null);
        this.notifications.success('people.notices.checklistStarted');
        this.changed.emit();
        void this.router.navigate(['/people/checklists', checklist.id]);
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
    this.request = this.api.listChecklists(orgId, { employee_id: id, limit: 50 }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
