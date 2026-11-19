import { AcceptedSuggestion } from '../../../shared/ask/form-suggest';
import {
  SuggestFieldSpec,
  acceptedValue,
  suggestPatch,
} from '../../../shared/ask/form-suggest-map';
import { Kpi, PROCESS_CATEGORIES, PROCESS_FRAMEWORKS } from '../data/process.models';
import { ProcessFormValue } from './process-form-model';

/** The process form's whole-form suggestion (server key `processes.process`). */
export const PROCESS_SUGGEST_KEY = 'processes.process';

const list = (name: string): SuggestFieldSpec => ({
  name,
  labelKey: `processes.fields.${name}`,
  type: 'refs',
});

export const PROCESS_SUGGEST_FIELDS: readonly SuggestFieldSpec[] = [
  { name: 'title', labelKey: 'processes.fields.title', type: 'text' },
  {
    name: 'category',
    labelKey: 'processes.fields.category',
    type: 'enum',
    options: PROCESS_CATEGORIES,
    enumPrefix: 'processes.category.',
  },
  { name: 'purpose', labelKey: 'processes.fields.purpose', type: 'long' },
  { name: 'scope', labelKey: 'processes.fields.scope', type: 'long' },
  { name: 'owner_user_id', labelKey: 'processes.fields.owner', type: 'ref' },
  { name: 'department_id', labelKey: 'processes.fields.department', type: 'ref' },
  { name: 'parent_id', labelKey: 'processes.fields.parent', type: 'ref' },
  // Lists of short texts (validated as string lists).
  list('inputs'),
  list('outputs'),
  list('resources'),
  list('competence'),
  list('methods'),
  list('risks'),
  { name: 'kpis', labelKey: 'processes.fields.kpis', type: 'items' },
  {
    name: 'frameworks',
    labelKey: 'processes.fields.frameworks',
    type: 'multi',
    options: PROCESS_FRAMEWORKS,
    enumPrefix: 'processes.frameworks.',
  },
  {
    name: 'review_interval_months',
    labelKey: 'processes.fields.reviewInterval',
    type: 'int',
    asString: true,
    min: 1,
    max: 60,
  },
];

/** The form change for accepted suggestions. */
export function processSuggestPatch(accepted: AcceptedSuggestion): Partial<ProcessFormValue> {
  const patch = suggestPatch(PROCESS_SUGGEST_FIELDS, accepted, ['kpis']) as Record<string, unknown>;
  const spec = PROCESS_SUGGEST_FIELDS.find((s) => s.name === 'kpis')!;
  const rows = acceptedValue(spec, accepted['kpis']) as unknown[] | undefined;
  if (rows) {
    patch['kpis'] = rows.flatMap((raw): Kpi[] => {
      const row = raw as { name?: unknown; target?: unknown; unit?: unknown };
      return typeof row.name === 'string' && row.name.trim()
        ? [
            {
              name: row.name.trim(),
              target: typeof row.target === 'string' ? row.target : null,
              unit: typeof row.unit === 'string' ? row.unit : null,
            },
          ]
        : [];
    });
  }
  return patch as Partial<ProcessFormValue>;
}
