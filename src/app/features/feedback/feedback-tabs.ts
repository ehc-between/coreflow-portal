import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../shared/ui/icon/icon';

/** The section links of the feedback area: register, surveys and insights. */
@Component({
  selector: 'app-feedback-tabs',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mb-4 flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'feedback.tabs.label' | transloco"
    >
      @for (tab of tabs; track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive="!border-accent !text-fg"
          [routerLinkActiveOptions]="tab.exact ? exactPath : subsetPath"
          ariaCurrentWhenActive="page"
          class="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          [attr.data-testid]="'feedback-tab-' + tab.key"
        >
          <app-icon [name]="tab.icon" [size]="14" />
          {{ 'feedback.tabs.' + tab.key | transloco }}
        </a>
      }
    </nav>
  `,
})
export class FeedbackTabs {
  protected readonly exactPath = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  } as const;
  protected readonly subsetPath = { ...this.exactPath, paths: 'subset' } as const;
  protected readonly tabs = [
    { key: 'register', path: '/feedback', exact: true, icon: 'inbox' },
    { key: 'surveys', path: '/feedback/surveys', exact: false, icon: 'qa' },
    { key: 'insights', path: '/feedback/insights', exact: false, icon: 'reports' },
  ] as const;
}
