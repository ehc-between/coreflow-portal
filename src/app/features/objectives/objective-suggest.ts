import { SuggestFieldSpec } from '../../shared/ask/form-suggest-map';
import { MANAGEMENT_SYSTEMS } from './data/objectives.models';

/** The objective form's whole-form suggestion (server key `objectives.objective`). */
export const OBJECTIVE_SUGGEST_KEY = 'objectives.objective';

export const OBJECTIVE_SUGGEST_FIELDS: readonly SuggestFieldSpec[] = [
  { name: 'title', labelKey: 'objectives.fields.title', type: 'text' },
  { name: 'description', labelKey: 'objectives.fields.description', type: 'long' },
  {
    name: 'management_systems',
    labelKey: 'objectives.fields.managementSystems',
    type: 'multi',
    options: MANAGEMENT_SYSTEMS,
    enumPrefix: 'objectives.managementSystems.',
  },
  { name: 'target', labelKey: 'objectives.fields.target', type: 'text' },
  { name: 'plan', labelKey: 'objectives.fields.plan', type: 'long' },
  { name: 'resources', labelKey: 'objectives.fields.resources', type: 'long' },
  { name: 'evaluation_method', labelKey: 'objectives.fields.evaluationMethod', type: 'long' },
  { name: 'owner_user_id', labelKey: 'objectives.fields.owner', type: 'ref' },
  { name: 'department_id', labelKey: 'objectives.fields.department', type: 'ref' },
  { name: 'communicated_to', labelKey: 'objectives.fields.communicatedTo', type: 'text' },
];
