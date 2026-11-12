import { DestroyRef, Injectable, computed, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { filter, merge } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';
import { EntityTypeInfo } from '../entities/entity.models';
import { KitApi } from './kit-api';
import { LINK_TYPES } from './kit.models';

interface Catalog {
  readonly orgId: string;
  readonly items: readonly EntityTypeInfo[];
  readonly linkTypes: readonly string[];
}

/** `risk_treatment` -> `Risk treatment` (last-resort label for an unknown type). */
export function humanize(value: string): string {
  const text = value.replace(/[_.-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

/**
 * The registered entity types of the current org (`GET entity-types`), loaded
 * once per org on first use, and their display names. Kit pickers use it to
 * offer only linkable / searchable types.
 */
@Injectable({ providedIn: 'root' })
export class EntityTypesService {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly transloco = inject(TranslocoService);

  private readonly catalog = signal<Catalog | null>(null);
  private loadingOrg: string | null = null;
  /** Bumps on language switch / translation load so labels re-evaluate. */
  private readonly i18nRevision = signal(0);

  constructor() {
    const sub = merge(
      this.transloco.langChanges$,
      this.transloco.events$.pipe(filter((e) => e.type === 'translationLoadSuccess')),
    ).subscribe(() => untracked(() => this.i18nRevision.update((n) => n + 1)));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /** Types of the current org (empty until loaded or after a failed load). */
  readonly types = computed<readonly EntityTypeInfo[]>(() => {
    const catalog = this.catalog();
    return catalog && catalog.orgId === this.selectedOrg.currentOrgId() ? catalog.items : [];
  });

  /** Link types the backend accepts (the contract list until loaded). */
  readonly linkTypes = computed<readonly string[]>(() => {
    const catalog = this.catalog();
    return catalog && catalog.orgId === this.selectedOrg.currentOrgId()
      ? catalog.linkTypes
      : LINK_TYPES;
  });

  /** Types a record may be linked to (linkable and findable through search). */
  readonly linkTargets = computed(() => this.types().filter((t) => t.linkable && t.searchable));

  /** Load the catalog for the current org, unless it is loaded or loading. */
  ensureLoaded(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.catalog()?.orgId === orgId || this.loadingOrg === orgId) {
      return;
    }
    this.loadingOrg = orgId;
    this.api.entityTypes(orgId).subscribe({
      next: (list) => {
        this.loadingOrg = null;
        this.catalog.set({ orgId, items: list.items, linkTypes: list.link_types });
      },
      error: () => {
        // Pickers fall back to the contract's link types and an unfiltered search.
        this.loadingOrg = null;
      },
    });
  }

  info(entityType: string): EntityTypeInfo | null {
    return this.types().find((t) => t.entity_type === entityType) ?? null;
  }

  /**
   * Display name of an entity type in the active language: the type's global
   * label key when translated, else the kit scope's built-in name, else the
   * humanized type. Signal-tracked, safe in `computed()` and templates.
   */
  label(entityType: string, labelKey?: string | null): string {
    const keys = [
      labelKey ?? this.info(entityType)?.label_key ?? null,
      `modules.entities.${entityType}`,
      `kit.entityTypes.${entityType}`,
    ];
    return this.firstTranslated(keys) ?? humanize(entityType);
  }

  /**
   * Display name of a record status: the owning module's `<module>.status.<s>`
   * label when loaded, else the kit's common status names, else humanized.
   */
  statusLabel(status: string, module?: string | null): string {
    const keys = module
      ? [`${module}.status.${status}`, `${camelCase(module)}.status.${status}`]
      : [];
    return this.firstTranslated([...keys, `kit.status.${status}`]) ?? humanize(status);
  }

  /** The first key translated in the active language (looked up directly, so a
   *  missing optional key is not reported as missing). Signal-tracked. */
  private firstTranslated(keys: readonly (string | null)[]): string | null {
    this.i18nRevision();
    const translation = this.transloco.getTranslation(this.transloco.getActiveLang());
    for (const key of keys) {
      const text = key ? translation[key] : undefined;
      if (typeof text === 'string' && text) {
        return text;
      }
    }
    return null;
  }
}

/** `management_review` / `management-review` -> `managementReview` (Transloco's scope alias). */
export function camelCase(value: string): string {
  return value.replace(/[-_]+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
