import { GeneratedOutput, Output } from '../../../core/outputs/outputs.models';
import {
  RECIPIENTS,
  StandardOutputs,
  buildRows,
  fileStatus,
  groupRows,
  isRecipient,
  readinessStatus,
  recipientsOf,
  shortStandardLabel,
} from './report-groups';

function output(overrides: Partial<Output> = {}): Output {
  return {
    key: 'privacy.ropa_controller',
    module: 'privacy',
    kind: 'compiled_controlled',
    title: { en: 'Records of processing', nb: 'Protokoll over behandlingsaktiviteter' },
    description: { en: 'Art. 30', nb: 'Art. 30' },
    audience: ['authority', 'auditor'],
    clauses: [],
    permission: 'privacy:read',
    formats: ['pdf'],
    default_format: 'pdf',
    subject: 'org',
    entity_type: null,
    frameworks: ['gdpr'],
    evidence: false,
    route: null,
    register_key: null,
    has_preflight: true,
    generates: true,
    readiness: { ready: true, missing: 0, recommended: 0 },
    last: null,
    ...overrides,
  };
}

function file(overrides: Partial<GeneratedOutput> = {}): GeneratedOutput {
  return {
    id: 'f1',
    output_key: 'audits.audit_report',
    output_title: null,
    module: 'audits',
    kind: 'record_report',
    title: 'Internrevisjonsrapport 2026',
    version: 1,
    status: 'final',
    origin: 'user',
    format: 'pdf',
    lang: 'nb',
    file_name: 'rapport.pdf',
    size_bytes: 1,
    sha256: 'x',
    rows: 0,
    standard_key: null,
    subject_type: 'audit_plan',
    subject_id: 'a1',
    params: {},
    preflight: [],
    has_gaps: false,
    ai_draft: false,
    clauses: [],
    evidence_for: [],
    current: true,
    superseded_at: null,
    generated_at: '2026-10-12T10:00:00Z',
    generated_by: null,
    url: '/library/generated/f1',
    download_url: '/x',
    ...overrides,
  };
}

const std = (key: string, items: Output[]): StandardOutputs => ({
  standardKey: key,
  labelKey: `reports.frameworks.${key}`,
  items,
});

describe('report groups', () => {
  it('maps audiences to the four recipient groups (customers + employees share one)', () => {
    expect(recipientsOf(['authority', 'auditor'])).toEqual(['auditor', 'authority']);
    expect(recipientsOf(['customers'])).toEqual(['people']);
    expect(recipientsOf(['employees', 'board'])).toEqual(['board', 'people']);
    expect(recipientsOf([])).toEqual([]);
    expect(isRecipient('board')).toBe(true);
    expect(isRecipient('customers')).toBe(false);
    expect(isRecipient(undefined)).toBe(false);
  });

  it('reads "Klar" / "Mangler N" / "Ny" from readiness and file state', () => {
    expect(readinessStatus({ ready: true, missing: 0, recommended: 2 })).toEqual({
      tone: 'pass',
      key: 'ready',
    });
    expect(readinessStatus({ ready: false, missing: 4, recommended: 0 })).toEqual({
      tone: 'warn',
      key: 'missing',
      count: 4,
    });
    expect(readinessStatus(null).key).toBe('new');
    expect(fileStatus({ status: 'draft', has_gaps: true }).key).toBe('draft');
    expect(fileStatus({ status: 'final', has_gaps: true }).key).toBe('gaps');
    expect(fileStatus({ status: 'final', has_gaps: false }).key).toBe('ready');
  });

  it('builds rows: org outputs, per-standard rows, record files, own flows; no register exports', () => {
    const catalogue = [
      output(),
      output({ key: 'register.deviations', kind: 'register_export', audience: ['auditor'] }),
      output({ key: 'risk.soa', subject: 'standard', readiness: null, audience: ['auditor'] }),
      output({
        key: 'audits.audit_report',
        subject: 'record',
        readiness: null,
        audience: ['auditor', 'board'],
      }),
      output({
        key: 'reports.audit_pack',
        kind: 'pack',
        generates: false,
        route: '/reports/audit-packs',
        readiness: null,
        audience: ['auditor'],
      }),
    ];
    const soa = output({
      key: 'risk.soa',
      subject: 'standard',
      audience: ['auditor'],
      readiness: { ready: false, missing: 2, recommended: 0 },
    });
    const rows = buildRows(
      catalogue,
      [std('iso27001-2022', [soa])],
      [file(), file({ id: 'old', current: false }), file({ id: 'x', output_key: 'unknown' })],
    );
    expect(rows.map((r) => r.id)).toEqual([
      'privacy.ropa_controller',
      'reports.audit_pack',
      'risk.soa:iso27001-2022',
      'file:f1',
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('privacy.ropa_controller')!.action).toBe('make');
    expect(byId.get('reports.audit_pack')!.action).toBe('flow');
    const soaRow = byId.get('risk.soa:iso27001-2022')!;
    expect(soaRow.action).toBe('missing');
    expect(soaRow.standardKey).toBe('iso27001-2022');
    expect(soaRow.status).toEqual({ tone: 'warn', key: 'missing', count: 2 });
    expect(byId.get('file:f1')!.action).toBe('file');
  });

  it('combines an output that applies to more than two standards into one row', () => {
    const cov = (missing: number) =>
      output({
        key: 'standards.coverage_report',
        subject: 'standard',
        audience: ['board'],
        readiness: { ready: missing === 0, missing, recommended: 0 },
      });
    const rows = buildRows(
      [],
      [std('iso9001-2026', [cov(0)]), std('iso27001-2022', [cov(1)]), std('gdpr-2016', [cov(2)])],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].standardKey).toBeNull();
    expect(rows[0].standardCount).toBe(3);
    expect(rows[0].status).toEqual({ tone: 'warn', key: 'missing', count: 3 });
  });

  it('groups rows into all four recipients, gaps first, an output in each of its groups', () => {
    const rows = buildRows(
      [
        output({ key: 'a', audience: ['auditor', 'customers'] }),
        output({
          key: 'b',
          audience: ['auditor'],
          readiness: { ready: false, missing: 1, recommended: 0 },
        }),
      ],
      [],
      [],
    );
    const groups = groupRows(rows);
    expect(groups.map((g) => g.recipient)).toEqual([...RECIPIENTS]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect(groups[1].rows).toEqual([]);
    expect(groups[3].rows.map((r) => r.id)).toEqual(['a']);
  });

  it('puts the audit pack first for the auditor', () => {
    const rows = buildRows(
      [
        output({
          key: 'a',
          audience: ['auditor'],
          readiness: { ready: false, missing: 1, recommended: 0 },
        }),
        output({
          key: 'reports.audit_pack',
          kind: 'pack',
          generates: false,
          route: '/reports/audit-packs',
          readiness: null,
          audience: ['auditor'],
        }),
      ],
      [],
      [],
    );
    expect(groupRows(rows)[0].rows.map((r) => r.id)).toEqual(['reports.audit_pack', 'a']);
  });

  it('shortens framework names', () => {
    expect(shortStandardLabel('ISO 27001 – informasjonssikkerhet')).toBe('ISO 27001');
    expect(shortStandardLabel('KI-forordningen (EU)')).toBe('KI-forordningen (EU)');
  });
});
