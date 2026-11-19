import {
  findingMissing,
  findingStatusSentence,
  inspectionMissing,
  inspectionStatusSentence,
  templateMissing,
  templateStatusSentence,
} from './inspection-anatomy';
import { makeFinding, makeInspectionDetail, makeTemplateDetail } from './inspections.testing';

const fmt = { percent: (v: number) => `${Math.round(v)} %`, day: (v: string) => v.slice(0, 10) };

describe('inspection anatomy', () => {
  it('states the result with score and pass mark', () => {
    const ins = makeInspectionDetail({
      status: 'completed',
      result: 'failed',
      score_pct: 63.3,
      pass_threshold: 80,
    });
    expect(inspectionStatusSentence(ins, fmt)).toEqual({
      key: 'inspections.detail.status.failedScore',
      tone: 'fail',
      params: { score: '63 %', threshold: '80 %' },
    });
  });

  it('says an overdue planned inspection is overdue (a to-do, not a failure)', () => {
    const ins = makeInspectionDetail({
      status: 'planned',
      is_overdue: true,
      due_at: '2026-11-09T09:00:00',
    });
    expect(inspectionStatusSentence(ins, fmt)).toMatchObject({
      key: 'inspections.detail.status.overdue',
      tone: 'warn',
      params: { date: '2026-11-09' },
    });
  });

  it('lists serious findings without a deviation and open findings', () => {
    const open = vi.fn();
    const ins = makeInspectionDetail({
      status: 'completed',
      findings: [
        makeFinding({
          id: 'f-1',
          code: 'FND-1',
          severity: 'high',
          status: 'open',
          deviation: null,
        }),
        makeFinding({ id: 'f-2', code: 'FND-2', severity: 'low', status: 'open' }),
        makeFinding({ id: 'f-3', code: 'FND-3', status: 'closed' }),
      ],
    });
    const items = inspectionMissing(ins, { editLink: null, runLink: null, openFinding: open });
    expect(items.map((i) => i.key)).toEqual(['deviation', 'findings']);
    expect(items[1].params).toMatchObject({ count: 2 });
    items[0].action?.();
    expect(open).toHaveBeenCalledWith('f-1');
  });

  it('asks for an inspector only while the plan can be changed', () => {
    const ins = makeInspectionDetail({ status: 'planned', inspector: null });
    const noop = () => undefined;
    expect(
      inspectionMissing(ins, { editLink: ['/edit'], runLink: null, openFinding: noop }).map(
        (i) => i.key,
      ),
    ).toContain('inspector');
    expect(
      inspectionMissing(ins, { editLink: null, runLink: null, openFinding: noop }).map(
        (i) => i.key,
      ),
    ).not.toContain('inspector');
  });

  it('tells a closed finding apart by whether the fix was checked', () => {
    expect(
      findingStatusSentence(makeFinding({ status: 'closed', effectiveness_checked_at: null }), fmt)
        .tone,
    ).toBe('warn');
    expect(
      findingStatusSentence(
        makeFinding({ status: 'closed', effectiveness_checked_at: '2026-11-16T14:00:00' }),
        fmt,
      ).tone,
    ).toBe('pass');
  });

  it('lists what an open finding still needs, only for editors', () => {
    const opts = {
      canEdit: true,
      canEscalate: true,
      edit: () => undefined,
      escalate: () => undefined,
      checkEffect: () => undefined,
    };
    const f = makeFinding({
      status: 'open',
      severity: 'critical',
      deviation: null,
      owner: null,
      due_at: null,
      root_cause: null,
    });
    expect(findingMissing(f, opts).map((i) => i.key)).toEqual([
      'deviation',
      'owner',
      'due',
      'cause',
    ]);
    expect(findingMissing(f, { ...opts, canEdit: false })).toEqual([]);
  });

  it('says whether a checklist can be used and what is missing', () => {
    expect(templateStatusSentence(makeTemplateDetail({ status: 'draft' })).tone).toBe('warn');
    const draft = makeTemplateDetail({ status: 'draft', question_count: 3, description: null });
    expect(
      templateMissing(draft, { editLink: ['/edit'], publish: () => undefined }).map((i) => i.key),
    ).toEqual(['publish', 'description']);
  });
});
