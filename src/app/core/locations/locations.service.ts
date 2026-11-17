import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, catchError, filter, of, shareReplay } from 'rxjs';
import { LocationsApi } from './locations-api';
import { LocationRequirements, LocationVocabulary } from './locations.models';

/**
 * Shared, de-duplicated reads of the requirement-locations layer. Several
 * components on one page ask for the same data (the "Dette oppfyller" strip and
 * the assistant context, the vocabulary for route matching), so the in-flight
 * request is shared per org + language + key. The cache is dropped when the user
 * moves to another page (results are live data: a page visit should show today's
 * state; query-only changes such as list filters keep it) and
 * after an override (`invalidate()`), which also bumps `version` so mounted
 * components reload.
 */
@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly api = inject(LocationsApi);
  private readonly cache = new Map<string, Observable<unknown>>();

  /** Bumped by `invalidate()`; components that show results read it to reload. */
  readonly version = signal(0);

  private lastPath: string | null = null;

  constructor() {
    inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const path = normalisePath(event.urlAfterRedirects);
        if (path !== this.lastPath) {
          this.lastPath = path;
          this.cache.clear();
        }
      });
  }

  /** The vocabulary of the enabled modules, or `[]` when it cannot be read. */
  vocabulary(orgId: string, lang: string): Observable<readonly LocationVocabulary[]> {
    return this.shared(`vocabulary|${orgId}|${lang}`, () =>
      this.api.vocabulary(orgId, lang).pipe(catchError(() => of([]))),
    );
  }

  /** What a place fulfils, or null when it cannot be read (no access, unknown key). */
  requirementsOf(
    orgId: string,
    key: string,
    lang: string,
  ): Observable<LocationRequirements | null> {
    return this.shared(`fulfils|${orgId}|${lang}|${key}`, () =>
      this.api.requirementsOf(orgId, key, lang).pipe(catchError(() => of(null))),
    );
  }

  /** Forget cached results (after an override) and tell mounted components to reload. */
  invalidate(): void {
    this.cache.clear();
    this.version.update((v) => v + 1);
  }

  private shared<T>(key: string, load: () => Observable<T>): Observable<T> {
    let hit = this.cache.get(key) as Observable<T> | undefined;
    if (!hit) {
      hit = load().pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.cache.set(key, hit);
    }
    return hit;
  }
}

/**
 * The location whose route is the given portal path, for pages that serve several
 * places from one component (context and privacy registers). Only exact path
 * matches without placeholders count; the first declared location wins.
 */
export function locationForPath(
  vocabulary: readonly LocationVocabulary[],
  path: string,
): LocationVocabulary | null {
  const clean = normalisePath(path);
  return (
    vocabulary.find((loc) => !loc.route.includes('{') && normalisePath(loc.route) === clean) ?? null
  );
}

function normalisePath(path: string): string {
  const bare = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return bare || '/';
}
