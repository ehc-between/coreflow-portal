import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { hasAnyPermission } from '../../../core/auth/permission';
import {
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
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { DynamicForm } from '../../../shared/records/dynamic-form';
import { PickOption } from '../../../shared/records/form-model';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { SEVERITY_OPTIONS, severityLabelKey } from '../deviation-enums';
import { DeviationPageGuide } from '../guide/deviation-page-guide';
import { intakeStatusTone } from './intake-inbox';

/** Reports that can still be triaged, dismissed or converted. */
export function isOpenReport(report: IntakeReport): boolean {
  return report.status === 'new' || report.status === 'triaged';
}

/**
 * One received intake report (`deviations:intake`). Triage marks it as being
 * handled, dismiss closes it; both can leave a note the reporter sees when
 * checking their receipt code. Convert (also `deviations:write`) files it as a
 * deviation of a chosen type; a whistleblowing report becomes a restricted
 * deviation owned by the triager. AI can draft the deviation fields from the
 * report text for review.
 */
@Component({
  selector: 'app-intake-report-detail',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Alert,
    Badge,
    Button,
    Card,
    Icon,
    LocalDatePipe,
    LocalDayPipe,
    DynamicForm,
    AiAssistButton,
    DeviationPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/deviations/intake"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.intake.backToInbox' | transloco }}
      </a>

      @if (loading()) {
        <app-card>
          <p class="py-6 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else if (report(); as r) {
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <app-badge [tone]="tone(r.status)">{{
            'deviations.intake.status.' + r.status | transloco
          }}</app-badge>
          <app-badge tone="neutral">{{
            'deviations.intake.modes.' + r.mode | transloco
          }}</app-badge>
          <span class="text-[12.5px] text-fg-subtle">{{
            'deviations.intake.report.received'
              | transloco: { date: (r.created_at | localDate: 'medium') }
          }}</span>
        </div>
        <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.025em] text-fg">
          {{ r.title }}
        </h1>

        <app-deviation-page-guide class="mb-5" page="intakeReport" />

        @if (r.mode === 'whistleblowing') {
          <div class="mb-4">
            <app-alert tone="info">{{
              'deviations.intake.report.whistleblowingNote' | transloco
            }}</app-alert>
          </div>
        }

        <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div class="flex flex-col gap-5">
            <app-card>
              <dl class="flex flex-col gap-3 text-[13.5px]">
                <div>
                  <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.intake.fields.description' | transloco }}
                  </dt>
                  <dd class="mt-1 whitespace-pre-line text-fg">{{ r.description }}</dd>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'deviations.intake.fields.occurredOn' | transloco }}
                    </dt>
                    <dd class="mt-1 text-fg">
                      {{ r.occurred_on ? (r.occurred_on | localDay) : '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'deviations.intake.fields.location' | transloco }}
                    </dt>
                    <dd class="mt-1 text-fg">{{ r.location || '—' }}</dd>
                  </div>
                </div>
                <div>
                  <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.intake.fields.contact' | transloco }}
                  </dt>
                  <dd class="mt-1 whitespace-pre-line text-fg">
                    {{ r.contact || ('deviations.intake.report.noContact' | transloco) }}
                  </dd>
                </div>
                @if (r.public_note) {
                  <div>
                    <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'deviations.intake.fields.publicNote' | transloco }}
                    </dt>
                    <dd class="mt-1 whitespace-pre-line text-fg">{{ r.public_note }}</dd>
                  </div>
                }
              </dl>
            </app-card>

            @if (open() && canConvert()) {
              <app-card>
                <form class="flex flex-col gap-4" (ngSubmit)="convert()" data-testid="convert-form">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
                      {{ 'deviations.intake.convert.title' | transloco }}
                    </h2>
                    <app-ai-assist-button
                      assist="deviations.register_from_text"
                      labelKey="deviations.assist.draftFromReport"
                      [input]="assistInput()"
                      (result)="onDraft($event)"
                    />
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="convert-type" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.intake.convert.type' | transloco }}
                      </label>
                      <select
                        id="convert-type"
                        name="type"
                        [ngModel]="typeId()"
                        (ngModelChange)="selectType($event)"
                        class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
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
                      <label for="convert-severity" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.severity' | transloco }}
                      </label>
                      <select
                        id="convert-severity"
                        name="severity"
                        [ngModel]="severity()"
                        (ngModelChange)="severity.set($event)"
                        class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
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
                    <label for="convert-title" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.title' | transloco }}
                    </label>
                    <input
                      id="convert-title"
                      name="title"
                      type="text"
                      maxlength="255"
                      [ngModel]="title()"
                      (ngModelChange)="title.set($event)"
                      class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
                    />
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="convert-owner" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.detail.owner' | transloco }}
                      </label>
                      <select
                        id="convert-owner"
                        name="owner"
                        [ngModel]="ownerId()"
                        (ngModelChange)="ownerId.set($event)"
                        class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
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
                      <label for="convert-dept" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.department' | transloco }}
                      </label>
                      <select
                        id="convert-dept"
                        name="department"
                        [ngModel]="departmentId()"
                        (ngModelChange)="departmentId.set($event)"
                        class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
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
                    <label for="convert-note" class="text-[13px] font-semibold text-fg-muted">
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
                      class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent"
                    ></textarea>
                  </div>
                  <div>
                    <app-button
                      type="submit"
                      [loading]="busy() === 'convert'"
                      [disabled]="busy() !== null"
                    >
                      {{ 'deviations.intake.convert.submit' | transloco }}
                    </app-button>
                  </div>
                </form>
              </app-card>
            }
          </div>

          <div class="flex flex-col gap-4">
            @if (r.deviation_id) {
              <app-card>
                <p class="text-[13px] text-fg-muted">
                  {{ 'deviations.intake.report.convertedTo' | transloco }}
                </p>
                <a
                  [routerLink]="['/deviations', r.deviation_id]"
                  class="mt-1 inline-block font-mono text-[14px] font-semibold text-accent hover:underline"
                  >{{ r.deviation_code }}</a
                >
              </app-card>
            }
            @if (r.triaged_by_name) {
              <app-card>
                <p class="text-[13px] text-fg-muted">
                  {{
                    'deviations.intake.report.triagedBy'
                      | transloco
                        : {
                            name: r.triaged_by_name,
                            date: r.triaged_at ? (r.triaged_at | localDate: 'medium') : '',
                          }
                  }}
                </p>
              </app-card>
            }
            @if (open()) {
              <app-card>
                <div class="flex flex-col gap-3">
                  <label for="triage-note" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.intake.fields.publicNote' | transloco }}
                  </label>
                  <textarea
                    id="triage-note"
                    rows="3"
                    maxlength="2000"
                    [ngModel]="note()"
                    (ngModelChange)="note.set($event)"
                    [placeholder]="'deviations.intake.report.notePlaceholder' | transloco"
                    class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent"
                  ></textarea>
                  <div class="flex flex-wrap gap-2">
                    @if (r.status === 'new') {
                      <app-button
                        size="sm"
                        [loading]="busy() === 'triage'"
                        [disabled]="busy() !== null"
                        (click)="triage()"
                      >
                        {{ 'deviations.intake.report.triage' | transloco }}
                      </app-button>
                    }
                    <app-button
                      size="sm"
                      variant="secondary"
                      [loading]="busy() === 'dismiss'"
                      [disabled]="busy() !== null"
                      (click)="dismiss()"
                    >
                      {{ 'deviations.intake.report.dismiss' | transloco }}
                    </app-button>
                  </div>
                </div>
              </app-card>
            }
          </div>
        </div>
      } @else {
        <app-card>
          <p class="py-6 text-center text-[14px] text-fg-muted">
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
      view: 'detail',
      title: this.report()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId) {
        this.load(orgId, id);
      }
    });
  }

  protected tone(status: string) {
    return intakeStatusTone(status);
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
        this.report.set(updated);
        this.note.set('');
        this.notifications.success(`deviations.intake.report.${kind}Toast`);
      },
      error: (error: unknown) => {
        this.busy.set(null);
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

  private load(orgId: string, id: string): void {
    this.loading.set(this.report()?.id !== id);
    this.api.getReport(orgId, id).subscribe({
      next: (report) => {
        this.report.set(report);
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
        this.users.set(subjects.users.map((u) => ({ id: u.id, name: u.name })));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}
