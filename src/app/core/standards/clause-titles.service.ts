import { Injectable, Injector, inject, signal } from '@angular/core';
import { LanguageService } from '../i18n/language.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { StandardsApi } from './standards-api';
import { ClauseTitle } from './standards.models';

/** The backend answers at most this many refs per request. */
export const CLAUSE_TITLE_BATCH = 50;

/**
 * The canonical form of a clause ref, as the titles endpoint returns it: the year and
 * hyphens of a standard key go (`iso27001-2022:A.6.3` → `iso27001:A.6.3`,
 * `eu-ai-act:4` → `eu_ai_act:4`) and a requirement ref answers as its clause
 * (`iso9001-2026:8.4.1.r1` → `iso9001:8.4.1`). Null when the ref has no framework.
 */
export function canonicalClauseRef(ref: string): string | null {
  const at = ref.indexOf(':');
  if (at <= 0 || at === ref.length - 1) {
    return null;
  }
  const framework = ref
    .slice(0, at)
    .trim()
    .replace(/-\d{4}$/, '')
    .replace(/-/g, '_');
  const number = ref
    .slice(at + 1)
    .trim()
    .replace(/\.r\d+$/, '');
  return framework && number ? `${framework}:${number}` : null;
}

type Entry = ClauseTitle | 'loading' | 'missing';

/**
 * Plain requirement titles for clause refs (simplify U39, "no bare clause numbers"):
 * beginners read "Kompetanse" where others read "Felles ISO-krav · 7.2".
 *
 * `read(ref)` is a reactive read (call it in `computed()` or a template). The first read
 * of an unknown ref queues it; queued refs are fetched together, 50 per request, once per
 * language and org, from `GET orgs/{org}/requirement-catalogue/titles`. Until the answer
 * arrives, and when the catalogue does not know the ref or the request fails, `read`
 * returns null and callers show `short · number`.
 */
@Injectable({ providedIn: 'root' })
export class ClauseTitlesService {
  // Resolved on first use: titles are extra context, and screens that show clause refs
  // (help panels, chips) must keep working where no org or HTTP stack is provided.
  private readonly injector = inject(Injector);
  private readonly language = inject(LanguageService);

  /** Keyed `<org>/<lang>/<canonical ref>`. */
  private readonly entries = signal<ReadonlyMap<string, Entry>>(new Map());
  private readonly queue = new Set<string>();
  private flushScheduled = false;

  /** The plain title of a clause ref in the active language, or null. */
  read(ref: string | null | undefined): ClauseTitle | null {
    const canonical = ref ? canonicalClauseRef(ref) : null;
    const org = this.orgId();
    if (!canonical || !org) {
      return null;
    }
    const key = `${org}/${this.language.active()}/${canonical}`;
    const entry = this.entries().get(key);
    if (entry === undefined) {
      this.enqueue(key);
      return null;
    }
    return typeof entry === 'string' || !entry.found || !entry.title ? null : entry;
  }

  private orgId(): string | null {
    try {
      return this.injector.get(SelectedOrgService).currentOrgId();
    } catch {
      return null;
    }
  }

  private enqueue(key: string): void {
    this.queue.add(key);
    if (this.flushScheduled) {
      return;
    }
    // Reads run inside computed()/templates, where signal writes are not allowed.
    this.flushScheduled = true;
    queueMicrotask(() => this.flush());
  }

  private flush(): void {
    this.flushScheduled = false;
    const keys = [...this.queue].filter((key) => !this.entries().has(key));
    this.queue.clear();
    if (!keys.length) {
      return;
    }
    this.set(keys, () => 'loading');
    const byScope = new Map<string, string[]>();
    for (const key of keys) {
      const [org, lang] = key.split('/', 2);
      const scope = `${org}/${lang}`;
      byScope.set(scope, [...(byScope.get(scope) ?? []), key]);
    }
    for (const [scope, scopeKeys] of byScope) {
      const [org] = scope.split('/', 1);
      for (let i = 0; i < scopeKeys.length; i += CLAUSE_TITLE_BATCH) {
        this.fetch(org, scope, scopeKeys.slice(i, i + CLAUSE_TITLE_BATCH));
      }
    }
  }

  private fetch(org: string, scope: string, keys: readonly string[]): void {
    const refs = keys.map((key) => key.slice(scope.length + 1));
    let api: StandardsApi;
    try {
      api = this.injector.get(StandardsApi);
    } catch {
      this.set(keys, () => 'missing');
      return;
    }
    api.clauseTitles(org, refs).subscribe({
      next: (titles) => {
        const byRef = new Map(titles.map((t) => [t.clause_ref, t]));
        this.set(keys, (key) => byRef.get(key.slice(scope.length + 1)) ?? 'missing');
      },
      error: () => this.set(keys, () => 'missing'),
    });
  }

  private set(keys: readonly string[], value: (key: string) => Entry): void {
    this.entries.update((map) => {
      const next = new Map(map);
      keys.forEach((key) => next.set(key, value(key)));
      return next;
    });
  }
}
