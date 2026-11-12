import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, catchError, forkJoin, from, mergeMap, of, toArray } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AI_ACT_ROLES,
  FRAMEWORK_KEYS,
  OrgModule,
  SIZE_BANDS,
  SetupState,
  emptyProfile,
} from '../../../core/modules/module.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleService } from '../../../core/modules/module.service';
import { ModulesApi, moduleErrorDetail } from '../../../core/modules/modules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ROLE_KEYS, roleDescriptionKey, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import {
  GUIDE_CLAUSES,
  frameworkDescriptionKey,
  frameworkNameKey,
  frameworkShortKey,
} from '../frameworks';
import { ModulesGuide } from '../guide/modules-guide';
import { ModulesLesson } from '../guide/modules-lesson';
import { moduleDescriptionKey, moduleNameKey, moduleNameList } from '../module-names';
import {
  createProfileForm,
  patchProfileForm,
  readProfileForm,
  selectedFrameworks,
} from '../profile/profile-form';
import {
  FirstTask,
  ModuleChoice,
  SETUP_STEPS,
  SetupStep,
  dueAt,
  firstTasksFor,
  initialSelection,
  moduleChoices,
  nextStep,
  previousStep,
  resumeStep,
} from './setup-steps';
import { SetupTasksApi } from './setup-tasks-api';

/** Roles worth pointing out per framework (the rest are listed too). */
const ROLE_HINTS: Readonly<Record<string, readonly string[]>> = {
  iso9001: ['quality_manager'],
  iso27001: ['ciso'],
  iso14001: ['hse_manager'],
  iso45001: ['hse_manager'],
  iso42001: ['ai_officer'],
  eu_ai_act: ['ai_officer'],
  gdpr: ['dpo'],
  nis2: ['ciso'],
};

type TaskOutcome = 'created' | 'unavailable' | 'failed' | null;

/**
 * The organisation setup wizard (`/setup`, `org:manage`): profile → frameworks
 * → recommended modules (with reasons and "Ask why") → roles → first tasks →
 * done. The current step is saved (`PUT /setup/step`) so the wizard resumes
 * where it was left; finishing turns the chosen modules on (never off) and
 * marks setup complete. It can be re-run from Settings at any time.
 */
