import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { ChapterBar, chapterBars, pctColor } from '../../core/standards/standards-data';
import { ClauseNode, StandardSummary } from '../../core/standards/standards.models';
import { LanguageService } from '../../core/i18n/language.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { ProgressRing } from '../../shared/ui/progress-ring/progress-ring';

/**
 * ISO & standards overview for the current org: every enabled standard as a
 * card with its completeness ring, status counts and per-chapter bars (from the
 * clause tree), plus the catalogue of standards that can be switched on.
 * Enabling / disabling needs `standards:manage`. Reloads on org switch.
 */
@Component({
  selector: 'app-standards-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Badge,
    Button,
    Card,
    Icon,
    ProgressBar,
    ProgressRing,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-8 pt-7 pb-12">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'standards.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">
          {{ 'standards.subtitle' | transloco }}
        </div>
      </div>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (loadError()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'standards.loadError' | transloco }}
          </div>
        </app-card>
      } @else {
        @if (enabled().length === 0) {
          <app-card>
            <div class="flex flex-col items-center gap-2 py-10 text-center">
              <span class="flex text-fg-subtle"><app-icon name="iso" [size]="28" /></span>
              <p class="text-[14px] font-semibold text-fg">
                {{ 'standards.overview.noneEnabled' | transloco }}
              </p>
              <p class="max-w-md text-[13px] text-fg-muted">
                {{ 'standards.overview.noneEnabledHint' | transloco }}
              </p>
            </div>
          </app-card>
        } @else {
          <div class="grid gap-5 md:grid-cols-2">
            @for (std of enabled(); track std.key) {
              <app-card>
                <div class="flex items-start gap-4">
                  <app-progress-ring
                    [value]="std.completeness.pct"
                    [size]="76"
                    [color]="pctColor(std.completeness.pct)"
                    [label]="'standards.completeness' | transloco"
                  />
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/standards', std.key]"
                      class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg hover:text-accent"
                    >
                      {{ std.name }}
                    </a>
                    <div class="text-[12.5px] text-fg-subtle">
                      {{ 'standards.edition' | transloco: { edition: std.edition } }}
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <app-badge tone="pass">
                        {{
                          'standards.counts.covered'
                            | transloco: { count: std.completeness.covered }
                        }}
                      </app-badge>
                      <app-badge tone="warn">
                        {{
                          'standards.counts.partial'
                            | transloco: { count: std.completeness.partial }
                        }}
                      </app-badge>
                      <app-badge tone="fail">
                        {{
                          'standards.counts.not_started'
                            | transloco: { count: std.completeness.not_started }
                        }}
                      </app-badge>
                      @if (std.completeness.not_applicable > 0) {
                        <app-badge tone="neutral">
                          {{
                            'standards.counts.not_applicable'
                              | transloco: { count: std.completeness.not_applicable }
                          }}
                        </app-badge>
                      }
                    </div>
                  </div>
                </div>

                @if (bars()[std.key]; as list) {
                  <ul
                    class="mt-4 flex flex-col gap-2"
                    [attr.aria-label]="'standards.overview.chapters' | transloco"
                  >
                    @for (bar of list; track bar.number) {
                      <li>
                        <div class="mb-1 flex items-center gap-2 text-[12.5px]">
                          <span class="w-9 flex-none font-mono text-fg-subtle">{{
                            bar.number
                          }}</span>
                          <span class="min-w-0 flex-1 truncate text-fg" [title]="bar.title">{{
                            bar.title
                          }}</span>
                          <span class="flex-none font-semibold text-fg-muted">{{ bar.pct }}%</span>
                        </div>
                        <app-progress-bar
                          [value]="bar.pct"
                          [color]="pctColor(bar.pct)"
                          [label]="bar.number + ' ' + bar.title"
                        />
                      </li>
                    }
                  </ul>
                }

                <div class="mt-4 flex items-center justify-between gap-2">
                  <a [routerLink]="['/standards', std.key]">
                    <app-button variant="secondary" size="sm">
                      {{ 'standards.overview.open' | transloco }}
                      <app-icon name="arrow" [size]="14" />
                    </app-button>
                  </a>
                  <app-button
                    *appHasPermission="'standards:manage'"
                    variant="ghost"
                    size="sm"
                    [loading]="togglingKey() === std.key"
                    (click)="setEnabled(std, false)"
                  >
                    {{ 'standards.overview.disable' | transloco }}
                  </app-button>
                </div>
              </app-card>
            }
          </div>
        }

        @if (available().length > 0) {
          <h2 class="mt-8 mb-3 font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
            {{ 'standards.overview.available' | transloco }}
          </h2>
          <app-card [padded]="false">
            <ul class="divide-y divide-border">
              @for (std of available(); track std.key) {
                <li class="flex items-center gap-3 px-4 py-3">
                  <span class="flex flex-none text-fg-subtle"
                    ><app-icon name="iso" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[13.5px] font-semibold text-fg">{{ std.name }}</span>
                    <span class="block text-[12px] text-fg-subtle">{{
                      'standards.edition' | transloco: { edition: std.edition }
                    }}</span>
                  </span>
                  <app-button
                    *appHasPermission="'standards:manage'"
                    size="sm"
                    [loading]="togglingKey() === std.key"
                    (click)="setEnabled(std, true)"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'standards.overview.enable' | transloco }}
                  </app-button>
                </li>
              }
            </ul>
          </app-card>
        }

        @if (toggleError()) {
          <p class="mt-3 text-[13px] text-fail" role="alert">
            {{ 'standards.overview.toggleError' | transloco }}
          </p>
        }
      }
    </div>
  `,
})
export class StandardsOverview {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly standards = signal<readonly StandardSummary[]>([]);
  private readonly trees = signal<Readonly<Record<string, readonly ClauseNode[]>>>({});
  /** Per-chapter bars, re-titled on language switch. */
  protected readonly bars = computed(() => {
    const lang = this.language.active();
    const out: Record<string, readonly ChapterBar[]> = {};
    for (const [key, tree] of Object.entries(this.trees())) {
      out[key] = chapterBars(tree, lang);
    }
    return out;
  });
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly togglingKey = signal<string | null>(null);
  protected readonly toggleError = signal(false);

  protected readonly enabled = computed(() => this.standards().filter((s) => s.enabled));
  protected readonly available = computed(() => this.standards().filter((s) => !s.enabled));

  protected readonly pctColor = pctColor;

  private sub: Subscription | null = null;
  private barsSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.barsSub?.unsubscribe();
    });
  }

  protected setEnabled(std: StandardSummary, enabled: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.togglingKey()) {
      return;
    }
    this.togglingKey.set(std.key);
    this.toggleError.set(false);
    this.api.setEnabled(orgId, std.key, enabled).subscribe({
      next: () => {
        this.togglingKey.set(null);
        this.load(orgId);
      },
      error: () => {
        this.togglingKey.set(null);
        this.toggleError.set(true);
      },
    });
  }

  private load(orgId: string | null): void {
    this.sub?.unsubscribe();
    this.barsSub?.unsubscribe();
    this.standards.set([]);
    this.trees.set({});
    this.loadError.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = this.api.list(orgId).subscribe({
      next: (list) => {
        this.standards.set(list);
        this.loading.set(false);
        this.loadBars(
          orgId,
          list.filter((s) => s.enabled),
        );
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  /** Per-chapter bars come from each enabled standard's tree (best-effort). */
  private loadBars(orgId: string, enabled: readonly StandardSummary[]): void {
    if (enabled.length === 0) {
      return;
    }
    const requests = Object.fromEntries(
      enabled.map((s) => [s.key, this.api.getTree(orgId, s.key).pipe(catchError(() => of(null)))]),
    );
    this.barsSub = forkJoin(requests).subscribe((trees) => {
      const out: Record<string, readonly ClauseNode[]> = {};
      for (const [key, tree] of Object.entries(trees)) {
        if (tree) {
          out[key] = tree;
        }
      }
      this.trees.set(out);
    });
  }
}
