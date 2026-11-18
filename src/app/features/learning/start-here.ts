/** Lessons on the "Start her" path. */
export const START_HERE_SIZE = 5;

/** A lesson that may be on the "Start her" path; `module` limits it to orgs using that module. */
export interface StartHereCandidate {
  readonly scope: string;
  readonly key: string;
  readonly module: string | null;
}

/**
 * The beginner path (simplify U38, comprehension §4): what CoreFlow is, your role, how to
 * report something, how to read the status and privacy in five minutes; then fallbacks
 * for orgs that do not use those modules. The first five whose module is enabled win.
 */
export const START_HERE_CANDIDATES: readonly StartHereCandidate[] = [
  { scope: 'platform', key: 'getting-started', module: null },
  { scope: 'platform', key: 'people-and-access', module: null },
  { scope: 'deviations', key: 'good-deviation-report', module: 'deviations' },
  { scope: 'standards', key: 'readiness', module: 'standards' },
  { scope: 'privacy', key: 'gdpr-principles', module: 'privacy' },
  { scope: 'documents', key: 'read-and-acknowledge', module: 'documents' },
  { scope: 'tasks', key: 'working-with-tasks', module: null },
  { scope: 'risk', key: 'first-risk-assessment', module: 'risk' },
  { scope: 'search', key: 'finding-records-fast', module: null },
];

/** The "Start her" lessons for an org: candidates in order, filtered to enabled modules. */
export function startHere(
  isEnabled: (module: string) => boolean,
  candidates: readonly StartHereCandidate[] = START_HERE_CANDIDATES,
  size = START_HERE_SIZE,
): StartHereCandidate[] {
  return candidates.filter((c) => c.module === null || isEnabled(c.module)).slice(0, size);
}