@Component({
  selector: 'app-setup-wizard',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Alert,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    ModulesGuide,
    ModulesLesson,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let w = 'modules.setup';
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ w + '.title' | transloco }}
        </h1>
        <p class="mt-1.5 text-[14px] text-fg-muted">{{ w + '.subtitle' | transloco }}</p>
      </div>

      <app-modules-guide class="mb-5 block" page="setup" [steps]="3" [clauses]="clauses" />

      @if (!orgId()) {
        <app-card>
          <p class="py-8 text-center text-[14px] text-fg-muted">
            {{ 'modules.common.noOrg' | transloco }}
          </p>
        </app-card>
      } @else if (loading()) {
        <app-card>
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else {
        @if (state()?.completed_at; as completed) {
          @if (step() !== 'done' || !finished()) {
            <app-alert tone="info" class="mb-4 block">
              {{ w + '.rerunNotice' | transloco: { date: (completed | localDate) } }}
            </app-alert>
          }
        }

        <ol
          class="mb-5 flex flex-wrap gap-1.5"
          [attr.aria-label]="w + '.progressLabel' | transloco"
        >
          @for (s of steps; track s; let i = $index) {
            <li
              class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold"
              [class]="
                s === step()
                  ? 'border-accent bg-accent text-white'
                  : i < stepIndex()
                    ? 'border-accent-border bg-accent-soft text-accent'
                    : 'border-border bg-surface text-fg-muted'
              "
              [attr.aria-current]="s === step() ? 'step' : null"
            >
              <span class="tabular-nums">{{ i + 1 }}</span>
              {{ w + '.steps.' + s | transloco }}
            </li>
          }
        </ol>

        <app-card>
          <h2 class="mb-1 text-[18px] font-bold text-fg" tabindex="-1" #stepHeading>
            {{ w + '.' + step() + '.title' | transloco }}
          </h2>
          <p class="mb-4 text-[13.5px] text-fg-muted">
            {{ w + '.' + step() + '.body' | transloco }}
          </p>

          @switch (step()) {
            @case ('profile') {
              <form
                class="grid gap-4 md:grid-cols-2"
                [formGroup]="form"
                (ngSubmit)="next()"
                novalidate
              >
                <app-form-field
                  inputId="setup-industry"
                  [label]="'modules.profile.industry' | transloco"
                >
                  <input
                    id="setup-industry"
                    type="text"
                    formControlName="industry"
                    maxlength="64"
                    autocomplete="off"
                  />
                </app-form-field>
                <app-form-field
                  inputId="setup-size"
                  [label]="'modules.profile.sizeBand' | transloco"
                >
                  <select id="setup-size" formControlName="size_band">
                    <option value="">{{ 'modules.common.notSet' | transloco }}</option>
                    @for (band of sizeBands; track band) {
                      <option [value]="band">{{ 'modules.sizeBands.' + band | transloco }}</option>
                    }
                  </select>
                </app-form-field>
                <div class="md:col-span-2">
                  <app-form-field
                    inputId="setup-countries"
                    [label]="'modules.profile.countries' | transloco"
                  >
                    <input
                      id="setup-countries"
                      type="text"
                      formControlName="countries"
                      autocomplete="off"
                      [placeholder]="'modules.profile.countriesPlaceholder' | transloco"
                    />
                  </app-form-field>
                  @if (form.controls.countries.invalid && form.controls.countries.touched) {
                    <p role="alert" class="mt-1 text-[12px] font-medium text-fail">
                      {{ 'modules.profile.errors.countries' | transloco }}
                    </p>
                  }
                </div>
                <fieldset class="md:col-span-2">
                  <legend class="mb-2 text-[13px] font-semibold text-fg-muted">
                    {{ 'modules.profile.aiActRole' | transloco }}
                  </legend>
                  <div class="grid gap-2 sm:grid-cols-2">
                    @for (role of aiActRoles; track role) {
                      <label
                        class="flex cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2 hover:bg-surface-2"
                      >
                        <input
                          type="radio"
                          class="mt-1 accent-[var(--accent)]"
                          formControlName="ai_act_role"
                          [value]="role"
                        />
                        <span>
                          <span class="block text-[13px] font-semibold text-fg">{{
                            'modules.aiActRoles.' + role + '.name' | transloco
                          }}</span>
                          <span class="block text-[12px] text-fg-muted">{{
                            'modules.aiActRoles.' + role + '.description' | transloco
                          }}</span>
                        </span>
                      </label>
                    }
                  </div>
                </fieldset>
                <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
              </form>
            }
            @case ('frameworks') {
              <fieldset [formGroup]="form">
                <legend class="sr-only">{{ w + '.frameworks.title' | transloco }}</legend>
                <div class="grid gap-2 sm:grid-cols-2" formGroupName="frameworks">
                  @for (fw of frameworks; track fw) {
                    <label
                      class="flex cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        class="mt-1 accent-[var(--accent)]"
                        [formControlName]="fw"
                      />
                      <span>
                        <span class="block text-[13.5px] font-semibold text-fg">{{
                          frameworkNameKey(fw) | transloco
                        }}</span>
                        <span class="block text-[12.5px] text-fg-muted">{{
                          frameworkDescriptionKey(fw) | transloco
                        }}</span>
                      </span>
                    </label>
                  }
                </div>
              </fieldset>
              <p class="mt-3 text-[12.5px] text-fg-subtle">
                {{ w + '.frameworks.hint' | transloco }}
              </p>
            }
            @case ('modules') {
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p class="text-[13px] text-fg-muted" role="status">
                  {{ w + '.modules.selectedCount' | transloco: { count: selected().size } }}
                </p>
                <app-button
                  variant="secondary"
                  size="sm"
                  (click)="askWhy()"
                  [disabled]="choices().length === 0"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ w + '.modules.askWhy' | transloco }}
                </app-button>
              </div>
              @if (choices().length === 0) {
                <p
                  class="rounded-tile border border-dashed border-border px-3 py-6 text-center text-[13px] text-fg-muted"
                >
                  {{ w + '.modules.empty' | transloco }}
                </p>
              }
              <ul class="flex flex-col gap-2">
                @for (c of choices(); track c.key) {
                  <li>
                    <label
                      class="flex cursor-pointer items-start gap-3 rounded-tile border px-3 py-3 hover:bg-surface-2"
                      [class]="selected().has(c.key) ? 'border-accent-border' : 'border-border'"
                      [class.cursor-not-allowed]="c.alreadyEnabled"
                    >
                      <input
                        type="checkbox"
                        class="mt-1 accent-[var(--accent)]"
                        [checked]="selected().has(c.key)"
                        [disabled]="c.alreadyEnabled"
                        (change)="toggleModule(c.key, $any($event.target).checked)"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="flex flex-wrap items-center gap-2">
                          <span class="text-[14px] font-bold text-fg">{{
                            moduleNameKey(c.key) | transloco
                          }}</span>
                          @if (c.recommended) {
                            <app-badge tone="accent">{{
                              w + '.modules.recommended' | transloco
                            }}</app-badge>
                          }
                          @if (c.alreadyEnabled) {
                            <app-badge tone="pass">{{
                              w + '.modules.alreadyOn' | transloco
                            }}</app-badge>
                          }
                        </span>
                        <span class="mt-0.5 block text-[12.5px] text-fg-muted">{{
                          moduleDescriptionKey(c.key) | transloco
                        }}</span>
                        @if (c.recommended) {
                          <span class="mt-1 block text-[12.5px] text-fg">{{
                            c.reasonKey | transloco
                          }}</span>
                        }
                        @if (c.dependsOn.length) {
                          <span class="mt-1 block text-[12px] text-fg-subtle">
                            {{
                              'modules.settings.dependsOn'
                                | transloco: { modules: names(c.dependsOn) }
                            }}
                          </span>
                        }
                        @if (c.frameworks.length) {
                          <span class="mt-1.5 flex flex-wrap gap-1">
                            @for (fw of c.frameworks; track fw) {
                              <app-badge>{{ frameworkShortKey(fw) | transloco }}</app-badge>
                            }
                          </span>
                        }
                      </span>
                    </label>
                  </li>
                }
              </ul>
            }
            @case ('roles') {
              <ul class="grid gap-2 sm:grid-cols-2">
                @for (role of roles; track role) {
                  <li
                    class="rounded-tile border px-3 py-2.5"
                    [class]="
                      suggestedRoles().has(role)
                        ? 'border-accent-border bg-accent-soft/40'
                        : 'border-border'
                    "
                  >
                    <span class="flex flex-wrap items-center gap-2">
                      <span class="text-[13.5px] font-bold text-fg">{{
                        roleNameKey(role) | transloco
                      }}</span>
                      @if (suggestedRoles().has(role)) {
                        <app-badge tone="accent">{{
                          w + '.roles.suggested' | transloco
                        }}</app-badge>
                      }
                    </span>
                    <span class="mt-0.5 block text-[12.5px] text-fg-muted">{{
                      roleDescriptionKey(role) | transloco
                    }}</span>
                  </li>
                }
              </ul>
              <div class="mt-4 flex flex-wrap gap-2">
                <a
                  routerLink="/settings"
                  class="inline-flex h-8 items-center gap-2 rounded-tile border border-border bg-surface px-3 text-[13px] font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <app-icon name="userplus" [size]="15" /> {{ w + '.roles.invite' | transloco }}
                </a>
              </div>
            }
            @case ('tasks') {
              @if (taskOutcome() === 'unavailable') {
                <app-alert tone="info" class="mb-3 block">{{
                  w + '.tasks.unavailable' | transloco
                }}</app-alert>
              } @else if (taskOutcome() === 'created') {
                <app-alert tone="success" class="mb-3 block">
                  {{ w + '.tasks.created' | transloco: { count: createdCount() } }}
                </app-alert>
              } @else if (taskOutcome() === 'failed') {
                <app-alert class="mb-3 block">{{ w + '.tasks.failed' | transloco }}</app-alert>
              }
              <fieldset>
                <legend class="sr-only">{{ w + '.tasks.title' | transloco }}</legend>
                <ul class="flex flex-col gap-2">
                  @for (task of firstTasks(); track task.id) {
                    <li>
                      <label
                        class="flex cursor-pointer items-start gap-3 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          class="mt-1 accent-[var(--accent)]"
                          [checked]="chosenTasks().has(task.id)"
                          [disabled]="taskOutcome() === 'created'"
                          (change)="toggleTask(task.id, $any($event.target).checked)"
                        />
                        <span>
                          <span class="block text-[13.5px] font-semibold text-fg">{{
                            w + '.tasks.items.' + task.id + '.title' | transloco
                          }}</span>
                          <span class="block text-[12.5px] text-fg-muted">
                            {{ w + '.tasks.items.' + task.id + '.description' | transloco }}
                            {{ w + '.tasks.dueIn' | transloco: { days: task.dueInDays } }}
                          </span>
                        </span>
                      </label>
                    </li>
                  }
                </ul>
              </fieldset>
              @if (taskOutcome() !== 'created' && taskOutcome() !== 'unavailable') {
                <app-button
                  class="mt-3 inline-block"
                  variant="secondary"
                  size="sm"
                  [loading]="creatingTasks()"
                  [disabled]="chosenTasks().size === 0"
                  (click)="createTasks()"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ w + '.tasks.create' | transloco: { count: chosenTasks().size } }}
                </app-button>
              }
            }
            @case ('done') {
              @if (finished(); as result) {
                <app-alert tone="success" class="mb-3 block">{{
                  w + '.done.finished' | transloco
                }}</app-alert>
                @if (result.length) {
                  <p class="text-[13.5px] text-fg">
                    {{ w + '.done.enabledList' | transloco: { modules: names(result) } }}
                  </p>
                }
                <div class="mt-4 flex flex-wrap gap-2">
                  <a
                    routerLink="/dashboard"
                    class="inline-flex h-9 items-center gap-2 rounded-tile border border-transparent bg-accent px-4 text-[13.5px] font-semibold text-white hover:bg-accent-2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {{ w + '.done.toDashboard' | transloco }}
                  </a>
                  <a
                    routerLink="/settings/modules"
                    class="inline-flex h-9 items-center gap-2 rounded-tile border border-border bg-surface px-4 text-[13.5px] font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {{ w + '.done.toModules' | transloco }}
                  </a>
                </div>
              } @else {
                <p class="text-[13.5px] text-fg">
                  {{
                    (selected().size ? w + '.done.summary' : w + '.done.summaryNone')
                      | transloco: { modules: names(selectedList()) }
                  }}
                </p>
              }
            }
          }

          @if (error(); as message) {
            <app-alert class="mt-4 block">{{ message | transloco }}</app-alert>
          }

          @if (!finished()) {
            <div
              class="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4"
            >
              <app-button
                variant="ghost"
                [disabled]="step() === 'profile' || busy()"
                (click)="back()"
              >
                {{ w + '.back' | transloco }}
              </app-button>
              @if (step() === 'done') {
                <app-button [loading]="busy()" (click)="finish()">{{
                  w + '.finish' | transloco
                }}</app-button>
              } @else {
                <app-button [loading]="busy()" (click)="next()">
                  {{
                    (step() === 'tasks' && taskOutcome() === null ? w + '.skip' : w + '.next')
                      | transloco
                  }}
                </app-button>
              }
            </div>
          }
        </app-card>

        @if (step() === 'modules' || step() === 'frameworks') {
          <app-modules-lesson class="mt-5 block" />
        }
      }
    </div>
  `,
})
export class SetupWizard {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ModulesApi);
  private readonly tasksApi = inject(SetupTasksApi);
  private readonly moduleService = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  protected readonly clauses = GUIDE_CLAUSES.setup;
  protected readonly steps = SETUP_STEPS;
  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly sizeBands = SIZE_BANDS;
  protected readonly aiActRoles = AI_ACT_ROLES;
  protected readonly roles = ROLE_KEYS;
  protected readonly frameworkShortKey = frameworkShortKey;
  protected readonly frameworkNameKey = frameworkNameKey;
  protected readonly frameworkDescriptionKey = frameworkDescriptionKey;
  protected readonly moduleNameKey = moduleNameKey;
  protected readonly moduleDescriptionKey = moduleDescriptionKey;
  protected readonly roleNameKey = roleNameKey;
  protected readonly roleDescriptionKey = roleDescriptionKey;

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly step = signal<SetupStep>('profile');
  protected readonly state = signal<SetupState | null>(null);
  private readonly modules = signal<readonly OrgModule[]>([]);

  protected readonly choices = signal<readonly ModuleChoice[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedList = computed(() => [...this.selected()].sort());
  private readonly chosenFrameworks = signal<readonly string[]>([]);

  protected readonly chosenTasks = signal<ReadonlySet<string>>(new Set());
  protected readonly creatingTasks = signal(false);
  protected readonly taskOutcome = signal<TaskOutcome>(null);
  protected readonly createdCount = signal(0);

  /** Module keys enabled when the wizard finished (null until then). */
  protected readonly finished = signal<readonly string[] | null>(null);

  protected readonly form = createProfileForm(this.fb);

  protected readonly stepIndex = computed(() => SETUP_STEPS.indexOf(this.step()));
  protected readonly firstTasks = computed<FirstTask[]>(() => {
    const on = new Set([
      ...this.selected(),
      ...this.modules()
        .filter((m) => m.enabled)
        .map((m) => m.key),
    ]);
    return firstTasksFor(on);
  });
  protected readonly suggestedRoles = computed(() => {
    const roles = new Set<string>(['admin']);
    for (const fw of this.chosenFrameworks()) {
      for (const role of ROLE_HINTS[fw] ?? []) {
        roles.add(role);
      }
    }
    return roles;
  });

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.finished.set(null);
        this.taskOutcome.set(null);
        if (orgId) {
          this.load(orgId);
        }
      });
    });
  }

  protected names(keys: readonly string[]): string {
    return moduleNameList((key) => this.language.translate(key), this.language.active(), keys);
  }

  protected toggleModule(key: string, on: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (on) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  protected toggleTask(id: string, on: boolean): void {
    this.chosenTasks.update((set) => {
      const next = new Set(set);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected back(): void {
    this.error.set(null);
    this.goTo(previousStep(this.step()));
  }

  protected next(): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.error.set(null);
    const step = this.step();
    if (step === 'profile' || step === 'frameworks') {
      if (this.form.invalid) {
        this.form.markAllAsTouched();
        return;
      }
      this.busy.set(true);
      this.api.updateProfile(orgId, readProfileForm(this.form)).subscribe({
        next: (profile) => {
          patchProfileForm(this.fb, this.form, profile);
          if (step === 'frameworks') {
            this.loadRecommendations(orgId, () => this.advance(orgId));
          } else {
            this.advance(orgId);
          }
        },
        error: () => {
          this.busy.set(false);
          this.error.set('modules.profile.errors.save');
        },
      });
      return;
    }
    if (step === 'modules' && this.choices().length === 0) {
      // Resumed straight into this step: nothing loaded yet.
      this.busy.set(true);
      this.loadRecommendations(orgId, () => this.advance(orgId));
      return;
    }
    this.busy.set(true);
    this.advance(orgId);
  }

  protected createTasks(): void {
    const orgId = this.orgId();
    const chosen = this.firstTasks().filter((task) => this.chosenTasks().has(task.id));
    if (!orgId || chosen.length === 0 || this.creatingTasks()) {
      return;
    }
    this.creatingTasks.set(true);
    from(chosen)
      .pipe(
        mergeMap(
          (task) =>
            this.tasksApi
              .create(orgId, {
                title: this.transloco.translate(`modules.setup.tasks.items.${task.id}.title`),
                description: this.transloco.translate(
                  `modules.setup.tasks.items.${task.id}.description`,
                ),
                due_at: dueAt(task.dueInDays),
                priority: 'normal',
                kind: 'setup',
              })
              .pipe(
                catchError((err: unknown) =>
                  of(
                    err instanceof HttpErrorResponse && err.status === 404
                      ? 'unavailable'
                      : 'failed',
                  ),
                ),
              ) as Observable<unknown>,
          1,
        ),
        toArray(),
      )
      .subscribe((results) => {
        this.creatingTasks.set(false);
        const created = results.filter((r) => typeof r === 'object' && r !== null).length;
        this.createdCount.set(created);
        if (results.includes('unavailable') && created === 0) {
          this.taskOutcome.set('unavailable');
        } else if (results.includes('failed') || results.includes('unavailable')) {
          this.taskOutcome.set(created ? 'created' : 'failed');
        } else {
          this.taskOutcome.set('created');
        }
      });
  }

  protected askWhy(): void {
    const recommended = this.choices()
      .filter((c) => c.recommended)
      .map((c) => c.key);
    const value = readProfileForm(this.form);
    this.ask.showWith(
      this.transloco.translate('modules.setup.modules.askWhyPrompt', {
        frameworks: value.frameworks.length
          ? value.frameworks.map((fw) => this.transloco.translate(frameworkShortKey(fw))).join(', ')
          : '-',
        industry: value.industry ?? '-',
        size: value.size_band ?? '-',
        modules: recommended.length ? this.names(recommended) : '-',
      }),
    );
  }

  protected finish(): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.completeSetup(orgId, { modules: this.selectedList(), step: 'done' }).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.finished.set(result.enabled);
        this.state.set({ completed_at: result.completed_at, step: 'done' });
        this.moduleService.reload();
        this.notifications.success('modules.setup.done.finishedToast');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const detail = moduleErrorDetail(err);
        this.error.set(
          detail?.code === 'unknown_modules'
            ? 'modules.setup.errors.unknownModules'
            : 'modules.common.saveFailed',
        );
      },
    });
  }

  private advance(orgId: string): void {
    const target = nextStep(this.step());
    this.api.setSetupStep(orgId, target).subscribe({
      next: (state) => {
        this.busy.set(false);
        this.state.set(state);
        this.goTo(target);
      },
      // The resume point is best-effort; never block the wizard on it.
      error: () => {
        this.busy.set(false);
        this.goTo(target);
      },
    });
  }

  private goTo(step: SetupStep, focus = true): void {
    const changed = this.step() !== step;
    this.step.set(step);
    if (focus && changed) {
      // Move focus to the new step's heading so keyboard and screen-reader users follow along.
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    }
    this.chosenFrameworks.set(selectedFrameworks(this.form));
    if (step === 'tasks' && this.chosenTasks().size === 0 && this.taskOutcome() === null) {
      this.chosenTasks.set(new Set(this.firstTasks().map((task) => task.id)));
    }
  }

  private loadRecommendations(orgId: string, then: () => void): void {
    const value = readProfileForm(this.form);
    forkJoin([
      this.api.recommendations(orgId, {
        frameworks: value.frameworks,
        industry: value.industry,
        size_band: value.size_band,
      }),
      this.api.list(orgId).pipe(catchError(() => of(this.modules() as OrgModule[]))),
    ]).subscribe({
      next: ([recommendations, modules]) => {
        this.modules.set(modules);
        const choices = moduleChoices(recommendations.modules, modules);
        this.choices.set(choices);
        this.selected.set(initialSelection(choices));
        then();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('modules.setup.errors.recommendations');
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    forkJoin([
      this.api.getProfile(orgId).pipe(catchError(() => of(emptyProfile(orgId)))),
      this.api.setup(orgId).pipe(catchError(() => of(null))),
      this.api.list(orgId).pipe(catchError(() => of([] as OrgModule[]))),
    ]).subscribe(([profile, state, modules]) => {
      if (this.orgId() !== orgId) {
        return;
      }
      this.state.set(state);
      this.modules.set(modules);
      patchProfileForm(this.fb, this.form, profile);
      const step = resumeStep(state);
      this.loading.set(false);
      this.goTo(step, false);
      if (step === 'modules' || step === 'roles' || step === 'tasks') {
        this.loadRecommendations(orgId, () => undefined);
      }
    });
  }
}
