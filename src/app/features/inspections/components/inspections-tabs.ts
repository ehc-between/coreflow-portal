import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

export type InspectionsSection = 'inspections' | 'findings' | 'templates' | 'schedules';

interface SectionLink {
  readonly key: InspectionsSection;
  readonly link: string;
}

const SECTIONS: readonly SectionLink[] = [
  { key: 'inspections', link: '/inspections' },
  { key: 'findings', link: '/inspections/findings' },
  { key: 'templates', link: '/inspections/templates' },
  { key: 'schedules', link: '/inspections/schedules' },
];

/** The inspections area's section links (inspections, findings, templates, schedules). */
@Component({
  selector: 'app-inspections-tabs',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mt-3 flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'inspections.sections.label' | transloco"
    >
      @for (s of sections; track s.key) {
        <a
          [routerLink]="s.link"
          class="-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent"
          [class]="
            s.key === active()
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          "
          [attr.aria-current]="s.key === active() ? 'page' : null"
          [attr.data-testid]="'section-' + s.key"
        >
          {{ 'inspections.sections.' + s.key | transloco }}
        </a>
      }
    </nav>
  `,
})
export class InspectionsTabs {
  readonly active = input.required<InspectionsSection>();

  protected readonly sections = SECTIONS;
}
