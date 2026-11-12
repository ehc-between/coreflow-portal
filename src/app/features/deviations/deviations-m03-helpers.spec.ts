import { HttpErrorResponse } from '@angular/common/http';
import { recordDataErrors, codedErrorMessage } from '../../core/deviations/deviation-errors';
import { FieldSpec } from '../../core/records/record.models';
import { deviationStatusTone, humanizeKey, isLegacyStatus } from './deviation-status';
import { linksFromParams } from './deviation-new';
import { dueInDays, usableSuggestions } from './insights/suggested-actions';
import { publicUrl } from './intake/intake-settings';
import { isOpenReport } from './intake/intake-report-detail';
import { intakeStatusTone } from './intake/intake-inbox';
import { normalizeReceipt, publicErrorKey, RECEIPT_PATTERN } from './intake/public-report';
import {
  createRequest,
  emptyWorksheet,
  lastAnswer,
  linesOf,
  updateRequest,
  worksheetFromAnalysis,
  worksheetFromSuggestion,
} from './root-cause/root-cause-form';
import { templateText } from './templates/deviation-templates';
import {
  coreFieldSpecs,
  isCoreField,
  missingFieldSpecs,
  missingFieldsPatch,
  unrenderableFields,
} from './workflow/workflow-run';

const params = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
});

