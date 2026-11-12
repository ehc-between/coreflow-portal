import { Injector } from '@angular/core';
import { TRANSLOCO_SCOPE, provideTranslocoScope } from '@jsverse/transloco';
import { mergeScopes, provideSharedScope } from './shared-scope';

describe('provideSharedScope', () => {
  it('adds its scope to the inherited route scope instead of replacing it', () => {
    const route = Injector.create({ providers: [provideTranslocoScope('contracts')] });
    const kit = Injector.create({ providers: [provideSharedScope('kit')], parent: route });
    expect(kit.get(TRANSLOCO_SCOPE)).toEqual(['contracts', 'kit']);
  });

  it('accumulates through nested shared components without duplicates', () => {
    const route = Injector.create({ providers: [provideTranslocoScope('obligations')] });
    const tasks = Injector.create({ providers: [provideSharedScope('tasks')], parent: route });
    const nested = Injector.create({
      providers: [provideSharedScope('kit', 'tasks')],
      parent: tasks,
    });
    expect(nested.get(TRANSLOCO_SCOPE)).toEqual(['obligations', 'tasks', 'kit']);
  });

  it('works without any inherited scope', () => {
    const root = Injector.create({ providers: [provideSharedScope('guidance')] });
    expect(root.get(TRANSLOCO_SCOPE)).toEqual(['guidance']);
  });
});

describe('mergeScopes', () => {
  it('drops empty entries and dedupes object scopes by scope + alias', () => {
    const aliased = { scope: 'management-review', alias: 'mr' };
    expect(mergeScopes([undefined, aliased, 'kit'], [{ ...aliased }, 'kit'])).toEqual([
      aliased,
      'kit',
    ]);
  });
});
