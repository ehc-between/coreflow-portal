import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { PeopleApi } from '../data/people-api';
import { textOrNull, todayIso } from '../data/people-display';
import { peopleErrorKey } from '../data/people-errors';
import { PeopleLookups } from '../data/people-lookups';
import {
  ASSESSMENT_METHODS,
  AssessmentMethod,
  COMPETENCE_LEVELS,
  EmployeeCompetences,
  HeldCompetence,
  TrainingRecordRow,
} from '../data/people.models';
import { PeopleField } from './people-field';

interface AssessDraft {
  readonly competence_id: string;
  readonly level: number;
  readonly method: AssessmentMethod | '';
  readonly assessed_by_user_id: string;
  readonly assessed_on: string;
  readonly expires_on: string;
  readonly training_record_id: string;
  readonly evidence_note: string;
}

/** What the dialog is opened for: one person and (optionally) one competence. */
export interface AssessTarget {
  readonly employeeId: string;
  readonly employeeName: string;
  /** The row being re-assessed; null to pick a competence. */
  readonly row: HeldCompetence | null;
  /** Preselected competence (e.g. a matrix cell) when there is no row. */
  readonly competenceId?: string | null;
  /** The level the position requires (matrix cells pass it). */
  readonly requiredLevel?: number | null;
}

/**
 * Record a competence assessment (HS 7.2 d): the level shown, how it was assessed,
 * who assessed it, when, the training record it rests on and a short note. Used on
 * the person's page and from a matrix cell. A new assessment at the required level
 * also marks the open actions on that gap as effective (backend).
 */
