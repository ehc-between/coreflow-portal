import { Provider, WritableSignal, signal } from '@angular/core';
import { GLOSSARY_SCOPE, GuidanceContentService } from './guidance-content.service';
import { GuidanceFile, GuidanceLevel } from './guidance.models';
import { GuidanceService } from './guidance.service';

/**
 * Test doubles for the guidance services (specs only). `files` maps a scope to its
 * content; the fake content service serves them synchronously.
 */
export function provideFakeGuidance(
  files: Readonly<Record<string, GuidanceFile>> = {},
  level: GuidanceLevel = 'standard',
): { providers: Provider[]; level: WritableSignal<GuidanceLevel> } {
  const levelSignal = signal<GuidanceLevel>(level);
  const personal = signal<GuidanceLevel | null>(null);
  const read = (scope: string) => files[scope] ?? null;
  const content: Partial<GuidanceContentService> = {
    readFile: read,
    readLoaded: () => true,
    readPage: (scope, page) => read(scope)?.pages?.[page] ?? null,
    readLesson: (scope, key) => read(scope)?.lessons?.[key] ?? null,
    readTour: (scope, key) => read(scope)?.tours?.[key] ?? [],
    readTerm: (key, scope) =>
      (scope ? read(scope)?.glossary?.[key] : undefined) ??
      read(GLOSSARY_SCOPE)?.glossary?.[key] ??
      null,
    whenLoaded: (scope) => Promise.resolve(read(scope)),
  };
  const guidance = {
    level: levelSignal.asReadonly(),
    personalLevel: personal.asReadonly(),
    orgDefault: signal<GuidanceLevel>('standard').asReadonly(),
    isBeginner: () => levelSignal() === 'beginner',
    isExpert: () => levelSignal() === 'expert',
    loaded: signal(true).asReadonly(),
    saving: signal(false).asReadonly(),
    setLevel: (value: GuidanceLevel | null) => personal.set(value),
    reload: () => undefined,
  };
  return {
    providers: [
      { provide: GuidanceContentService, useValue: content },
      { provide: GuidanceService, useValue: guidance },
    ],
    level: levelSignal,
  };
}
