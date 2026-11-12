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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull, changedFields, parseIntOrNull, todayIso } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { IctDetail, IctFields, OUTCOMES, Outcome } from '../data/continuity.models';
import { ContinuityDurationInput } from '../shared/duration';
import { ContinuityUserSelect } from '../shared/user-select';

export interface IctDraft {
  name: string;
  description: string;
  owner_user_id: string;
  provider: string;
  achievable_rto_minutes: number | null;
  achievable_rpo_minutes: number | null;
  recovery_strategy: string;
  backup_strategy: string;
  test_interval_months: string;
  last_tested_on: string;
  last_test_outcome: Outcome | '';
}

export function ictDraft(s: IctDetail | null): IctDraft {
  return {
    name: s?.name ?? '',
    description: s?.description ?? '',
    owner_user_id: s?.owner?.id ?? '',
    provider: s?.provider ?? '',
    achievable_rto_minutes: s?.achievable_rto_minutes ?? null,
    achievable_rpo_minutes: s?.achievable_rpo_minutes ?? null,
    recovery_strategy: s?.recovery_strategy ?? '',
    backup_strategy: s?.backup_strategy ?? '',
    test_interval_months: s ? String(s.test_interval_months) : '12',
    last_tested_on: s?.last_tested_on ?? '',
    last_test_outcome: s?.last_test_outcome ?? '',
  };
}

export function ictFields(d: IctDraft): IctFields {
  const interval = parseIntOrNull(d.test_interval_months);
  return {
    name: d.name.trim(),
    description: blankToNull(d.description),
    owner_user_id: d.owner_user_id || null,
    provider: blankToNull(d.provider),
    achievable_rto_minutes: d.achievable_rto_minutes,
    achievable_rpo_minutes: d.achievable_rpo_minutes,
    recovery_strategy: blankToNull(d.recovery_strategy),
    backup_strategy: blankToNull(d.backup_strategy),
    test_interval_months: interval !== null && Number.isFinite(interval) ? interval : null,
    last_tested_on: d.last_tested_on || null,
    last_test_outcome: d.last_test_outcome || null,
  };
}

/**
 * Register (`/continuity/ict-systems/new`) or edit (`/continuity/ict-systems/:id/edit`)
 * an ICT service and its recovery capability: achievable RTO/RPO, recovery and
 * backup strategies, the test cycle and the last test. Tests run as exercises later
 * update the last test automatically.
 */
