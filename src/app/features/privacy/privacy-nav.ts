import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../../shared/ui/icon/icon';
import { REGISTER_LIST, RegisterKey } from './data/privacy-registers';

/** The permissions of the signed-in user in the current org (reactive). */
export function privacyPermissions() {
  const selectedOrg = inject(SelectedOrgService);
  return computed<ReadonlySet<string>>(() => new Set(selectedOrg.currentOrg()?.permissions ?? []));
}

/**
 * The register switcher of the privacy area: the overview and every register
 * the user may read (requests and consents need `privacy:requests`).
 */
@Component({
  selector: 'app-privacy-nav',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1"
      [attr.aria-label]="'privacy.nav.label' | transloco"
    >
      <a
        routerLink="/privacy"
        class="inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap"
        [class]="active() === 'overview' ? activeClass : idleClass"
        [attr.aria-current]="active() === 'overview' ? 'page' : null"
      >
        {{ 'privacy.nav.overview' | transloco }}
      </a>
      @for (r of registers(); track r.key) {
        <a
          [routerLink]="['/privacy', r.segment]"
          class="inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap"
          [class]="active() === r.key ? activeClass : idleClass"
          [attr.aria-current]="active() === r.key ? 'page' : null"
          [attr.data-testid]="'privacy-nav-' + r.key"
        >
          <app-icon [name]="r.icon" [size]="13" />
          {{ 'privacy.registers.' + r.key + '.plural' | transloco }}
        </a>
      }
    </nav>
  `,
})
export class PrivacyNav {
  readonly active = input<RegisterKey | 'overview'>('overview');
  private readonly perms = privacyPermissions();

  protected readonly activeClass = 'bg-accent text-white';
  protected readonly idleClass = 'bg-surface-2 text-fg-muted hover:text-fg';

  protected readonly registers = computed(() =>
    REGISTER_LIST.filter((r) => this.perms().has(r.readPermission)),
  );
}

/**
 * A compact link to one of the privacy micro-lessons (played on the learning
 * page, `/account/learning/privacy/<lesson>`, which records progress).
 */
@Component({
  selector: 'app-privacy-lesson-link',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lessonContent(); as l) {
      <a
        [routerLink]="['/account/learning', 'privacy', lesson()]"
        class="inline-flex items-center gap-1.5 rounded-tile px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
        [attr.data-testid]="'lesson-link-' + lesson()"
      >
        <app-icon name="training" [size]="14" />
        {{ 'privacy.lessons.link' | transloco: { title: l.title, minutes: l.minutes } }}
      </a>
    }
  `,
})
export class PrivacyLessonLink {
  private readonly content = inject(GuidanceContentService);
  readonly lesson = input.required<string>();
  protected readonly lessonContent = computed(() =>
    this.content.readLesson('privacy', this.lesson()),
  );
}