@Component({
  selector: 'app-people-assess-dialog',
  imports: [TranslocoPipe, LocalDatePipe, ConfirmDialog, PeopleField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-confirm-dialog
      [open]="target() !== null"
      [title]="'people.competences.assessTitle' | transloco"
      [message]="
        'people.competences.assessMessage' | transloco: { name: target()?.employeeName ?? '' }
      "
      [confirmLabel]="'people.competences.saveAssessment' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!draft().competence_id"
      [initialFocus]="locked() ? '#cf-assess-level' : '#cf-assess-comp'"
      (confirmed)="save()"
      (cancelled)="closed.emit()"
    >
      @if (target()) {
        <div class="mt-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          <app-people-field
            labelKey="people.fields.competence"
            inputId="cf-assess-comp"
            [required]="true"
          >
            <select
              id="cf-assess-comp"
              [disabled]="locked()"
              (change)="patch({ competence_id: $any($event.target).value })"
              data-testid="assess-competence"
            >
              <option value="" [selected]="!draft().competence_id">
                {{ 'people.competences.pick' | transloco }}
              </option>
              @for (c of competenceOptions(); track c.id) {
                <option [value]="c.id" [selected]="draft().competence_id === c.id">
                  {{ c.name }}
                </option>
              }
            </select>
          </app-people-field>
          <app-people-field
            labelKey="people.fields.level"
            inputId="cf-assess-level"
            page="detail"
            help="level"
            [required]="true"
            [hintKey]="requiredLevel() !== null ? 'people.competences.requiredHint' : null"
            [hintParams]="{ level: requiredLabel() }"
          >
            <select
              id="cf-assess-level"
              (change)="patch({ level: +$any($event.target).value })"
              data-testid="assess-level"
            >
              @for (l of levels; track l) {
                <option [value]="l" [selected]="draft().level === l">
                  {{ 'people.levels.' + l | transloco }}
                </option>
              }
            </select>
          </app-people-field>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-people-field
              labelKey="people.fields.method"
              inputId="cf-assess-method"
              page="detail"
              help="method"
            >
              <select
                id="cf-assess-method"
                (change)="patch({ method: $any($event.target).value })"
                data-testid="assess-method"
              >
                <option value="" [selected]="!draft().method">
                  {{ 'people.common.choose' | transloco }}
                </option>
                @for (m of methods; track m) {
                  <option [value]="m" [selected]="draft().method === m">
                    {{ 'people.methods.' + m | transloco }}
                  </option>
                }
              </select>
            </app-people-field>
            <app-people-field labelKey="people.fields.assessedBy" inputId="cf-assess-by">
              <select
                id="cf-assess-by"
                (change)="patch({ assessed_by_user_id: $any($event.target).value })"
                data-testid="assess-by"
              >
                @if (!draft().assessed_by_user_id) {
                  <option value="" selected>{{ 'people.common.choose' | transloco }}</option>
                }
                @for (u of lookups.users(); track u.id) {
                  <option [value]="u.id" [selected]="draft().assessed_by_user_id === u.id">
                    {{ u.label }}
                  </option>
                }
              </select>
            </app-people-field>
            <app-people-field labelKey="people.fields.assessedOn" inputId="cf-assess-date">
              <input
                id="cf-assess-date"
                type="date"
                [value]="draft().assessed_on"
                (change)="patch({ assessed_on: $any($event.target).value })"
              />
            </app-people-field>
            <app-people-field
              labelKey="people.fields.expiresOn"
              inputId="cf-assess-exp"
              hintKey="people.competences.expiryHint"
            >
              <input
                id="cf-assess-exp"
                type="date"
                aria-describedby="cf-assess-exp-hint"
                [value]="draft().expires_on"
                (change)="patch({ expires_on: $any($event.target).value })"
              />
            </app-people-field>
          </div>
          <app-people-field
            labelKey="people.fields.trainingRecord"
            inputId="cf-assess-record"
            [hintKey]="records().length ? null : 'people.competences.noTrainingRecords'"
          >
            <select
              id="cf-assess-record"
              [disabled]="records().length === 0"
              (change)="patch({ training_record_id: $any($event.target).value })"
              data-testid="assess-record"
            >
              <option value="" [selected]="!draft().training_record_id">
                {{ 'people.competences.noTrainingRecord' | transloco }}
              </option>
              @for (r of records(); track r.id) {
                <option [value]="r.id" [selected]="draft().training_record_id === r.id">
                  {{ r.course.code ?? '' }} {{ r.course.title ?? '' }} ·
                  {{ r.completed_at | localDate: 'mediumDate' }}
                </option>
              }
            </select>
          </app-people-field>
          <app-people-field
            labelKey="people.fields.evidenceNote"
            inputId="cf-assess-note"
            hintKey="people.competences.evidenceHint"
          >
            <textarea
              id="cf-assess-note"
              rows="2"
              maxlength="1000"
              [value]="draft().evidence_note"
              (input)="patch({ evidence_note: $any($event.target).value })"
            ></textarea>
          </app-people-field>
        </div>
      }
    </app-confirm-dialog>
  `,
})
export class AssessDialog {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  protected readonly lookups = inject(PeopleLookups);

  readonly target = input<AssessTarget | null>(null);
  /** Competences listed first (the person's rows), then the active catalogue. */
  readonly listed = input<readonly HeldCompetence[]>([]);
  readonly saved = output<EmployeeCompetences>();
  readonly closed = output<void>();

  protected readonly levels = COMPETENCE_LEVELS;
  protected readonly methods = ASSESSMENT_METHODS;
  protected readonly busy = signal(false);
  protected readonly records = signal<readonly TrainingRecordRow[]>([]);
  protected readonly draft = signal<AssessDraft>(emptyDraft(''));
  protected readonly locked = computed(() => !!this.target()?.row || !!this.target()?.competenceId);

  protected readonly competenceOptions = computed(() => {
    const listed = this.listed().map((i) => ({ id: i.competence_id, name: i.competence_name }));
    const seen = new Set(listed.map((c) => c.id));
    const active = this.lookups
      .competences()
      .filter((c) => c.status === 'active' && !seen.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    return [...listed, ...active];
  });

  protected readonly requiredLevel = computed<number | null>(() => {
    const target = this.target();
    const id = this.draft().competence_id;
    const row = target?.row ?? this.listed().find((r) => r.competence_id === id) ?? null;
    return row?.required_level ?? target?.requiredLevel ?? null;
  });
  protected readonly requiredLabel = computed(() => `${this.requiredLevel() ?? ''}`);

  constructor() {
    effect(() => {
      const target = this.target();
      untracked(() => {
        if (!target) {
          return;
        }
        this.lookups.ensureLoaded();
        this.draft.set(this.start(target));
        this.loadRecords(target.employeeId);
      });
    });
  }

  protected patch(patch: Partial<AssessDraft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.target();
    const d = this.draft();
    if (!orgId || !target || !d.competence_id || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .assessCompetence(orgId, target.employeeId, d.competence_id, {
        level: d.level,
        assessed_on: d.assessed_on || null,
        expires_on: d.expires_on || null,
        evidence_note: textOrNull(d.evidence_note),
        method: d.method || null,
        assessed_by_user_id: d.assessed_by_user_id || null,
        training_record_id: d.training_record_id || null,
      })
      .subscribe({
        next: (data) => {
          this.busy.set(false);
          this.notifications.success('people.notices.assessed');
          this.saved.emit(data);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(peopleErrorKey(error));
        },
      });
  }

  private start(target: AssessTarget): AssessDraft {
    const id = target.row?.competence_id ?? target.competenceId ?? '';
    const row = target.row ?? this.listed().find((r) => r.competence_id === id) ?? null;
    return {
      ...emptyDraft(this.auth.user()?.id ?? ''),
      competence_id: id,
      level: row?.required_level ?? target.requiredLevel ?? row?.level ?? 2,
      method: row?.method ?? '',
    };
  }

  private loadRecords(employeeId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.records.set([]);
    if (!orgId) {
      return;
    }
    this.api.training(orgId, employeeId).subscribe({
      next: (t) => this.records.set(t.visible ? t.records.filter((r) => r.passed) : []),
      error: () => this.records.set([]),
    });
  }
}

function emptyDraft(userId: string): AssessDraft {
  return {
    competence_id: '',
    level: 2,
    method: '',
    assessed_by_user_id: userId,
    assessed_on: todayIso(),
    expires_on: '',
    training_record_id: '',
    evidence_note: '',
  };
}
