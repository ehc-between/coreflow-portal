import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { FrameworkView, mergeFrameworks } from '../../../core/standards/frameworks-data';
import { StandardsApi } from '../../../core/standards/standards-api';
import {
  FrameworkReadiness,
  FrameworkSummary,
  StandardSummary,
} from '../../../core/standards/standards.models';

export interface FrameworksSnapshot {
  readonly standards: readonly StandardSummary[];
  readonly views: readonly FrameworkView[];
}

/**
 * Load the standards, the framework list and the readiness breakdown for an
 * org and merge them. Only the standards list is required: the framework and
 * readiness calls degrade to "unknown" (derived from the standards) when they
 * fail, e.g. while the module gate or an older backend rejects them.
 */
export function loadFrameworks(api: StandardsApi, orgId: string): Observable<FrameworksSnapshot> {
  return forkJoin({
    standards: api.list(orgId),
    frameworks: api
      .listFrameworks(orgId)
      .pipe(catchError(() => of(null as FrameworkSummary[] | null))),
    readiness: api.readiness(orgId).pipe(catchError(() => of([] as FrameworkReadiness[]))),
  }).pipe(
    map(({ standards, frameworks, readiness }) => ({
      standards,
      views: mergeFrameworks(frameworks, standards, readiness),
    })),
  );
}
