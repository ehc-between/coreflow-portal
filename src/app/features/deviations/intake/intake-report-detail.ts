import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { hasAnyPermission } from '../../../core/auth/permission';
import {
  DeviationDetail,
  DeviationType,
  RegisterFromTextResult,
  Severity,
} from '../../../core/deviations/deviation.models';
import {
  codedErrorDetail,
  notifyDeviationError,
  recordDataErrors,
} from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { DeviationIntakeApi } from '../../../core/deviations/intake-api';
import { IntakeReport } from '../../../core/deviations/intake.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RecordTypeVersion } from '../../../core/records/record.models';
import { RecordsApi } from '../../../core/records/records-api';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import {
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, formatLocalDate } from '../../../shared/locale/locale-pipes';
import { LanguageService } from '../../../core/i18n/language.service';
import { DynamicForm } from '../../../shared/records/dynamic-form';
import { PickOption } from '../../../shared/records/form-model';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { DEVIATIONS_ROOT_CRUMB, personOptions } from '../deviation-display';
import { SEVERITY_OPTIONS, severityLabelKey } from '../deviation-enums';
import { DeviationStatusLabels } from '../deviation-status';
import { intakeStatusValue } from './intake-inbox';

/** Tone of the status sentence: open work is a to-do, done is green. */
const STATUS_TONE: Readonly<Record<string, StatusLineTone>> = {
  new: 'warn',
  triaged: 'info',
  converted: 'pass',
  dismissed: 'neutral',
};

/** A legal deadline of a whistleblowing report, for the "Oppfølging" card. */
export interface IntakeDeadline {
  readonly key: 'acknowledge' | 'feedback';
  readonly labelKey: string;
  readonly date: string;
  readonly done: boolean;
}

/**
 * The deadlines of a whistleblowing report: confirm receipt (done once it was
 * triaged) and give feedback (done once the report is closed or converted).
 */
export function intakeDeadlines(report: IntakeReport): IntakeDeadline[] {
  const out: IntakeDeadline[] = [];
  if (report.acknowledge_due_at) {
    const done = !!report.acknowledged_at;
    out.push({
      key: 'acknowledge',
      labelKey: done
        ? 'deviations.intake.page.deadline.acknowledged'
        : 'deviations.intake.deadline.acknowledge',
      date: report.acknowledged_at ?? report.acknowledge_due_at,
      done,
    });
  }
  if (report.feedback_due_at) {
    out.push({
      key: 'feedback',
      labelKey: 'deviations.intake.deadline.feedback',
      date: report.feedback_due_at,
      done: !isOpenReport(report),
    });
  }
  return out;
}

/** Reports that can still be triaged, dismissed or converted. */
export function isOpenReport(report: IntakeReport): boolean {
  return report.status === 'new' || report.status === 'triaged';
}

/**
 * One received intake report (`deviations:intake`) on the detail-page anatomy
 * (docs/ux-guide.md §2.7). "Registrer som avvik" is the one primary action (also
 * `deviations:write`): it opens the form that files the report as a deviation
 * of a chosen type (a whistleblowing report becomes a restricted deviation owned
 * by the triager). "Start behandling" marks it as being handled and "Lukk uten
 * avvik" (in "Mer") closes it; both ask for an optional note the reporter sees
 * when checking their receipt code. "Hovedinformasjon" shows what was reported,
 * when and where; the "Oppfølging" card the legal deadlines of a whistleblowing
 * report, the deviation it became and the facts (received, contact, handled by).
 * The assistant can draft the deviation fields from the report ("Spør KI").
 */
