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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import { RuleSummary } from '../../../shared/tasks/rule-summary';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { InspectionsTabs } from '../components/inspections-tabs';
import { RefSelect } from '../components/ref-select';
import { dateInputToIso, isoToDateInput } from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences, NamedRef } from '../data/inspection-references';
import { INSPECTIONS_MODULE, Schedule, ScheduleFields } from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

const PAGE_SIZE = 25;

export interface ScheduleForm {
  readonly templateId: string;
  readonly title: string;
  readonly location: string;
  readonly rrule: string;
  readonly startDate: string;
  readonly leadDays: number;
  readonly inspectorId: string;
  readonly ownerId: string;
  readonly departmentId: string;
  readonly active: boolean;
}

export const EMPTY_SCHEDULE_FORM: ScheduleForm = {
  templateId: '',
  title: '',
  location: '',
  rrule: 'FREQ=MONTHLY',
  startDate: '',
  leadDays: 7,
  inspectorId: '',
  ownerId: '',
  departmentId: '',
  active: true,
};

export function formFromSchedule(s: Schedule): ScheduleForm {
  return {
    templateId: s.template?.id ?? '',
    title: s.title ?? '',
    location: s.location ?? '',
    rrule: s.rrule,
    startDate: isoToDateInput(s.dtstart),
    leadDays: s.lead_days,
    inspectorId: s.inspector?.id ?? '',
    ownerId: s.owner?.id ?? '',
    departmentId: s.department_id ?? '',
    active: s.active,
  };
}

export function toScheduleFields(f: ScheduleForm): ScheduleFields {
  return {
    rrule: f.rrule,
    dtstart: dateInputToIso(f.startDate) ?? '',
    lead_days: Math.max(0, Math.min(366, Math.round(f.leadDays))),
    title: f.title.trim() || null,
    location: f.location.trim() || null,
    inspector_user_id: f.inspectorId || null,
    owner_user_id: f.ownerId || null,
    department_id: f.departmentId || null,
    active: f.active,
  };
}

/**
 * Recurring inspections (`/inspections/schedules`): each schedule plans the next
 * inspection from an active template on its recurrence (at most one open at a time,
 * created `lead_days` before it is due). Everyone with `inspections:read` sees them;
 * managers (`inspections:manage`) create, change, pause and delete them.
 * `?template=<id>&new=1` opens the form for a template.
 */
