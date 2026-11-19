import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';
import { AiNav } from './ai-nav';
import { ModuleConfigNav } from '../../../shared/ui/module-config-nav/module-config-nav';
import { moduleConfigCrumbs } from '../../../core/modules/module-config';

/** Breadcrumb root of every AI governance page (= nav label = module h1). */
export const AI_GOV_ROOT: Breadcrumb = {
  labelKey: 'modules.names.ai_governance',
  link: '/ai-governance',
};

/**
 * Frame of the AI governance pages that are not a record list or detail
 * (docs/ux-guide.md, page anatomy): `app-page-header` (breadcrumbs, h1, one-line
 * description, `[primary]` / `[secondary]` / `[overflow]` actions, the settings
 * gear) → `app-ai-nav` → `app-help-strip` (intro, tour and lesson for `page`, the
 * only learning entry) → the content → why-it-matters below.
 */
@Component({
  selector: 'app-ai-gov-page',
  imports: [PageHeader, HelpStrip, WhyItMatters, AiNav, ModuleConfigNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="titleKey()"
        [titleParams]="titleParams()"
        [title]="title()"
        [descriptionKey]="descriptionKey()"
        [breadcrumbs]="crumbs()"
        [settingsLink]="settingsLink()"
        [backLink]="backLink()"
        [backLabelKey]="backLabelKey()"
        [outputsModule]="outputsModule()"
      >
        <ng-container ngProjectAs="[meta]"><ng-content select="[meta]" /></ng-container>
        <ng-container ngProjectAs="[secondary]"><ng-content select="[secondary]" /></ng-container>
        <ng-container ngProjectAs="[primary]"><ng-content select="[primary]" /></ng-container>
        <ng-container ngProjectAs="[overflow]"><ng-content select="[overflow]" /></ng-container>
      </app-page-header>
      @if (config()) {
        <app-module-config-nav module="ai_governance" />
      } @else if (nav()) {
        <app-ai-nav class="mb-5" />
      }
      <app-help-strip [scope]="scope" [page]="page()" [tour]="tour()" [lesson]="lesson()" />
      <ng-content />
      @if (why()) {
        <app-why-it-matters class="mt-8" [scope]="scope" [page]="page()" />
      }
    </div>
  `,
})
export class AiGovPage {
  readonly titleKey = input<string | null>(null);
  readonly titleParams = input<Record<string, unknown> | undefined>(undefined);
  /** Literal h1 (a record name); wins over `titleKey`. */
  readonly title = input<string | null>(null);
  readonly descriptionKey = input<string | null>(null);
  /** Crumbs after the module root ("KI-styring › …"). */
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
  /** Guidance page key (`pages.<page>` in the guidance file). */
  readonly page = input.required<string>();
  readonly tour = input<string | null>(null);
  readonly lesson = input<string | null>(null);
  /** Show the module sub-navigation (off on forms and sub-pages of a record). */
  readonly nav = input(true);
  readonly why = input(true);
  /** A configuration page (U10): Settings crumbs and the configuration nav, no module tabs. */
  readonly config = input(false);
  readonly settingsLink = input<string | null>('/settings/modules/ai-governance');
  readonly backLink = input<string | readonly unknown[] | null>(null);
  readonly backLabelKey = input<string | null>(null);
  /** "Dokumenter og rapporter" for this module (principle 8). */
  readonly outputsModule = input<string | null>(null);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly crumbs = computed<readonly Breadcrumb[]>(() => [
    ...(this.config() ? moduleConfigCrumbs('ai_governance') : [AI_GOV_ROOT]),
    ...this.breadcrumbs(),
  ]);
}
