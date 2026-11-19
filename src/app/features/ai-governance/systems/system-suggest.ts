import { SuggestFieldSpec } from '../../../shared/ask/form-suggest-map';
import { AI_ACT_ROLES, SYSTEM_STATUSES } from '../data/ai-governance.models';

/** The AI system form's whole-form suggestion (server key `ai_governance.system`). */
export const SYSTEM_SUGGEST_KEY = 'ai_governance.system';

export const SYSTEM_SUGGEST_FIELDS: readonly SuggestFieldSpec[] = [
  { name: 'name', labelKey: 'aiGovernance.fields.name', type: 'text' },
  { name: 'description', labelKey: 'aiGovernance.fields.description', type: 'long' },
  { name: 'intended_purpose', labelKey: 'aiGovernance.fields.intendedPurpose', type: 'long' },
  {
    name: 'ai_act_role',
    labelKey: 'aiGovernance.fields.role',
    type: 'enum',
    options: AI_ACT_ROLES,
    enumPrefix: 'aiGovernance.role.',
  },
  {
    name: 'status',
    labelKey: 'aiGovernance.fields.status',
    type: 'enum',
    options: SYSTEM_STATUSES,
    enumPrefix: 'aiGovernance.status.',
  },
  { name: 'provider_name', labelKey: 'aiGovernance.fields.provider', type: 'text' },
  { name: 'models', labelKey: 'aiGovernance.fields.models', type: 'text' },
  { name: 'data_categories', labelKey: 'aiGovernance.fields.dataCategories', type: 'text' },
  { name: 'uses_personal_data', labelKey: 'aiGovernance.fields.usesPersonalData', type: 'bool' },
  { name: 'owner_user_id', labelKey: 'aiGovernance.fields.owner', type: 'ref' },
  { name: 'overseer_user_ids', labelKey: 'aiGovernance.fields.overseers', type: 'refs' },
  { name: 'department_id', labelKey: 'aiGovernance.fields.department', type: 'ref' },
];