@Component({
  selector: 'app-ict-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    Alert,
    AskAbout,
    Button,
    Card,
    ContinuityDurationInput,
    ContinuityUserSelect,
    FieldHelp,
    FormField,
    GuideIntro,
    Icon,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[920px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/continuity/ict-systems', id()] : '/continuity/ict-systems'"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ (id() ? 'continuity.common.backToRecord' : 'continuity.ict.back') | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'continuity.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        }
        @default {
          <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            @if (system(); as s) {
              {{ 'continuity.ict.editTitle' | transloco: { code: s.code, title: s.name } }}
            } @else {
              {{ 'continuity.ict.newTitle' | transloco }}
            }
          </h1>
          @if (system()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            <div class="mt-3 mb-4"><app-guide-intro scope="continuity" page="ictForm" /></div>
            <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
              <app-card>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.name' | transloco"
                      inputId="ict-name"
                    >
                      <input
                        id="ict-name"
                        type="text"
                        maxlength="255"
                        required
                        [attr.aria-invalid]="showErrors() && !d().name.trim()"
                        [value]="d().name"
                        (input)="set('name', $any($event.target).value)"
                      />
                    </app-form-field>
                    @if (showErrors() && !d().name.trim()) {
                      <p class="mt-1 text-[12px] text-fail" role="alert">
                        {{ 'continuity.form.errors.nameRequired' | transloco }}
                      </p>
                    }
                  </div>
                  <app-form-field
                    [label]="'continuity.fields.provider' | transloco"
                    inputId="ict-provider"
                  >
                    <input
                      id="ict-provider"
                      type="text"
                      maxlength="255"
                      [value]="d().provider"
                      (input)="set('provider', $any($event.target).value)"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'continuity.fields.owner' | transloco"
                    inputId="ict-owner"
                  >
                    <app-continuity-user-select
                      inputId="ict-owner"
                      [value]="d().owner_user_id"
                      [currentName]="system()?.owner?.name ?? null"
                      (valueChange)="set('owner_user_id', $event)"
                    />
                  </app-form-field>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.description' | transloco"
                      inputId="ict-desc"
                    >
                      <textarea
                        id="ict-desc"
                        rows="3"
                        maxlength="20000"
                        [value]="d().description"
                        (input)="set('description', $any($event.target).value)"
                      ></textarea>
                    </app-form-field>
                  </div>
                </div>
              </app-card>

              <app-card>
                <div class="mb-3 flex items-center gap-1">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'continuity.ict.capability' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'continuity.ai.prompts.ictCapability' | transloco"
                    field="achievable_rto_minutes"
                  />
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div class="flex items-center gap-1">
                      <app-field-help
                        scope="continuity"
                        page="ictForm"
                        field="achievable_rto_minutes"
                      />
                    </div>
                    <app-form-field
                      [label]="'continuity.fields.achievableRto' | transloco"
                      inputId="ict-rto"
                    >
                      <app-continuity-duration-input
                        inputId="ict-rto"
                        [value]="d().achievable_rto_minutes"
                        (valueChange)="set('achievable_rto_minutes', $event)"
                      />
                    </app-form-field>
                  </div>
                  <div>
                    <div class="flex items-center gap-1">
                      <app-field-help
                        scope="continuity"
                        page="ictForm"
                        field="achievable_rpo_minutes"
                      />
                    </div>
                    <app-form-field
                      [label]="'continuity.fields.achievableRpo' | transloco"
                      inputId="ict-rpo"
                    >
                      <app-continuity-duration-input
                        inputId="ict-rpo"
                        [value]="d().achievable_rpo_minutes"
                        (valueChange)="set('achievable_rpo_minutes', $event)"
                      />
                    </app-form-field>
                  </div>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.recoveryStrategy' | transloco"
                      inputId="ict-recovery"
                    >
                      <textarea
                        id="ict-recovery"
                        rows="3"
                        maxlength="20000"
                        [value]="d().recovery_strategy"
                        (input)="set('recovery_strategy', $any($event.target).value)"
                      ></textarea>
                    </app-form-field>
                  </div>
                  <div class="sm:col-span-2">
                    <div class="flex items-center gap-1">
                      <app-field-help scope="continuity" page="ictForm" field="backup_strategy" />
                    </div>
                    <app-form-field
                      [label]="'continuity.fields.backupStrategy' | transloco"
                      inputId="ict-backup"
                    >
                      <textarea
                        id="ict-backup"
                        rows="3"
                        maxlength="20000"
                        [value]="d().backup_strategy"
                        (input)="set('backup_strategy', $any($event.target).value)"
                      ></textarea>
                    </app-form-field>
                  </div>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.ict.testing' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <div class="flex items-center gap-1">
                      <app-field-help
                        scope="continuity"
                        page="ictForm"
                        field="test_interval_months"
                      />
                    </div>
                    <app-form-field
                      [label]="'continuity.fields.testInterval' | transloco"
                      inputId="ict-interval"
                    >
                      <input
                        id="ict-interval"
                        type="number"
                        min="1"
                        max="120"
                        [attr.aria-invalid]="showErrors() && !intervalValid()"
                        [value]="d().test_interval_months"
                        (input)="set('test_interval_months', $any($event.target).value)"
                      />
                    </app-form-field>
                    @if (showErrors() && !intervalValid()) {
                      <p class="mt-1 text-[12px] text-fail" role="alert">
                        {{ 'continuity.form.errors.interval' | transloco }}
                      </p>
                    }
                  </div>
                  <app-form-field
                    [label]="'continuity.fields.lastTested' | transloco"
                    inputId="ict-tested"
                  >
                    <input
                      id="ict-tested"
                      type="date"
                      [max]="today"
                      [value]="d().last_tested_on"
                      (input)="set('last_tested_on', $any($event.target).value)"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'continuity.fields.lastOutcome' | transloco"
                    inputId="ict-outcome"
                  >
                    <select
                      id="ict-outcome"
                      (change)="set('last_test_outcome', $any($event.target).value)"
                    >
                      <option value="" [selected]="!d().last_test_outcome">
                        {{ 'continuity.common.notSet' | transloco }}
                      </option>
                      @for (o of outcomes; track o) {
                        <option [value]="o" [selected]="d().last_test_outcome === o">
                          {{ 'continuity.outcome.' + o | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                </div>
              </app-card>

              @if (error(); as key) {
                <app-alert>{{ key | transloco }}</app-alert>
              }
              <div class="flex flex-wrap items-center justify-end gap-2">
                <app-button variant="ghost" (click)="back()">
                  {{ 'common.cancel' | transloco }}
                </app-button>
                <app-button type="submit" [loading]="busy()">
                  {{ (system() ? 'continuity.form.save' : 'continuity.ict.create') | transloco }}
                </app-button>
              </div>
            </form>
            <div class="mt-6"><app-why-it-matters scope="continuity" page="ictForm" /></div>
          }
        }
      }
    </div>
  `,
})
export class IctEditor {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>(undefined);

  protected readonly outcomes = OUTCOMES;
  protected readonly today = todayIso();
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly system = signal<IctDetail | null>(null);
  protected readonly d = signal<IctDraft>(ictDraft(null));
  protected readonly showErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly intervalValid = computed(() => {
    const n = parseIntOrNull(this.d().test_interval_months);
    return n === null || (Number.isFinite(n) && n >= 1 && n <= 120);
  });
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_ict_system',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.system()?.name ?? this.language.translate('continuity.ict.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !id) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.getIct(orgId, id).subscribe({
          next: (s) => {
            this.system.set(s);
            this.d.set(ictDraft(s));
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected set<K extends keyof IctDraft>(key: K, value: IctDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    if (!this.d().name.trim() || !this.intervalValid()) {
      this.showErrors.set(true);
      return;
    }
    const fields = ictFields(this.d());
    const current = this.system();
    this.error.set(null);
    if (!current) {
      this.busy.set(true);
      this.api.createIct(orgId, fields).subscribe({
        next: (s) => {
          this.busy.set(false);
          this.notifications.success('continuity.ict.created', { code: s.code });
          void this.router.navigate(['/continuity/ict-systems', s.id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
      return;
    }
    const changes = changedFields(ictFields(ictDraft(current)), fields);
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.api.updateIct(orgId, current.id, changes).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('continuity.form.saved');
        this.back();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(continuityErrorKey(err));
      },
    });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/continuity/ict-systems', id] : ['/continuity/ict-systems']);
  }
}
