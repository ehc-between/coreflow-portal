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
 * "Why this matters" note (`pages.<page>.why`): a short explanation plus the clause
 * references it serves, as chips that open the tutor for that clause. Experts see the
 * chips only, with the explanation one click away.
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
          <h2 [id]="headingId" class="text-[12px] font-bold tracking-wide text-fg-subtle uppercase">
            {{ 'guidance.why.title' | transloco }}
          </h2>
          @if (why.clauses?.length) {
            <app-clause-chips [clauses]="why.clauses ?? []" />
          }
          @if (expert()) {
            <button
              type="button"
              class="ml-auto text-[12.5px] font-semibold text-accent hover:underline"
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
      </aside>
    }
  `,
})
export class WhyItMatters {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);

  readonly scope = input.required<string>();
  readonly page = input.required<string>();

  protected readonly headingId = `why-${nextId++}`;
  protected readonly bodyId = `${this.headingId}-body`;
  protected readonly why = computed(
    () => this.content.readPage(this.scope(), this.page())?.why ?? null,
  );
  protected readonly expert = this.guidance.isExpert;
  protected readonly showBody = linkedSignal(() => !this.guidance.isExpert());
}
