import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map, of, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { HomeApi } from '../data/home-api';
import {
  apiErrorCode,
  defaultOpenPhases,
  frameworkShortKey,
  nextOpenStep,
} from '../data/home-format';
import { AvailableJourney, Journey, JourneyStep } from '../data/home.models';
import { JourneyStepRow, StepCommand } from './journey-step';

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'off' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'start'; readonly available: AvailableJourney }
  | { readonly kind: 'journey'; readonly journey: Journey };

/**
 * `/standards/journey/:framework`: the guided path to a standard ("Bli klar for
 * ISO 27001"). Phases with progress; each step says what to do, which requirements
 * it covers and has one way forward, plus "Make it a task" and "Skip". Step status
 * is computed live by the backend: a record step is done only when the records
 * exist *and* are linked to the requirement, so the journey never says "done" for
 * data that is not connected.
 *
 * Before a journey exists the page offers to start it (`standards:manage`; this
 * also switches the standard on). Mounted by the standards routes; its strings
 * live in the `home` scope.
 */
@Component({
  selector: 'app-journey-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PageHeader,
    ProgressBar,
    JourneyStepRow,
    LocalDayPipe,
  ],
  viewProviders: [provideSharedScope('home')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @switch (view().kind) {
        @case ('loading') {
          <app-page-header [title]="frameworkTitle()" [breadcrumbs]="crumbs()" />
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-page-header [title]="frameworkTitle()" [breadcrumbs]="crumbs()" />
          <app-error-state (retry)="reload()" />
        }
        @case ('off') {
          <app-page-header [title]="frameworkTitle()" [breadcrumbs]="crumbs()" />
          <app-empty-state
            icon="lock"
            titleKey="home.journey.off.title"
            bodyKey="home.journey.off.body"
            ctaKey="home.journey.off.cta"
            ctaLink="/settings/modules"
          />
        }
        @case ('unknown') {
          <app-page-header [title]="frameworkTitle()" [breadcrumbs]="crumbs()" />
          <app-empty-state
            icon="iso"
            titleKey="home.journey.unknown.title"
            bodyKey="home.journey.unknown.body"
            ctaKey="home.journey.unknown.cta"
            ctaLink="/standards"
          />
        }
        @case ('start') {
          @if (available(); as a) {
            <app-page-header [title]="a.title" [breadcrumbs]="crumbs()" />
            <section
              class="rounded-card border border-accent-border bg-accent-soft p-5 sm:p-6"
              data-testid="journey-start"
            >
              <p class="max-w-[68ch] text-body text-fg">{{ a.summary }}</p>
              <ul class="mt-4 flex flex-col gap-2 text-ui text-fg">
                <li class="flex items-start gap-2">
                  <app-icon name="flag" [size]="15" class="mt-0.5 text-accent" />
                  {{ 'home.journey.start.steps' | transloco: { count: a.steps } }}
                </li>
                <li class="flex items-start gap-2">
                  <app-icon name="checkcircle" [size]="15" class="mt-0.5 text-accent" />
                  {{ 'home.journey.start.live' | transloco }}
                </li>
                <li class="flex items-start gap-2">
                  <app-icon name="link" [size]="15" class="mt-0.5 text-accent" />
                  {{ 'home.journey.start.connected' | transloco }}
                </li>
              </ul>
              @if (!a.standard_enabled) {
                <p class="mt-4 text-ui text-fg-muted">
                  {{
                    'home.journey.start.enables' | transloco: { standard: (shortKey() | transloco) }
                  }}
                </p>
              }
              <div class="mt-5 flex flex-wrap items-center gap-3">
                @if (canManage()) {
                  <app-button
                    [loading]="busy()"
                    (click)="start()"
                    data-testid="journey-start-button"
                  >
                    {{ 'home.journey.start.button' | transloco }}
                  </app-button>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'home.journey.start.noRights' | transloco }}
                  </p>
                }
                <a
                  routerLink="/standards"
                  class="text-ui font-semibold text-accent hover:underline"
                >
                  {{ 'home.journey.start.later' | transloco }}
                </a>
              </div>
            </section>
          }
        }
        @case ('journey') {
          @if (journey(); as j) {
            <app-page-header [title]="j.title" [breadcrumbs]="crumbs()">
              <p intro class="mt-1.5 max-w-[72ch] text-body text-fg-muted">{{ j.summary }}</p>
              @if (canManage()) {
                @if (j.status === 'archived') {
                  <app-button primary [loading]="busy()" (click)="setStatus('active')">
                    {{ 'home.journey.reactivate' | transloco }}
                  </app-button>
                } @else {
                  <button appMenuItem overflow type="button" (click)="setStatus('archived')">
                    <app-icon name="history" [size]="15" />
                    {{ 'home.journey.archive' | transloco }}
                  </button>
                }
              }
            </app-page-header>

            <app-help-strip
              class="mb-5"
              scope="platform"
              page="journey"
              lesson="standards-and-evidence"
            />

            <!-- Overall progress and the next step -->
            <section
              class="mb-6 rounded-card border border-border bg-surface p-5 shadow-card"
              aria-labelledby="journey-progress-title"
              data-testid="journey-progress"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="journey-progress-title" class="font-display text-card font-bold text-fg">
                  {{ 'home.journey.progressTitle' | transloco }}
                </h2>
                <span class="font-display text-section font-bold text-fg">{{ j.percent }} %</span>
              </div>
              <app-progress-bar
                class="mt-2 block"
                [value]="j.percent"
                [label]="'home.journey.progress' | transloco: { done: j.done, total: j.total }"
              />
              <p class="mt-2 text-meta text-fg-muted">
                {{ 'home.journey.progress' | transloco: { done: j.done, total: j.total } }}
                @if (j.skipped) {
                  · {{ 'home.journey.skipped' | transloco: { count: j.skipped } }}
                }
              </p>
              <!-- U09: the target audit date and whether the plan is on track -->
              <div
                class="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
                data-testid="journey-target"
              >
                @if (j.target_date) {
                  <span class="text-ui text-fg">
                    {{ 'home.journey.target.label' | transloco }}
                    <strong>{{ j.target_date | localDay }}</strong>
                  </span>
                  @if (j.schedule; as s) {
                    <span
                      class="rounded-full px-2.5 py-0.5 text-meta font-semibold"
                      [class]="
                        s.status === 'on_track' || s.status === 'done'
                          ? 'bg-pass-soft text-pass-ink'
                          : s.status === 'behind'
                            ? 'bg-warn-soft text-warn-ink'
                            : 'bg-fail-soft text-fail-ink'
                      "
                      data-testid="journey-schedule"
                    >
                      {{
                        'home.journey.target.status.' +
                          (s.status === 'behind' && s.weeks_behind === 1 ? 'behindOne' : s.status)
                          | transloco: { weeks: s.weeks_behind }
                      }}
                    </span>
                  }
                } @else {
                  <span class="text-ui text-fg-muted">{{
                    'home.journey.target.none' | transloco
                  }}</span>
                }
                @if (canManage() && j.status !== 'archived') {
                  <label class="ml-auto flex items-center gap-2 text-meta text-fg-muted">
                    <span>{{ 'home.journey.target.set' | transloco }}</span>
                    <input
                      type="date"
                      class="h-8 rounded-tile border border-border bg-surface px-2 text-ui text-fg"
                      [value]="j.target_date ?? ''"
                      [disabled]="busy()"
                      (change)="setTargetDate($any($event.target).value)"
                      data-testid="journey-target-input"
                    />
                  </label>
                }
              </div>
              @if (j.status === 'completed') {
                <p
                  class="mt-3 flex items-center gap-2 rounded-tile bg-pass-soft px-3 py-2 text-ui text-pass-ink"
                >
                  <app-icon name="checkcircle" [size]="15" />
                  {{ 'home.journey.completed' | transloco }}
                </p>
              } @else if (j.status === 'archived') {
                <p class="mt-3 rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg-muted">
                  {{ 'home.journey.archived' | transloco }}
                </p>
              } @else if (next(); as n) {
                <p class="mt-3 text-ui text-fg">
                  {{ 'home.journey.nextStep' | transloco: { step: n.title } }}
                  <a
                    [href]="'#step-' + n.key"
                    class="ml-1 font-semibold text-accent hover:underline"
                    (click)="focusStep($event, n)"
                  >
                    {{ 'home.journey.goToStep' | transloco }}
                  </a>
                </p>
              }
            </section>

            <!-- Phases -->
            <ol class="flex flex-col gap-4" data-testid="journey-phases">
              @for (phase of j.phases; track phase.key; let i = $index) {
                <li class="rounded-card border border-border bg-surface shadow-card">
                  <h3>
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 rounded-card px-5 py-4 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      [attr.aria-expanded]="isOpen(phase.key)"
                      [attr.aria-controls]="'phase-' + phase.key"
                      (click)="togglePhase(phase.key)"
                    >
                      <span
                        class="flex h-8 w-8 flex-none items-center justify-center rounded-full font-display text-ui font-bold"
                        [class]="
                          phase.percent === 100
                            ? 'bg-pass-soft text-pass-ink'
                            : 'bg-accent-soft text-accent'
                        "
                        aria-hidden="true"
                      >
                        @if (phase.percent === 100) {
                          <app-icon name="check" [size]="15" />
                        } @else {
                          {{ i + 1 }}
                        }
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block font-display text-card font-bold text-fg">{{
                          phase.title
                        }}</span>
                        @if (phase.summary) {
                          <span class="mt-0.5 block text-ui text-fg-muted">{{
                            phase.summary
                          }}</span>
                        }
                      </span>
                      <span class="hidden w-28 flex-none sm:block">
                        <app-progress-bar
                          [value]="phase.percent"
                          [label]="
                            'home.journey.progress'
                              | transloco: { done: phase.done, total: phase.total }
                          "
                        />
                      </span>
                      <span class="flex-none text-meta text-fg-muted">
                        {{
                          'home.journey.phaseCount'
                            | transloco: { done: phase.done, total: phase.total }
                        }}
                      </span>
                      <app-icon
                        name="chevron"
                        [size]="16"
                        class="flex-none text-fg-subtle transition-transform"
                        [class.rotate-180]="isOpen(phase.key)"
                      />
                    </button>
                  </h3>
                  @if (isOpen(phase.key)) {
                    <ol
                      [id]="'phase-' + phase.key"
                      class="flex flex-col gap-2 px-3 pb-3 sm:px-5 sm:pb-5"
                    >
                      @for (step of phase.steps; track step.key) {
                        <li
                          [id]="'step-' + step.key"
                          tabindex="-1"
                          class="scroll-mt-24 outline-none"
                        >
                          <app-journey-step
                            [step]="step"
                            [highlight]="j.status === 'active' && next()?.key === step.key"
                            [canManage]="canManage() && j.status !== 'archived'"
                            [canMakeTask]="canMakeTask() && j.status !== 'archived'"
                            [busy]="busyStep() === step.key"
                            (requested)="run($event)"
                          />
                        </li>
                      }
                    </ol>
                  }
                </li>
              }
            </ol>
          }
        }
      }
    </div>
  `,
})
export class JourneyPage {
  private readonly api = inject(HomeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  protected readonly framework = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('framework') ?? '')),
    { initialValue: '' },
  );

  protected readonly view = signal<View>({ kind: 'loading' });
  protected readonly busy = signal(false);
  protected readonly busyStep = signal<string | null>(null);
  private readonly openPhases = signal<ReadonlySet<string>>(new Set());

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canManage = computed(() => this.permissions().includes('standards:manage'));
  protected readonly canMakeTask = computed(
    () => this.canManage() && this.permissions().includes('tasks:write'),
  );

  protected readonly journey = computed(() => {
    const v = this.view();
    return v.kind === 'journey' ? v.journey : null;
  });
  protected readonly available = computed(() => {
    const v = this.view();
    return v.kind === 'start' ? v.available : null;
  });
  protected readonly next = computed(() => {
    const j = this.journey();
    return j ? nextOpenStep(j) : null;
  });

  protected readonly shortKey = computed(() => frameworkShortKey(this.framework()));
  protected readonly frameworkTitle = computed(() =>
    this.language.translate('home.journey.titleFallback', {
      standard: this.language.translate(this.shortKey()),
    }),
  );
  protected readonly crumbs = computed(() => [
    { labelKey: 'nav.standards', link: '/standards' },
    { label: this.journey()?.title ?? this.available()?.title ?? this.frameworkTitle() },
  ]);

  private request = new Subscription();
  private loadedKey = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());

    providePageContext(() => {
      const j = this.journey();
      return {
        module: 'standards',
        entityType: 'journey',
        entityId: j?.id ?? null,
        view: 'detail',
        title: j?.title ?? this.frameworkTitle(),
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const framework = this.framework();
      const lang = this.language.active();
      untracked(() => this.load(orgId, framework, lang));
    });
  }

  protected isOpen(phase: string): boolean {
    return this.openPhases().has(phase);
  }

  protected togglePhase(phase: string): void {
    this.openPhases.update((open) => {
      const next = new Set(open);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }

  protected focusStep(event: Event, step: JourneyStep): void {
    event.preventDefault();
    this.openPhases.update((open) => new Set([...open, step.phase]));
    // Wait a frame so an opened phase has rendered its steps.
    requestAnimationFrame(() => {
      const el = document.getElementById(`step-${step.key}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.focus({ preventScroll: true });
    });
  }

  protected reload(): void {
    this.loadedKey = '';
    this.load(this.selectedOrg.currentOrgId(), this.framework(), this.language.active());
  }

  protected start(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.start(orgId, this.framework(), this.language.active()).subscribe({
      next: (journey) => {
        this.busy.set(false);
        this.show(journey);
        this.notifications.success('home.journey.started', { journey: journey.title });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (apiErrorCode(error) === 'journey_exists') {
          this.reload();
          return;
        }
        this.notifications.error('home.journey.errors.start');
      },
    });
  }

  protected setStatus(status: 'active' | 'archived'): void {
    const orgId = this.selectedOrg.currentOrgId();
    const j = this.journey();
    if (!orgId || !j) {
      return;
    }
    this.busy.set(true);
    this.api.setStatus(orgId, j.id, status, this.language.active()).subscribe({
      next: (journey) => {
        this.busy.set(false);
        this.view.set({ kind: 'journey', journey });
        this.notifications.success(
          status === 'archived' ? 'home.journey.archivedToast' : 'home.journey.reactivatedToast',
        );
      },
      error: () => {
        this.busy.set(false);
        this.notifications.error('home.journey.errors.save');
      },
    });
  }

  /** U09: set (or clear with an empty value) the target audit date. */
  protected setTargetDate(value: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const j = this.journey();
    if (!orgId || !j || (value || null) === (j.target_date ?? null)) {
      return;
    }
    this.busy.set(true);
    this.api.setTargetDate(orgId, j.id, value || null, this.language.active()).subscribe({
      next: (journey) => {
        this.busy.set(false);
        this.view.set({ kind: 'journey', journey });
        this.notifications.success('home.journey.target.savedToast');
      },
      error: () => {
        this.busy.set(false);
        this.notifications.error('home.journey.errors.save');
      },
    });
  }

  protected run(command: StepCommand): void {
    const orgId = this.selectedOrg.currentOrgId();
    const j = this.journey();
    if (!orgId || !j) {
      return;
    }
    const lang = this.language.active();
    this.busyStep.set(command.step.key);
    if (command.kind === 'task') {
      this.api
        .stepTask(orgId, j.id, command.step.key, lang)
        .pipe(
          switchMap((task) =>
            this.api.journey(orgId, j.id, lang).pipe(map((journey) => ({ task, journey }))),
          ),
        )
        .subscribe({
          next: ({ task, journey }) => {
            this.busyStep.set(null);
            this.view.set({ kind: 'journey', journey });
            this.notifications.success('home.journey.taskCreated', { title: task.title });
          },
          error: () => {
            this.busyStep.set(null);
            this.notifications.error('home.journey.errors.task');
          },
        });
      return;
    }
    this.api.setStep(orgId, j.id, command.step.key, command.status, lang).subscribe({
      next: (journey) => {
        this.busyStep.set(null);
        this.view.set({ kind: 'journey', journey });
        if (journey.status === 'completed' && j.status !== 'completed') {
          this.notifications.success('home.journey.completedToast');
        }
      },
      error: () => {
        this.busyStep.set(null);
        this.notifications.error('home.journey.errors.save');
      },
    });
  }

  private show(journey: Journey): void {
    this.view.set({ kind: 'journey', journey });
    this.openPhases.set(defaultOpenPhases(journey));
  }

  private load(orgId: string | null, framework: string, lang: string): void {
    this.request.unsubscribe();
    if (!orgId || !framework) {
      return;
    }
    const key = `${orgId}:${framework}`;
    const fresh = key !== this.loadedKey;
    this.loadedKey = key;
    if (fresh) {
      this.view.set({ kind: 'loading' });
    }
    this.request = this.api
      .journeys(orgId, lang)
      .pipe(
        switchMap((list) => {
          const summary = list.items.find((j) => j.framework === framework);
          if (summary) {
            return this.api.journey(orgId, summary.id, lang).pipe(map((journey) => ({ journey })));
          }
          const available = list.available.find((a) => a.framework === framework);
          return of({ available: available ?? null });
        }),
      )
      .subscribe({
        next: (result) => {
          if ('journey' in result) {
            if (fresh) {
              this.show(result.journey);
            } else {
              this.view.set({ kind: 'journey', journey: result.journey });
            }
          } else if (result.available) {
            this.view.set({ kind: 'start', available: result.available });
          } else {
            this.view.set({ kind: 'unknown' });
          }
        },
        error: (error: unknown) => {
          const code = apiErrorCode(error);
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          if (code === 'module_disabled') {
            this.view.set({ kind: 'off' });
          } else if (status === 403) {
            this.void403();
          } else {
            this.view.set({ kind: 'error' });
          }
        },
      });
  }

  /** Without `standards:read` there is nothing to show here: go home. */
  private void403(): void {
    void this.router.navigateByUrl('/dashboard');
  }
}
