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
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import { RuleSummary } from '../../../shared/tasks/rule-summary';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RefSelect } from '../components/ref-select';
import { NO_SUBJECT, SubjectPicker, SubjectValue } from '../components/subject-picker';
import {
  INSPECTIONS_NAV,
  INSPECTIONS_SETTINGS_LINK,
  dateInputToIso,
  isoToDateInput,
  subjectTypeKey,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences, NamedRef } from '../data/inspection-references';
import {
  INSPECTIONS_MODULE,
  Schedule,
  ScheduleFields,
  SubjectType,
} from '../data/inspection.models';
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
  readonly subject: SubjectValue;
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
  subject: NO_SUBJECT,
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
    subject: {
      type: s.subject_type ?? null,
      id: s.subject_id ?? null,
      title: null,
    },
  };
}

export function toScheduleFields(f: ScheduleForm): ScheduleFields {
  const subject = f.subject.type && f.subject.id ? f.subject : null;
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
    subject_type: subject?.type ?? null,
    subject_id: subject?.id ?? null,
  };
}

/**
 * Recurring inspections (`/inspections/schedules`, "Faste inspeksjoner"): each one
 * creates the next inspection from an active checklist on its rhythm (one open at a
 * time, a set number of days before it is due), so routine checks are never
 * forgotten. Rows show the checklist, place and subject, the rhythm in words,
 * whether it is running, the next due date and the open inspection. Everyone with
 * `inspections:read` sees them; managers (`inspections:manage`) create, change,
 * pause and delete them. `?template=<id>&new=1` opens the form for a template.
 */
