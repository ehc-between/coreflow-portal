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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, concatMap, forkJoin, from, map, of, switchMap, toArray } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AI_ACT_ROLES,
  FRAMEWORK_KEYS,
  OrgModule,
  PackagesResponse,
  SIZE_BANDS,
  SetupState,
  StarterKind,
  StarterKindKey,
  StartersResponse,
  emptyProfile,
} from '../../../core/modules/module.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleService } from '../../../core/modules/module.service';
import { ModulesApi, moduleErrorDetail } from '../../../core/modules/modules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import { HomeApi } from '../../dashboard/data/home-api';
import { apiErrorCode, hasJourney, journeyUrl } from '../../dashboard/data/home-format';
import { frameworkDescriptionKey, frameworkNameKey, frameworkShortKey } from '../frameworks';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { moduleDescriptionKey, moduleNameKey, moduleNameList } from '../module-names';
import {
  createProfileForm,
  patchProfileForm,
  readProfileForm,
  selectedFrameworks,
} from '../profile/profile-form';
import {
  ModuleChoice,
  SETUP_STEPS,
  STARTER_MODULE,
  SetupStep,
  initialSelection,
  isStarterStep,
  moduleChoices,
  resumeStep,
  stepAfter,
  stepBefore,
} from './setup-steps';

