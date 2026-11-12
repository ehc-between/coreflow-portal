import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TourButton } from '../../../shared/guidance/tour-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { ContinuityContactsPanel } from '../shared/contacts-panel';
import { ContinuityNav } from '../shared/continuity-nav';

/**
 * The org-wide crisis contact list (`/continuity/contacts`): who to call in an
 * emergency (crisis team, authorities, emergency services, key suppliers), kept
 * verified at least yearly. Plans keep their own lists on the plan page.
 */
@Component({
  selector: 'app-continuity-contacts-page',
  imports: [
    TranslocoPipe,
    ContinuityContactsPanel,
    ContinuityNav,
    GuideIntro,
    LessonView,
    TourButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'continuity.contacts.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'continuity.contacts.subtitle' | transloco }}
          </p>
        </div>
        <app-tour-button scope="continuity" tour="contacts" />
      </div>
      <app-continuity-nav />
      <div class="mt-5 flex flex-col gap-3">
        <app-guide-intro scope="continuity" page="contacts" />
        <div><app-lesson scope="continuity" lesson="crisis-contacts" /></div>
      </div>
      <div class="mt-4">
        <app-continuity-contacts-panel [canEdit]="canWrite()" />
      </div>
      <div class="mt-6">
        <app-why-it-matters scope="continuity" page="contacts" />
      </div>
    </div>
  `,
})
export class ContinuityContactsPage {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  constructor() {
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_contact',
      view: 'list',
      title: this.language.translate('continuity.contacts.title'),
    }));
  }
}
