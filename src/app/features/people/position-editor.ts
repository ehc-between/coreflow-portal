import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { textOrNull } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import {
  PositionDetail,
  PositionFields,
  RECORD_STATUSES,
  RISK_LEVELS,
  RecordStatus,
  RiskLevel,
} from './data/people.models';
import { PeopleLessonLink } from './people-section-nav';

export interface PositionFormValue {
  readonly title: string;
  readonly code: string;
  readonly description: string;
  readonly responsibilities: string;
  readonly authorities: string;
  readonly department_id: string;
  readonly reports_to_id: string;
  readonly risk_level: RiskLevel;
  readonly owner_user_id: string;
  readonly status: RecordStatus;
}

export function emptyPositionForm(): PositionFormValue {
  return {
    title: '',
    code: '',
    description: '',
    responsibilities: '',
    authorities: '',
    department_id: '',
    reports_to_id: '',
    risk_level: 'low',
    owner_user_id: '',
    status: 'active',
  };
}

export function formFromPosition(p: PositionDetail): PositionFormValue {
  return {
    title: p.title,
    code: p.code ?? '',
    description: p.description ?? '',
    responsibilities: p.responsibilities ?? '',
    authorities: p.authorities ?? '',
    department_id: p.department?.id ?? '',
    reports_to_id: p.reports_to?.id ?? '',
    risk_level: p.risk_level,
    owner_user_id: p.owner?.id ?? '',
    status: p.status,
  };
}

export function toPositionFields(v: PositionFormValue): PositionFields {
  return {
    title: v.title.trim(),
    code: textOrNull(v.code),
    description: textOrNull(v.description),
    responsibilities: textOrNull(v.responsibilities),
    authorities: textOrNull(v.authorities),
    department_id: v.department_id || null,
    reports_to_id: v.reports_to_id || null,
    risk_level: v.risk_level,
    owner_user_id: v.owner_user_id || null,
  };
}

/**
 * Create (`/people/positions/new`) or edit (`/people/positions/:id/edit`) a position:
 * purpose, responsibilities and authorities (ISO HS 5.3), department, reporting line,
 * risk level and owner. "Draft responsibilities" asks the assistant for a first draft.
 */
