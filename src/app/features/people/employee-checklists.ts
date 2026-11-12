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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { PeopleApi } from './data/people-api';
import { checklistStatusTone, textOrNull } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { CHECKLIST_KINDS, Checklist, ChecklistCreate, ChecklistKind } from './data/people.models';

interface StartDraft {
  readonly kind: ChecklistKind;
  readonly title: string;
  readonly due_date: string;
  readonly assignee: string;
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
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    FieldHelp,
    AssigneeSelect,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
    ProgressBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-cl-h" id="checklists">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-cl-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'people.checklists.employeeTitle' | transloco }}
        </h2>
        @if (canEdit()) {
          <div class="flex flex-wrap gap-2">
            @for (k of kinds; track k) {
              <app-button
                size="sm"
                variant="secondary"
                (click)="openStart(k)"
                [attr.data-testid]="'start-' + k"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'people.checklists.start.' + k | transloco }}
              </app-button>
            }
          </div>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <p class="py-4 text-[13px] text-fg-muted" role="status">
            {{ 'people.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-4 text-[13px] text-fail" role="alert">
            {{ 'people.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (items().length === 0) {
            <p class="py-3 text-[13px] text-fg-muted">
              {{ 'people.checklists.employeeEmpty' | transloco }}
            </p>
          } @else {
            <ul class="divide-y divide-border" data-testid="employee-checklists">
              @for (c of items(); track c.id) {
                <li class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/people/checklists', c.id]"
                      class="text-[13.5px] font-semibold text-fg hover:underline"
                      >{{ c.title }}</a
                    >
                    <p class="text-[12px] text-fg-subtle">
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
                    <p class="mt-1 text-[11.5px] text-fg-subtle">
                      {{
                        'people.checklists.progress'
                          | transloco: { done: c.items_done, total: c.items_total }
                      }}
                    </p>
                  </div>
                  <app-badge [tone]="tone(c.status)">{{
                    'people.checklistStatus.' + c.status | transloco
                  }}</app-badge>
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
      initialFocus="#cf-cl-due"
      (confirmed)="start()"
      (cancelled)="draft.set(null)"
    >
      @if (draft(); as d) {
        <div class="mt-4 flex flex-col gap-3">
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
            <input
              id="cf-cl-due"
              type="date"
              [value]="d.due_date"
              (change)="patch({ due_date: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'people.fields.assignee' | transloco" inputId="cf-cl-assignee">
            <app-assignee-select
              inputId="cf-cl-assignee"
              [value]="d.assignee"
              (valueChange)="patch({ assignee: $event })"
            />
          </app-form-field>
          <app-field-help scope="people" page="detail" field="checklist_assignee" />
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
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly kinds = CHECKLIST_KINDS;
  protected readonly tone = checklistStatusTone;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Checklist[]>([]);
  protected readonly draft = signal<StartDraft | null>(null);
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

  protected openStart(kind: ChecklistKind): void {
    this.draft.set({ kind, title: '', due_date: '', assignee: '' });
  }

  protected patch(patch: Partial<StartDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected start(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || this.busy()) {
      return;
    }
    const body: ChecklistCreate = {
      kind: d.kind,
      title: textOrNull(d.title) ?? undefined,
      due_date: d.due_date || undefined,
      assignee: assigneeFromValue(d.assignee),
    };
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
