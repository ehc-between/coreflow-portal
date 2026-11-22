import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ClauseTitlesService } from '../../../core/standards/clause-titles.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import {
  clauseLabel,
  progressText,
  splitUrl,
  stepActionKey,
  stepActionUrl,
  stepState,
} from '../data/home-format';
import { JourneyStep, StepStatus } from '../data/home.models';

/** What the step row asks its page to do. */
export type StepCommand =
  | { readonly kind: 'status'; readonly step: JourneyStep; readonly status: StepStatus }
  | { readonly kind: 'task'; readonly step: JourneyStep };

const STATE_ICON: Record<string, string> = {
  done: 'checkcircle',
  skipped: 'x',
  needs_link: 'link',
  module_off: 'lock',
  todo: 'flag',
};

/**
 * One step of a guided journey: what to do in plain words, the requirements it
 * covers, how far it is, and one clear way forward:
 *
 * - to do: the step's own action ("Opprett", "Åpne"), plus "Make it a task";
 * - a record step whose requirement-location rule is not met: the plain reason
 *   ("1 analysis registered, but not approved yet") and a direct action to fix it
 *   (no manual requirement link is needed: records in the right register count);
 * - module off: "Turn on <module>" (Settings › Modules);
 * - done / skipped: why it is done, with "Undo" / "Include again" when it was set by hand.
 *
 * "Mark as done" and "Skip" sit in the ⋯ menu. Mutations need `standards:manage`.
 */
