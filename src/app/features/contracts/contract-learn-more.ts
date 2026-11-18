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
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ClauseChips } from '../../shared/guidance/clause-chips';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';

/**
 * "Why this matters" for one contract: the module explanation, then teaching links
 * to the requirements THIS contract documents (its type and flags: an NDA reads
 * about ISO 27001 A.6.6, a DPA about GDPR Art. 28), not the same list everywhere.
 * Collapsed for experts. Teaching links, never evidence pills.
 */
@Component({
  selector: 'app-contract-learn-more',
  imports: [TranslocoPipe, MarkdownPipe, ClauseChips],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (why(); as why) {
      <aside
        data-testid="contract-learn-more"
        class="rounded-card border border-border bg-surface px-4 py-3"
        aria-labelledby="cf-contract-why"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2
            id="cf-contract-why"
            class="text-meta font-bold tracking-wide text-fg-subtle uppercase"
          >
            {{ 'guidance.why.title' | transloco }}
          </h2>
          @if (expert()) {
            <button
              type="button"
              class="ml-auto text-meta font-semibold text-accent hover:underline"
              [attr.aria-expanded]="showBody()"
              aria-controls="cf-contract-why-body"
              (click)="showBody.set(!showBody())"
            >
              {{ (showBody() ? 'guidance.why.less' : 'guidance.why.more') | transloco }}
            </button>
          }
        </div>
        @if (showBody()) {
          <div
            id="cf-contract-why-body"
            class="cf-prose mt-2 text-fg-muted"
            [innerHTML]="why.body | appMarkdown"
          ></div>
        }
        @if (clauses().length) {
          <app-clause-chips class="mt-2" [clauses]="clauses()" [lead]="true" />
        }
      </aside>
    }
  `,
})
export class ContractLearnMore {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);

  /** The contract's own clause refs (`requirement_refs`); the page defaults otherwise. */
  readonly requirementRefs = input<readonly string[] | null | undefined>(null);

  protected readonly why = computed(
    () => this.content.readPage('contracts', 'detail')?.why ?? null,
  );
  protected readonly clauses = computed(() => {
    const own = this.requirementRefs();
    return own?.length ? own.slice(0, 6) : (this.why()?.clauses ?? []);
  });
  protected readonly expert = this.guidance.isExpert;
  protected readonly showBody = linkedSignal(() => !this.guidance.isExpert());
}
