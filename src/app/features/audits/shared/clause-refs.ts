import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { teachingClause } from '../../../shared/guidance/clause-chips';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuditFrameworks } from '../data/audit-frameworks';

/**
 * The clauses an audit, question or finding is about, as readable outlined chips
 * ("ISO 9001 · 8.4", "Felles ISO-krav · 9.2") that open the requirement in
 * Standards. Never the raw `iso9001:8.4` ref. `suggested` draws them dashed: a
 * finding's clause is a weak spot, not evidence that the requirement is met.
 */
@Component({
  selector: 'app-audit-clause-refs',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-1.5' },
  template: `
    @for (chip of chips(); track chip.ref) {
      @if (chip.link) {
        <a
          [routerLink]="chip.link"
          data-testid="audit-clause-ref"
          class="inline-flex max-w-full items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-meta font-medium text-fg hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [class]="suggested() ? 'border-dashed border-border-strong' : 'border-border'"
          [title]="
            (chip.shared ? 'standards.reqs.teach.sharedTooltip' : 'audits.clauses.openTooltip')
              | transloco
          "
        >
          <app-icon name="book" [size]="12" class="text-fg-subtle" />
          <span class="truncate">{{ chip.label }}</span>
        </a>
      } @else {
        <span
          data-testid="audit-clause-ref"
          class="inline-flex max-w-full items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-meta font-medium text-fg"
          [class]="suggested() ? 'border-dashed border-border-strong' : 'border-border'"
        >
          <span class="truncate">{{ chip.label }}</span>
        </span>
      }
    } @empty {
      <span class="text-body text-fg-muted">{{ 'common.empty.none' | transloco }}</span>
    }
  `,
})
export class AuditClauseRefs {
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(AuditFrameworks);

  readonly refs = input<readonly string[] | null | undefined>([]);
  readonly suggested = input(false);

  protected readonly chips = computed(() => {
    // Re-label when the language changes.
    this.language.active();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return (this.refs() ?? []).map((ref) => ({
      ...teachingClause(ref, t),
      link: this.frameworks.clauseLink(ref),
    }));
  });
}
