import {
  DEVIATION_ERROR_CODES,
  DeviationErrorCode,
  deviationErrorKey,
} from '../../core/deviations/deviation-errors';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import {
  ACTION_KIND_OPTIONS,
  ACTION_STATUS_OPTIONS,
  BACKEND_FIELD_ERROR_CODES,
  EFFECTIVENESS_OPTIONS,
  FIELD_ERROR_CODES,
  FIELD_TYPE_OPTIONS,
  ROOT_CAUSE_METHOD_OPTIONS,
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  STANDARD_OPTIONS,
  STATUS_OPTIONS,
  VISIBILITY_OPTIONS,
  actionKindLabelKey,
  actionStatusLabelKey,
  effectivenessLabelKey,
  fieldErrorKey,
  fieldTypeLabelKey,
  rootCauseMethodLabelKey,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
  visibilityLabelKey,
} from './deviation-enums';
import { EVENT_FIELD_NAMES, actionNounKey, eventFieldKey } from './deviation-events';
import { workflowReasonKey } from './deviation-workflow';

type Dict = Record<string, unknown>;

const LANGS: Record<string, Dict> = { en, nb };

function lookup(dict: Dict, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict);
}

function flatKeys(node: Dict, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatKeys(v as Dict, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** Every backend enum value the deviation UI renders, with its key builder. */
const ENUMS: Record<string, { values: readonly string[]; key: (v: string) => string }> = {
  status: { values: STATUS_OPTIONS, key: statusLabelKey },
  severity: { values: SEVERITY_OPTIONS, key: severityLabelKey },
  source: { values: SOURCE_OPTIONS, key: sourceLabelKey },
  standard: { values: STANDARD_OPTIONS, key: standardLabelKey },
  fieldType: { values: FIELD_TYPE_OPTIONS, key: fieldTypeLabelKey },
  actionKind: { values: ACTION_KIND_OPTIONS, key: actionKindLabelKey },
  actionKindNoun: { values: [...ACTION_KIND_OPTIONS, 'unknown'], key: actionNounKey },
  actionStatus: { values: ACTION_STATUS_OPTIONS, key: actionStatusLabelKey },
  effectiveness: { values: EFFECTIVENESS_OPTIONS, key: effectivenessLabelKey },
  rootCauseMethod: { values: ROOT_CAUSE_METHOD_OPTIONS, key: rootCauseMethodLabelKey },
  visibility: { values: VISIBILITY_OPTIONS, key: visibilityLabelKey },
  workflowReason: {
    values: [
      'invalid_transition',
      'reason_required',
      'root_cause_required',
      'open_actions',
      'verification_required',
      'deviation_closed',
      'something_new',
    ],
    key: workflowReasonKey,
  },
  fieldError: { values: FIELD_ERROR_CODES, key: (c) => `deviations.fieldErrors.${c}` },
  backendFieldError: { values: BACKEND_FIELD_ERROR_CODES, key: (code) => fieldErrorKey({ code }) },
  deviationError: {
    values: DEVIATION_ERROR_CODES,
    key: (c) => deviationErrorKey(c as DeviationErrorCode),
  },
  eventField: { values: EVENT_FIELD_NAMES, key: (f) => eventFieldKey(f) ?? '' },
};

describe('deviation i18n coverage', () => {
  for (const [name, { values, key }] of Object.entries(ENUMS)) {
    for (const [lang, dict] of Object.entries(LANGS)) {
      it(`has a ${lang} label for every ${name} value`, () => {
        const missing = values.filter((v) => {
          const text = lookup(dict, key(v));
          return typeof text !== 'string' || text.trim() === '';
        });
        expect(missing).toEqual([]);
      });
    }
  }

  it('has every event / access / workflow string the timeline and menu use', () => {
    const keys = [
      'deviations.events.created',
      'deviations.events.deleted',
      'deviations.events.statusChanged',
      'deviations.events.statusChangedGeneric',
      'deviations.events.reason',
      'deviations.events.updated',
      'deviations.events.updatedFields',
      'deviations.events.noChanges',
      'deviations.events.actionAdded',
      'deviations.events.actionUpdated',
      'deviations.events.actionStatus',
      'deviations.events.actionRemoved',
      'deviations.events.accessGranted',
      'deviations.events.accessRevoked',
      'deviations.events.accessChanged',
      'deviations.events.subject.user',
      'deviations.events.subject.department',
      'deviations.events.byline',
      'deviations.events.accessLevelChanged',
      'deviations.access.view',
      'deviations.access.edit',
      'deviations.workflow.reasons.reopen_requires_manage',
      'deviations.detail.yes',
      'deviations.detail.no',
    ];
    for (const dict of Object.values(LANGS)) {
      expect(keys.filter((k) => typeof lookup(dict, k) !== 'string')).toEqual([]);
    }
  });

  it('maps known and unknown backend field errors to existing keys', () => {
    expect(fieldErrorKey('This field is required')).toBe('deviations.fieldErrors.required');
    expect(fieldErrorKey('Must be a number')).toBe('deviations.fieldErrors.number');
    expect(fieldErrorKey('Something unexpected')).toBe('deviations.fieldErrors.invalid');
  });

  it('maps coded field errors by code, with the legacy message as a fallback', () => {
    expect(
      fieldErrorKey({ code: 'invalid_option', params: { options: ['a'] }, message: 'x' }),
    ).toBe('deviations.fieldErrors.option');
    expect(fieldErrorKey({ code: 'not_number', params: {}, message: '' })).toBe(
      'deviations.fieldErrors.number',
    );
    expect(fieldErrorKey({ code: 'brand_new', message: 'This field is required' })).toBe(
      'deviations.fieldErrors.required',
    );
    expect(fieldErrorKey({ code: 'brand_new' })).toBe('deviations.fieldErrors.invalid');
    // Every backend code maps to a real UI code, never the generic fallback.
    expect(
      BACKEND_FIELD_ERROR_CODES.filter(
        (code) => fieldErrorKey({ code }) === 'deviations.fieldErrors.invalid',
      ),
    ).toEqual([]);
  });

  it('keeps en and nb at full key parity', () => {
    const enKeys = flatKeys(en).sort();
    const nbKeys = flatKeys(nb).sort();
    expect(enKeys.filter((k) => !nbKeys.includes(k))).toEqual([]);
    expect(nbKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it('keeps the same {{ params }} in en and nb for every key', () => {
    const params = (s: unknown) =>
      typeof s === 'string' ? [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort() : [];
    const mismatched = flatKeys(en).filter(
      (k) => params(lookup(en, k)).join() !== params(lookup(nb, k)).join(),
    );
    expect(mismatched).toEqual([]);
  });
});