@Component({
  selector: 'app-schedules-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    TeachingEmpty,
    WhyItMatters,
    LocalDayPipe,
    RecurrencePicker,
    RuleSummary,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    Pager,
    SlideOver,
    StatusBadge,
    RefSelect,
    SubjectPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="inspections.schedules.title"
        descriptionKey="inspections.schedules.subtitle"
        [breadcrumbs]="breadcrumbs"
        [settingsLink]="settingsLink"
      >
        @if (canManage()) {
          <app-button primary (click)="openNew()" data-testid="new-schedule">
            <app-icon name="plus" [size]="15" />
            {{ 'inspections.schedules.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-module-nav class="mb-4 block" labelKey="modules.names.inspections" [items]="nav" />
      <app-help-strip scope="inspections" page="schedules" lesson="inspection-basics" />

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (!loaded()) {
        <app-loading-state [rows]="4" />
      } @else if (total() === 0) {
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
          <ul data-testid="schedule-rows">
            @for (s of items(); track s.id) {
              <li
                class="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
              >
                <div class="min-w-0 sm:flex-1 sm:basis-[260px]">
                  <p class="truncate text-body font-semibold text-fg">
                    {{ s.title || s.template?.title }}
                  </p>
                  <p class="truncate text-meta text-fg-muted">
                    @if (s.template; as t) {
                      <a
                        [routerLink]="['/settings/modules/inspections/templates', t.id]"
                        class="hover:underline"
                        >{{ t.title }}</a
                      >
                    }
                    @if (s.location) {
                      · {{ s.location }}
                    }
                    @if (s.subject_type) {
                      · {{ subjectTypeKey(s.subject_type) | transloco }}
                    }
                  </p>
                  <p class="text-meta text-fg-muted">
                    <app-rule-summary [rrule]="s.rrule" />
                    @if (s.inspector?.name; as name) {
                      · {{ 'inspections.schedules.inspector' | transloco: { name } }}
                    }
                  </p>
                </div>
                <app-status-badge
                  meaning="lifecycle"
                  [value]="s.active ? 'active' : 'on_hold'"
                  [labelKey]="
                    s.active ? 'inspections.schedules.active' : 'inspections.schedules.paused'
                  "
                />
                <span class="text-meta text-fg-muted sm:w-[160px] sm:flex-none">
                  @if (s.next_due_at) {
                    {{
                      'inspections.schedules.nextDue'
                        | transloco: { date: (s.next_due_at | localDay) }
                    }}
                  } @else {
                    {{ 'inspections.schedules.noNext' | transloco }}
                  }
                </span>
                <span class="flex flex-wrap items-center gap-1 sm:flex-none">
                  @if (s.open_inspection_id) {
                    <a
                      [routerLink]="['/inspections', s.open_inspection_id]"
                      class="inline-flex min-h-8 items-center px-2 text-meta font-semibold text-accent hover:underline"
                    >
                      {{ 'inspections.schedules.openInspection' | transloco }}
                    </a>
                  }
                  <a
                    [routerLink]="['/inspections']"
                    [queryParams]="{ template: s.template?.id }"
                    class="inline-flex min-h-8 items-center px-2 text-meta font-semibold text-accent hover:underline"
                  >
                    {{ 'inspections.schedules.history' | transloco }}
                  </a>
                  @if (canManage()) {
                    <app-button variant="ghost" size="sm" (click)="openEdit(s)">
                      {{ 'inspections.actions.edit' | transloco }}
                    </app-button>
                    <app-button
                      variant="ghost"
                      size="sm"
                      (click)="toDelete.set(s)"
                      [attr.aria-label]="
                        'inspections.schedules.deleteNamed'
                          | transloco: { name: s.title || s.template?.title }
                      "
                    >
                      <app-icon name="trash" [size]="14" />
                    </app-button>
                  }
                </span>
              </li>
            }
          </ul>
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
      <div class="mt-8"><app-why-it-matters scope="inspections" page="schedules" /></div>
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
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
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
              [placeholder]="'inspections.schedules.titlePlaceholder' | transloco"
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
          <app-form-field [label]="'inspections.subject.label' | transloco" inputId="sf-subject">
            <app-subject-picker
              inputId="sf-subject"
              [value]="form().subject"
              (valueChange)="set('subject', $event)"
            />
          </app-form-field>
          <app-recurrence-picker [rrule]="form().rrule" (rruleChange)="set('rrule', $event)" />
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  aria-describedby="sf-lead-hint"
                  (change)="set('leadDays', toInt($any($event.target).value))"
                />
              </app-form-field>
              <p id="sf-lead-hint" class="mt-1 text-meta text-fg-muted">
                {{ 'inspections.schedules.leadDaysHint' | transloco: { count: form().leadDays } }}
              </p>
            </div>
            <div>
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
            </div>
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
          <p class="text-meta text-fg-muted">{{ 'inspections.form.rolesHint' | transloco }}</p>
          <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="form().active"
              (change)="set('active', $any($event.target).checked)"
            />
            {{ 'inspections.schedules.activeLabel' | transloco }}
          </label>
          <app-field-help scope="inspections" page="schedules" field="leadDays" />
          <div
            class="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-bg py-3 sm:static"
          >
            <app-button variant="secondary" (click)="formOpen.set(false)">
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
  private readonly language = inject(LanguageService);
  protected readonly references = inject(InspectionReferences);

  /** `?template=<id>` preselects a template; `?new=1` opens the form. */
  readonly template = input<string | undefined>(undefined);
  readonly new = input<string | undefined>(undefined);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly nav = INSPECTIONS_NAV;
  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly subjectTypeKey = subjectTypeKey;
  protected readonly breadcrumbs = [
    { labelKey: 'modules.names.inspections', link: '/inspections' },
    { labelKey: 'inspections.schedules.title' },
  ];
  protected readonly items = signal<readonly Schedule[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal(false);
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
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: 'inspection_schedule',
      view: 'list',
      title: this.language.translate('inspections.schedules.title'),
    }));

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
    this.error.set(false);
    this.api.listSchedules(orgId, { limit: PAGE_SIZE, offset }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.loaded.set(true);
      },
      error: () => {
        this.loaded.set(true);
        this.error.set(true);
      },
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.offset());
    }
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
    const form = formFromSchedule(s);
    this.form.set(
      s.subject_type && s.subject_id
        ? {
            ...form,
            subject: {
              type: s.subject_type as SubjectType,
              id: s.subject_id,
              title: this.language.translate('inspections.subject.current'),
            },
          }
        : form,
    );
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
