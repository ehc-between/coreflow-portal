import { collectParityProblems } from '../../../testing/i18n-parity';
import en from '../../../assets/guidance/en/settings.json';
import nb from '../../../assets/guidance/nb/settings.json';
import { KNOWN_FRAMEWORKS } from '../../core/guidance/clause-ref';
import { GuidanceFile } from '../../core/guidance/guidance.models';
import { LESSON_SCOPES } from '../learning/lesson-catalog';

/** The pages that show `<app-help-strip scope="settings">` and their lesson. */
const PAGES: Record<string, string | null> = {
  notifications: 'reminders-and-escalation',
  'notification-preferences': 'following-records',
  modules: 'modules-basics',
  profile: null,
  terminology: null,
  setup: 'modules-basics',
};

describe('settings guidance', () => {
  const files = [en, nb] as GuidanceFile[];

  it('keeps en and nb at full parity', () => {
    expect(collectParityProblems(en, nb)).toEqual([]);
  });

  it('has an intro and a why note for every settings page, and the lessons they open', () => {
    for (const file of files) {
      for (const [page, lesson] of Object.entries(PAGES)) {
        const content = file.pages?.[page];
        expect(content?.intro?.title, page).toBeTruthy();
        expect(content?.intro?.steps?.length, page).toBeGreaterThan(0);
        expect(content?.why?.body, page).toBeTruthy();
        if (lesson) expect(file.lessons?.[lesson]?.sections.length, lesson).toBeGreaterThan(0);
      }
    }
    expect(LESSON_SCOPES).toContain('settings');
  });

  it('has valid quizzes with the same answers in both languages', () => {
    const answers = (f: GuidanceFile) =>
      Object.values(f.lessons ?? {}).flatMap((l) => (l.quiz ?? []).map((q) => q.answer));
    for (const file of files) {
      for (const lesson of Object.values(file.lessons ?? {})) {
        for (const q of lesson.quiz ?? []) {
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
    expect(answers(en as GuidanceFile)).toEqual(answers(nb as GuidanceFile));
  });

  it('only teaches known clauses, the same in both languages', () => {
    const refs = (f: GuidanceFile) =>
      Object.values(f.pages ?? {}).flatMap((p) => p.why?.clauses ?? []);
    for (const ref of refs(en as GuidanceFile)) {
      expect(KNOWN_FRAMEWORKS.has(ref.split(':')[0]), ref).toBe(true);
    }
    expect(refs(en as GuidanceFile)).toEqual(refs(nb as GuidanceFile));
  });

  it('never names a vendor or model', () => {
    expect(JSON.stringify([en, nb])).not.toMatch(/claude|anthropic|openai|\bgpt\b|gemini/i);
  });
});
