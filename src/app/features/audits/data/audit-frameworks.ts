import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { FrameworkSummary } from '../../../core/standards/standards.models';
import { parseClause } from '../../../shared/requirement-links/clause-picker';
import { CERTIFIABLE_FRAMEWORKS, FRAMEWORKS } from './audit.models';

/** Options for a framework list: the org's enabled standards plus any value already stored. */
export function frameworkOptions(
  enabled: readonly string[] | null,
  current: readonly string[] = [],
  allowed: readonly string[] = FRAMEWORKS,
): string[] {
  const base = enabled && enabled.length ? enabled : allowed;
  const keep = new Set([...base.filter((f) => allowed.includes(f)), ...current]);
  // Catalogue order, then anything unknown (stored before a standard was removed).
  return [
    ...FRAMEWORKS.filter((f) => keep.has(f)),
    ...[...keep].filter((f) => !(FRAMEWORKS as readonly string[]).includes(f)),
  ];
}

/**
 * The standards the organisation has switched on (`GET frameworks`), so audit
 * forms offer those instead of a fixed list of eight (UX audit #10), and the
 * standard key behind a framework, so a clause ref can link to its requirement
 * page in Standards. Until the list loads (or when it cannot be read) every
 * framework is offered.
 */
@Injectable({ providedIn: 'root' })
export class AuditFrameworks {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly rows = signal<readonly FrameworkSummary[] | null>(null);
  private loadedFor: string | null = null;

  /** Enabled framework keys, or null while unknown. */
  readonly enabled = computed<readonly string[] | null>(() => {
    const rows = this.rows();
    return rows ? rows.filter((r) => r.enabled).map((r) => r.framework) : null;
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  private load(orgId: string | null): void {
    if (!orgId || this.loadedFor === orgId) {
      return;
    }
    this.loadedFor = orgId;
    this.rows.set(null);
    this.api.listFrameworks(orgId).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.rows.set(null),
    });
  }

  /** Frameworks to offer in a form (enabled ones + the stored values). */
  options(current: readonly string[] = []): string[] {
    return frameworkOptions(this.enabled(), current);
  }

  /** Certifiable ISO standards to offer for a certificate (enabled ones + the stored value). */
  certifiable(current: string | null = null): string[] {
    return frameworkOptions(this.enabled(), current ? [current] : [], CERTIFIABLE_FRAMEWORKS);
  }

  /**
   * Router link of a clause ref's page in Standards (`/standards/<key>/<number>`), or
   * null when its standard is unknown. Shared ISO clauses (`hs:9.2`) open in the first
   * enabled ISO standard.
   */
  clauseLink(ref: string): readonly string[] | null {
    const { framework, number } = parseClause(ref);
    if (!framework || !number) {
      return null;
    }
    const rows = this.rows() ?? [];
    const row =
      framework === 'hs'
        ? rows.find((r) => r.enabled && r.framework.startsWith('iso'))
        : rows.find((r) => r.framework === framework);
    return row ? ['/standards', row.standard_key, number] : null;
  }
}
