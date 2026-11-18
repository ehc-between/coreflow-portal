import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { formatLocalDay } from '../../shared/locale/locale-pipes';
import { locationName } from '../../shared/locale/countries';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { GAP_KINDS, PrivacyGap } from './data/privacy.models';

/** A route with its query string split for `routerLink` + `queryParams`. */
export function splitRoute(url: string): {
  readonly path: string;
  readonly query: Readonly<Record<string, string>> | null;
} {
  const [path, search] = url.split('?');
  if (!search) {
    return { path, query: null };
  }
  const query: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => (query[key] = value));
  return { path, query };
}

/** The article number of a canonical clause ref (`gdpr:6` → `6`). */
export function articleNumber(ref: string): string {
  const at = ref.indexOf(':');
  return at >= 0 ? ref.slice(at + 1) : ref;
}

/** The i18n group of a gap kind (unknown kinds read as a generic gap). */
export function gapKindKey(kind: string): string {
  return (GAP_KINDS as readonly string[]).includes(kind)
    ? `privacy.gaps.kinds.${kind}`
    : 'privacy.gaps.kinds.generic';
}

interface GapRow {
  readonly gap: PrivacyGap;
  readonly kindKey: string;
  readonly params: Record<string, unknown>;
  readonly fix: ReturnType<typeof splitRoute>;
  readonly open: ReturnType<typeof splitRoute>;
}

/**
 * "Mangler": what is missing between the registers (`GET /gaps`), most severe first.
 * Each row says what is missing, why it matters (the article), and offers one button
 * that opens the fix: a new record prefilled from this one, or the form to complete.
 * `compact` lists the first few with "Vis alle"; on a record page `showRecord` is off.
 */
@Component({
  selector: 'app-privacy-gaps',
  imports: [RouterLink, TranslocoPipe, Card, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-card font-bold text-fg">
          <app-icon name="target" [size]="16" />
          {{ titleKey() | transloco: { count: gaps().length } }}
        </h2>
        @if (limit() && gaps().length > limit() && !expanded()) {
          <button
            type="button"
            class="text-ui font-semibold text-accent hover:underline"
            (click)="expanded.set(true)"
            data-testid="gaps-show-all"
          >
            {{ 'privacy.gaps.showAll' | transloco: { count: gaps().length } }}
          </button>
        }
      </div>
      @if (gaps().length === 0) {
        <p class="text-ui text-fg-muted" data-testid="gaps-none">
          {{ emptyKey() | transloco }}
        </p>
      } @else {
        <p class="mb-3 text-ui text-fg-muted">{{ 'privacy.gaps.intro' | transloco }}</p>
        <ul class="flex flex-col divide-y divide-border" data-testid="privacy-gaps">
          @for (row of rows(); track row.gap.key) {
            <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-2 text-body font-semibold text-fg">
                  <app-status-badge
                    meaning="severity"
                    [value]="row.gap.severity"
                    [labelKey]="'privacy.gaps.severity.' + row.gap.severity"
                  />
                  <span>{{ row.kindKey + '.title' | transloco: row.params }}</span>
                </p>
                <p class="mt-0.5 text-ui text-fg-muted">
                  {{ row.kindKey + '.why' | transloco: row.params }}
                </p>
                @if (showRecord()) {
                  <a
                    [routerLink]="row.open.path"
                    class="mt-1 inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline"
                  >
                    <span class="font-mono">{{ row.gap.code }}</span>
                    <span class="truncate">{{ row.gap.title }}</span>
                  </a>
                }
              </div>
              @if (canFix()) {
                <a
                  [routerLink]="row.fix.path"
                  [queryParams]="row.fix.query"
                  class="inline-flex h-9 flex-none items-center justify-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  [attr.data-testid]="'gap-fix-' + row.gap.kind"
                >
                  {{ row.kindKey + '.fix' | transloco }}
                </a>
              }
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class PrivacyGaps {
  private readonly language = inject(LanguageService);

  readonly gaps = input.required<readonly PrivacyGap[]>();
  /** Rows shown before "Vis alle" (0 = all). */
  readonly limit = input(5);
  readonly canFix = input(true);
  /** Link each gap to its record (off on the record's own page). */
  readonly showRecord = input(true);
  readonly titleKey = input('privacy.gaps.title');
  readonly emptyKey = input('privacy.gaps.none');

  protected readonly expanded = signal(false);

  protected readonly rows = computed<readonly GapRow[]>(() => {
    const all = this.gaps();
    const limit = this.limit();
    const shown = this.expanded() || !limit ? all : all.slice(0, limit);
    return shown.map((gap) => ({
      gap,
      kindKey: gapKindKey(gap.kind),
      params: this.params(gap),
      fix: splitRoute(gap.fix.url),
      open: splitRoute(gap.url),
    }));
  });

  /** The text params of a gap: code, title, article and the kind's own details. */
  private params(gap: PrivacyGap): Record<string, unknown> {
    const t = (key: string) => this.language.translate(key);
    const p = gap.params ?? {};
    const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
    const fields = list(p['fields'])
      .map((f) => t(`privacy.fields.${f}`))
      .join(', ');
    const reasons = list(p['reasons'])
      .map((r) => t(`privacy.gaps.reasons.${r}`))
      .join(', ');
    const countries = list(p['countries'])
      .filter(Boolean)
      .map((c) => locationName(c, this.language))
      .join(', ');
    const dueAt = typeof p['due_at'] === 'string' ? (p['due_at'] as string) : null;
    return {
      code: gap.code,
      title: gap.title,
      article: articleNumber(gap.article),
      fields,
      reasons,
      countries: countries || t('privacy.gaps.unknownCountry'),
      dpaStatus:
        typeof p['dpa_status'] === 'string'
          ? t(`privacy.options.dpaStatus.${p['dpa_status']}`)
          : '',
      due: dueAt ? formatLocalDay(dueAt, 'mediumDate', this.language.locale()) : '',
    };
  }
}
