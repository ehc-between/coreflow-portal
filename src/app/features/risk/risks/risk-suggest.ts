import { SuggestFieldSpec } from '../../../shared/ask/form-suggest-map';
import { CIA_PROPERTIES, SOURCE_TYPES, STRATEGIES } from '../data/risk.models';

/** The risk form's whole-form suggestion (server key `risk.risk`). */
export const RISK_SUGGEST_KEY = 'risk.risk';

export const RISK_SUGGEST_FIELDS: readonly SuggestFieldSpec[] = [
  { name: 'title', labelKey: 'risk.fields.title', type: 'text' },
  { name: 'description', labelKey: 'risk.fields.description', type: 'long' },
  {
    name: 'source_type',
    labelKey: 'risk.fields.sourceType',
    type: 'enum',
    options: SOURCE_TYPES,
    enumPrefix: 'risk.sourceTypes.',
  },
  { name: 'threat', labelKey: 'risk.fields.threat', type: 'long' },
  { name: 'vulnerability', labelKey: 'risk.fields.vulnerability', type: 'long' },
  { name: 'consequence_text', labelKey: 'risk.fields.consequence', type: 'long' },
  {
    name: 'affected_properties',
    labelKey: 'risk.fields.affectedProperties',
    type: 'multi',
    options: CIA_PROPERTIES,
    enumPrefix: 'risk.properties.',
  },
  { name: 'owner_user_id', labelKey: 'risk.fields.riskOwner', type: 'ref' },
  { name: 'department_id', labelKey: 'risk.fields.department', type: 'ref' },
  {
    name: 'treatment_strategy',
    labelKey: 'risk.fields.strategy',
    type: 'enum',
    options: STRATEGIES,
    enumPrefix: 'risk.strategies.',
  },
  { name: 'treatment_notes', labelKey: 'risk.fields.treatmentNotes', type: 'long' },
];
