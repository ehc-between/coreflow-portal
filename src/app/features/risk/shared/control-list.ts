import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { internalLink } from '../../../core/search/internal-link';
import { fixedShortName } from '../../../shared/requirement-links/requirement-label';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { implementationValue } from '../data/risk-display';
import { ControlRef } from '../data/risk.models';

interface ControlRow {
  readonly ref: string;
  readonly short: string;
  readonly number: string;
  readonly title: string;
  readonly link: ReturnType<typeof internalLink>;
  readonly status: string | null;
  readonly statusKey: string | null;
}

/**
 * The controls a risk or treatment cites, readable for everyone:
 * "ISO 27001 · A.8.13 — Sikkerhetskopiering av informasjon", linked to the
 * control in the Statement of Applicability, with its implementation status
 * ("Implementert", "Utelatt"). Never the raw `iso27001:A.8.13` key.
 */
@Component({
  selector: 'app-risk-control-list',
  imports: [RouterLink, TranslocoPipe, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (rows().length) {
      <ul class="flex flex-col gap-1.5" [class.gap-1]="compact()" data-testid="control-list">
        @for (row of rows(); track row.ref) {
          <li class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            @if (row.link; as link) {
              <a
                [routerLink]="link.path"
                [queryParams]="link.queryParams"
                class="min-w-0 text-ui text-fg hover:text-accent hover:underline"
                [title]="'risk.controls.openInSoa' | transloco"
              >
                <span class="font-semibold">{{ row.short }} · {{ row.number }}</span>
                @if (row.title) {
                  <span class="text-fg-muted"> — {{ row.title }}</span>
                }
              </a>
            } @else {
              <span class="min-w-0 text-ui text-fg">
                <span class="font-semibold">{{ row.short }} · {{ row.number }}</span>
                @if (row.title) {
                  <span class="text-fg-muted"> — {{ row.title }}</span>
                }
              </span>
            }
            @if (row.status) {
              <app-status-badge
                meaning="compliance"
                [value]="row.status"
                [labelKey]="row.statusKey"
              />
            }
          </li>
        }
      </ul>
    } @else if (emptyKey()) {
      <p class="text-ui text-fg-muted">{{ emptyKey()! | transloco }}</p>
    }
  `,
})
export class ControlList {
  private readonly language = inject(LanguageService);

  readonly controls = input.required<readonly ControlRef[]>();
  readonly compact = input(false);
  readonly emptyKey = input<string | null>(null);

  protected readonly rows = computed<readonly ControlRow[]>(() => {
    const lang = this.language.active();
    return this.controls().map((c) => {
      const framework = c.framework ?? '';
      const short =
        c.short?.[lang] || c.short?.['en'] || fixedShortName(framework) || framework.toUpperCase();
      const title = (lang === 'nb' && c.title_nb) || c.title || '';
      let status: string | null = null;
      let statusKey: string | null = null;
      if (c.applicable === false) {
        status = 'not_applicable';
        statusKey = 'risk.controls.excluded';
      } else if (c.implementation_status) {
        status = implementationValue(c.implementation_status);
        statusKey = `risk.soa.implementation.${c.implementation_status}`;
      }
      return {
        ref: c.ref,
        short,
        number: c.number,
        title,
        link: internalLink(c.url),
        status,
        statusKey,
      };
    });
  });
}