/**
 * The organisation setup wizard (`/setup`, `org:manage`). U09: five short confirm
 * screens instead of a long module list:
 *
 * 1. profile, pre-filled from the Brønnøysund register (organisation number);
 * 2. standards: a plain package (Internkontroll/HMS, Kvalitet ISO 9001,
 *    Informasjonssikkerhet + personvern, Full styring) or the standards one by one;
 * 3. modules: the package's modules preselected ("Du har 10 av 28 områder på");
 *    continuing switches them on (never off), so the starter records can be created;
 * 4. "Legg til 12 policyer →", "Legg til 14 risikoer →", "Legg til 6
 *    behandlingsaktiviteter →": starter templates a person ticks and confirms, created
 *    through the normal endpoints (a step is hidden when its module is off);
 * 5. done: the result, a first document (Dokumenter og rapporter) and the guided
 *    journey with a target audit date.
 *
 * The current step is saved (`PUT /setup/step`) so the wizard resumes where it was
 * left. It can be re-run from Settings at any time.
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
    HelpStrip,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let w = 'modules.setup';
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <div class="mb-[18px]">
        <h1 class="font-display text-page font-bold text-fg">
          {{ w + '.title' | transloco }}
        </h1>
        <p class="mt-1.5 text-body text-fg-muted">{{ w + '.subtitle' | transloco }}</p>
      </div>

      <app-help-strip scope="settings" page="setup" lesson="modules-basics" />

      @if (!orgId()) {
        <app-card>
          <p class="py-8 text-center text-body text-fg-muted">
            {{ 'modules.common.noOrg' | transloco }}
          </p>
        </app-card>
      } @else if (loading()) {
        <app-card>
          <p class="py-10 text-center text-body text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else {
        @if (state()?.completed_at; as completed) {
          @if ((step() !== 'done' || !finished()) && !modulesSaved()) {
            <app-alert tone="info" class="mb-4 block">
              {{ w + '.rerunNotice' | transloco: { date: (completed | localDate) } }}
            </app-alert>
          }
        }

        <ol
          class="mb-5 flex flex-wrap gap-1.5"
          [attr.aria-label]="w + '.progressLabel' | transloco"
        >
          @for (s of shownSteps(); track s; let i = $index) {
            <li
              class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-meta font-semibold"
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
          <h2 class="mb-1 text-section font-bold text-fg" tabindex="-1" #stepHeading>
            {{ w + '.' + step() + '.title' | transloco }}
          </h2>
          <p class="mb-4 text-ui text-fg-muted">
            {{ w + '.' + step() + '.body' | transloco }}
          </p>

          @switch (step()) {
            @case ('profile') {
              <!-- U09: pre-fill from the Brønnøysund register -->
              <div class="mb-4 rounded-tile border border-border bg-surface-2 p-3">
                <div class="flex flex-wrap items-end gap-2">
                  <app-form-field
                    class="min-w-[200px] flex-1"
                    inputId="setup-orgnr"
                    [label]="w + '.lookup.label' | transloco"
                  >
                    <input
                      id="setup-orgnr"
                      type="text"
                      inputmode="numeric"
                      maxlength="11"
                      autocomplete="off"
                      [value]="orgnr()"
                      (input)="orgnr.set($any($event.target).value)"
                      (keydown.enter)="lookup()"
                    />
                  </app-form-field>
                  <app-button
                    (click)="lookup()"
                    variant="secondary"
                    [loading]="lookupBusy()"
                    [disabled]="!orgnr().trim()"
                    data-testid="setup-lookup"
                  >
                    {{ w + '.lookup.button' | transloco }}
                  </app-button>
                </div>
                <p class="mt-1.5 text-meta text-fg-subtle">{{ w + '.lookup.hint' | transloco }}</p>
                @if (lookupFound(); as found) {
                  <p class="mt-2 text-ui text-pass-ink" role="status">
                    {{ w + '.lookup.found' | transloco: { name: found } }}
                  </p>
                } @else if (lookupError(); as key) {
                  <p class="mt-2 text-ui text-fail-ink" role="alert">{{ key | transloco }}</p>
                }
              </div>
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
                    <p role="alert" class="mt-1 text-meta font-medium text-fail">
                      {{ 'modules.profile.errors.countries' | transloco }}
                    </p>
                  }
                </div>
                <fieldset class="md:col-span-2">
                  <legend class="mb-2 text-ui font-semibold text-fg-muted">
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
                          <span class="block text-ui font-semibold text-fg">{{
                            'modules.aiActRoles.' + role + '.name' | transloco
                          }}</span>
                          <span class="block text-meta text-fg-muted">{{
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
              <!-- U09: plain packages first; the standards list is the fine-tuning -->
              @if (packages(); as p) {
                <fieldset class="mb-5">
                  <legend class="mb-2 text-ui font-semibold text-fg">
                    {{ 'modules.packages.title' | transloco }}
                  </legend>
                  <div class="grid gap-2 sm:grid-cols-2" data-testid="setup-packages">
                    @for (pkg of p.items; track pkg.key) {
                      <label
                        class="flex cursor-pointer items-start gap-2.5 rounded-tile border px-3 py-2.5 hover:bg-surface-2"
                        [class]="
                          chosenPackage() === pkg.key
                            ? 'border-accent bg-accent-soft/40'
                            : 'border-border'
                        "
                      >
                        <input
                          type="radio"
                          name="setup-package"
                          class="mt-1 accent-[var(--accent)]"
                          [checked]="chosenPackage() === pkg.key"
                          (change)="choosePackage(pkg.key)"
                        />
                        <span>
                          <span class="block text-ui font-semibold text-fg">{{
                            'modules.packages.items.' + pkg.key + '.name' | transloco
                          }}</span>
                          <span class="block text-meta text-fg-muted">{{
                            'modules.packages.items.' + pkg.key + '.description' | transloco
                          }}</span>
                          <span class="mt-1 block text-meta text-fg-subtle">{{
                            'modules.packages.moduleCount'
                              | transloco: { count: pkg.module_count, total: p.total }
                          }}</span>
                        </span>
                      </label>
                    }
                  </div>
                </fieldset>
                <p class="mb-2 text-ui font-semibold text-fg">
                  {{ w + '.frameworks.custom' | transloco }}
                </p>
              }
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
                        <span class="block text-ui font-semibold text-fg">{{
                          frameworkNameKey(fw) | transloco
                        }}</span>
                        <span class="block text-meta text-fg-muted">{{
                          frameworkDescriptionKey(fw) | transloco
                        }}</span>
                      </span>
                    </label>
                  }
                </div>
              </fieldset>
              <p class="mt-3 text-meta text-fg-subtle">
                {{ w + '.frameworks.hint' | transloco }}
              </p>
            }
            @case ('modules') {
              @if (packages(); as p) {
                <p
                  class="mb-3 rounded-tile bg-accent-soft px-3 py-2 text-ui text-fg"
                  data-testid="setup-coverage"
                >
                  {{ 'modules.packages.coverage' | transloco: { on: onCount(), total: p.total } }}
                  @if (chosenPackage(); as pkg) {
                    {{
                      'modules.packages.enough'
                        | transloco
                          : { package: ('modules.packages.items.' + pkg + '.name' | transloco) }
                    }}
                  }
                </p>
              }
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p class="text-ui text-fg-muted" role="status">
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
                  class="rounded-tile border border-dashed border-border px-3 py-6 text-center text-ui text-fg-muted"
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
                          <span class="text-body font-bold text-fg">{{
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
                        <span class="mt-0.5 block text-meta text-fg-muted">{{
                          moduleDescriptionKey(c.key) | transloco
                        }}</span>
                        @if (c.recommended) {
                          <span class="mt-1 block text-meta text-fg">{{
                            c.reasonKey | transloco
                          }}</span>
                        }
                        @if (c.dependsOn.length) {
                          <span class="mt-1 block text-meta text-fg-subtle">
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
            @case ('done') {
              @if (finished(); as result) {
                <app-alert tone="success" class="mb-3 block">{{
                  w + '.done.finished' | transloco
                }}</app-alert>
                @if (result.length) {
                  <p class="text-ui text-fg">
                    {{ w + '.done.enabledList' | transloco: { modules: names(result) } }}
                  </p>
                }
                @if (createdTotal()) {
                  <p class="mt-1 text-ui text-fg" data-testid="setup-created">
                    {{ w + '.done.created' | transloco: createdCounts() }}
                  </p>
                }
                <!-- U09: the flow ends with a first document built from the data -->
                <div
                  class="mt-4 rounded-tile border border-border bg-surface p-4"
                  data-testid="setup-first-document"
                >
                  <p class="text-ui font-semibold text-fg">
                    {{ w + '.done.firstDocTitle' | transloco }}
                  </p>
                  <p class="mt-1 text-ui text-fg-muted">
                    {{ w + '.done.firstDocBody' | transloco }}
                  </p>
                  <a
                    routerLink="/library"
                    class="mt-3 inline-flex h-9 items-center gap-2 rounded-tile border border-transparent bg-accent px-4 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {{ w + '.done.firstDocCta' | transloco }}
                  </a>
                </div>
                @if (journeyFrameworks().length && canStartJourney()) {
                  <div
                    class="mt-4 rounded-tile border border-accent-border bg-accent-soft p-4"
                    data-testid="setup-journeys"
                  >
                    <p class="text-ui font-semibold text-fg">
                      {{ w + '.done.journeyTitle' | transloco }}
                    </p>
                    <p class="mt-1 text-ui text-fg-muted">
                      {{ w + '.done.journeyBody' | transloco }}
                    </p>
                    <label class="mt-3 flex flex-wrap items-center gap-2 text-ui text-fg">
                      <span>{{ w + '.done.targetLabel' | transloco }}</span>
                      <input
                        type="date"
                        class="h-8 rounded-tile border border-border bg-surface px-2 text-ui text-fg"
                        [value]="targetDate()"
                        (change)="targetDate.set($any($event.target).value)"
                        data-testid="setup-target-date"
                      />
                    </label>
                    <p class="mt-1 text-meta text-fg-subtle">
                      {{ w + '.done.targetHint' | transloco }}
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      @for (fw of journeyFrameworks(); track fw; let first = $first) {
                        <app-button
                          size="sm"
                          [variant]="first ? 'primary' : 'secondary'"
                          [loading]="startingJourney() === fw"
                          [disabled]="startingJourney() !== null"
                          (click)="startJourney(fw)"
                        >
                          {{
                            w + '.done.startJourney'
                              | transloco: { standard: (frameworkShortKey(fw) | transloco) }
                          }}
                        </app-button>
                      }
                    </div>
                  </div>
                }
                <div class="mt-4 flex flex-wrap gap-2">
                  <a
                    routerLink="/dashboard"
                    class="inline-flex h-9 items-center gap-2 rounded-tile border border-transparent bg-accent px-4 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {{ w + '.done.toDashboard' | transloco }}
                  </a>
                  <a
                    routerLink="/settings/modules"
                    class="inline-flex h-9 items-center gap-2 rounded-tile border border-border bg-surface px-4 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {{ w + '.done.toModules' | transloco }}
                  </a>
                </div>
              } @else {
                <p class="text-ui text-fg">
                  {{
                    (selected().size ? w + '.done.summary' : w + '.done.summaryNone')
                      | transloco: { modules: names(selectedList()) }
                  }}
                </p>
                @if (createdTotal()) {
                  <p class="mt-1 text-ui text-fg">
                    {{ w + '.done.created' | transloco: createdCounts() }}
                  </p>
                }
              }
            }
            @default {
              <!-- U09: "Legg til 12 policyer" / 14 risikoer / 6 behandlingsaktiviteter -->
              @if (starterKind(); as kind) {
                @if (starterData(kind); as data) {
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p class="text-ui text-fg-muted" role="status">
                      {{ w + '.starters.chosen' | transloco: { count: chosenStarters(kind).size } }}
                    </p>
                    <span class="flex gap-2">
                      <app-button variant="ghost" size="sm" (click)="selectAllStarters(kind, true)">
                        {{ w + '.starters.all' | transloco }}
                      </app-button>
                      <app-button
                        variant="ghost"
                        size="sm"
                        (click)="selectAllStarters(kind, false)"
                      >
                        {{ w + '.starters.none' | transloco }}
                      </app-button>
                    </span>
                  </div>
                  <ul class="flex flex-col gap-2" [attr.data-testid]="'setup-starters-' + kind">
                    @for (item of data.items; track item.key) {
                      <li>
                        <label
                          class="flex cursor-pointer items-start gap-3 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                          [class.cursor-not-allowed]="item.exists"
                        >
                          <input
                            type="checkbox"
                            class="mt-1 accent-[var(--accent)]"
                            [checked]="chosenStarters(kind).has(item.key)"
                            [disabled]="item.exists || addingStarters()"
                            (change)="toggleStarter(kind, item.key, $any($event.target).checked)"
                          />
                          <span class="min-w-0 flex-1">
                            <span class="flex flex-wrap items-center gap-2">
                              <span class="text-ui font-semibold text-fg">{{ item.title }}</span>
                              @if (item.exists) {
                                <app-badge tone="pass">{{
                                  w + '.starters.exists' | transloco
                                }}</app-badge>
                              }
                            </span>
                            <span class="block text-meta text-fg-muted">{{ item.summary }}</span>
                          </span>
                        </label>
                      </li>
                    }
                  </ul>
                  <p class="mt-3 text-meta text-fg-subtle">
                    {{ w + '.starters.hint' | transloco }}
                  </p>
                } @else {
                  <p class="py-6 text-center text-ui text-fg-muted">
                    {{ 'common.loading' | transloco }}
                  </p>
                }
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
              } @else if (starterKind(); as kind) {
                <span class="flex flex-wrap gap-2">
                  <app-button variant="ghost" [disabled]="busy()" (click)="skipStarters()">
                    {{ w + '.skip' | transloco }}
                  </app-button>
                  <app-button
                    [loading]="busy()"
                    [disabled]="chosenStarters(kind).size === 0"
                    (click)="addStarters(kind)"
                    data-testid="setup-add-starters"
                  >
                    {{
                      w + '.starters.' + kind + '.add'
                        | transloco: { count: chosenStarters(kind).size }
                    }}
                  </app-button>
                </span>
              } @else {
                <app-button [loading]="busy()" (click)="next()">
                  {{ w + '.next' | transloco }}
                </app-button>
              }
            </div>
          }
        </app-card>
      }

      <app-why-it-matters class="mt-6 block" scope="settings" page="setup" />
    </div>
  `,
})
export class SetupWizard {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ModulesApi);
  private readonly moduleService = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly injector = inject(Injector);
  private readonly homeApi = inject(HomeApi);
  private readonly router = inject(Router);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly sizeBands = SIZE_BANDS;
  protected readonly aiActRoles = AI_ACT_ROLES;
  protected readonly frameworkShortKey = frameworkShortKey;
  protected readonly frameworkNameKey = frameworkNameKey;
  protected readonly frameworkDescriptionKey = frameworkDescriptionKey;
  protected readonly moduleNameKey = moduleNameKey;
  protected readonly moduleDescriptionKey = moduleDescriptionKey;

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

  // U09: Brønnøysund lookup.
  protected readonly orgnr = signal('');
  protected readonly lookupBusy = signal(false);
  protected readonly lookupFound = signal<string | null>(null);
  protected readonly lookupError = signal<string | null>(null);

  // U09: packages.
  protected readonly packages = signal<PackagesResponse | null>(null);
  protected readonly chosenPackage = signal<string | null>(null);

  // U09: modules switched on before the starter steps (their create endpoints need them).
  protected readonly modulesSaved = signal(false);
  private readonly savedModules = signal<ReadonlySet<string>>(new Set());

  // U09: starter templates.
  private readonly starters = signal<StartersResponse | null>(null);
  private readonly chosen = signal<Readonly<Record<StarterKindKey, ReadonlySet<string>>>>({
    policies: new Set(),
    risks: new Set(),
    ropa: new Set(),
  });
  protected readonly addingStarters = signal(false);
  protected readonly createdCounts = signal<Record<StarterKindKey, number>>({
    policies: 0,
    risks: 0,
    ropa: 0,
  });
  protected readonly createdTotal = computed(() =>
    Object.values(this.createdCounts()).reduce((sum, n) => sum + n, 0),
  );
  protected readonly targetDate = signal('');

  /** Module keys enabled when the wizard finished (null until then). */
  protected readonly finished = signal<readonly string[] | null>(null);

  /** Chosen standards with a guided journey, offered as "Start the journey" at the end. */
  protected readonly journeyFrameworks = computed(() =>
    this.chosenFrameworks().filter((fw) => hasJourney(fw)),
  );
  protected readonly canStartJourney = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('standards:manage') ?? false,
  );
  protected readonly startingJourney = signal<string | null>(null);

  protected readonly form = createProfileForm(this.fb);

  /** Every module that is (or will be) on: enabled, selected, saved or in the package. */
  private readonly onModules = computed(() => {
    const on = new Set<string>([...this.selected(), ...this.savedModules()]);
    for (const m of this.modules()) {
      if (m.enabled || m.always_on) {
        on.add(m.key);
      }
    }
    if (!this.choices().length) {
      const pkg = this.packages()?.items.find((p) => p.key === this.chosenPackage());
      pkg?.modules.forEach((key) => on.add(key));
    }
    return on;
  });
  protected readonly onCount = computed(() => this.onModules().size);

  /** A starter step is shown only when its module is (or will be) on. */
  private readonly isShown = (s: SetupStep): boolean => {
    if (!isStarterStep(s)) {
      return true;
    }
    const data = this.starters()?.[s];
    return data ? data.module_enabled : this.onModules().has(STARTER_MODULE[s]);
  };
  protected readonly shownSteps = computed(() => SETUP_STEPS.filter((s) => this.isShown(s)));
  protected readonly stepIndex = computed(() => this.shownSteps().indexOf(this.step()));
  protected readonly starterKind = computed<StarterKindKey | null>(() => {
    const s = this.step();
    return isStarterStep(s) ? s : null;
  });

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.finished.set(null);
        this.modulesSaved.set(false);
        if (orgId) {
          this.load(orgId);
        }
      });
    });
  }

  protected starterData(kind: StarterKindKey): StarterKind | null {
    return this.starters()?.[kind] ?? null;
  }

  protected chosenStarters(kind: StarterKindKey): ReadonlySet<string> {
    return this.chosen()[kind];
  }

  protected toggleStarter(kind: StarterKindKey, key: string, on: boolean): void {
    this.chosen.update((all) => {
      const next = new Set(all[kind]);
      if (on) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { ...all, [kind]: next };
    });
  }

  protected selectAllStarters(kind: StarterKindKey, on: boolean): void {
    const items = this.starters()?.[kind].items ?? [];
    this.chosen.update((all) => ({
      ...all,
      [kind]: new Set(on ? items.filter((i) => !i.exists).map((i) => i.key) : []),
    }));
  }

  /** U09: look the organisation number up and pre-fill the profile. */
  protected lookup(): void {
    const orgId = this.orgId();
    const number = this.orgnr().trim();
    if (!orgId || !number || this.lookupBusy()) {
      return;
    }
    this.lookupBusy.set(true);
    this.lookupFound.set(null);
    this.lookupError.set(null);
    this.api.registryLookup(orgId, number).subscribe({
      next: (found) => {
        this.lookupBusy.set(false);
        this.lookupFound.set(found.name);
        const band = SIZE_BANDS.find((b) => b === found.size_band);
        this.form.patchValue({
          ...(found.industry ? { industry: found.industry } : {}),
          ...(band ? { size_band: band } : {}),
          ...(found.countries.length ? { countries: found.countries.join(', ') } : {}),
        });
      },
      error: (err: unknown) => {
        this.lookupBusy.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.lookupError.set(
          status === 422
            ? 'modules.setup.lookup.invalid'
            : status === 404
              ? 'modules.setup.lookup.notFound'
              : 'modules.setup.lookup.unavailable',
        );
      },
    });
  }

  /** U09: a package sets the standards (and later the module selection). */
  protected choosePackage(key: string): void {
    this.chosenPackage.set(key);
    const pkg = this.packages()?.items.find((p) => p.key === key);
    if (pkg && pkg.frameworks.length) {
      const values: Record<string, boolean> = {};
      for (const fw of FRAMEWORK_KEYS) {
        values[fw] = pkg.frameworks.includes(fw);
      }
      this.form.controls.frameworks.patchValue(values);
    }
    this.choices.set([]);
  }

  /**
   * Start the guided journey of a chosen standard (with the target audit date when one
   * is given) and open it. An existing journey (409) is simply opened.
   */
  protected startJourney(framework: string): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const lang = this.language.active();
    const target = this.targetDate() || null;
    this.startingJourney.set(framework);
    this.homeApi
      .start(orgId, framework, lang)
      .pipe(
        switchMap((journey) =>
          target
            ? this.homeApi
                .setTargetDate(orgId, journey.id, target, lang)
                .pipe(catchError(() => of(journey)))
            : of(journey),
        ),
      )
      .subscribe({
        next: () => this.openJourney(framework),
        error: (error: unknown) => {
          if (apiErrorCode(error) === 'journey_exists') {
            this.openJourney(framework);
            return;
          }
          this.startingJourney.set(null);
          this.notifications.error('modules.setup.done.journeyFailed');
        },
      });
  }

  private openJourney(framework: string): void {
    this.startingJourney.set(null);
    void this.router.navigateByUrl(journeyUrl(framework));
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

  protected back(): void {
    this.error.set(null);
    this.goTo(stepBefore(this.step(), this.isShown));
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
    if (step === 'modules') {
      this.busy.set(true);
      if (this.choices().length === 0) {
        // Resumed straight into this step: nothing loaded yet.
        this.loadRecommendations(orgId, () => this.busy.set(false));
        return;
      }
      this.saveModules(orgId);
      return;
    }
    this.busy.set(true);
    this.advance(orgId);
  }

  /**
   * U09: switch the chosen modules on before the starter steps (their create endpoints
   * need the module), then load the starter templates.
   */
  private saveModules(orgId: string): void {
    this.api
      .completeSetup(orgId, { modules: this.selectedList(), step: 'policies' })
      .pipe(
        switchMap((result) =>
          this.api.starters(orgId, this.language.active()).pipe(
            catchError(() => of(null)),
            map((starters) => ({ result, starters })),
          ),
        ),
      )
      .subscribe({
        next: ({ result, starters }) => {
          this.modulesSaved.set(true);
          this.savedModules.set(new Set(result.enabled));
          this.moduleService.reload();
          this.setStarters(starters);
          this.busy.set(false);
          this.goTo(stepAfter('modules', this.isShown));
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

  private setStarters(starters: StartersResponse | null): void {
    // Without templates (offline) the starter steps are hidden.
    const fallback: StarterKind = { module: '', module_enabled: false, items: [] };
    const data: StartersResponse = starters ?? {
      policies: fallback,
      risks: fallback,
      ropa: fallback,
    };
    const fresh = (kind: StarterKindKey) =>
      new Set(data[kind].items.filter((i) => !i.exists).map((i) => i.key));
    this.starters.set(data);
    this.chosen.set({ policies: fresh('policies'), risks: fresh('risks'), ropa: fresh('ropa') });
  }

  /** U09: create the confirmed starters (one at a time) through the normal endpoints. */
  protected addStarters(kind: StarterKindKey): void {
    const orgId = this.orgId();
    const items = (this.starters()?.[kind].items ?? []).filter(
      (item) => this.chosen()[kind].has(item.key) && !item.exists,
    );
    if (!orgId || this.busy() || items.length === 0) {
      return;
    }
    this.busy.set(true);
    this.addingStarters.set(true);
    from(items)
      .pipe(
        concatMap((item) =>
          this.api.createStarter(orgId, kind, item.payload).pipe(
            map(() => true),
            catchError(() => of(false)),
          ),
        ),
        toArray(),
      )
      .subscribe((results) => {
        this.addingStarters.set(false);
        const created = results.filter(Boolean).length;
        this.createdCounts.update((counts) => ({ ...counts, [kind]: counts[kind] + created }));
        if (created < results.length) {
          this.notifications.error('modules.setup.starters.failed');
        } else {
          this.notifications.success('modules.setup.starters.created');
        }
        this.advance(orgId);
      });
  }

  protected skipStarters(): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.advance(orgId);
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
    const target = stepAfter(this.step(), this.isShown);
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
        this.selected.set(this.packageSelection(choices) ?? initialSelection(choices));
        then();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('modules.setup.errors.recommendations');
      },
    });
  }

  /** U09: with a package chosen, preselect only its modules (plus what is on already). */
  private packageSelection(choices: readonly ModuleChoice[]): Set<string> | null {
    const pkg = this.packages()?.items.find((p) => p.key === this.chosenPackage());
    if (!pkg) {
      return null;
    }
    const wanted = new Set(pkg.modules);
    return new Set(choices.filter((c) => wanted.has(c.key) || c.alreadyEnabled).map((c) => c.key));
  }

  private load(orgId: string): void {
    this.loading.set(true);
    forkJoin([
      this.api.getProfile(orgId).pipe(catchError(() => of(emptyProfile(orgId)))),
      this.api.setup(orgId).pipe(catchError(() => of(null))),
      this.api.list(orgId).pipe(catchError(() => of([] as OrgModule[]))),
      this.api.packages(orgId).pipe(catchError(() => of(null))),
    ]).subscribe(([profile, state, modules, packages]) => {
      if (this.orgId() !== orgId) {
        return;
      }
      this.state.set(state);
      this.modules.set(modules);
      this.packages.set(packages);
      patchProfileForm(this.fb, this.form, profile);
      const step = resumeStep(state);
      this.loading.set(false);
      this.goTo(step, false);
      if (step === 'modules') {
        this.loadRecommendations(orgId, () => undefined);
      } else if (isStarterStep(step)) {
        this.modulesSaved.set(true);
        this.api
          .starters(orgId, this.language.active())
          .pipe(catchError(() => of(null)))
          .subscribe((starters) => this.setStarters(starters));
      }
    });
  }
}