describe('M03 helpers', () => {
  describe('status labels', () => {
    it('treats legacy statuses as legacy only on legacy deviations', () => {
      expect(isLegacyStatus({ status: 'open', record_type_version_id: null })).toBe(true);
      expect(isLegacyStatus({ status: 'open', record_type_version_id: 'v1' })).toBe(false);
      expect(isLegacyStatus({ status: 'received', record_type_version_id: null })).toBe(false);
    });

    it('tones workflow states by category and legacy statuses as before', () => {
      expect(deviationStatusTone({ status: 'closed' })).toBe('pass');
      expect(
        deviationStatusTone({
          status: 'answered',
          status_category: 'done',
          record_type_version_id: 'v1',
        }),
      ).toBe('pass');
      expect(
        deviationStatusTone({
          status: 'triage',
          status_category: 'in_progress',
          record_type_version_id: 'v1',
        }),
      ).toBe('warn');
    });

    it('humanises unknown state keys', () => {
      expect(humanizeKey('effectiveness_check')).toBe('Effectiveness check');
      expect(humanizeKey('')).toBe('');
    });
  });

  describe('workflow run', () => {
    const t = (key: string) => key;
    const recordFields: FieldSpec[] = [
      { key: 'complaint_channel', label: 'Channel', type: 'text' },
      { key: 'severity', label: 'Own severity', type: 'text' },
    ];

    it('knows the core columns', () => {
      expect(isCoreField('root_cause')).toBe(true);
      expect(isCoreField('complaint_channel')).toBe(false);
    });

    it('prefers the record type field over the core spec and drops unknown keys', () => {
      const specs = missingFieldSpecs(
        ['severity', 'root_cause', 'mystery'],
        recordFields,
        coreFieldSpecs(t),
      );
      expect(specs.map((s) => [s.key, s.label, s.required])).toEqual([
        ['severity', 'Own severity', true],
        ['root_cause', 'deviations.create.fields.rootCause', true],
      ]);
      expect(unrenderableFields(['severity', 'root_cause', 'mystery'], specs)).toEqual(['mystery']);
    });

    it('stores record fields in data and core fields top-level', () => {
      expect(
        missingFieldsPatch(
          { complaint_channel: 'phone', root_cause: '  Old list  ', due_at: '' },
          { existing: 1 },
          recordFields,
        ),
      ).toEqual({
        root_cause: 'Old list',
        data: { existing: 1, complaint_channel: 'phone' },
      });
      expect(missingFieldsPatch({ root_cause: '' }, {}, recordFields)).toBeNull();
    });
  });

  describe('root-cause worksheets', () => {
    it('starts a 5 Whys worksheet with five prompts', () => {
      const form = emptyWorksheet('five_whys', 'Why?', 'Leak');
      expect(form.whys).toHaveLength(5);
      expect(form.problem).toBe('Leak');
      expect(emptyWorksheet('fishbone', 'Why?').whys).toEqual([]);
    });

    it('sends only the parts of the method, causes one per line', () => {
      const form = {
        ...emptyWorksheet('fishbone', 'Why?'),
        categories: {
          ...emptyWorksheet('fishbone', 'Why?').categories,
          people: 'New staff\n\n  No training ',
        },
        conclusion: 'No onboarding',
        apply: true,
      };
      expect(createRequest(form)).toEqual({
        method: 'fishbone',
        problem: null,
        whys: [],
        categories: { people: ['New staff', 'No training'] },
        conclusion: 'No onboarding',
        apply: true,
      });
      expect(updateRequest({ ...form, conclusion: '' }).conclusion).toBeNull();
      expect(linesOf(' a \n\nb')).toEqual(['a', 'b']);
    });

    it('never applies without a conclusion and drops empty steps', () => {
      const form = {
        ...emptyWorksheet('five_whys', 'Why?'),
        whys: [
          { question: 'Why?', answer: 'Old list' },
          { question: '', answer: '' },
        ],
        apply: true,
      };
      const body = createRequest(form);
      expect(body.apply).toBe(false);
      expect(body.whys).toEqual([{ question: 'Why?', answer: 'Old list' }]);
      expect(lastAnswer(form)).toBe('Old list');
    });

    it('turns a suggestion with causes but no whys into a fishbone', () => {
      const form = worksheetFromSuggestion({
        problem: 'P',
        whys: [],
        categories: { method: ['No check'] },
        conclusion: 'C',
      });
      expect(form.method).toBe('fishbone');
      expect(form.categories.method).toBe('No check');
    });

    it('edits a saved analysis of an unknown method as "other"', () => {
      const form = worksheetFromAnalysis({
        id: 'r1',
        deviation_id: 'd1',
        method: '8d',
        problem: null,
        whys: [],
        categories: {},
        conclusion: null,
        applied_at: null,
        source: 'manual',
        created_by: null,
        created_by_name: null,
        created_at: '',
        updated_at: '',
      });
      expect(form.method).toBe('other');
      expect(form.conclusion).toBe('');
    });
  });

  describe('suggested actions', () => {
    it('keeps usable suggestions and normalises the kind', () => {
      expect(
        usableSuggestions({
          actions: [
            { kind: 'preventive', description: ' Train staff ', due_in_days: 30, rationale: 'r' },
            { kind: 'weird', description: 'Fix', due_in_days: null, rationale: '' },
            { kind: 'corrective', description: '   ', due_in_days: 1, rationale: '' },
          ],
        }),
      ).toEqual([
        { kind: 'preventive', description: 'Train staff', due_in_days: 30, rationale: 'r' },
        { kind: 'corrective', description: 'Fix', due_in_days: null, rationale: '' },
      ]);
      expect(usableSuggestions(null)).toEqual([]);
    });

    it('computes a local due date', () => {
      expect(dueInDays(10, new Date(2026, 11, 25))).toBe('2027-01-04');
      expect(dueInDays(null)).toBeUndefined();
    });
  });

  describe('intake', () => {
    it('builds the public URL', () => {
      expect(publicUrl('https://app.example/', '/report/abc')).toBe(
        'https://app.example/report/abc',
      );
    });

    it('knows which reports are still open, and their tones', () => {
      const report = { status: 'triaged' } as Parameters<typeof isOpenReport>[0];
      expect(isOpenReport(report)).toBe(true);
      expect(isOpenReport({ ...report, status: 'converted' })).toBe(false);
      expect(intakeStatusTone('new')).toBe('info');
      expect(intakeStatusTone('dismissed')).toBe('neutral');
    });

    it('normalises receipt codes', () => {
      expect(normalizeReceipt(' abcd efgh-ijkl mnop ')).toBe('ABCD-EFGH-IJKL-MNOP');
      expect(RECEIPT_PATTERN.test(normalizeReceipt('abcdefghijklmnop'))).toBe(true);
      expect(RECEIPT_PATTERN.test(normalizeReceipt('abc'))).toBe(false);
    });

    it('explains public failures without leaking details', () => {
      expect(publicErrorKey(new HttpErrorResponse({ status: 429 }))).toBe(
        'deviations.publicReport.errors.rateLimited',
      );
      expect(
        publicErrorKey(
          new HttpErrorResponse({ status: 404, error: { detail: { code: 'receipt_not_found' } } }),
        ),
      ).toBe('deviations.apiErrors.receipt_not_found');
      expect(publicErrorKey(new HttpErrorResponse({ status: 500 }))).toBe(
        'deviations.publicReport.errors.generic',
      );
    });
  });

  describe('new deviation links', () => {
    it('reads one link from the query string, defaulting the link type', () => {
      expect(
        linksFromParams(
          params({
            link_entity_type: 'inspection_finding',
            link_entity_id: 'f1',
            link_type: 'caused_by',
          }),
        ),
      ).toEqual([{ entity_type: 'inspection_finding', entity_id: 'f1', link_type: 'caused_by' }]);
      expect(
        linksFromParams(params({ link_entity_type: 'risk', link_entity_id: 'r1', link_type: 'x' })),
      ).toEqual([{ entity_type: 'risk', entity_id: 'r1', link_type: 'relates_to' }]);
      expect(
        linksFromParams(params({ link_entity_type: 'Bad Type', link_entity_id: 'x' })),
      ).toEqual([]);
    });
  });

  describe('templates and errors', () => {
    it('picks the template text in the UI language', () => {
      expect(templateText({ en: 'Complaint', nb: 'Klage' }, 'nb')).toBe('Klage');
      expect(templateText({ en: 'Complaint' }, 'nb')).toBe('Complaint');
    });

    it('maps M03 codes to their scoped messages', () => {
      const error = new HttpErrorResponse({
        status: 409,
        error: { detail: { code: 'workflow_managed', message: 'x' } },
      });
      expect(codedErrorMessage(error)).toEqual({
        message: 'deviations.apiErrors.workflow_managed',
      });
    });

    it('reads F4 field codes from an invalid_data 422', () => {
      const error = new HttpErrorResponse({
        status: 422,
        error: { detail: { code: 'invalid_data', errors: { channel: 'required' } } },
      });
      expect(recordDataErrors(error)).toEqual({ channel: 'required' });
      expect(
        recordDataErrors(
          new HttpErrorResponse({
            status: 422,
            error: { detail: { code: 'invalid_data', data: { a: 'x' } } },
          }),
        ),
      ).toBeNull();
    });
  });
});
