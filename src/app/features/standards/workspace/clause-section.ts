import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { localized, pctColor } from '../../../core/standards/standards-data';
import { LocalizedText, RequirementDetail } from '../../../core/standards/standards.models';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { themeKey } from '../standard-themes';
import { RequirementRow } from './requirement-row';
import { SectionView, sectionDomId } from './workspace-data';
import { SpySection } from './workspace-scroll';

/** Licensed clause text, fetched on demand per clause. */
export type LicensedState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly text: string | null }
  | { readonly status: 'error' };

/** A neighbouring section for the previous / next links. */
export interface SectionLink {
  readonly number: string;
  readonly title: LocalizedText;
}

/**
 * One clause / control of the workspace document: heading (number + title),
 * our explanation, collapsible guidance, the org's licensed text in a clearly
 * labelled collapsible block, the requirements inline, and previous / next
 * links. Purely presentational: state lives in the workspace.
 */
@Component({
  selector: 'app-clause-section',
  imports: [RouterLink, TranslocoPipe, Badge, Icon, ProgressBar, RequirementRow, SpySection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = section();
    @let node = s.node;
    @if (s.themeHeading; as theme) {
      <div
        class="mt-10 mb-2 border-b border-border pb-2 text-[11.5px] font-bold tracking-[0.1em] text-fg-subtle uppercase"
      >
        @if (themeKey(theme); as k) {
          {{ k | transloco }}
        } @else {
          {{ theme }}
        }
      </div>
    }
    <section
      [id]="domId()"
      [appSpySection]="s.number"
      [attr.aria-labelledby]="domId() + '-h'"
      class="scroll-mt-4"
      [class]="s.depth === 0 ? 'pt-12' : 'pt-8'"
    >
      <header class="mb-3">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div
              [id]="domId() + '-h'"
              role="heading"
              [attr.aria-level]="headingLevel()"
              class="flex items-baseline gap-3 font-display tracking-[-0.02em] text-fg"
              [class]="headingClass()"
            >
              <span class="flex-none font-mono font-semibold text-fg-subtle tabular-nums">{{
                s.number
              }}</span>
              <span class="min-w-0">{{ text(node.title) }}</span>
            </div>
            @if (node.kind === 'annex_control') {
              <div class="mt-1.5">
                <app-badge tone="info">{{ 'standards.clause.control' | transloco }}</app-badge>
              </div>
            }
          </div>
          @if (node.rollup.applicable > 0) {
            <div class="mt-1.5 flex w-28 flex-none items-center gap-2" [title]="coverageTitle()">
              <span class="flex-1">
                <app-progress-bar
                  [value]="node.rollup.pct"
                  [color]="pctColor(node.rollup.pct)"
                  [label]="'standards.completeness' | transloco"
                />
              </span>
              <span class="w-9 text-right text-[12px] font-semibold text-fg-muted tabular-nums"
                >{{ node.rollup.pct }}%</span
              >
            </div>
          }
        </div>
      </header>

      @if (summary(); as summaryText) {
        <div class="mb-3">
          <p class="text-[15px] leading-[1.7] whitespace-pre-line text-fg">{{ summaryText }}</p>
          <p class="mt-1.5 text-[11.5px] text-fg-subtle">
            {{ 'standards.clause.explanationHint' | transloco }}
          </p>
        </div>
      }

      @if (guidance() || showLicensed()) {
        <div class="mb-4 flex flex-col gap-2">
          @if (guidance(); as guidanceText) {
            <div class="rounded-tile border border-border bg-surface-2/60">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-fg"
                [attr.aria-expanded]="guidanceOpen()"
                [attr.aria-controls]="domId() + '-guidance'"
                (click)="guidanceToggled.emit()"
              >
                <span class="flex text-fg-subtle"><app-icon name="procedures" [size]="15" /></span>
                <span class="flex-1">{{ 'standards.clause.guidance' | transloco }}</span>
                <app-icon
                  name="chevron"
                  [size]="14"
                  class="text-fg-subtle"
                  [class]="guidanceOpen() ? 'rotate-180' : ''"
                />
              </button>
              @if (guidanceOpen()) {
                <div [id]="domId() + '-guidance'" class="px-3.5 pb-3.5">
                  <p class="text-[14px] leading-[1.65] whitespace-pre-line text-fg">
                    {{ guidanceText }}
                  </p>
                  <p class="mt-1.5 text-[11.5px] text-fg-subtle">
                    {{ 'standards.clause.guidanceHint' | transloco }}
                  </p>
                </div>
              }
            </div>
          }

          @if (showLicensed()) {
            <div class="rounded-tile border border-accent-border bg-accent-soft/30">
              <button
                type="button"
                class="flex w-full flex-wrap items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-fg"
                [attr.aria-expanded]="licensedOpen()"
                [attr.aria-controls]="domId() + '-licensed'"
                (click)="licensedToggled.emit()"
              >
                <span class="flex text-accent"><app-icon name="lock" [size]="15" /></span>
                <span>{{ 'standards.clause.licensedText' | transloco }}</span>
                <app-badge tone="accent">{{
                  'standards.clause.licensedBadge' | transloco
                }}</app-badge>
                <span class="flex-1"></span>
                <app-icon
                  name="chevron"
                  [size]="14"
                  class="text-fg-subtle"
                  [class]="licensedOpen() ? 'rotate-180' : ''"
                />
              </button>
              @if (licensedOpen()) {
                <div [id]="domId() + '-licensed'" class="px-3.5 pb-3.5" aria-live="polite">
                  @switch (licensed()?.status) {
                    @case ('loaded') {
                      @if (licensedText(); as licensedBody) {
                        <blockquote
                          class="border-l-2 border-accent-border pl-3 text-[14px] leading-[1.65] whitespace-pre-line text-fg"
                        >
                          {{ licensedBody }}
                        </blockquote>
                        <p class="mt-1.5 text-[11.5px] text-fg-subtle">
                          {{ 'standards.clause.licensedHint' | transloco }}
                        </p>
                      } @else {
                        <p class="text-[13px] text-fg-muted">
                          {{ 'standards.workspace.noLicensedText' | transloco }}
                        </p>
                      }
                    }
                    @case ('error') {
                      <p class="text-[13px] text-fail" role="alert">
                        {{ 'standards.workspace.licensedError' | transloco }}
                      </p>
                    }
                    @default {
                      <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
                    }
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      @if (node.requirements.length > 0) {
        <div class="mt-4">
          <div
            class="mb-2 text-[11.5px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
            [id]="domId() + '-reqs'"
          >
            {{ 'standards.clause.requirements' | transloco: { count: node.requirements.length } }}
          </div>
          <ul class="flex flex-col gap-2" [attr.aria-labelledby]="domId() + '-reqs'">
            @for (req of node.requirements; track req.ref) {
              <li>
                <app-requirement-row
                  [requirement]="req"
                  [expanded]="expandedRefs().has(req.ref)"
                  [highlighted]="highlightRef() === req.ref"
                  [canManage]="canManage()"
                  (toggled)="requirementToggled.emit(req.ref)"
                  (updated)="requirementUpdated.emit($event)"
                  (linksChanged)="linksChanged.emit(req.ref)"
                />
              </li>
            }
          </ul>
        </div>
      }

      @if (prev() || next()) {
        <nav
          class="mt-5 flex items-center justify-between gap-3 border-t border-dashed border-border pt-3 text-[12.5px]"
          [attr.aria-label]="'standards.workspace.sectionNav' | transloco: { number: s.number }"
        >
          @if (prev(); as p) {
            <a
              [routerLink]="['/standards', standardKey(), p.number]"
              class="inline-flex min-w-0 items-center gap-1.5 text-fg-muted hover:text-accent"
              (click)="onNavigate($event, p.number)"
            >
              <app-icon name="back" [size]="14" />
              <span class="sr-only">{{ 'standards.workspace.previous' | transloco }}:</span>
              <span class="font-mono">{{ p.number }}</span>
              <span class="hidden truncate sm:inline">{{ text(p.title) }}</span>
            </a>
          } @else {
            <span></span>
          }
          @if (next(); as n) {
            <a
              [routerLink]="['/standards', standardKey(), n.number]"
              class="inline-flex min-w-0 items-center gap-1.5 text-right text-fg-muted hover:text-accent"
              (click)="onNavigate($event, n.number)"
            >
              <span class="sr-only">{{ 'standards.workspace.next' | transloco }}:</span>
              <span class="font-mono">{{ n.number }}</span>
              <span class="hidden truncate sm:inline">{{ text(n.title) }}</span>
              <app-icon name="arrow" [size]="14" />
            </a>
          }
        </nav>
      }
    </section>
  `,
})
export class ClauseSection {
  private readonly language = inject(LanguageService);

  readonly section = input.required<SectionView>();
  readonly standardKey = input.required<string>();
  readonly canManage = input(false);
  /** Whether the org has a licensed copy with extracted text. */
  readonly hasLicensedText = input(false);
  readonly licensed = input<LicensedState | undefined>(undefined);
  readonly licensedOpen = input(false);
  readonly guidanceOpen = input(false);
  readonly expandedRefs = input<ReadonlySet<string>>(new Set());
  readonly highlightRef = input<string | null>(null);
  readonly prev = input<SectionLink | null>(null);
  readonly next = input<SectionLink | null>(null);

  readonly guidanceToggled = output<void>();
  readonly licensedToggled = output<void>();
  readonly requirementToggled = output<string>();
  readonly requirementUpdated = output<RequirementDetail>();
  /** Evidence changed on requirement `ref` (the server recomputes its status). */
  readonly linksChanged = output<string>();
  /** A previous / next link was activated (plain click). */
  readonly navigate = output<string>();

  protected readonly pctColor = pctColor;
  protected readonly themeKey = themeKey;

  protected readonly domId = computed(() => sectionDomId(this.section().number));
  /** h1 is the standard's name in the header; chapters are h2. */
  protected readonly headingLevel = computed(() => Math.min(this.section().depth + 2, 6));
  protected readonly headingClass = computed(() => {
    switch (this.section().depth) {
      case 0:
        return 'text-[24px] font-bold leading-tight';
      case 1:
        return 'text-[19px] font-bold leading-snug';
      default:
        return 'text-[16.5px] font-semibold leading-snug';
    }
  });
  protected readonly summary = computed(() =>
    localized(this.section().node.summary, this.language.active()),
  );
  protected readonly guidance = computed(() =>
    localized(this.section().node.guidance, this.language.active()),
  );
  protected readonly showLicensed = computed(() => {
    const state = this.licensed();
    // Hide the block once we know this clause has no text in the org's copy.
    return (
      this.hasLicensedText() && !(state?.status === 'loaded' && !state.text && !this.licensedOpen())
    );
  });
  protected readonly licensedText = computed(() => {
    const state = this.licensed();
    return state?.status === 'loaded' ? state.text : null;
  });
  protected readonly coverageTitle = computed(() => {
    const r = this.section().node.rollup;
    return `${r.covered}/${r.applicable}`;
  });

  protected text(value: LocalizedText | null | undefined): string {
    return localized(value, this.language.active());
  }

  /** Plain left clicks scroll in place; modified clicks keep their browser meaning. */
  protected onNavigate(event: MouseEvent, number: string): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    this.navigate.emit(number);
  }
}
