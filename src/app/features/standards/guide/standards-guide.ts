import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { teachingClause } from '../../../shared/guidance/clause-chips';

/** Pages of the standards area with learning-mode guidance (`standards.guide.<page>.*`). */
export type StandardsGuidePage = 'overview' | 'readiness';

const STEPS = ['step1', 'step2', 'step3'] as const;

function storageKey(page: string): string {
  return `coreflow.standards.guide.${page}`;
}

function readCollapsed(page: string): boolean {
  try {
    return globalThis.localStorage?.getItem(storageKey(page)) === 'collapsed';
  } catch {
    return false;
  }
}

function writeCollapsed(page: string, collapsed: boolean): void {
  try {
    if (collapsed) {
      globalThis.localStorage?.setItem(storageKey(page), 'collapsed');
    } else {
      globalThis.localStorage?.removeItem(storageKey(page));
    }
  } catch {
    // Storage unavailable (private mode): the choice simply isn't remembered.
  }
}

/**
 * Learning-mode guidance for a standards page: an intro with steps and a
 * "why this matters" note whose clause chips open the assistant to teach that
 * clause. Expanded by default for new users; once collapsed it stays a single
 * line (remembered per page in this browser), so experienced users get a
 * compact page. Text comes from the `standards` Transloco scope.
 */
@Component({
  selector: 'app-standards-guide',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let base = 'standards.guide.' + page();
    <aside
      class="mb-5 rounded-card border border-accent-border bg-accent-soft/30"
      [attr.aria-labelledby]="id() + '-title'"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-3 text-left"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-controls]="id() + '-body'"
        (click)="toggle()"
      >
        <span class="flex text-accent"><app-icon name="training" [size]="16" /></span>
        <span [id]="id() + '-title'" class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg">
          {{ base + '.title' | transloco }}
        </span>
        <span class="hidden text-[12px] text-fg-muted sm:inline">
          {{ (collapsed() ? 'standards.guide.show' : 'standards.guide.hide') | transloco }}
        </span>
        <app-icon
          name="chevron"
          [size]="14"
          class="text-fg-subtle"
          [class]="collapsed() ? '' : 'rotate-180'"
        />
      </button>
      @if (!collapsed()) {
        <div [id]="id() + '-body'" class="grid gap-4 px-4 pb-4 md:grid-cols-[3fr_2fr]">
          <div>
            <p class="text-[13.5px] leading-[1.6] text-fg">{{ base + '.body' | transloco }}</p>
            <div class="mt-3 text-[11.5px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
              {{ 'standards.guide.stepsTitle' | transloco }}
            </div>
            <ol class="mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-fg">
              @for (step of steps; track step) {
                <li>{{ base + '.' + step | transloco }}</li>
              }
            </ol>
          </div>
          <div class="rounded-tile border border-border bg-surface p-3">
            <div class="text-[11.5px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
              {{ 'standards.guide.whyTitle' | transloco }}
            </div>
            <p class="mt-1.5 text-[13px] leading-[1.6] text-fg">{{ base + '.why' | transloco }}</p>
            @if (labels().length > 0) {
              <p class="mt-2 flex flex-wrap items-baseline gap-x-1 text-meta">
                <span class="text-fg-subtle">{{
                  'standards.reqs.teach.readAbout' | transloco
                }}</span>
                @for (clause of labels(); track clause.ref; let last = $last) {
                  <span class="inline-flex items-baseline">
                    <button
                      type="button"
                      class="rounded-sm font-medium text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      [attr.aria-label]="
                        'standards.guide.clauseAsk' | transloco: { clause: clause.label }
                      "
                      (click)="teach(clause.label)"
                    >
                      {{ clause.label }}
                    </button>
                    @if (!last) {
                      <span class="text-fg-subtle">,</span>
                    }
                  </span>
                }
              </p>
            }
          </div>
        </div>
      }
    </aside>
  `,
})
export class StandardsGuide {
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  readonly page = input.required<StandardsGuidePage>();
  /**
   * Clause refs for the "why" teaching links (`hs:9.1`, `iso27001:A.5.9`), shown as
   * "Felles ISO-krav · 9.1"; each opens the assistant on it.
   */
  readonly clauses = input<readonly string[]>([]);
  protected readonly labels = computed(() =>
    this.clauses().map((ref) =>
      teachingClause(ref, (key, params) => this.language.translate(key, params)),
    ),
  );

  protected readonly steps = STEPS;
  protected readonly id = computed(() => `std-guide-${this.page()}`);

  private readonly collapsedOverride = signal<boolean | null>(null);
  protected readonly collapsed = computed(
    () => this.collapsedOverride() ?? readCollapsed(this.page()),
  );

  protected toggle(): void {
    const next = !this.collapsed();
    this.collapsedOverride.set(next);
    writeCollapsed(this.page(), next);
  }

  protected teach(clause: string): void {
    this.ask.showWith(this.transloco.translate('standards.guide.clausePrompt', { clause }));
  }
}
