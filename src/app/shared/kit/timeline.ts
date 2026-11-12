import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityTypesService, camelCase, humanize } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { TimelineItem } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe } from '../locale/locale-pipes';
import { RelativeTimePipe } from '../relative-time/relative-time';
import { Button } from '../ui/button/button';
import { inlineValue, linkTypeKey } from './kit-format';
import { provideKitScope } from './kit-scope';

const PAGE_SIZE = 50;

/** `"risk:timeline.ownerChanged"` -> scope `risk`, key `timeline.ownerChanged`. */
export function splitLabelKey(labelKey: string): { scope: string | null; key: string } {
  const at = labelKey.indexOf(':');
  return at > 0
    ? { scope: labelKey.slice(0, at), key: labelKey.slice(at + 1) }
    : { scope: null, key: labelKey };
}

interface RenderedItem {
  readonly item: TimelineItem;
  readonly text: string;
  readonly changes: readonly string[];
}

/**
 * Activity timeline of any record (F3 timeline API): domain events rendered
 * with their module's scoped timeline text (the module's Transloco scope is
 * loaded on demand), optionally interleaved with audit-log rows for users who
 * hold `audit:read`. Newest first, paged with "Show older activity".
 */
@Component({
  selector: 'app-timeline',
  imports: [TranslocoPipe, LocalDatePipe, RelativeTimePipe, Button],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'kit.timeline.title' | transloco }}
        </h2>
        @if (canAudit()) {
          <label class="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="withAudit()"
              (change)="withAudit.set($any($event.target).checked)"
              data-testid="timeline-audit"
            />
            {{ 'kit.timeline.includeAudit' | transloco }}
          </label>
        }
      </div>

      @if (loading()) {
        <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (loadErrorKey(); as key) {
        <p class="text-[13px] text-fg-muted">{{ key | transloco }}</p>
      } @else if (rendered().length === 0) {
        <div
          class="rounded-[10px] border border-dashed border-border px-4 py-5"
          data-testid="timeline-empty"
        >
          <p class="text-[13.5px] font-semibold text-fg">{{ 'kit.timeline.empty' | transloco }}</p>
          <p class="mt-1 text-[12.5px] text-fg-muted">
            {{ 'kit.timeline.emptyHint' | transloco }}
          </p>
        </div>
      } @else {
        <ol class="relative flex flex-col gap-3 border-l border-border pl-4">
          @for (entry of rendered(); track entry.item.source + entry.item.id) {
            <li class="relative" data-testid="timeline-item">
              <span
                class="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface"
                [class]="entry.item.source === 'audit' ? 'bg-fg-subtle' : 'bg-accent'"
                aria-hidden="true"
              ></span>
              <p class="text-[13px] text-fg">{{ entry.text }}</p>
              @if (entry.changes.length > 0) {
                <ul class="mt-0.5 flex flex-col text-[12px] text-fg-muted">
                  @for (change of entry.changes; track $index) {
                    <li class="break-words">{{ change }}</li>
                  }
                </ul>
              }
              <time
                class="text-[11.5px] text-fg-subtle"
                [attr.datetime]="entry.item.created_at"
                [title]="entry.item.created_at | localDate: 'medium'"
                >{{ entry.item.created_at | relativeTime: lang() : now() }}</time
              >
            </li>
          }
        </ol>
        @if (nextBefore()) {
          <div class="mt-3">
            <app-button
              size="sm"
              variant="secondary"
              [loading]="loadingMore()"
              (click)="loadMore()"
              data-testid="timeline-more"
            >
              {{ 'kit.timeline.loadMore' | transloco }}
            </app-button>
          </div>
        }
        @if (moreErrorKey(); as key) {
          <p class="mt-2 text-[12.5px] text-fail">{{ key | transloco }}</p>
        }
      }
    </section>
  `,
})
export class Timeline {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly entityTypes = inject(EntityTypesService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Interleave audit-log rows (shown only to users holding `audit:read`). */
  readonly includeAudit = input(false);

  protected readonly headingId = `cf-timeline-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly items = signal<readonly TimelineItem[]>([]);
  protected readonly nextBefore = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly loadErrorKey = signal<string | null>(null);
  protected readonly moreErrorKey = signal<string | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly lang = this.language.active;

  protected readonly canAudit = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('audit:read'),
  );
  /** The user's audit toggle, starting from the `includeAudit` input. */
  protected readonly withAudit = linkedSignal(() => this.includeAudit());

  /** `scope/lang` paths whose translations have been loaded (or failed to). */
  private readonly loadedScopes = signal<ReadonlySet<string>>(new Set());
  private readonly requestedScopes = new Set<string>();

  protected readonly rendered = computed<readonly RenderedItem[]>(() => {
    this.loadedScopes();
    const lang = this.lang();
    return this.items().map((item) => this.render(item, lang));
  });

  private loadSub: Subscription | null = null;

  constructor() {
    this.entityTypes.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      const audit = this.withAudit() && this.canAudit();
      untracked(() => this.load(orgId, entityType, entityId, audit));
    });
    // Load each module scope the visible events need, in the active language.
    effect(() => {
      const lang = this.lang();
      for (const item of this.items()) {
        const scope = item.label_key ? splitLabelKey(item.label_key).scope : null;
        if (scope) {
          untracked(() => this.ensureScope(scope, lang));
        }
      }
    });
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  protected loadMore(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const before = this.nextBefore();
    if (!orgId || !before || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.moreErrorKey.set(null);
    this.api
      .timeline(orgId, this.entityType(), this.entityId(), {
        limit: PAGE_SIZE,
        before,
        includeAudit: this.withAudit() && this.canAudit(),
      })
      .subscribe({
        next: (page) => {
          this.loadingMore.set(false);
          const seen = new Set(this.items().map((i) => i.source + i.id));
          this.items.update((list) => [
            ...list,
            ...page.items.filter((i) => !seen.has(i.source + i.id)),
          ]);
          this.nextBefore.set(page.next_before);
        },
        error: (error: unknown) => {
          this.loadingMore.set(false);
          this.moreErrorKey.set(kitErrorKey(error));
        },
      });
  }

  private render(item: TimelineItem, lang: string): RenderedItem {
    const actor = this.actorName(item);
    const empty = this.language.translate('kit.revisions.emptyValue');
    const changes = (item.changes ?? []).map((c) =>
      this.language.translate('kit.timeline.change', {
        field: humanize(c.field),
        before: inlineValue(c.before, empty),
        after: inlineValue(c.after, empty),
      }),
    );
    if (item.label_key) {
      const { scope, key } = splitLabelKey(item.label_key);
      const fullKey = scope ? `${camelCase(scope)}.${key}` : key;
      const loaded = !scope || this.loadedScopes().has(`${scope}/${lang}`) || scope === 'kit';
      if (loaded) {
        const text = this.language.translate(fullKey, this.params(item, actor));
        if (text && text !== fullKey) {
          return { item, text, changes };
        }
      }
    }
    const text = this.language.translate('kit.timeline.fallback', {
      actor,
      kind: item.source === 'audit' && item.summary ? item.summary : humanize(item.kind),
    });
    return { item, text, changes };
  }

  /** Event params plus display labels for entity / link types they carry. */
  private params(item: TimelineItem, actor: string): Record<string, unknown> {
    const params: Record<string, unknown> = { ...item.params, actor_name: actor };
    for (const [key, value] of Object.entries(item.params)) {
      if (typeof value !== 'string') {
        continue;
      }
      if (key === 'link_type') {
        const direction = item.params['direction'] === 'incoming' ? 'incoming' : 'outgoing';
        params['link_type_label'] = this.language.translate(linkTypeKey(value, direction));
      } else if (key.endsWith('_type') || key === 'entity_type') {
        params[`${key}_label`] = this.entityTypes.label(value);
      }
    }
    return params;
  }

  private actorName(item: TimelineItem): string {
    const named = item.params['actor_name'] ?? item.actor?.name;
    if (typeof named === 'string' && named) {
      return named;
    }
    if (item.actor?.kind === 'ai') {
      return this.language.translate('kit.timeline.assistant');
    }
    if (item.actor?.kind === 'system') {
      return this.language.translate('kit.timeline.system');
    }
    return this.language.translate('kit.timeline.someone');
  }

  private ensureScope(scope: string, lang: string): void {
    const path = `${scope}/${lang}`;
    if (scope === 'kit' || this.requestedScopes.has(path)) {
      return;
    }
    this.requestedScopes.add(path);
    const done = () => this.loadedScopes.update((set) => new Set([...set, path]));
    this.transloco.load(path).subscribe({ next: done, error: done });
  }

  private load(
    orgId: string | null,
    entityType: string,
    entityId: string,
    includeAudit: boolean,
  ): void {
    this.loadSub?.unsubscribe();
    this.items.set([]);
    this.nextBefore.set(null);
    this.loadErrorKey.set(null);
    this.moreErrorKey.set(null);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadSub = this.api
      .timeline(orgId, entityType, entityId, { limit: PAGE_SIZE, includeAudit })
      .subscribe({
        next: (page) => {
          this.now.set(Date.now());
          this.items.set(page.items);
          this.nextBefore.set(page.next_before);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loadErrorKey.set(kitErrorKey(error));
          this.loading.set(false);
        },
      });
  }
}