@Component({
  selector: 'app-schedules-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    LocalDayPipe,
    RecurrencePicker,
    RuleSummary,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    Pager,
    SlideOver,
    InspectionsTabs,
    RefSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'inspections.schedules.title' | transloco }}
          </h1>
          <p class="mt-1.5 max-w-[680px] text-[14px] text-fg-muted">
            {{ 'inspections.schedules.subtitle' | transloco }}
          </p>
          <app-inspections-tabs active="schedules" />
        </div>
        @if (canManage()) {
          <app-button (click)="openNew()" data-testid="new-schedule">
            <app-icon name="plus" [size]="15" />
            {{ 'inspections.schedules.new' | transloco }}
          </app-button>
        }
      </div>

      <app-guide-intro class="mb-3 block" scope="inspections" page="schedules" />

      @if (loaded() && total() === 0) {
        <app-card>
          <app-teaching-empty
            scope="inspections"
            page="schedules"
            [showAction]="canManage()"
            (action)="openNew()"
          />
        </app-card>
      } @else {
        <app-card [padded]="false">
          @if (!loaded()) {
            <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
              {{ 'common.loading' | transloco }}
            </p>
          } @else {
            <ul data-testid="schedule-rows">
              @for (s of items(); track s.id) {
                <li
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <span class="min-w-0 flex-1 basis-[220px]">
                    <span class="block truncate font-semibold text-fg">
                      {{ s.title || s.template?.title }}
                    </span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      @if (s.template; as t) {
                        <a [routerLink]="['/inspections/templates', t.id]" class="hover:underline">
                          {{ t.code }} · {{ t.title }}
                        </a>
                      }
                      @if (s.location) {
                        · {{ s.location }}
                      }
                    </span>
                    <span class="block text-[12.5px] text-fg-muted">
                      <app-rule-summary [rrule]="s.rrule" />
                    </span>
                  </span>
                  <app-badge [tone]="s.active ? 'pass' : 'neutral'">{{
                    (s.active ? 'inspections.schedules.active' : 'inspections.schedules.paused')
                      | transloco
                  }}</app-badge>
                  <span class="w-[150px] flex-none text-[12.5px] text-fg-subtle">
                    @if (s.next_due_at) {
                      {{
                        'inspections.schedules.nextDue'
                          | transloco: { date: (s.next_due_at | localDay) }
                      }}
                    } @else {
                      {{ 'inspections.schedules.noNext' | transloco }}
                    }
                  </span>
                  @if (s.open_inspection_id) {
                    <a
                      [routerLink]="['/inspections', s.open_inspection_id]"
                      class="text-[12.5px] font-semibold text-accent hover:underline"
                    >
                      {{ 'inspections.schedules.openInspection' | transloco }}
                    </a>
                  }
                  @if (canManage()) {
                    <span class="flex gap-1">
                      <app-button variant="ghost" size="sm" (click)="openEdit(s)">
                        {{ 'inspections.actions.edit' | transloco }}
                      </app-button>
                      <app-button
                        variant="ghost"
                        size="sm"
                        (click)="toDelete.set(s)"
                        [attr.aria-label]="'inspections.schedules.delete' | transloco"
                      >
                        <app-icon name="trash" [size]="14" />
                      </app-button>
                    </span>
                  }
                </li>
              }
            </ul>
          }
        </app-card>
        <div class="mt-3">
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="items().length"
            [total]="total()"
            (pageChange)="offset.set($event)"
          />
        </div>
      }
      <app-why-it-matters class="mt-5 block" scope="inspections" page="schedules" />
    </div>

    <app-slide-over
      [open]="formOpen()"
      [title]="
        (editing() ? 'inspections.schedules.editTitle' : 'inspections.schedules.newTitle')
          | transloco
      "
      [closeLabel]="'inspections.actions.close' | transloco"
      [width]="560"
      (closed)="formOpen.set(false)"
    >
      @if (formOpen()) {
        <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); save()">
          @if (!editing()) {
            <app-form-field
              [label]="'inspections.fields.template' | transloco"
              inputId="sf-template"
            >
              <app-ref-select
                inputId="sf-template"
                [options]="templateOptions()"
                [value]="form().templateId"
                [noneLabel]="'inspections.form.chooseTemplate' | transloco"
                (valueChange)="set('templateId', $event)"
              />
            </app-form-field>
          }
          <app-form-field [label]="'inspections.fields.title' | transloco" inputId="sf-title">
            <input
              id="sf-title"
              maxlength="255"
              [value]="form().title"
              (input)="set('title', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'inspections.fields.location' | transloco" inputId="sf-location">
            <input
              id="sf-location"
              maxlength="255"
              [value]="form().location"
              (input)="set('location', $any($event.target).value)"
            />
          </app-form-field>
          <app-recurrence-picker [rrule]="form().rrule" (rruleChange)="set('rrule', $event)" />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field [label]="'inspections.schedules.start' | transloco" inputId="sf-start">
              <input
                id="sf-start"
                type="date"
                required
                [value]="form().startDate"
                (input)="set('startDate', $any($event.target).value)"
              />
            </app-form-field>
            <div>
              <app-form-field
                [label]="'inspections.schedules.leadDays' | transloco"
                inputId="sf-lead"
              >
                <input
                  id="sf-lead"
                  type="number"
                  min="0"
                  max="366"
                  [value]="form().leadDays"
                  (change)="set('leadDays', toInt($any($event.target).value))"
                />
              </app-form-field>
              <app-field-help scope="inspections" page="schedules" field="leadDays" />
            </div>
            <app-form-field
              [label]="'inspections.fields.inspector' | transloco"
              inputId="sf-inspector"
            >
              <app-ref-select
                inputId="sf-inspector"
                [options]="references.users()"
                [value]="form().inspectorId"
                [currentName]="editing()?.inspector?.name ?? null"
                [noneLabel]="'inspections.form.anyInspector' | transloco"
                (valueChange)="set('inspectorId', $event)"
              />
            </app-form-field>
            <app-form-field [label]="'inspections.fields.owner' | transloco" inputId="sf-owner">
              <app-ref-select
                inputId="sf-owner"
                [options]="references.users()"
                [value]="form().ownerId"
                [currentName]="editing()?.owner?.name ?? null"
                [noneLabel]="'inspections.form.noOwner' | transloco"
                (valueChange)="set('ownerId', $event)"
              />
            </app-form-field>
            <app-form-field [label]="'inspections.fields.department' | transloco" inputId="sf-dept">
              <app-ref-select
                inputId="sf-dept"
                [options]="references.departments()"
                [value]="form().departmentId"
                [noneLabel]="'inspections.form.noDepartment' | transloco"
                (valueChange)="set('departmentId', $event)"
              />
            </app-form-field>
          </div>
          <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="form().active"
              (change)="set('active', $any($event.target).checked)"
            />
            {{ 'inspections.schedules.activeLabel' | transloco }}
          </label>
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" (click)="formOpen.set(false)">
              {{ 'inspections.actions.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="!formValid()"
              data-testid="save-schedule"
            >
              {{ 'inspections.actions.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!toDelete()"
      [title]="'inspections.schedules.deleteTitle' | transloco"
      [message]="'inspections.schedules.deleteMessage' | transloco"
      [confirmLabel]="'inspections.actions.delete' | transloco"
      [cancelLabel]="'inspections.actions.cancel' | transloco"
      [busy]="saving()"
      (confirmed)="remove()"
      (cancelled)="toDelete.set(null)"
    />
  `,
})
export class SchedulesList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly references = inject(InspectionReferences);

  /** `?template=<id>` preselects a template; `?new=1` opens the form. */
  readonly template = input<string | undefined>(undefined);
  readonly new = input<string | undefined>(undefined);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly items = signal<readonly Schedule[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly loaded = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Schedule | null>(null);
  protected readonly form = signal<ScheduleForm>(EMPTY_SCHEDULE_FORM);
  protected readonly saving = signal(false);
  protected readonly toDelete = signal<Schedule | null>(null);

  protected readonly canManage = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('inspections:manage') ?? false,
  );

  protected readonly templateOptions = computed<NamedRef[]>(() =>
    this.references.activeTemplates().map((t) => ({ id: t.id, name: `${t.code} · ${t.title}` })),
  );

  protected readonly formValid = computed(() => {
    const f = this.form();
    return (!!this.editing() || !!f.templateId) && !!dateInputToIso(f.startDate) && !!f.rrule;
  });

  constructor() {
    providePageContext(() => ({ module: INSPECTIONS_MODULE, view: 'list' }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const offset = this.offset();
      if (orgId) {
        untracked(() => this.load(orgId, offset));
      }
    });

    effect(() => {
      const template = this.template();
      const open = this.new();
      if (open && this.canManage()) {
        untracked(() => {
          this.openNew();
          if (template) {
            this.set('templateId', template);
          }
        });
      }
    });
  }

  private load(orgId: string, offset: number): void {
    this.api.listSchedules(orgId, { limit: PAGE_SIZE, offset }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  protected set<K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected toInt(raw: string): number {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 7;
  }

  protected openNew(): void {
    this.references.ensurePeople();
    this.references.ensureTemplates();
    this.editing.set(null);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.form.set({
      ...EMPTY_SCHEDULE_FORM,
      startDate: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    });
    this.formOpen.set(true);
  }

  protected openEdit(s: Schedule): void {
    this.references.ensurePeople();
    this.editing.set(s);
    this.form.set(formFromSchedule(s));
    this.formOpen.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.formValid() || this.saving()) {
      return;
    }
    const fields = toScheduleFields(this.form());
    const editing = this.editing();
    this.saving.set(true);
    const call = editing
      ? this.api.updateSchedule(orgId, editing.id, fields)
      : this.api.createSchedule(orgId, { ...fields, template_id: this.form().templateId });
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.notifications.success('inspections.notices.scheduleSaved');
        this.load(orgId, this.offset());
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.toDelete();
    if (!orgId || !s) {
      return;
    }
    this.saving.set(true);
    this.api.deleteSchedule(orgId, s.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.toDelete.set(null);
        this.notifications.success('inspections.notices.scheduleDeleted');
        this.load(orgId, this.offset());
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
