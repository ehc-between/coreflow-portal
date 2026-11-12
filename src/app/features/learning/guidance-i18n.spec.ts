import { collectParityProblems, expectKeyParity } from '../../../testing/i18n-parity';
import enUi from '../../../assets/i18n/guidance/en.json';
import nbUi from '../../../assets/i18n/guidance/nb.json';
import enGlossary from '../../../assets/guidance/en/glossary.json';
import nbGlossary from '../../../assets/guidance/nb/glossary.json';
import enPlatform from '../../../assets/guidance/en/platform.json';
import nbPlatform from '../../../assets/guidance/nb/platform.json';
import { KNOWN_FRAMEWORKS } from '../../core/guidance/clause-ref';
import { GUIDANCE_LEVELS, GuidanceFile } from '../../core/guidance/guidance.models';
import { LESSON_SCOPES, LESSON_STATUSES } from './lesson-catalog';

type Dict = Record<string, unknown>;

function lookup(dict: Dict, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict);
}

const VENDOR_NAMES = /\b(claude|anthropic|openai|gpt|chatgpt|gemini)\b/i;

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

function clauseRefs(file: GuidanceFile): string[] {
  const pages = Object.values(file.pages ?? {}).flatMap((p) => p.why?.clauses ?? []);
  const terms = Object.values(file.glossary ?? {}).flatMap((g) => g.clauses ?? []);
  return [...pages, ...terms];
}

describe('expectKeyParity', () => {
  it('reports missing keys, kind mismatches and array lengths', () => {
    expect(collectParityProblems({ a: 1, b: { c: 'x' } }, { a: 2, b: { c: 'y' } })).toEqual([]);
    expect(collectParityProblems({ a: 'x', b: 'y' }, { a: 'x', c: 'z' })).toEqual([
      'b: missing in second',
      'c: missing in first',
    ]);
    expect(collectParityProblems({ a: ['x'] }, { a: ['x', 'y'] })).toEqual([
      'a: array length 1 vs 2',
    ]);
    expect(collectParityProblems({ a: { b: 1 } }, { a: 'x' })).toEqual(['a: object vs string']);
    expectKeyParity({ list: [{ k: 1 }] }, { list: [{ k: 2 }] });
  });
});

describe('guidance i18n and content', () => {
  it('keeps the guidance scope translations at en/nb parity', () => {
    expectKeyParity(enUi, nbUi);
  });

  it('keeps the guidance content files at en/nb parity', () => {
    expectKeyParity(enPlatform, nbPlatform);
    expectKeyParity(enGlossary, nbGlossary);
  });

  it('defines every dynamic key the components build', () => {
    for (const ui of [enUi, nbUi] as Dict[]) {
      for (const level of GUIDANCE_LEVELS) {
        expect(lookup(ui, `levels.${level}.name`)).toBeTypeOf('string');
        expect(lookup(ui, `levels.${level}.description`)).toBeTypeOf('string');
        expect(lookup(ui, `tutor.style.${level}`)).toBeTypeOf('string');
      }
      for (const status of LESSON_STATUSES) {
        expect(lookup(ui, `status.${status}`)).toBeTypeOf('string');
      }
      for (const scope of LESSON_SCOPES) {
        expect(lookup(ui, `scopes.${scope}`)).toBeTypeOf('string');
      }
      for (const framework of KNOWN_FRAMEWORKS) {
        expect(lookup(ui, `frameworks.${framework}`)).toBeTypeOf('string');
      }
      // Event-kind keys referenced by the backend (guidance:notifications.* / timeline.*).
      for (const key of ['lessonCompleted', 'quizPassed', 'defaultLevelChanged']) {
        expect(lookup(ui, `notifications.${key}`)).toBeTypeOf('string');
        expect(lookup(ui, `timeline.${key}`)).toBeTypeOf('string');
      }
    }
  });

  it('ships the required platform pages, lessons and a glossary of at least 40 terms', () => {
    const platform = enPlatform as GuidanceFile;
    for (const page of ['dashboard', 'my-work', 'documents', 'deviations', 'standards']) {
      expect(platform.pages?.[page]?.intro?.title, page).toBeTruthy();
    }
    expect(Object.keys(platform.lessons ?? {}).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys((enGlossary as GuidanceFile).glossary ?? {}).length).toBeGreaterThanOrEqual(
      40,
    );
  });

  it('has valid lessons, quizzes and lesson keys', () => {
    for (const file of [enPlatform, nbPlatform] as GuidanceFile[]) {
      for (const [key, lesson] of Object.entries(file.lessons ?? {})) {
        expect(`platform.${key}`).toMatch(/^[a-z][a-z0-9_-]*\.[a-z0-9][a-z0-9_.-]*$/);
        expect(lesson.sections.length, key).toBeGreaterThan(0);
        for (const q of lesson.quiz ?? []) {
          expect(q.answer, `${key}: ${q.question}`).toBeGreaterThanOrEqual(0);
          expect(q.answer, `${key}: ${q.question}`).toBeLessThan(q.options.length);
        }
        if (lesson.pass_mark !== undefined) {
          expect(lesson.pass_mark).toBeGreaterThan(0);
          expect(lesson.pass_mark).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('only references known frameworks and the same answers in both languages', () => {
    for (const file of [enPlatform, nbPlatform, enGlossary, nbGlossary] as GuidanceFile[]) {
      for (const ref of clauseRefs(file)) {
        expect(KNOWN_FRAMEWORKS.has(ref.split(':')[0]), ref).toBe(true);
      }
    }
    expect(clauseRefs(enPlatform as GuidanceFile)).toEqual(clauseRefs(nbPlatform as GuidanceFile));
    expect(clauseRefs(enGlossary as GuidanceFile)).toEqual(clauseRefs(nbGlossary as GuidanceFile));
    const answers = (f: GuidanceFile) =>
      Object.values(f.lessons ?? {}).flatMap((l) => (l.quiz ?? []).map((q) => q.answer));
    expect(answers(enPlatform as GuidanceFile)).toEqual(answers(nbPlatform as GuidanceFile));
  });

  it('never names a vendor or model in user-facing text', () => {
    for (const file of [enUi, nbUi, enPlatform, nbPlatform, enGlossary, nbGlossary]) {
      for (const text of allStrings(file)) {
        expect(text).not.toMatch(VENDOR_NAMES);
      }
    }
  });
});
