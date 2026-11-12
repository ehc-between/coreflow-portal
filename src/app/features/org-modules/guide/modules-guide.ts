import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ClauseRef, clauseFramework, clauseNumber } from '../frameworks';

/** The F1 pages that carry learning-mode guidance (`modules.guide.pages.<page>`). */
export type GuidePage = 'modules' | 'profile' | 'terminology' | 'setup';

const STORAGE_PREFIX = 'coreflow.guide.modules.';

/**
 * Learning-mode page intro for the F1 pages: what the page is for, a few
 * guided steps and a "why this matters" note with clause chips. A chip opens
 * the assistant with a teaching prompt about that clause. Collapsible; the
 * choice is remembered per page. Content lives in the `modules` scope under
 * `guide.pages.<page>` (F6 guidance format), so it can move to the shared
 * guidance components unchanged.
 */
@Component({
  selector: 'app-modules-guide',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let base = 'modules.guide.pages.' + page();
    <section
      class="rounded-card border border-accent-border bg-accent-soft/60 px-4 py-3.5"
      [attr.aria-labelledby]="'guide-title-' + page()"
      data-testid="modules-guide"
    >
      <div class="flex items-start gap-3">
        <span class="mt-0.5 flex flex-none text-accent" aria-hidden="true">
          <app-icon name="spark" [size]="18" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 [id]="'guide-title-' + page()" class="text-[14px] font-bold text-fg">
            {{ base + '.intro.title' | transloco }}
          </h2>
          @if (expanded()) {
            <p class="mt-1 text-[13.5px] leading-relaxed text-fg-muted">
              {{ base + '.intro.body' | transloco }}
            </p>
            @if (stepKeys().length) {
              <ol class="mt-2.5 list-decimal space-y-1 pl-5 text-[13px] text-fg">
                @for (step of stepKeys(); track step) {
                  <li>{{ base + '.intro.steps.' + step | transloco }}</li>
                }
              </ol>
            }
            <div class="mt-3 rounded-tile border border-border bg-surface px-3 py-2.5">
              <h3 class="text-[12px] font-bold tracking-[0.04em] text-fg-subtle uppercase">
                {{ 'modules.guide.whyTitle' | transloco }}
              </h3>
              <p class="mt-1 text-[13px] leading-relaxed text-fg-muted">
                {{ base + '.why.body' | transloco }}
              </p>
              @if (clauses().length) {
                <div class="mt-2 flex flex-wrap gap-1.5">
                  @for (clause of clauses(); track clause) {
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                      (click)="explain(clause)"
                    >
                      <span class="sr-only">{{ 'modules.guide.explainClause' | transloco }}</span>
                      {{ 'modules.frameworks.' + framework(clause) + '.short' | transloco }}
                      {{ number(clause) }}
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
        <button
          type="button"
          class="flex-none rounded-tile px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          [attr.aria-expanded]="expanded()"
          (click)="toggle()"
        >
          {{ (expanded() ? 'modules.guide.hide' : 'modules.guide.show') | transloco }}
        </button>
      </div>
    </section>
  `,
})
export class ModulesGuide {
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);

  readonly page = input.required<GuidePage>();
  /** How many intro steps the page has (`intro.steps.s1` … `sN`). */
  readonly steps = input(3);
  /** Clause references for "why this matters" (`framework:number`). */
  readonly clauses = input<readonly ClauseRef[]>([]);

  private readonly collapsed = signal<ReadonlySet<string>>(readCollapsed());

  protected readonly expanded = computed(() => !this.collapsed().has(this.page()));
  protected readonly stepKeys = computed(() =>
    Array.from({ length: this.steps() }, (_, i) => `s${i + 1}`),
  );

  protected framework(clause: ClauseRef): string {
    return clauseFramework(clause);
  }

  protected number(clause: ClauseRef): string {
    return clauseNumber(clause);
  }

  protected toggle(): void {
    const page = this.page();
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      writeCollapsed(next);
      return next;
    });
  }

  /** Teach the clause in the assistant (tutor-style prompt; F5 later adds a tutor mode). */
  protected explain(clause: ClauseRef): void {
    const label = `${this.transloco.translate(`modules.frameworks.${clauseFramework(clause)}.short`)} ${clauseNumber(clause)}`;
    this.ask.showWith(
      this.transloco.translate('modules.guide.tutorPrompt', {
        clause: label,
        page: this.transloco.translate(`modules.guide.pages.${this.page()}.intro.title`),
      }),
    );
  }
}

function readCollapsed(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}collapsed`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(pages: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}collapsed`, JSON.stringify([...pages]));
  } catch {
    // Best-effort (private mode / storage disabled).
  }
}