@Component({
  selector: 'app-people-position-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    PeopleLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/people/positions', id()] : '/people/positions'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'people.common.backToPosition' : 'people.common.backToPositions') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          id()
            ? ('people.positionForm.editTitle' | transloco: { title: original()?.title ?? '' })
            : ('people.positionForm.newTitle' | transloco)
        }}
      </h1>
      <div class="mb-5"><app-guide-intro scope="people" page="positionForm" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'people.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
            <app-card>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'people.fields.positionTitle' | transloco"
                    inputId="cf-p-title"
                  >
                    <input
                      id="cf-p-title"
                      type="text"
                      maxlength="200"
                      required
                      [value]="form().title"
                      (input)="set('title', $any($event.target).value)"
                      [attr.aria-invalid]="attempted() && !form().title.trim()"
                      [attr.aria-describedby]="
                        attempted() && !form().title.trim() ? 'cf-p-title-err' : null
                      "
                      data-testid="position-title"
                    />
                  </app-form-field>
                  @if (attempted() && !form().title.trim()) {
                    <p id="cf-p-title-err" class="mt-1 text-[12px] text-fail">
                      {{ 'people.positionForm.titleRequired' | transloco }}
                    </p>
                  }
                </div>
                <app-form-field [label]="'people.fields.code' | transloco" inputId="cf-p-code">
                  <input
                    id="cf-p-code"
                    type="text"
                    maxlength="32"
                    [value]="form().code"
                    (input)="set('code', $any($event.target).value)"
                  />
                </app-form-field>
                <div class="sm:col-span-3">
                  <app-form-field
                    [label]="'people.fields.description' | transloco"
                    inputId="cf-p-desc"
                  >
                    <textarea
                      id="cf-p-desc"
                      rows="2"
                      maxlength="20000"
                      [value]="form().description"
                      (input)="set('description', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
                <div class="sm:col-span-3">
                  <app-form-field
                    [label]="'people.fields.responsibilities' | transloco"
                    inputId="cf-p-resp"
                  >
                    <textarea
                      id="cf-p-resp"
                      rows="5"
                      maxlength="20000"
                      [value]="form().responsibilities"
                      (input)="set('responsibilities', $any($event.target).value)"
                      data-testid="position-responsibilities"
                    ></textarea>
                  </app-form-field>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <app-ai-assist-button
                      assist="people.draft_responsibilities"
                      labelKey="people.ai.draftResponsibilities"
                      [input]="assistInput()"
                      [disabled]="!form().title.trim()"
                      (text)="draftText.set($event)"
                    />
                    <app-field-help scope="people" page="positionForm" field="responsibilities" />
                  </div>
                  @if (draftText()) {
                    <div
                      class="mt-3 rounded-tile border border-border bg-surface-2 p-3"
                      role="status"
                      data-testid="responsibilities-draft"
                    >
                      <p class="mb-2 text-[12px] font-semibold text-fg-subtle">
                        {{ 'people.ai.draftPreview' | transloco }}
                      </p>
                      <p class="text-[13px] whitespace-pre-line text-fg">{{ draftText() }}</p>
                      <div class="mt-2 flex gap-2">
                        <app-button size="sm" (click)="useDraft()">
                          {{ 'people.ai.useDraft' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="ghost" (click)="draftText.set('')">
                          {{ 'people.ai.discard' | transloco }}
                        </app-button>
                      </div>
                    </div>
                  }
                </div>
                <div class="sm:col-span-3">
                  <app-form-field
                    [label]="'people.fields.authorities' | transloco"
                    inputId="cf-p-auth"
                  >
                    <textarea
                      id="cf-p-auth"
                      rows="3"
                      maxlength="20000"
                      [value]="form().authorities"
                      (input)="set('authorities', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                  <app-field-help scope="people" page="positionForm" field="authorities" />
                </div>
                <app-form-field
                  [label]="'people.fields.department' | transloco"
                  inputId="cf-p-dept"
                >
                  <select id="cf-p-dept" (change)="set('department_id', $any($event.target).value)">
                    <option value="" [selected]="!form().department_id">
                      {{ 'people.form.noDepartment' | transloco }}
                    </option>
                    @if (form().department_id && !knownDepartment()) {
                      <option [value]="form().department_id" selected>
                        {{ original()?.department?.name ?? '' }}
                      </option>
                    }
                    @for (d of lookups.departments(); track d.id) {
                      <option [value]="d.id" [selected]="form().department_id === d.id">
                        {{ d.label }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-form-field
                  [label]="'people.fields.reportsTo' | transloco"
                  inputId="cf-p-reports"
                >
                  <select
                    id="cf-p-reports"
                    (change)="set('reports_to_id', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().reports_to_id">
                      {{ 'people.positionForm.noReportsTo' | transloco }}
                    </option>
                    @for (p of reportOptions(); track p.id) {
                      <option [value]="p.id" [selected]="form().reports_to_id === p.id">
                        {{ p.title }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <div>
                  <app-form-field
                    [label]="'people.fields.riskLevel' | transloco"
                    inputId="cf-p-risk"
                  >
                    <select id="cf-p-risk" (change)="set('risk_level', $any($event.target).value)">
                      @for (r of risks; track r) {
                        <option [value]="r" [selected]="form().risk_level === r">
                          {{ 'people.riskLevels.' + r | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-field-help scope="people" page="positionForm" field="risk_level" />
                </div>
                <app-form-field [label]="'people.fields.owner' | transloco" inputId="cf-p-owner">
                  <select
                    id="cf-p-owner"
                    (change)="set('owner_user_id', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().owner_user_id">
                      {{ 'people.positionForm.noOwner' | transloco }}
                    </option>
                    @if (form().owner_user_id && !knownOwner()) {
                      <option [value]="form().owner_user_id" selected>
                        {{ original()?.owner?.name ?? '' }}
                      </option>
                    }
                    @for (u of lookups.users(); track u.id) {
                      <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                        {{ u.label }}
                      </option>
                    }
                  </select>
                </app-form-field>
                @if (id()) {
                  <app-form-field
                    [label]="'people.fields.status' | transloco"
                    inputId="cf-p-status"
                  >
                    <select id="cf-p-status" (change)="set('status', $any($event.target).value)">
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="form().status === s">
                          {{ 'people.recordStatus.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                }
              </div>
            </app-card>

            @if (id()) {
              <app-card>
                <app-form-field
                  [label]="'people.form.changeReason' | transloco"
                  inputId="cf-p-reason"
                >
                  <input
                    id="cf-p-reason"
                    type="text"
                    maxlength="1000"
                    [placeholder]="'people.form.changeReasonPlaceholder' | transloco"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
              </app-card>
            } @else {
              <p class="text-[12.5px] text-fg-muted">
                {{ 'people.positionForm.requirementsLater' | transloco }}
              </p>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="cancel()">
                {{ 'common.cancel' | transloco }}
              </app-button>
              <app-button
                type="submit"
                [loading]="saving()"
                [disabled]="saving()"
                data-testid="position-save"
              >
                {{ (id() ? 'common.save' : 'people.positionForm.create') | transloco }}
              </app-button>
            </div>
          </form>
        }
      }

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="people" page="positionForm" />
        <app-people-lesson-link lesson="roles-and-responsibilities" />
      </div>
    </div>
  `,
})
export class PositionEditor {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly lookups = inject(PeopleLookups);

  readonly id = input<string | undefined>(undefined);

  protected readonly risks = RISK_LEVELS;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly original = signal<PositionDetail | null>(null);
  protected readonly seed = signal<PositionFormValue>(emptyPositionForm());
  protected readonly form = signal<PositionFormValue>(emptyPositionForm());
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly draftText = signal('');

  protected readonly assistInput = computed(() => {
    const f = this.form();
    return {
      title: f.title.trim(),
      description: textOrNull(f.description) ?? undefined,
      responsibilities: textOrNull(f.responsibilities) ?? undefined,
    };
  });
  protected readonly reportOptions = computed(() =>
    this.lookups.positions().filter((p) => p.id !== this.id() && p.status === 'active'),
  );
  protected readonly knownDepartment = computed(() =>
    this.lookups.departments().some((d) => d.id === this.form().department_id),
  );
  protected readonly knownOwner = computed(() =>
    this.lookups.users().some((u) => u.id === this.form().owner_user_id),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'position',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? this.language.translate('people.positionForm.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.lookups.ensureLoaded();
        if (id) {
          this.load(orgId, id);
        }
      });
    });
  }

  protected set<K extends keyof PositionFormValue>(key: K, value: PositionFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected useDraft(): void {
    this.set('responsibilities', this.draftText());
    this.draftText.set('');
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || !this.form().title.trim()) {
      return;
    }
    const id = this.id();
    this.saving.set(true);
    if (id) {
      const before = { ...toPositionFields(this.seed()), status: this.seed().status };
      const after = { ...toPositionFields(this.form()), status: this.form().status };
      const body: Record<string, unknown> = {};
      for (const key of Object.keys(after) as (keyof typeof after)[]) {
        if (after[key] !== before[key]) {
          body[key] = after[key];
        }
      }
      if (Object.keys(body).length === 0) {
        this.saving.set(false);
        this.notifications.info('people.notices.noChanges');
        this.cancel();
        return;
      }
      if (this.changeReason().trim()) {
        body['change_reason'] = this.changeReason().trim();
      }
      this.api.updatePosition(orgId, id, body).subscribe({
        next: () => this.done(id, 'people.notices.saved'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.api.createPosition(orgId, toPositionFields(this.form())).subscribe({
      next: (position) => this.done(position.id, 'people.notices.positionCreated'),
      error: (error: unknown) => this.failed(error),
    });
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/people/positions', id] : ['/people/positions']);
  }

  private done(id: string, key: string): void {
    this.saving.set(false);
    this.lookups.invalidate();
    this.notifications.success(key);
    void this.router.navigate(['/people/positions', id]);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(peopleErrorKey(error));
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getPosition(orgId, id).subscribe({
      next: (position) => {
        const value = formFromPosition(position);
        this.original.set(position);
        this.seed.set(value);
        this.form.set(value);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
