import { FieldSpec, WorkflowDefinition } from '../../core/records/record.models';
import {
  assignSections,
  buildLayout,
  checkDefinition,
  checkFields,
  cleanFields,
  removeState,
  renameState,
  sectionsFrom,
  slugify,
  starterDefinition,
  uniqueKey,
} from './designer-model';

const f = (key: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label: { en: key },
  type: 'text',
  ...extra,
});

describe('designer model: keys', () => {
  it('slugifies free text, including Norwegian letters', () => {
    expect(slugify('Root cause')).toBe('root_cause');
    expect(slugify('Årsak – før/etter')).toBe('arsak_for_etter');
    expect(slugify('Ærlig')).toBe('aerlig');
    expect(slugify('2nd try')).toBe('k_2nd_try');
    expect(slugify('***')).toBe('');
  });

  it('finds a free key', () => {
    expect(uniqueKey('text', ['text', 'text_2'])).toBe('text_3');
    expect(uniqueKey('New', [])).toBe('new');
  });
});

describe('designer model: workflow', () => {
  it('accepts the starter definition', () => {
    expect(checkDefinition(starterDefinition())).toEqual([]);
  });

  it('reports the same problems the backend would', () => {
    const def: WorkflowDefinition = {
      initial_state: 'nope',
      states: [
        { key: 'open', label: 'Open', category: 'open' },
        { key: 'open', label: '', category: 'done' },
      ],
      transitions: [
        { key: 'go', from: [], to: 'missing', label: 'Go', allowed_permissions: ['bad'] },
        {
          key: 'go',
          from: ['open'],
          to: 'open',
          label: 'Again',
          approval: { mode: 'quorum', approver_roles: [], segregation_of_duties: true },
          notify: [{ type: 'role' }],
          create_tasks: [{ title: 'T', assignee: { type: 'role' } }],
        },
      ],
    };
    const codes = checkDefinition(def).map((i) => `${i.code}@${i.loc}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        'duplicate_state@states',
        'no_label@states.1',
        'unknown_state@initial_state',
        'duplicate_transition@transitions',
        'no_from@transitions.0.from',
        'unknown_state@transitions.0.to',
        'invalid_permission@transitions.0',
        'approval_without_approver@transitions.1.approval',
        'quorum_required@transitions.1.approval',
        'notify_value_required@transitions.1.notify',
        'assignee_value_required@transitions.1.create_tasks',
      ]),
    );
  });

  it('renames a state everywhere and removes one with its transitions', () => {
    const renamed = renameState(starterDefinition(), 'open', 'new');
    expect(renamed.initial_state).toBe('new');
    expect(renamed.transitions.find((t) => t.key === 'cancel')?.from).toEqual([
      'new',
      'in_progress',
    ]);

    const removed = removeState(starterDefinition(), 'in_progress');
    expect(removed.states.map((s) => s.key)).toEqual(['open', 'done', 'cancelled']);
    expect(removed.transitions.map((t) => t.key)).toEqual(['cancel']);
    expect(removed.transitions[0].from).toEqual(['open']);
  });
});

describe('designer model: fields', () => {
  it('reports field problems', () => {
    const issues = checkFields([
      f('a'),
      f('a'),
      f('Bad'),
      f('s', { type: 'select', options: [] }),
      f('o', { type: 'multiselect', options: ['x', 'x'] }),
      f('r', { type: 'number', min: 5, max: 1 }),
      f('e', { type: 'entity_ref' }),
      f('c1', { type: 'calculated' }),
      f('c2', { type: 'calculated', formula: 'a * 2' }),
      f('v', { visible_if: { field: 'ghost', equals: 1 } }),
      f('n', { label: '' }),
    ]).map((i) => `${i.key}:${i.code}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        'a:duplicate_key',
        'Bad:invalid_field',
        's:options_required',
        'o:duplicate_option',
        'r:invalid_range',
        'e:entity_type_required',
        'c1:formula_required',
        'c2:invalid_formula',
        'v:invalid_visible_if',
        'n:no_label',
      ]),
    );
  });

  it('accepts a formula over earlier number fields', () => {
    expect(
      checkFields([
        f('l', { type: 'number' }),
        f('c', { type: 'number' }),
        f('score', { type: 'calculated', formula: 'l * c' }),
      ]),
    ).toEqual([]);
  });

  it('round-trips sections and layout', () => {
    const fields = [f('a'), f('b'), f('c')];
    const layout = [
      { key: 'one', label: 'One', fields: ['a'], columns: 1 as const },
      { key: 'two', label: 'Two', fields: ['b'], columns: 2 as const },
    ];
    const sections = sectionsFrom(fields, layout, 'Details');
    const assigned = assignSections(fields, layout, sections);
    expect(assigned.map((x) => x.section)).toEqual(['one', 'two', 'one']);
    expect(buildLayout(assigned, sections)).toEqual([
      { key: 'one', label: 'One', columns: 1, fields: ['a', 'c'] },
      { key: 'two', label: 'Two', columns: 2, fields: ['b'] },
    ]);
  });

  it('derives one default section without a layout', () => {
    const sections = sectionsFrom([f('a', { width: 'half' })], [], 'Details');
    expect(sections).toEqual([{ key: 'details', label: 'Details', columns: 2 }]);
  });

  it('drops empty optional bits when publishing', () => {
    const [clean] = cleanFields([
      f('a', {
        help: null,
        placeholder: { en: 'x' },
        options: ['ignored'],
        min: null,
        default: '',
        visible_if: null,
      }),
    ]);
    expect(clean).toEqual({
      key: 'a',
      label: { en: 'a' },
      type: 'text',
      required: false,
      width: 'full',
      placeholder: { en: 'x' },
    });
  });
});
