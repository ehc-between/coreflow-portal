import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { entityTypeLabelKey, groupMappings } from '../../../core/standards/frameworks-data';
import { StandardsApi } from '../../../core/standards/standards-api';
import { localized } from '../../../core/standards/standards-data';
import {
  ClauseMappingItem,
  ClauseSupport,
  LocalizedText,
  StandardSummary,
} from '../../../core/standards/standards.models';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';

type PanelState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'loaded';
      /** null = the mappings call failed. */
      readonly mappings: readonly ClauseMappingItem[] | null;
      /** null = the clause-support call failed. */
      readonly support: ClauseSupport | null;
      readonly standards: readonly StandardSummary[];
    };

/**
 * "Also satisfies" for one clause of the workspace: the clauses of other
 * frameworks it maps to (shared Harmonised Structure clauses first, then
 * curated mappings), each linking into that standard's workspace, plus which
 * modules' records can be evidence for it. Collapsed by default and loaded on
 * first open, so a long standard does not fire one request per clause.
 */
@Component({
  selector: 'app-clause-mappings',
  imports: [RouterLink, TranslocoPipe, Badge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-tile border border-border bg-surface-2/60">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-fg"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId()"
        (click)="toggle()"
      >
        <span class="flex text-fg-subtle"><app-icon name="link" [size]="15" /></span>
        <span class="flex-1">{{ 'standards.mappings.title' | transloco }}</span>
        <app-icon
          name="chevron"
          [size]="14"
          class="text-fg-subtle"
          [class]="open() ? 'rotate-180' : ''"
        />
      </button>
      @if (open()) {
        <div [id]="panelId()" class="px-3.5 pb-3.5" aria-live="polite">
          @let s = state();
          @if (s.status === 'loaded') {
            @if (s.mappings === null) {
              <p class="text-[13px] text-fail" role="alert">
                {{ 'standards.mappings.error' | transloco }}
              </p>
            } @else if (s.mappings.length === 0) {
              <p class="text-[13px] text-fg-muted">{{ 'standards.mappings.none' | transloco }}</p>
            } @else {
              <p class="mb-2 text-[12.5px] text-fg-muted">
                {{ 'standards.mappings.hint' | transloco }}
              </p>
              @for (group of groups(); track group.relation) {
                <div
                  class="mt-2 mb-1 text-[11.5px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                >
                  {{ 'standards.mappings.relation.' + group.relation | transloco }}
                </div>
                <ul class="flex flex-col gap-1.5">
                  @for (item of group.items; track item.standard_key + ':' + item.number) {
                    <li class="rounded-tile border border-border bg-surface px-2.5 py-1.5">
                      <div class="flex flex-wrap items-center gap-2">
                        <a
                          [routerLink]="['/standards', item.standard_key, item.number]"
                          class="min-w-0 flex-1 text-[13px] font-medium text-fg hover:text-accent hover:underline"
                        >
                          <span class="text-fg-subtle">{{ nameOf(item.standard_key) }}</span>
                          · <span class="font-mono">{{ item.number }}</span>
                          {{ text(item.title) }}
                        </a>
                        @if (item.source === 'hs') {
                          <span [title]="'standards.mappings.source.hs' | transloco">
                            <app-badge tone="info">{{
                              'standards.mappings.hsBadge' | transloco
                            }}</app-badge>
                          </span>
                        }
                        @if (!isEnabled(item.standard_key)) {
                          <app-badge>{{ 'standards.mappings.notEnabled' | transloco }}</app-badge>
                        }
                      </div>
                      @if (text(item.note); as note) {
                        <p class="mt-1 text-[12.5px] leading-[1.55] text-fg-muted">{{ note }}</p>
                      }
                    </li>
                  }
                </ul>
              }
              @if (!aiUnavailable()) {
                <button
                  type="button"
                  class="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
                  (click)="askHowTheyRelate()"
                >
                  <app-icon name="spark" [size]="13" />
                  {{ 'standards.mappings.ask' | transloco }}
                </button>
              }
            }

            <div
              class="mt-4 mb-1 text-[11.5px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
            >
              {{ 'standards.support.title' | transloco }}
            </div>
            @if (s.support === null) {
              <p class="text-[12.5px] text-fail">{{ 'standards.support.error' | transloco }}</p>
            } @else if (s.support.modules.length === 0) {
              <p class="text-[12.5px] text-fg-muted">{{ 'standards.support.none' | transloco }}</p>
            } @else {
              <ul class="flex flex-wrap gap-1.5">
                @for (module of s.support.modules; track module.key) {
                  @for (type of module.entity_types; track type) {
                    <li>
                      <app-badge [tone]="module.enabled ? 'pass' : 'neutral'">
                        {{ labelKey(type) | transloco }}
                        @if (!module.enabled) {
                          <span class="font-normal">
                            · {{ 'standards.support.moduleOff' | transloco }}</span
                          >
                        }
                      </app-badge>
                    </li>
                  }
                }
              </ul>
            }
          } @else {
            <p class="text-[13px] text-fg-muted">{{ 'standards.mappings.loading' | transloco }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class ClauseMappings {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  protected readonly aiUnavailable = inject(AiAvailability).unavailable;

  readonly standardKey = input.required<string>();
  readonly number = input.required<string>();

  protected readonly open = signal(false);
  protected readonly state = signal<PanelState>({ status: 'idle' });
  protected readonly panelId = computed(
    () => `map-${this.number().replace(/[^A-Za-z0-9_-]/g, '_')}`,
  );

  protected readonly groups = computed(() => {
    const s = this.state();
    return s.status === 'loaded' && s.mappings ? groupMappings(s.mappings) : [];
  });
  private readonly standardsByKey = computed(() => {
    const s = this.state();
    return new Map((s.status === 'loaded' ? s.standards : []).map((x) => [x.key, x]));
  });

  protected readonly labelKey = entityTypeLabelKey;

  private sub: Subscription | null = null;
  /** Which clause the loaded state belongs to (inputs can change while reused). */
  private loadedFor: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    const target = `${this.selectedOrg.currentOrgId()}|${this.standardKey()}|${this.number()}`;
    if (next && this.loadedFor !== target) {
      this.load(target);
    }
  }

  protected text(value: LocalizedText | null | undefined): string {
    return localized(value, this.language.active());
  }

  protected nameOf(key: string): string {
    return this.standardsByKey().get(key)?.name ?? key;
  }

  protected isEnabled(key: string): boolean {
    // Unknown until the standards list loads: don't flag anything.
    return this.standardsByKey().get(key)?.enabled ?? true;
  }

  protected askHowTheyRelate(): void {
    const targets = this.groups()
      .flatMap((g) => g.items)
      .map((i) => `${this.nameOf(i.standard_key)} ${i.number} ${this.text(i.title)}`)
      .join('; ');
    this.ask.showWith(
      this.transloco.translate('standards.mappings.askPrompt', {
        number: this.number(),
        standard: this.nameOf(this.standardKey()),
        targets,
      }),
    );
  }

  private load(target: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.sub?.unsubscribe();
    this.loadedFor = target;
    this.state.set({ status: 'loading' });
    const key = this.standardKey();
    const number = this.number();
    this.sub = forkJoin({
      mappings: this.api
        .clauseMappings(orgId, key, number)
        .pipe(catchError(() => of(null as ClauseMappingItem[] | null))),
      support: this.api
        .clauseSupport(orgId, `${key}:${number}`)
        .pipe(catchError(() => of(null as ClauseSupport | null))),
      standards: this.api.list(orgId).pipe(catchError(() => of([] as StandardSummary[]))),
    })
      .pipe(map((loaded) => ({ status: 'loaded' as const, ...loaded })))
      .subscribe((loaded) => {
        this.state.set(loaded);
        if (loaded.mappings === null) {
          // Let a later open retry.
          this.loadedFor = null;
        }
      });
  }
}
