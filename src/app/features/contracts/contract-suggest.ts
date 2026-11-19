import { SuggestFieldSpec } from '../../shared/ask/form-suggest-map';
import { CONTRACT_TYPES, PERSONAL_DATA_ROLES } from './data/contract.models';

/** The new-contract form's whole-form suggestion (server key `contracts.contract`). */
export const CONTRACT_SUGGEST_KEY = 'contracts.contract';

const flag = (name: string, labelKey: string): SuggestFieldSpec => ({
  name,
  labelKey,
  type: 'bool',
});

export const CONTRACT_SUGGEST_FIELDS: readonly SuggestFieldSpec[] = [
  { name: 'title', labelKey: 'contracts.fields.title', type: 'text' },
  {
    name: 'contract_type',
    labelKey: 'contracts.fields.contractType',
    type: 'enum',
    options: CONTRACT_TYPES,
    enumPrefix: 'contracts.types.',
  },
  { name: 'description', labelKey: 'contracts.fields.description', type: 'long' },
  { name: 'owner_user_id', labelKey: 'contracts.fields.owner', type: 'ref' },
  { name: 'department_id', labelKey: 'contracts.fields.department', type: 'ref' },
  flag('confidential', 'contracts.fields.confidential'),
  {
    name: 'personal_data_role',
    labelKey: 'contracts.fields.personalDataRole',
    type: 'enum',
    options: PERSONAL_DATA_ROLES,
    enumPrefix: 'contracts.personalDataRoles.',
    enumSuffix: '.label',
  },
  flag('ict_critical', 'contracts.fields.ictCritical'),
  flag('involves_ai_system', 'contracts.fields.involvesAiSystem'),
  {
    name: 'notice_period_days',
    labelKey: 'contracts.fields.noticePeriodDays',
    type: 'int',
    asString: true,
    min: 0,
    max: 3650,
  },
  flag('auto_renew', 'contracts.fields.autoRenew'),
  {
    name: 'renewal_term_months',
    labelKey: 'contracts.fields.renewalTermMonths',
    type: 'int',
    asString: true,
    min: 1,
    max: 120,
  },
  { name: 'governing_law', labelKey: 'contracts.fields.governingLaw', type: 'text' },
];
