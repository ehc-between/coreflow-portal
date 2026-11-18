import { DocumentAcknowledgements } from '../../core/documents/document.models';
import { documentErrorKey } from '../../core/documents/document-errors';
import { HttpErrorResponse } from '@angular/common/http';
import { proposalRequirementText } from '../review/proposal-label';
import { MAX_RELATED, MAX_REQUIREMENTS, parseRelatedParam } from './document-new';
import { PATTERN_PRESETS, typeBody } from './types/document-type-form';
import { ackRows, acknowledgementCsv } from './workflow/document-acknowledgement-list';

const report: DocumentAcknowledgements = {
  revision: 'B',
  acknowledged: [
    { user_id: 'u1', name: 'Kari Nordmann', email: 'kari@x.no', acknowledged_at: '2026-11-01' },
  ],
  pending: [
    { user_id: 'u2', name: 'Super', email: 'super1@x.no' },
    { user_id: 'u3', name: 'Super', email: 'super2@x.no' },
    { user_id: 'u4', name: 'Lars Olsen', email: 'lars@x.no' },
    { user_id: 'u5', name: 'ola@x.no', email: 'ola@x.no' },
  ],
};

describe('A01 documents helpers', () => {
  it('shows the email only when a name is ambiguous or missing', () => {
    const rows = ackRows(report, report.pending);
    expect(rows.map((r) => r.showEmail)).toEqual([true, true, false, true]);
    expect(ackRows(report, report.acknowledged)[0].showEmail).toBe(false);
  });

  it('exports who has and has not confirmed as CSV', () => {
    const csv = acknowledgementCsv(report, {
      name: 'Navn',
      email: 'E-post',
      status: 'Status',
      date: 'Dato',
      done: 'Bekreftet',
      pending: 'Ikke ennå',
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Navn","E-post","Status","Dato"');
    expect(lines[1]).toBe('"Kari Nordmann","kari@x.no","Bekreftet","2026-11-01"');
    expect(lines).toHaveLength(6);
    expect(lines[5]).toContain('"Ikke ennå"');
  });

  it('reads ?related=<type>:<id> and rejects anything else', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(parseRelatedParam(`process:${id}`)).toEqual({ entity_type: 'process', entity_id: id });
    expect(parseRelatedParam('process:not-an-id')).toBeNull();
    expect(parseRelatedParam(null)).toBeNull();
    expect(MAX_REQUIREMENTS).toBe(30);
    expect(MAX_RELATED).toBe(20);
  });

  it('labels a proposal requirement readably, never with the raw ref', () => {
    expect(
      proposalRequirementText({
        requirement_label: {
          ref: 'iso9001-2026:7.5.1.r1',
          short: 'ISO 9001',
          number: '7.5.1',
          title: 'General',
          standard_key: 'iso9001-2026',
          framework: 'iso9001',
        },
      }),
    ).toBe('ISO 9001 · 7.5.1');
    expect(proposalRequirementText({ requirement_label: null })).toBeNull();
  });

  it('leaves out an empty type key so the server makes one from the name', () => {
    const body = typeBody({
      key: '  ',
      name: 'Arbeidsinstruks',
      description: '',
      prefix: 'AI',
      pattern: '',
      nextNumber: '',
      interval: '',
      ack: false,
      retentionId: '',
      active: true,
    });
    expect('key' in body).toBe(false);
    expect(PATTERN_PRESETS[0]).toBe('{prefix}-{seq:03}');
  });

  it('explains the named-approver and requirement errors', () => {
    const err = (code: string) =>
      new HttpErrorResponse({ status: 422, error: { detail: { code } } });
    expect(documentErrorKey(err('approver_is_author'), 'submit')).toBe(
      'documents.approval.errors.approverIsAuthor',
    );
    expect(documentErrorKey(err('unknown_requirement'), 'updateControl')).toBe(
      'documents.link.errors.unknownRequirement',
    );
  });
});
