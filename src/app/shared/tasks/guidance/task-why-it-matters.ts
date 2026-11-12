import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { TasksGuidance } from '../../../core/tasks/tasks-guidance';
import { AskPanelService } from '../../../features/ask/ask-panel.service';
import { MarkdownPipe } from '../../markdown/markdown.pipe';
import { Icon } from '../../ui/icon/icon';

/** Framework prefixes with a translated short name (`tasks.guide.frameworks.<prefix>`). */
const KNOWN_FRAMEWORKS = new Set(['hs', 'iso9001', 'iso27001', 'iso14001', 'iso45001', 'iso42001']);

export interface ClauseChip {
  readonly ref: string;
  readonly framework: string;
  readonly clause: string;
}

/** Split a clause reference (`hs:6.1`) into its framework prefix and clause number. */
export function parseClauseRef(ref: string): ClauseChip {
  const index = ref.indexOf(':');
  return index > 0
    ? { ref, framework: ref.slice(0, index), clause: ref.slice(index + 1) }
    : { ref, framework: '', clause: ref };
}

/**
 * "Why this matters" note for a task page (`pages.<page>.why`): the reason in plain
 * language plus the standard clauses it serves. A clause chip asks the assistant to
 * explain that clause. Interim for F6's `<app-why-it-matters>`.
 */
@Component({
  selector: 'app-task-why-it-matters',
  imports: [TranslocoPipe, MarkdownPipe, Icon],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (why(); as why) {
      <aside
        class="rounded-card border border-border bg-surface px-4 py-3"
        [attr.aria-label]="'tasks.guide.whyTitle' | transloco"
      >
        <div
          class="mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-fg-subtle uppercase"
        >
          <app-icon name="iso" [size]="14" />
          {{ 'tasks.guide.whyTitle' | transloco }}
        </div>
        <div
          class="cf-prose text-[13px] leading-relaxed text-fg-muted"
          [innerHTML]="why.body | appMarkdown"
        ></div>
        @if (chips().length) {
          <ul
            class="mt-2 flex flex-wrap gap-1.5"
            [attr.aria-label]="'tasks.guide.clauses' | transloco"
          >
            @for (chip of chips(); track chip.ref) {
              <li>
                <button
                  type="button"
                  class="rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-[12px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  [title]="'tasks.guide.explainClauseHint' | transloco"
                  (click)="explain(chip)"
                >
                  {{ clauseLabel(chip) }}
                </button>
              </li>
            }
          </ul>
        }
      </aside>
    }
  `,
})
export class TaskWhyItMatters {
  private readonly guidance = inject(TasksGuidance);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  readonly page = input.required<string>();

  protected readonly why = computed(() => this.guidance.file()?.pages[this.page()]?.why);
  protected readonly chips = computed(() => (this.why()?.clauses ?? []).map(parseClauseRef));

  protected clauseLabel(chip: ClauseChip): string {
    if (!KNOWN_FRAMEWORKS.has(chip.framework)) {
      return chip.ref;
    }
    return this.language.translate('tasks.guide.clause', {
      framework: this.language.translate(`tasks.guide.frameworks.${chip.framework}`),
      clause: chip.clause,
    });
  }

  protected explain(chip: ClauseChip): void {
    this.ask.showWith(
      this.language.translate('tasks.ai.prompts.explainClause', { clause: this.clauseLabel(chip) }),
    );
  }
}
