import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DeviationListItem, StatusCategory } from '../../core/deviations/deviation.models';
import { hasAnyPermission } from '../../core/auth/permission';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { localize } from '../../core/records/localized';
import { LocalizedText } from '../../core/records/record.models';
import { RecordsApi } from '../../core/records/records-api';
import { categoryTone } from '../../shared/records/workflow-panel';
import { BadgeTone } from '../../shared/ui/badge/badge';
import { STATUS_OPTIONS, statusLabelKey, statusTone } from './deviation-enums';

/** Lifecycle categories in display order (the list's category filter). */
export const STATUS_CATEGORIES: readonly StatusCategory[] = [
  'open',
  'in_progress',
  'done',
  'cancelled',
];

/** What the status badge of a deviation needs. */
export type StatusSubject = Pick<
  DeviationListItem,
  'status' | 'status_category' | 'record_type_version_id'
>;

/** A workflow state known from the org's deviation workflows. */
export interface KnownState {
  readonly key: string;
  readonly label: LocalizedText;
  readonly category: string;
}

/** `snake_case` -> `Snake case`, the last-resort label of an unknown state key. */
export function humanizeKey(key: string): string {
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/** Whether a status belongs to the fixed legacy status machine. */
export function isLegacyStatus(subject: StatusSubject): boolean {
  return (
    !subject.record_type_version_id &&
    (STATUS_OPTIONS as readonly string[]).includes(subject.status)
  );
}

/** Badge tone: legacy statuses keep their tones, workflow states follow their category. */
export function deviationStatusTone(subject: StatusSubject): BadgeTone {
  return isLegacyStatus(subject)
    ? statusTone(subject.status)
    : categoryTone(subject.status_category ?? 'open');
}

/**
 * Status labels of deviations, legacy and record-typed. Legacy statuses are
 * translated (`deviations.status.<status>`); a workflow state uses the label from
 * the org's deviation workflows (current versions, loaded once per org; the user
 * needs `records:read`), else a humanised key.
 */
@Injectable({ providedIn: 'root' })
export class DeviationStatusLabels {
  private readonly records = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  private readonly states = signal<ReadonlyMap<string, KnownState>>(new Map());
  private loadedFor: string | null = null;

  /** The known workflow states (for the status filter), sorted by label. */
  readonly workflowStates = computed(() => {
    const lang = this.language.active();
    return [...this.states().values()]
      .map((state) => ({ ...state, text: localize(state.label, lang) || humanizeKey(state.key) }))
      .sort((a, b) => a.text.localeCompare(b.text));
  });

  constructor() {
    effect(() => this.ensure(this.selectedOrg.currentOrgId()));
  }

  /** The translated label of a deviation's status (reactive on language and loaded states). */
  label(subject: StatusSubject): string {
    if (isLegacyStatus(subject)) {
      return this.language.translate(statusLabelKey(subject.status));
    }
    const state = this.states().get(subject.status);
    if (state) {
      return localize(state.label, this.language.active()) || humanizeKey(subject.status);
    }
    if ((STATUS_OPTIONS as readonly string[]).includes(subject.status)) {
      return this.language.translate(statusLabelKey(subject.status));
    }
    return humanizeKey(subject.status);
  }

  tone(subject: StatusSubject): BadgeTone {
    return deviationStatusTone(subject);
  }

  /** Force a reload (e.g. after a template was installed). */
  reload(): void {
    this.loadedFor = null;
    this.ensure(this.selectedOrg.currentOrgId());
  }

  private ensure(orgId: string | null): void {
    if (!orgId || this.loadedFor === orgId) {
      return;
    }
    this.loadedFor = orgId;
    this.states.set(new Map());
    if (!hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'records:read')) {
      return;
    }
    this.records.listWorkflows(orgId, 'deviations').subscribe({
      next: (workflows) => {
        const map = new Map<string, KnownState>();
        for (const workflow of workflows) {
          for (const state of workflow.current_version?.definition.states ?? []) {
            if (!map.has(state.key)) {
              map.set(state.key, { key: state.key, label: state.label, category: state.category });
            }
          }
        }
        this.states.set(map);
      },
      // No records:read (or records off): labels fall back to humanised keys.
      error: () => this.states.set(new Map()),
    });
  }
}
