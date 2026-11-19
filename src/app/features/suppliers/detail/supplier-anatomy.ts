import { ActivatedRoute, Router } from '@angular/router';
import { StatusLineTone } from '../../../shared/kit/record-sections';
import { attentionAction } from '../data/supplier-display';
import {
  EvaluationDetail,
  EvaluationKind,
  EvaluationStatus,
  SupplierDetail,
  SupplierStatus,
} from '../data/supplier.models';

/** Tone of the supplier's status sentence: approved is done, open work is a to-do. */
export const SUPPLIER_STATUS_TONE: Readonly<Record<SupplierStatus, StatusLineTone>> = {
  prospective: 'warn',
  under_evaluation: 'info',
  approved: 'pass',
  conditional: 'warn',
  suspended: 'warn',
  rejected: 'fail',
  inactive: 'neutral',
};

/**
 * One line of the supplier's "Oppfølging" (docs/ux-guide.md §2.7), before the page
 * attaches the click: start an evaluation of a kind, open one that is in progress,
 * run a create-from-here flow, open the edit page, or show the agreements card.
 */
export type SupplierTodo =
  | {
      readonly key: string;
      readonly labelKey: string;
      readonly kind: 'start';
      readonly evaluation: EvaluationKind;
    }
  | {
      readonly key: string;
      readonly labelKey: string;
      readonly kind: 'open';
      readonly evaluation: EvaluationKind;
      readonly evaluationId: string;
    }
  | {
      readonly key: string;
      readonly labelKey: string;
      readonly kind: 'flow';
      readonly flow: string;
    }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'edit' }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'agreements' }
  | {
      readonly key: string;
      readonly labelKey: string;
      readonly kind: 'link';
      readonly url: string;
      readonly date: string | null;
    };

/**
 * What a supplier still needs, most important first: each attention flag with the
 * step that closes it, the required assessments not done yet (start, or finish the
 * one in progress), open approval conditions and a missing supplier owner. One line
 * per evaluation kind. Users who cannot edit only see the lines that open something
 * (they cannot start or change anything). `can` checks a permission.
 */
export function supplierTodos(
  s: SupplierDetail,
  can: (permission: string) => boolean,
): SupplierTodo[] {
  const out: SupplierTodo[] = [];
  const kinds = new Set<EvaluationKind>();
  const openFor = new Map<EvaluationKind, string>();
  for (const r of s.required_assessments ?? []) {
    if (r.open_evaluation_id) {
      openFor.set(r.kind, r.open_evaluation_id);
    }
  }
  const evaluate = (code: string, evaluation: EvaluationKind) => {
    if (kinds.has(evaluation)) {
      return;
    }
    kinds.add(evaluation);
    const open = openFor.get(evaluation);
    if (open) {
      out.push({
        key: code,
        labelKey: 'suppliers.detail.todo.open',
        kind: 'open',
        evaluation,
        evaluationId: open,
      });
    } else if (s.can_edit) {
      out.push({
        key: code,
        labelKey: `suppliers.detail.todo.attention.${code}`,
        kind: 'start',
        evaluation,
      });
    }
  };
  const approved = !!s.approved_at || s.status === 'approved' || s.status === 'conditional';
  for (const code of s.attention ?? []) {
    const action = attentionAction(code, approved);
    const labelKey = `suppliers.detail.todo.attention.${code}`;
    switch (action.kind) {
      case 'evaluate':
        evaluate(code, action.evaluation);
        break;
      case 'flow':
        out.push(
          s.can_edit && can(action.permission)
            ? { key: code, labelKey, kind: 'flow', flow: action.flow }
            : { key: code, labelKey, kind: 'agreements' },
        );
        break;
      case 'agreements':
        out.push({ key: code, labelKey, kind: 'agreements' });
        break;
      default:
        if (s.can_edit) {
          out.push({ key: code, labelKey, kind: 'edit' });
        }
    }
  }
  for (const r of s.required_assessments ?? []) {
    if (!r.done) {
      evaluate(`required:${r.kind}`, r.kind);
    }
  }
  // Re-label the "start" lines that came from a required assessment.
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (t.kind === 'start' && t.key.startsWith('required:')) {
      out[i] = { ...t, labelKey: 'suppliers.detail.todo.required' };
    }
  }
  const c = s.open_conditions;
  if (c) {
    out.push({
      key: 'conditions',
      labelKey: c.overdue
        ? 'suppliers.detail.todo.conditionsOverdue'
        : 'suppliers.detail.todo.conditions',
      kind: 'link',
      url: c.evaluation_url,
      date: c.due_at,
    });
  }
  if (!s.owner && s.can_edit) {
    out.push({ key: 'owner', labelKey: 'suppliers.detail.todo.owner', kind: 'edit' });
  }
  return out;
}

/** Tone of an evaluation's status sentence. */
export function evaluationTone(e: Pick<EvaluationDetail, 'status' | 'decision'>): StatusLineTone {
  if (e.status === 'completed') {
    return e.decision === 'approved' ? 'pass' : e.decision === 'rejected' ? 'fail' : 'warn';
  }
  const tones: Readonly<Record<EvaluationStatus, StatusLineTone>> = {
    draft: 'warn',
    submitted: 'info',
    completed: 'pass',
    cancelled: 'neutral',
  };
  return tones[e.status];
}

/** The i18n key of an evaluation's status sentence ("Godkjent – …", "Utkast – …"). */
export function evaluationStatusKey(e: Pick<EvaluationDetail, 'status' | 'decision'>): string {
  return e.status === 'completed' && e.decision
    ? `suppliers.evaluation.lead.status.decided.${e.decision}`
    : `suppliers.evaluation.lead.status.${e.status}`;
}

/**
 * Open the Details tab (drop `?tab=`) and bring an element on it into view, e.g. the
 * agreements card or the summary box an "Oppfølging" line points to.
 */
export function showOnDetails(router: Router, route: ActivatedRoute, elementId: string): void {
  void router
    .navigate([], { relativeTo: route, queryParams: { tab: null }, queryParamsHandling: 'merge' })
    .then(() =>
      setTimeout(() => {
        const el = document.getElementById(elementId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true });
      }),
    );
}
