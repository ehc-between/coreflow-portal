import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { LessonView } from '../../../shared/guidance/lesson';
import { Term } from '../../../shared/guidance/term';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';

/** The continuity sub-pages (`app-module-nav`, directly under every page header). */
export const CONTINUITY_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'continuity.nav.overview', link: '/continuity', exact: true },
  { labelKey: 'continuity.nav.bias', link: '/continuity/bias' },
  { labelKey: 'continuity.nav.plans', link: '/continuity/plans' },
  { labelKey: 'continuity.nav.exercises', link: '/continuity/exercises' },
  { labelKey: 'continuity.nav.ict', link: '/continuity/ict-systems' },
  { labelKey: 'continuity.nav.contacts', link: '/continuity/contacts' },
];

/** The module root crumb (= nav label = overview h1). */
export const MODULE_CRUMB: Breadcrumb = {
  labelKey: 'modules.names.continuity',
  link: '/continuity',
};

/** Module › section (list pages). */
export function sectionCrumbs(section: ContinuitySection): readonly Breadcrumb[] {
  return [MODULE_CRUMB, { labelKey: SECTION_KEYS[section] }];
}

/** Module › section › record (detail pages). */
export function recordCrumbs(section: ContinuitySection, label: string): readonly Breadcrumb[] {
  return [
    MODULE_CRUMB,
    { labelKey: SECTION_KEYS[section], link: SECTION_LINKS[section] },
    { label },
  ];
}

/** Module › section › record › Edit / New (form pages). */
export function formCrumbs(
  section: ContinuitySection,
  record: { readonly id: string; readonly label: string } | null,
  lastKey: string,
): readonly Breadcrumb[] {
  const crumbs: Breadcrumb[] = [
    MODULE_CRUMB,
    { labelKey: SECTION_KEYS[section], link: SECTION_LINKS[section] },
  ];
  if (record) {
    crumbs.push({ label: record.label, link: [SECTION_LINKS[section], record.id] });
  }
  crumbs.push({ labelKey: lastKey });
  return crumbs;
}

export type ContinuitySection = 'bias' | 'plans' | 'exercises' | 'ict' | 'contacts';

const SECTION_KEYS: Readonly<Record<ContinuitySection, string>> = {
  bias: 'continuity.nav.bias',
  plans: 'continuity.nav.plans',
  exercises: 'continuity.nav.exercises',
  ict: 'continuity.nav.ict',
  contacts: 'continuity.nav.contacts',
};

const SECTION_LINKS: Readonly<Record<ContinuitySection, string>> = {
  bias: '/continuity/bias',
  plans: '/continuity/plans',
  exercises: '/continuity/exercises',
  ict: '/continuity/ict-systems',
  contacts: '/continuity/contacts',
};

/**
 * One line under list toolbars that explains the abbreviations used in the rows
 * (RTO, RPO, MTPD): hover or focus a term for the glossary definition.
 */
@Component({
  selector: 'app-continuity-targets-legend',
  imports: [TranslocoPipe, Term],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p class="text-meta text-fg-muted" data-testid="targets-legend">
      {{ 'continuity.legend.lead' | transloco }}
      <app-term key="rto" scope="continuity">{{ 'continuity.legend.rto' | transloco }}</app-term>
      ·
      <app-term key="rpo" scope="continuity">{{ 'continuity.legend.rpo' | transloco }}</app-term>
      @if (mtpd()) {
        ·
        <app-term key="mtpd" scope="continuity">{{
          'continuity.legend.mtpd' | transloco
        }}</app-term>
      }
    </p>
  `,
})
export class ContinuityTargetsLegend {
  readonly mtpd = input(true);
}

/**
 * The aside "Lær mer" card of a detail page (docs/ux-guide.md: one link list, never
 * full lessons): collapsed by default; each lesson opens in a side panel.
 */
@Component({
  selector: 'app-continuity-learn-more',
  imports: [TranslocoPipe, Card, Icon, LessonView, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (items().length) {
      <app-card>
        <details class="group" data-testid="learn-more">
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-tile text-card font-bold text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'continuity.common.learn' | transloco }}
            <span class="text-fg-subtle transition-transform group-open:rotate-180"
              ><app-icon name="chevron" [size]="15"
            /></span>
          </summary>
          <ul class="mt-3 flex flex-col gap-1.5">
            @for (item of items(); track item.key) {
              <li>
                <button
                  type="button"
                  class="inline-flex min-h-8 items-center gap-1.5 text-left text-ui font-semibold text-accent hover:underline"
                  (click)="open.set(item.key)"
                >
                  <app-icon name="book" [size]="14" />
                  {{ item.title }}
                  @if (item.minutes) {
                    <span class="font-normal text-fg-subtle">{{
                      'continuity.common.minutes' | transloco: { count: item.minutes }
                    }}</span>
                  }
                </button>
              </li>
            }
          </ul>
        </details>
      </app-card>
      <app-slide-over
        [open]="open() !== null"
        [title]="openTitle()"
        [closeLabel]="'continuity.common.close' | transloco"
        [width]="560"
        (closed)="open.set(null)"
      >
        @if (open(); as key) {
          <app-lesson scope="continuity" [lesson]="key" />
        }
      </app-slide-over>
    }
  `,
})
export class ContinuityLearnMore {
  private readonly content = inject(GuidanceContentService);

  /** Lesson keys in the continuity guidance file. */
  readonly lessons = input.required<readonly string[]>();

  protected readonly open = signal<string | null>(null);
  protected readonly items = computed(() =>
    this.lessons()
      .map((key) => ({ key, lesson: this.content.readLesson('continuity', key) }))
      .filter((x) => x.lesson !== null)
      .map((x) => ({ key: x.key, title: x.lesson!.title, minutes: x.lesson!.minutes ?? null })),
  );
  protected readonly openTitle = computed(() => {
    const key = this.open();
    return this.items().find((i) => i.key === key)?.title ?? '';
  });
}

/**
 * A question for the assistant ("Assess readiness"), styled like every other
 * assistant entry point (accent outline + spark) and with a tooltip saying the
 * answer opens in the assistant panel. Sends the translated `promptKey`.
 */
@Component({
  selector: 'app-continuity-ask-button',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-accent-border bg-accent-soft px-3 text-ui font-semibold text-accent hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      [title]="'continuity.ai.answersInPanel' | transloco"
      [attr.aria-description]="'continuity.ai.answersInPanel' | transloco"
      (click)="ask()"
      data-testid="continuity-ask"
    >
      <app-icon name="spark" [size]="14" />
      {{ labelKey() | transloco }}
    </button>
  `,
})
export class ContinuityAskButton {
  private readonly panel = inject(AskPanelService);
  private readonly language = inject(LanguageService);

  readonly labelKey = input.required<string>();
  readonly promptKey = input.required<string>();
  readonly promptParams = input<Record<string, unknown> | undefined>(undefined);

  protected ask(): void {
    this.panel.showWith(this.language.translate(this.promptKey(), this.promptParams()));
  }
}

/** Save a downloaded file (a PDF export) under its name. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A safe file name part from a title ("Kundeordre & fakturering" -> "kundeordre-fakturering"). */
export function fileSlug(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9æøå]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'export'
  );
}
