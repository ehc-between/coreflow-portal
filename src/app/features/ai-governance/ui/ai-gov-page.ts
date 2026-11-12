import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Icon } from '../../../shared/ui/icon/icon';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';
import { AiGovNav } from './ai-gov-nav';

/**
 * Frame of the AI governance pages that are not a record list or detail:
 * optional back link, module navigation, heading + actions, the learning-mode
 * intro for `page`, the content, and the "why this matters" note.
 */
@Component({
  selector: 'app-ai-gov-page',
  imports: [RouterLink, TranslocoPipe, GuideIntro, WhyItMatters, Icon, AiGovNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (backLink(); as link) {
        <a
          [routerLink]="link"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ backLabelKey() | transloco }}
        </a>
      } @else {
        <app-ai-gov-nav />
      }
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <ng-content select="[eyebrow]" />
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ titleKey() | transloco: titleParams() }}
          </h1>
          @if (subtitleKey(); as sub) {
            <p class="mt-1 text-[13.5px] text-fg-muted">{{ sub | transloco }}</p>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <ng-content select="[actions]" />
        </div>
      </header>
      <app-guide-intro class="mb-4" [scope]="scope" [page]="page()" />
      <ng-content />
      <app-why-it-matters class="mt-6" [scope]="scope" [page]="page()" />
    </div>
  `,
})
export class AiGovPage {
  readonly titleKey = input.required<string>();
  readonly titleParams = input<Record<string, unknown>>({});
  readonly subtitleKey = input<string | null>(null);
  /** Guidance page key (`pages.<page>` in the guidance file). */
  readonly page = input.required<string>();
  readonly backLink = input<string | readonly unknown[] | null>(null);
  readonly backLabelKey = input('aiGovernance.common.back');

  protected readonly scope = AI_GOVERNANCE_SCOPE;
}
