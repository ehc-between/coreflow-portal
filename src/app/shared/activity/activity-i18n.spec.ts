import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import activityEn from '../../../assets/i18n/activity/en.json';
import activityNb from '../../../assets/i18n/activity/nb.json';
import { ACTIVITY_ERROR_CODES } from '../../core/notifications/activity-errors';
import {
  BUILTIN_CATEGORIES,
  CHANNELS,
  EMAIL_MODES,
  RECIPIENT_TYPES,
} from '../../core/notifications/activity.models';
import { ACTIVITY_GUIDE_PAGES, clauseSlug } from './activity-guide';

type Tree = Readonly<Record<string, unknown>>;

/** Flattened `a.b.c` key paths of a translation tree. */
function paths(tree: unknown, prefix = ''): string[] {
  if (!tree || typeof tree !== 'object') return [prefix];
  return Object.entries(tree as Tree).flatMap(([key, value]) =>
    paths(value, prefix ? `${prefix}.${key}` : key),
  );
}

function get(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);
}

const has = (tree: unknown, path: string): boolean => typeof get(tree, path) === 'string';

describe('activity i18n', () => {
  it('keeps en and nb at full key parity (scope and global notifications)', () => {
    expect(paths(activityNb).sort()).toEqual(paths(activityEn).sort());
    expect(paths(nb.notifications).sort()).toEqual(paths(en.notifications).sort());
  });

  it('has no empty strings', () => {
    for (const tree of [activityEn, activityNb]) {
      for (const p of paths(tree)) expect(String(get(tree, p)).trim(), p).not.toBe('');
    }
  });

  it('labels every recipient type, channel, category, email mode and error code', () => {
    for (const tree of [activityEn, activityNb]) {
      for (const t of RECIPIENT_TYPES) expect(has(tree, `recipients.${t}.label`), t).toBe(true);
      for (const c of CHANNELS) expect(has(tree, `channels.${c}.label`), c).toBe(true);
      for (const c of BUILTIN_CATEGORIES) expect(has(tree, `categories.${c}.label`), c).toBe(true);
      for (const m of EMAIL_MODES) expect(has(tree, `emailModes.${m}`), m).toBe(true);
      for (const code of ACTIVITY_ERROR_CODES) expect(has(tree, `errors.${code}`), code).toBe(true);
    }
  });

  it('labels the event kinds and timeline keys the backend registers', () => {
    const kinds = [
      'reminder.due_soon',
      'reminder.overdue',
      'reminder.escalated',
      'module.enabled',
      'module.disabled',
    ];
    const timeline = [
      'reminderDueSoon',
      'reminderOverdue',
      'reminderEscalated',
      'moduleEnabled',
      'moduleDisabled',
    ];
    for (const tree of [activityEn, activityNb]) {
      for (const k of kinds) expect(has(tree, `kinds.${k}`), k).toBe(true);
      for (const k of timeline) expect(has(tree, `timeline.${k}`), k).toBe(true);
    }
  });

  it('has every reminder title variant in the global notifications', () => {
    const variants = [
      'reminderDueSoon',
      'reminderDueSoonToday',
      'reminderDueSoonTomorrow',
      'reminderOverdue',
      'reminderOverdueOne',
      'reminderEscalated',
      'reminderEscalatedOne',
    ];
    for (const tree of [en, nb]) {
      for (const v of variants) {
        expect(has(tree.notifications, v), v).toBe(true);
        expect(has(tree.notifications, `${v}NoCode`), `${v}NoCode`).toBe(true);
      }
      expect(has(tree.notifications, 'reminderEntityFallback')).toBe(true);
    }
  });

  it('has the learning content every guide page declares', () => {
    for (const tree of [activityEn, activityNb]) {
      for (const [page, content] of Object.entries(ACTIVITY_GUIDE_PAGES)) {
        const base = `guide.${page}`;
        for (const key of ['title', 'body', 'why', 'lesson.title', 'lesson.check.question']) {
          expect(has(tree, `${base}.${key}`), `${base}.${key}`).toBe(true);
        }
        for (let n = 1; n <= content.steps; n++) {
          expect(has(tree, `${base}.step${n}`), `${base}.step${n}`).toBe(true);
        }
        for (let n = 1; n <= content.lessonSections; n++) {
          expect(has(tree, `${base}.lesson.s${n}.body`), `${base}.lesson.s${n}`).toBe(true);
        }
        for (const ref of content.clauses) {
          expect(has(tree, `guide.clauses.${clauseSlug(ref)}`), ref).toBe(true);
        }
      }
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|gpt|openai)\b/i;
    for (const tree of [activityEn, activityNb, en.notifications, nb.notifications]) {
      for (const p of paths(tree)) expect(String(get(tree, p)), p).not.toMatch(banned);
    }
  });
});
