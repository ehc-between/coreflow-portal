import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { localized, pctColor } from '../../core/standards/standards-data';
import { ClauseDetail, RequirementDetail } from '../../core/standards/standards.models';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressRing } from '../../shared/ui/progress-ring/progress-ring';
import { RequirementCard, requirementAnchorId } from './requirement-card';
import { themeKey } from './standard-themes';

/**
 * A clause (or Annex A control) of a standard: our own explanation of it (in
 * the active language), the org's own licensed text when they have uploaded
 * their copy (clearly labelled as such), its sub-clauses, and one card per
 * requirement (evidence, AI suggestions, assessment). `?req=<ref>` scrolls to
 * and highlights a requirement. Navigates back to the overview on org switch.
 */
@Component({
  selector: 'app-clause-detail',
  imports: [RouterLink, TranslocoPipe, Badge, Card, Icon, ProgressRing, RequirementCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-8 pt-7 pb-12">
      <a
        [routerLink]="['/standards', key()]"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'standards.backToStandard' | transloco }}
      </a>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (clause(); as c) {
        <div class="mb-[18px] flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="mb-1 flex flex-wrap items-center gap-2">
              <span class="font-mono text-[13px] text-fg-subtle">{{ c.number }}</span>
              @if (c.kind === 'annex_control') {
                <app-badge tone="info">{{ 'standards.clause.control' | transloco }}</app-badge>
              }
              @if (c.theme) {
                <app-badge tone="neutral">
                  @if (themeKey(c.theme); as k) {
                    {{ k | transloco }}
                  } @else {
                    {{ c.theme }}
                  }
                </app-badge>
              }
            </div>
            <h1 class="font-display text-[24px] font-bold tracking-[-0.025em] text-fg">
              {{ c.title }}
            </h1>
          </div>
          @if (c.rollup.applicable > 0) {
            <app-progress-ring
              [value]="c.rollup.pct"
              [size]="60"
              [color]="pctColor(c.rollup.pct)"
              [label]="'standards.completeness' | transloco"
            />
          }
        </div>

        <div class="flex flex-col gap-5">
          @if (summary(); as text) {
            <app-card>
              <h2 class="mb-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
                {{ 'standards.clause.explanation' | transloco }}
              </h2>
              <p class="mb-2 text-[11.5px] text-fg-subtle">
                {{ 'standards.clause.explanationHint' | transloco }}
              </p>
              <p class="text-[14px] leading-relaxed whitespace-pre-line text-fg">{{ text }}</p>
            </app-card>
          }

          @if (c.licensed_text) {
            <app-card>
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <h2 class="font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
                  {{ 'standards.clause.licensedText' | transloco }}
                </h2>
                <app-badge tone="accent">
                  <app-icon name="lock" [size]="12" />
                  {{ 'standards.clause.licensedBadge' | transloco }}
                </app-badge>
              </div>
              <p class="mb-2 text-[11.5px] text-fg-subtle">
                {{ 'standards.clause.licensedHint' | transloco }}
              </p>
              <blockquote
                class="border-l-2 border-accent-border pl-3 text-[13.5px] leading-relaxed whitespace-pre-line text-fg"
              >
                {{ c.licensed_text }}
              </blockquote>
            </app-card>
          }

          @if (c.children.length > 0) {
            <app-card [padded]="false">
              <h2
                class="px-4 pt-3.5 pb-2 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'standards.clause.subclauses' | transloco }}
              </h2>
              <ul class="px-2 pb-2">
                @for (child of c.children; track child.number) {
                  <li>
                    <a
                      [routerLink]="['/standards', key(), 'clauses', child.number]"
                      class="flex items-center gap-2 rounded-[8px] px-2 py-1.5 hover:bg-surface-2"
                    >
                      <span class="w-14 flex-none font-mono text-[12px] text-fg-subtle">{{
                        child.number
                      }}</span>
                      <span class="min-w-0 flex-1 truncate text-[13.5px] text-fg">{{
                        child.title
                      }}</span>
                      @if (child.rollup.applicable > 0) {
                        <span class="text-[12px] font-semibold text-fg-muted"
                          >{{ child.rollup.pct }}%</span
                        >
                      }
                    </a>
                  </li>
                }
              </ul>
            </app-card>
          }

          @if (c.requirements.length > 0) {
            <h2 class="-mb-2 font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
              {{ 'standards.clause.requirements' | transloco: { count: c.requirements.length } }}
            </h2>
            @for (req of c.requirements; track req.ref) {
              <app-requirement-card
                [requirement]="req"
                [canManage]="canManage()"
                [highlighted]="req.ref === highlightRef()"
                (updated)="onRequirementUpdated($event)"
                (linksChanged)="refresh()"
              />
            }
          } @else if (c.children.length === 0) {
            <app-card>
              <p class="py-4 text-center text-[13.5px] text-fg-muted">
                {{ 'standards.clause.noRequirements' | transloco }}
              </p>
            </app-card>
          }
        </div>
      } @else {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'standards.clause.notFound' | transloco }}
          </div>
        </app-card>
      }
    </div>
  `,
})
export class ClauseDetailPage {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  /** Route params / query. */
  readonly key = input.required<string>();
  readonly number = input.required<string>();
  readonly req = input<string | undefined>(undefined);

  protected readonly clause = signal<ClauseDetail | null>(null);
  protected readonly loading = signal(true);

  protected readonly pctColor = pctColor;
  protected readonly themeKey = themeKey;
  protected readonly highlightRef = computed(() => this.req() ?? null);

  protected readonly summary = computed(() =>
    localized(this.clause()?.summary, this.language.active()),
  );

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('standards:manage'),
  );

  private sub: Subscription | null = null;
  private loadedOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = this.key();
      const number = this.number();
      if (this.loadedOrgId !== null && orgId !== this.loadedOrgId) {
        void this.router.navigateByUrl('/standards');
        return;
      }
      untracked(() => this.load(orgId, key, number, true));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected onRequirementUpdated(updated: RequirementDetail): void {
    this.clause.update((c) =>
      c
        ? {
            ...c,
            requirements: c.requirements.map((r) => (r.ref === updated.ref ? updated : r)),
          }
        : c,
    );
    this.refresh();
  }

  /** Quietly re-fetch (status + roll-ups are recomputed server-side). */
  protected refresh(): void {
    this.load(this.selectedOrg.currentOrgId(), this.key(), this.number(), false);
  }

  private load(orgId: string | null, key: string, number: string, initial: boolean): void {
    this.sub?.unsubscribe();
    this.loadedOrgId = orgId;
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    if (initial) {
      this.loading.set(true);
    }
    this.sub = this.api.getClause(orgId, key, number).subscribe({
      next: (clause) => {
        this.clause.set(clause);
        this.loading.set(false);
        if (initial) {
          this.scrollToHighlight();
        }
      },
      error: () => {
        if (initial) {
          this.clause.set(null);
        }
        this.loading.set(false);
      },
    });
  }

  private scrollToHighlight(): void {
    const ref = this.highlightRef();
    if (!ref) {
      return;
    }
    afterNextRender(
      () => {
        this.document
          .getElementById(requirementAnchorId(ref))
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      { injector: this.injector },
    );
  }
}
