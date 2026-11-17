import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { MarkdownPipe } from '../markdown/markdown.pipe';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ClauseChips } from './clause-chips';

let nextId = 0;

/**
 * "Why this matters" note (`pages.<page>.why`): a short explanation, then the clauses it
 * serves as plain teaching links ("Les om: ISO 27001 · A.5.24") that open the tutor for
 * that clause. Teaching links are never pills, so they are not mistaken for evidence.
 * Experts see the links only, with the explanation one click away.
 */
@Component({
  selector: 'app-why-it-matters',
  imports: [TranslocoPipe, MarkdownPipe, ClauseChips],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (why(); as why) {
      <aside
        data-testid="why-it-matters"
        class="rounded-card border border-border bg-surface px-4 py-3"
        [attr.aria-labelledby]="headingId"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 [id]="headingId" class="text-meta font-bold tracking-wide text-fg-subtle uppercase">
            {{ 'guidance.why.title' | transloco }}
          </h2>
          @if (expert()) {
            <button
              type="button"
              class="ml-auto text-meta font-semibold text-accent hover:underline"
              [attr.aria-expanded]="showBody()"
              [attr.aria-controls]="bodyId"
              (click)="showBody.set(!showBody())"
            >
              {{ (showBody() ? 'guidance.why.less' : 'guidance.why.more') | transloco }}
            </button>
          }
        </div>
        @if (showBody()) {
          <div
            [id]="bodyId"
            class="cf-prose mt-2 text-fg-muted"
            [innerHTML]="why.body | appMarkdown"
          ></div>
        }
        @if (why.clauses?.length) {
          <app-clause-chips class="mt-2" [clauses]="why.clauses ?? []" [lead]="true" />
        }
      </aside>
    }
  `,
})
export class WhyItMatters {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);

  readonly scope = input.required<string>();
  readonly page = input.required<string>();
  /**
   * Narrow the clause links to these frameworks (e.g. the record's standards), so a
   * customer complaint does not teach ISO 27001 incident clauses. Shared ISO clauses
   * (`hs:`) always stay. Unset or empty shows every clause.
   */
  readonly frameworks = input<readonly string[] | null | undefined>(null);

  protected readonly headingId = `why-${nextId++}`;
  protected readonly bodyId = `${this.headingId}-body`;
  protected readonly why = computed(() => {
    const why = this.content.readPage(this.scope(), this.page())?.why ?? null;
    const frameworks = this.frameworks();
    if (!why || !frameworks?.length || !why.clauses?.length) {
      return why;
    }
    const allowed = new Set(frameworks);
    const clauses = why.clauses.filter((ref) => {
      const framework = ref
        .split(':')[0]
        .replace(/-d{4}$/, '')
        .replace(/-/g, '_');
      return framework === 'hs' || allowed.has(framework);
    });
    return { ...why, clauses };
  });
  protected readonly expert = this.guidance.isExpert;
  protected readonly showBody = linkedSignal(() => !this.guidance.isExpert());
}