@Component({
  selector: 'app-intake-report-detail',
  imports: [
    FormsModule,
    TranslocoPipe,
    EntityChip,
    FieldItem,
    Icon,
    MenuItem,
    OverflowMenu,
    PromptDialog,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    Alert,
    Badge,
    Button,
    Card,
    LocalDatePipe,
    LocalDayPipe,
    DynamicForm,
    AiAssistButton,
    HelpStrip,
    LoadingState,
    PageHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (loading()) {
        <app-loading-state [rows]="5" />
      } @else if (report(); as r) {
        <app-page-header
          [title]="r.title"
          [breadcrumbs]="breadcrumbs()"
          backLink="/deviations/intake"
        >
          <ng-container ngProjectAs="[meta]">
            <span>{{ 'deviations.intake.modes.' + r.mode | transloco }}</span>
            <span aria-hidden="true">·</span>
            <app-status-badge
              meaning="lifecycle"
              [value]="statusValue(r.status)"
              [labelKey]="'deviations.intake.status.' + r.status"
            />
          </ng-container>
          <ng-container ngProjectAs="[secondary]">
            @if (open() && canConvert() && aiAvailable()) {
              <!-- §2.7: the assistant action in the header's "Spør KI" menu. -->
              <app-overflow-menu
                icon="spark"
                [label]="'deviations.intake.page.askLabel' | transloco"
                triggerTestId="intake-ask-menu"
              >
                <button
                  appMenuItem
                  type="button"
                  data-testid="intake-draft"
                  (click)="draftFromReport()"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ 'deviations.assist.draftFromReport' | transloco }}
                </button>
              </app-overflow-menu>
            }
            @if (open() && r.status === 'new') {
              <app-button
                variant="secondary"
                [loading]="busy() === 'triage'"
                [disabled]="busy() !== null"
                (click)="noteFor.set('triage')"
                data-testid="intake-triage"
              >
                {{ 'deviations.intake.report.triage' | transloco }}
              </app-button>
            }
          </ng-container>
          <ng-container ngProjectAs="[primary]">
            @if (open() && canConvert()) {
              <app-button (click)="openConvert()" data-testid="intake-convert">
                {{ 'deviations.intake.convert.title' | transloco }}
              </app-button>
            }
          </ng-container>
          @if (open()) {
            <button
              appMenuItem
              overflow
              type="button"
              [disabled]="busy() !== null"
              (click)="noteFor.set('dismiss')"
              data-testid="intake-dismiss"
            >
              {{ 'deviations.intake.report.dismiss' | transloco }}
            </button>
          }
        </app-page-header>
        <app-help-strip scope="deviations" page="intakeReport" lesson="speaking-up" />

        @if (r.mode === 'whistleblowing') {
          <div class="mb-4">
            <app-alert tone="info">{{
              'deviations.intake.report.whistleblowingNote' | transloco
            }}</app-alert>
          </div>
        }

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div class="flex min-w-0 flex-col gap-5">
            <!-- §2.7 "Hovedinformasjon": what was reported, when and where. -->
            <app-record-lead>
              <app-record-status-line status [tone]="statusTone()">{{
                'deviations.intake.page.status.' + r.status | transloco
              }}</app-record-status-line>
              <app-field-item
                size="lead"
                [wide]="true"
                labelKey="deviations.intake.page.lead.description"
                [value]="r.description"
                [multiline]="true"
              />
              <!-- A report cannot be edited: what the reporter left out is simply not shown. -->
              @if (r.occurred_on) {
                <app-field-item
                  size="lead"
                  labelKey="deviations.intake.page.lead.occurredOn"
                  [value]="r.occurred_on | localDay"
                />
              }
              @if (r.location) {
                <app-field-item
                  size="lead"
                  labelKey="deviations.intake.page.lead.location"
                  [value]="r.location"
                />
              }
            </app-record-lead>

            @if (open() && canConvert() && convertOpen()) {
              <app-card id="intake-convert" class="block scroll-mt-6">
                <form class="flex flex-col gap-4" (ngSubmit)="convert()" data-testid="convert-form">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-section font-bold tracking-[-0.02em] text-fg">
                      {{ 'deviations.intake.convert.title' | transloco }}
                    </h2>
                    <app-ai-assist-button
                      [quiet]="true"
                      assist="deviations.register_from_text"
                      labelKey="deviations.assist.draftFromReport"
                      [input]="assistInput()"
                      (result)="onDraft($event)"
                    />
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="convert-type" class="text-ui font-semibold text-fg-muted">
                        {{ 'deviations.intake.convert.type' | transloco }}
                      </label>
                      <select
                        id="convert-type"
                        name="type"
                        [ngModel]="typeId()"
                        (ngModelChange)="selectType($event)"
                        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                      >
                        <option value="">
                          {{ 'deviations.intake.convert.defaultType' | transloco }}
                        </option>
                        @for (type of types(); track type.id) {
                          <option [value]="type.id">{{ type.name }}</option>
                        }
                      </select>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="convert-severity" class="text-ui font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.severity' | transloco }}
                      </label>
                      <select
                        id="convert-severity"
                        name="severity"
                        [ngModel]="severity()"
                        (ngModelChange)="severity.set($event)"
                        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                      >
                        @for (option of severityOptions; track option) {
                          <option [value]="option">
                            {{ severityLabelKey(option) | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label for="convert-title" class="text-ui font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.title' | transloco }}
                    </label>
                    <input
                      id="convert-title"
                      name="title"
                      type="text"
                      maxlength="255"
                      [ngModel]="title()"
                      (ngModelChange)="title.set($event)"
                      class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                    />
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="convert-owner" class="text-ui font-semibold text-fg-muted">
                        {{ 'deviations.detail.owner' | transloco }}
                      </label>
                      <select
                        id="convert-owner"
                        name="owner"
                        [ngModel]="ownerId()"
                        (ngModelChange)="ownerId.set($event)"
                        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                      >
                        <option value="">
                          {{ 'deviations.intake.convert.ownerMe' | transloco }}
                        </option>
                        @for (user of users(); track user.id) {
                          <option [value]="user.id">{{ user.name }}</option>
                        }
                      </select>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="convert-dept" class="text-ui font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.department' | transloco }}
                      </label>
                      <select
                        id="convert-dept"
                        name="department"
                        [ngModel]="departmentId()"
                        (ngModelChange)="departmentId.set($event)"
                        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                      >
                        <option value="">{{ 'deviations.create.none' | transloco }}</option>
                        @for (dept of departments(); track dept.id) {
                          <option [value]="dept.id">{{ dept.name }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  @if (recordVersion(); as version) {
                    <div class="border-t border-border pt-4">
                      <app-dynamic-form
                        [fields]="version.fields"
                        [layout]="version.layout"
                        [value]="data()"
                        [errors]="dataErrors()"
                        [people]="users()"
                        [departments]="departments()"
                        (valueChange)="data.set($event)"
                      />
                    </div>
                  }
                  <div class="flex flex-col gap-1.5">
                    <label for="convert-note" class="text-ui font-semibold text-fg-muted">
                      {{ 'deviations.intake.fields.publicNote' | transloco }}
                    </label>
                    <textarea
                      id="convert-note"
                      name="note"
                      rows="2"
                      maxlength="2000"
                      [ngModel]="note()"
                      (ngModelChange)="note.set($event)"
                      [placeholder]="'deviations.intake.report.notePlaceholder' | transloco"
                      class="w-full rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg outline-none focus:border-accent"
                    ></textarea>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <app-button
                      type="submit"
                      [loading]="busy() === 'convert'"
                      [disabled]="busy() !== null"
                    >
                      {{ 'deviations.intake.convert.submit' | transloco }}
                    </app-button>
                    <app-button
                      variant="ghost"
                      [disabled]="busy() !== null"
                      (click)="convertOpen.set(false)"
                    >
                      {{ 'deviations.detail.cancel' | transloco }}
                    </app-button>
                  </div>
                </form>
              </app-card>
            }
          </div>

          <!-- §2.7: one "Oppfølging" card: deadlines, what the report became, the facts. -->
          <section
            class="flex flex-col rounded-card border border-border bg-surface shadow-card"
            aria-labelledby="intake-follow-up"
            data-testid="intake-follow-up"
          >
            <h2
              id="intake-follow-up"
              class="px-4 pt-4 pb-1 font-display text-card font-bold text-fg"
            >
              {{ 'deviations.intake.page.followUp' | transloco }}
            </h2>
            @if (deadlines().length) {
              <ul class="flex flex-col gap-2 px-4 pt-2 pb-4" data-testid="whistle-deadlines">
                @for (d of deadlines(); track d.key) {
                  <li class="flex gap-2 text-ui font-semibold text-fg">
                    <span
                      aria-hidden="true"
                      class="mt-1.5 h-2 w-2 flex-none rounded-full"
                      [class]="d.done ? 'bg-pass' : 'bg-warn'"
                    ></span>
                    <span [class.text-fg-muted]="d.done" [class.font-normal]="d.done">{{
                      d.labelKey | transloco: { date: (d.date | localDate: 'mediumDate') }
                    }}</span>
                  </li>
                }
              </ul>
            }
            <div class="border-t border-border px-4 py-4">
              <h3 class="mb-2 text-ui font-semibold text-fg">
                {{ 'deviations.intake.page.connected' | transloco }}
              </h3>
              @if (r.deviation_id) {
                <div class="flex flex-col gap-1" data-testid="intake-deviation">
                  <app-entity-chip [ref]="deviationRef(r)" [stacked]="true" />
                  @if (linked(); as dev) {
                    <app-badge class="w-fit" [tone]="statusLabels.tone(dev)">{{
                      statusLabels.label(dev)
                    }}</app-badge>
                  }
                </div>
              } @else {
                <p class="text-ui text-fg-muted">
                  {{ 'deviations.intake.page.notConverted' | transloco }}
                </p>
              }
            </div>
            @if (r.public_note) {
              <div class="border-t border-border px-4 py-4" data-testid="intake-public-note">
                <h3 class="mb-1 text-ui font-semibold text-fg">
                  {{ 'deviations.intake.fields.publicNote' | transloco }}
                </h3>
                <p class="text-ui whitespace-pre-line text-fg-muted">{{ r.public_note }}</p>
              </div>
            }
            <app-record-meta
              class="rounded-b-card border-t border-border bg-surface-2/50 px-4 py-3"
            >
              <app-field-item
                layout="inline"
                labelKey="deviations.intake.page.meta.received"
                [value]="r.created_at | localDate: 'medium'"
              />
              <app-field-item
                layout="inline"
                labelKey="deviations.intake.page.meta.contact"
                [value]="r.contact || ('deviations.intake.page.meta.anonymous' | transloco)"
              />
              <app-field-item
                layout="inline"
                labelKey="deviations.intake.page.meta.handledBy"
                [value]="handledBy(r)"
              />
            </app-record-meta>
          </section>
        </div>

        <app-prompt-dialog
          [open]="noteFor() !== null"
          [title]="'deviations.intake.page.dialog.' + (noteFor() ?? 'triage') + 'Title' | transloco"
          [message]="
            'deviations.intake.page.dialog.' + (noteFor() ?? 'triage') + 'Message' | transloco
          "
          [label]="'deviations.intake.fields.publicNote' | transloco"
          [placeholder]="'deviations.intake.report.notePlaceholder' | transloco"
          [required]="false"
          confirmVariant="primary"
          [confirmLabel]="
            (noteFor() === 'dismiss'
              ? 'deviations.intake.report.dismiss'
              : 'deviations.intake.report.triage'
            ) | transloco
          "
          [cancelLabel]="'deviations.detail.cancel' | transloco"
          [busy]="busy() !== null"
          (confirmed)="confirmNote($event)"
          (cancelled)="noteFor.set(null)"
        />
      } @else {
        <app-card>
          <p class="py-6 text-center text-body text-fg-muted">
            {{ 'deviations.intake.report.notFound' | transloco }}
          </p>
        </app-card>
      }
    </div>
  `,
})
export class IntakeReportDetailPage {
  private readonly api = inject(DeviationIntakeApi);
  private readonly deviations = inject(DeviationsApi);
  private readonly records = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly language = inject(LanguageService);
  private readonly ai = inject(AiAvailability);
  protected readonly statusLabels = inject(DeviationStatusLabels);

  /** Route param `id`. */
  readonly id = input.required<string>();

  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly severityLabelKey = severityLabelKey;

  protected readonly report = signal<IntakeReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal<'triage' | 'dismiss' | 'convert' | null>(null);
  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly users = signal<readonly PickOption[]>([]);
  protected readonly departments = signal<readonly PickOption[]>([]);

  protected readonly note = signal('');
  protected readonly typeId = signal('');
  protected readonly title = signal('');
  protected readonly severity = signal<Severity>('medium');
  protected readonly ownerId = signal('');
  protected readonly departmentId = signal('');
  protected readonly data = signal<Record<string, unknown>>({});
  protected readonly dataErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly recordVersion = signal<RecordTypeVersion | null>(null);
  /** The convert form is shown once "Registrer som avvik" is chosen. */
  protected readonly convertOpen = signal(false);
  /** Which note dialog is open (triage or dismiss). */
  protected readonly noteFor = signal<'triage' | 'dismiss' | null>(null);
  /** The deviation the report became (for its title and status), when readable. */
  protected readonly linked = signal<DeviationDetail | null>(null);
  protected readonly aiAvailable = computed(() => !this.ai.unavailable());
  private readonly draftAssist = viewChild(AiAssistButton);

  protected readonly statusTone = computed<StatusLineTone>(
    () => STATUS_TONE[this.report()?.status ?? 'new'] ?? 'neutral',
  );
  protected readonly deadlines = computed(() => {
    const r = this.report();
    return r ? intakeDeadlines(r) : [];
  });

  protected readonly open = computed(() => {
    const r = this.report();
    return !!r && isOpenReport(r);
  });
  protected readonly canConvert = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:write'),
  );
  protected readonly assistInput = computed(() => {
    const r = this.report();
    return r
      ? {
          text: `${r.title}\n\n${r.description}`,
          ...(this.typeId() ? { type_id: this.typeId() } : {}),
        }
      : {};
  });

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'intake_report',
      entityId: this.id(),
      view: 'detail',
      title: this.report()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId) {
        // Untracked: loading reads (and sets) the report, which must not re-run this effect.
        untracked(() => this.load(orgId, id));
      }
    });
  }

  protected readonly statusValue = intakeStatusValue;
  protected readonly breadcrumbs = computed(() => [
    DEVIATIONS_ROOT_CRUMB,
    { labelKey: 'deviations.intake.inbox.title', link: '/deviations/intake' },
    { label: this.report()?.title ?? '' },
  ]);

  protected deviationRef(r: IntakeReport): EntityChipRef {
    const dev = this.linked();
    return {
      entity_type: 'deviation',
      entity_id: r.deviation_id ?? '',
      code: r.deviation_code,
      title: dev?.title ?? r.deviation_code ?? '',
      url: `/deviations/${r.deviation_id}`,
      module: 'deviations',
    };
  }

  protected handledBy(r: IntakeReport): string | null {
    if (!r.triaged_by_name) {
      return null;
    }
    const at = r.triaged_at
      ? formatLocalDate(r.triaged_at, 'mediumDate', this.language.locale())
      : '';
    return at ? `${r.triaged_by_name}, ${at}` : r.triaged_by_name;
  }

  /** "Registrer som avvik": show the form and bring it into view. */
  protected openConvert(): void {
    this.convertOpen.set(true);
    afterNextRender(
      () =>
        document
          .getElementById('intake-convert')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
  }

  /** "Spør KI" → "Lag utkast fra rapporten": open the form and let the assistant fill it. */
  protected draftFromReport(): void {
    this.openConvert();
    afterNextRender(() => this.draftAssist()?.run(), { injector: this.injector });
  }

  /** The note dialog was confirmed: triage or dismiss with the (optional) note. */
  protected confirmNote(text: string): void {
    const kind = this.noteFor();
    this.note.set(text);
    if (kind === 'triage') {
      this.triage();
    } else if (kind === 'dismiss') {
      this.dismiss();
    }
  }

  protected selectType(typeId: string): void {
    this.typeId.set(typeId);
    this.data.set({});
    this.dataErrors.set({});
    this.recordVersion.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    const type = this.types().find((t) => t.id === typeId);
    if (orgId && type?.record_type_id) {
      this.records.getRecordType(orgId, type.record_type_id).subscribe({
        next: (recordType) => this.recordVersion.set(recordType.current_version),
      });
    }
  }

  protected onDraft(result: unknown): void {
    const draft = result as RegisterFromTextResult | null;
    if (!draft || typeof draft !== 'object') {
      return;
    }
    if (
      draft.type_id &&
      draft.type_id !== this.typeId() &&
      this.types().some((t) => t.id === draft.type_id)
    ) {
      this.selectType(draft.type_id);
    }
    if (draft.title) {
      this.title.set(draft.title);
    }
    if (draft.severity) {
      this.severity.set(draft.severity);
    }
    if (draft.data && typeof draft.data === 'object') {
      this.data.set({ ...this.data(), ...draft.data });
    }
    this.notifications.info('deviations.assist.draftApplied');
  }

  protected triage(): void {
    this.run('triage', (orgId, id) => this.api.triage(orgId, id, this.noteBody()));
  }

  protected dismiss(): void {
    this.run('dismiss', (orgId, id) => this.api.dismiss(orgId, id, this.noteBody()));
  }

  protected convert(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.report();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set('convert');
    this.dataErrors.set({});
    this.api
      .convert(orgId, r.id, {
        type_id: this.typeId() || null,
        title: this.title().trim() || null,
        severity: this.severity(),
        owner_user_id: this.ownerId() || null,
        department_id: this.departmentId() || null,
        ...this.noteBody(),
        data: this.data(),
      })
      .subscribe({
        next: (result) => {
          this.busy.set(null);
          this.notifications.success('deviations.intake.convert.convertedToast', {
            code: result.deviation_code,
          });
          void this.router.navigate(['/deviations', result.deviation_id]);
        },
        error: (error: unknown) => {
          this.busy.set(null);
          this.onError(error);
        },
      });
  }

  private noteBody(): { public_note?: string } {
    const note = this.note().trim();
    return note ? { public_note: note } : {};
  }

  private run(
    kind: 'triage' | 'dismiss',
    call: (orgId: string, id: string) => ReturnType<DeviationIntakeApi['triage']>,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.report();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set(kind);
    call(orgId, r.id).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.noteFor.set(null);
        this.report.set(updated);
        this.note.set('');
        this.notifications.success(`deviations.intake.report.${kind}Toast`);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.noteFor.set(null);
        this.onError(error);
      },
    });
  }

  private onError(error: unknown): void {
    const fieldErrors = recordDataErrors(error);
    if (fieldErrors) {
      this.dataErrors.set(fieldErrors);
      this.notifications.error('deviations.create.validationToast');
      return;
    }
    notifyDeviationError(this.notifications, error);
    if (codedErrorDetail(error)?.code === 'report_closed') {
      this.reload();
    }
  }

  private reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.id());
    }
  }

  private loadLinked(orgId: string, report: IntakeReport): void {
    if (!report.deviation_id) {
      this.linked.set(null);
      return;
    }
    if (this.linked()?.id === report.deviation_id) {
      return;
    }
    this.deviations.getDeviation(orgId, report.deviation_id).subscribe({
      next: (dev) => this.linked.set(dev),
      error: () => this.linked.set(null),
    });
  }

  private load(orgId: string, id: string): void {
    this.loading.set(this.report()?.id !== id);
    this.api.getReport(orgId, id).subscribe({
      next: (report) => {
        this.report.set(report);
        this.loadLinked(orgId, report);
        if (!this.title()) {
          this.title.set(report.title);
        }
        this.loading.set(false);
      },
      error: () => {
        this.report.set(null);
        this.loading.set(false);
      },
    });
    this.deviations.listTypes(orgId).subscribe({
      next: (types) => this.types.set(types.filter((t) => t.is_active)),
    });
    this.deviations.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.users.set(personOptions(subjects.users));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}