@Component({
  selector: 'app-journey-step',
  imports: [RouterLink, TranslocoPipe, Icon, OverflowMenu, MenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let s = step();
    <div
      class="flex gap-3 rounded-tile border p-4"
      [class.border-accent]="highlight()"
      [class.bg-accent-soft]="highlight()"
      [class.border-border]="!highlight()"
      [class.bg-surface]="!highlight()"
      [attr.data-testid]="'journey-step-' + s.key"
      [attr.data-state]="state()"
    >
      <span
        class="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full"
        [class]="iconClass()"
        aria-hidden="true"
      >
        <app-icon [name]="icon()" [size]="15" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h4
            class="text-body font-semibold text-fg"
            [class.line-through]="state() === 'skipped'"
            [class.text-fg-muted]="state() === 'skipped'"
          >
            {{ s.title }}
          </h4>
          <span class="sr-only">{{ 'home.journey.step.state.' + state() | transloco }}</span>
          @if (highlight()) {
            <span class="rounded-full bg-accent px-2 py-px text-micro font-semibold text-white">
              {{ 'home.journey.step.next' | transloco }}
            </span>
          }
        </div>
        @if (state() !== 'done' && state() !== 'skipped') {
          <p class="mt-1 max-w-[72ch] text-ui text-fg-muted">{{ s.body }}</p>
        }

        <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-subtle">
          @if (refs().length) {
            <span>
              {{ 'home.journey.step.covers' | transloco: { refs: refs().join(', ') } }}
            </span>
          }
          @if (progress(); as p) {
            <span>{{ p.key | transloco: p.params }}</span>
          }
          @if (doneNote(); as note) {
            <span class="text-pass-ink">{{ note | transloco }}</span>
          }
          @if (moduleName(); as m) {
            <span>{{ 'home.journey.step.where' | transloco: { module: m } }}</span>
          }
        </p>

        @if (state() === 'needs_link') {
          <p class="mt-2 max-w-[72ch] rounded-tile bg-warn-soft px-3 py-2 text-ui text-warn-ink">
            {{ 'home.journey.step.needsLink' | transloco: { refs: firstRef() } }}
          </p>
        } @else if (state() === 'todo' && reason(); as r) {
          <p
            class="mt-2 max-w-[72ch] rounded-tile bg-warn-soft px-3 py-2 text-ui text-warn-ink"
            data-testid="journey-step-reason"
          >
            {{ r.text }}
          </p>
        } @else if (state() === 'module_off') {
          <p class="mt-2 max-w-[72ch] rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg-muted">
            {{ 'home.journey.step.moduleOff' | transloco: { module: moduleName() } }}
          </p>
        }

        <div class="mt-3 flex flex-wrap items-center gap-2">
          @switch (state()) {
            @case ('needs_link') {
              @if (s.requirement_url) {
                <a
                  [routerLink]="reqLink().path"
                  [queryParams]="reqLink().query"
                  [class]="primaryClass"
                >
                  {{ 'home.journey.step.actions.link' | transloco }}
                </a>
              }
              @if (actionLink(); as a) {
                <a [routerLink]="a.path" [queryParams]="a.query" [class]="secondaryClass">
                  {{ 'home.journey.step.actions.openRecords' | transloco }}
                </a>
              }
            }
            @case ('module_off') {
              <a routerLink="/settings/modules" [class]="primaryClass">
                {{ 'home.journey.step.actions.enableModule' | transloco: { module: moduleName() } }}
              </a>
            }
            @case ('todo') {
              @if (reason(); as r) {
                <a
                  [routerLink]="reasonLink()!.path"
                  [queryParams]="reasonLink()!.query"
                  [class]="primaryClass"
                  data-testid="journey-step-fix"
                >
                  {{ r.action_label }}
                </a>
              } @else if (actionLink(); as a) {
                <a [routerLink]="a.path" [queryParams]="a.query" [class]="primaryClass">
                  {{ actionKey() | transloco }}
                </a>
              }
            }
          }
          @if (s.task; as task) {
            <a [routerLink]="task.url" [class]="secondaryClass" data-testid="journey-step-task">
              <app-icon name="checkcircle" [size]="14" />
              {{ 'home.journey.step.openTask' | transloco }}
            </a>
          } @else if (canMakeTask() && state() !== 'done' && state() !== 'skipped') {
            <button
              type="button"
              [class]="secondaryClass"
              [disabled]="busy()"
              (click)="requested.emit({ kind: 'task', step: s })"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'home.journey.step.actions.makeTask' | transloco }}
            </button>
          }
          @if (s.lesson; as lesson) {
            <a
              [routerLink]="lesson.url"
              class="inline-flex h-9 items-center gap-1.5 px-1 text-ui font-semibold text-accent hover:underline"
            >
              <app-icon name="book" [size]="14" />
              {{ 'home.journey.step.lesson' | transloco }}
            </a>
          }
          @if (canManage()) {
            @if (state() === 'skipped' || (state() === 'done' && s.done_source === 'manual')) {
              <button
                type="button"
                class="inline-flex h-9 items-center px-1 text-ui font-semibold text-fg-muted hover:text-fg hover:underline"
                [disabled]="busy()"
                (click)="requested.emit({ kind: 'status', step: s, status: 'todo' })"
              >
                {{
                  (state() === 'skipped'
                    ? 'home.journey.step.actions.include'
                    : 'home.journey.step.actions.undo'
                  ) | transloco
                }}
              </button>
            } @else if (state() !== 'done') {
              <app-overflow-menu
                [iconOnly]="true"
                labelKey="home.journey.step.menu"
                class="ml-auto"
              >
                <button
                  appMenuItem
                  type="button"
                  [disabled]="busy()"
                  (click)="requested.emit({ kind: 'status', step: s, status: 'done' })"
                >
                  <app-icon name="check" [size]="15" />
                  {{ 'home.journey.step.actions.markDone' | transloco }}
                </button>
                <button
                  appMenuItem
                  type="button"
                  [disabled]="busy()"
                  (click)="requested.emit({ kind: 'status', step: s, status: 'skipped' })"
                >
                  <app-icon name="x" [size]="15" />
                  {{ 'home.journey.step.actions.skip' | transloco }}
                </button>
              </app-overflow-menu>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class JourneyStepRow {
  private readonly language = inject(LanguageService);
  private readonly guidance = inject(GuidanceService);
  private readonly titles = inject(ClauseTitlesService);

  readonly step = input.required<JourneyStep>();
  /** The next step of the journey: drawn in the accent colour. */
  readonly highlight = input(false);
  readonly canManage = input(false);
  /** `standards:manage` and `tasks:write`. */
  readonly canMakeTask = input(false);
  readonly busy = input(false);

  readonly requested = output<StepCommand>();

  protected readonly primaryClass =
    'inline-flex h-9 items-center gap-1.5 rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none';
  protected readonly secondaryClass =
    'inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3.5 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60';

  protected readonly state = computed(() => stepState(this.step()));
  protected readonly icon = computed(() => STATE_ICON[this.state()]);
  protected readonly iconClass = computed(() => {
    switch (this.state()) {
      case 'done':
        return 'bg-pass-soft text-pass-ink';
      case 'needs_link':
        return 'bg-warn-soft text-warn-ink';
      case 'todo':
        return 'bg-accent-soft text-accent';
      default:
        return 'bg-surface-2 text-fg-muted';
    }
  });

  protected readonly refs = computed(() => {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    // U39: beginners read the requirement's plain title instead of "ISO 27001 · 4.2".
    const beginner = this.guidance.isBeginner();
    const labels = this.step().requirement_refs.map(
      (ref) => (beginner ? this.titles.read(ref)?.title : null) || clauseLabel(ref, t),
    );
    return [...new Set(labels)];
  });
  protected readonly firstRef = computed(() => this.refs()[0] ?? '');
  protected readonly progress = computed(() =>
    this.state() === 'done' && this.step().done_source !== 'auto'
      ? null
      : progressText(this.step()),
  );
  protected readonly moduleName = computed(() => {
    const module = this.step().module;
    return module ? this.language.translate(`modules.names.${module}`) : null;
  });
  protected readonly doneNote = computed(() => {
    const s = this.step();
    if (s.status !== 'done' || !s.done_source) {
      return null;
    }
    return `home.journey.step.doneBy.${s.done_source}`;
  });
  protected readonly actionKey = computed(() => stepActionKey(this.step()));
  protected readonly actionLink = computed(() => {
    const url = stepActionUrl(this.step());
    return url ? splitUrl(url) : null;
  });
  /** Why a record step is not done yet (its requirement-location rule is not met). */
  protected readonly reason = computed(() => {
    const location = this.step().location;
    return location && location.outcome !== 'met' && location.text ? location : null;
  });
  protected readonly reasonLink = computed(() => {
    const r = this.reason();
    return r ? splitUrl(r.url) : null;
  });
  protected readonly reqLink = computed(() =>
    splitUrl(this.step().requirement_url ?? '/standards'),
  );
}
