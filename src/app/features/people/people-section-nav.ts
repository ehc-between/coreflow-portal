import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { Icon } from '../../shared/ui/icon/icon';

export const PEOPLE_SECTIONS = [
  'employees',
  'positions',
  'competences',
  'matrix',
  'checklists',
] as const;
export type PeopleSection = (typeof PEOPLE_SECTIONS)[number];

/** Links between the areas of the people module (employees, positions, ...). */
@Component({
  selector: 'app-people-section-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mb-4 flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'people.sections.label' | transloco"
    >
      @for (s of sections; track s) {
        <a
          [routerLink]="['/people', s]"
          routerLinkActive=""
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          class="-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent"
          [class]="
            rla.isActive
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          "
          [attr.data-testid]="'section-' + s"
        >
          {{ 'people.sections.' + s | transloco }}
        </a>
      }
    </nav>
  `,
})
export class PeopleSectionNav {
  protected readonly sections = PEOPLE_SECTIONS;
}

/**
 * A compact link to one of the people micro-lessons (played on the learning page,
 * `/account/learning/people/<lesson>`, which records progress).
 */
@Component({
  selector: 'app-people-lesson-link',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lessonContent(); as l) {
      <a
        [routerLink]="['/account/learning', 'people', lesson()]"
        class="inline-flex items-center gap-1.5 rounded-tile px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
        [attr.data-testid]="'lesson-link-' + lesson()"
      >
        <app-icon name="training" [size]="14" />
        {{ 'people.lessons.link' | transloco: { title: l.title, minutes: l.minutes } }}
      </a>
    }
  `,
})
export class PeopleLessonLink {
  private readonly content = inject(GuidanceContentService);
  readonly lesson = input.required<string>();
  protected readonly lessonContent = computed(() =>
    this.content.readLesson('people', this.lesson()),
  );
}
