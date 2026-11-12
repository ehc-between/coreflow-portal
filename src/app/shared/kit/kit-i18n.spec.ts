import guidanceEn from '../../../assets/guidance/en/kit.json';
import guidanceNb from '../../../assets/guidance/nb/kit.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import kitNb from '../../../assets/i18n/kit/nb.json';
import { LINK_TYPES } from '../../core/kit/kit.models';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { HttpErrorResponse } from '@angular/common/http';

type Json = unknown;

/** Every key path with its value kind; arrays are compared by length and items. */
function shape(value: Json, path = ''): string[] {
  if (Array.isArray(value)) {
    return [`${path}[]#${value.length}`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, Json>).flatMap(([k, v]) =>
      shape(v, path ? `${path}.${k}` : k),
    );
  }
  return [`${path}:${typeof value}`];
}

function lookup(dict: Json, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
}

/** Interpolation params used by a string, e.g. `{{ name }}` -> `name`. */
function params(text: string): string[] {
  return [...text.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((m) => m[1]).sort();
}

function strings(value: Json, path = ''): [string, string][] {
  if (typeof value === 'string') {
    return [[path, value]];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, Json>).flatMap(([k, v]) =>
      strings(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

describe('kit i18n', () => {
  it('has full key parity between en and nb', () => {
    expect(shape(kitNb)).toEqual(shape(kitEn));
  });

  it('uses the same interpolation params in both languages', () => {
    const nb = new Map(strings(kitNb));
    for (const [key, text] of strings(kitEn)) {
      expect(params(nb.get(key) ?? ''), key).toEqual(params(text));
    }
  });

  it('names every link type in every form', () => {
    for (const type of [...LINK_TYPES, 'other']) {
      for (const form of ['name', 'outgoing', 'incoming']) {
        expect(lookup(kitEn, `linkTypes.${type}.${form}`), `${type}.${form}`).toBeTypeOf('string');
      }
    }
  });

  it('translates every error key the kit can produce', () => {
    const codes = [
      'unsupported_entity_type',
      'module_disabled',
      'invalid_link_type',
      'self_link',
      'not_linkable',
      'link_exists',
      'link_not_found',
      'comment_empty',
      'comment_too_long',
      'invalid_parent',
      'invalid_mentions',
      'mention_no_access',
      'not_commentable',
      'not_comment_author',
      'comment_not_found',
      'revision_not_found',
      'revision_mismatch',
    ];
    const keys = [
      ...codes.map((code) =>
        kitErrorKey(new HttpErrorResponse({ status: 422, error: { detail: { code } } })),
      ),
      ...[0, 403, 404, 500].map((status) => kitErrorKey(new HttpErrorResponse({ status }))),
    ];
    for (const key of keys) {
      expect(lookup({ kit: kitEn }, key), key).toBeTypeOf('string');
    }
  });

  it('has timeline and notification texts for every kit event kind', () => {
    for (const name of [
      'commentCreated',
      'commentMentioned',
      'commentDeleted',
      'linkCreated',
      'linkDeleted',
    ]) {
      expect(lookup(kitEn, `timeline.${name}`)).toBeTypeOf('string');
      expect(lookup(kitEn, `notifications.${name}`)).toBeTypeOf('string');
    }
  });

  it('has guidance content at full parity, with a lesson and a quiz', () => {
    expect(shape(guidanceNb)).toEqual(shape(guidanceEn));
    const lesson = guidanceEn.lessons['connected-records'];
    expect(lesson.sections.length).toBeGreaterThan(0);
    for (const q of lesson.quiz) {
      expect(q.answer).toBeLessThan(q.options.length);
    }
    for (const page of ['detail', 'related', 'comments', 'revisions', 'activity', 'list']) {
      expect(lookup(guidanceEn, `pages.${page}.intro.title`), page).toBeTypeOf('string');
      expect(lookup(guidanceEn, `pages.${page}.why.body`), page).toBeTypeOf('string');
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const all = [
      ...strings(kitEn),
      ...strings(kitNb),
      ...strings(guidanceEn),
      ...strings(guidanceNb),
    ];
    for (const [key, text] of all) {
      expect(/claude|anthropic|openai|gpt/i.test(text), key).toBe(false);
    }
  });
});
