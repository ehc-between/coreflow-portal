import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { RevisionCompare, RevisionDetail, RevisionSummary } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { LocalDatePipe } from '../locale/locale-pipes';
import { Alert } from '../ui/alert/alert';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { DisplayValue, displayValue, fieldLabel } from './kit-format';
import { provideKitScope } from './kit-scope';

/** What the detail panel shows: a comparison, or one revision's contents. */
type RevisionView =
  | { readonly kind: 'compare'; readonly data: RevisionCompare }
  | { readonly kind: 'snapshot'; readonly data: RevisionDetail };

interface ViewRow {
  readonly field: string;
  readonly label: string;
  readonly before: DisplayValue | null;
  readonly after: DisplayValue;
}

/**
 * Revision history of a controlled record (F8 revisions): who changed which
 * fields, when and why, newest first. "Show changes" compares a revision with
 * the one before it; ticking any two revisions compares them side by side;
 * the first revision can be shown in full. `fieldLabels` maps snapshot field
 * names to i18n keys (unmapped fields are humanized).
 */
@Component({
  selector: 'app-revision-history',
  imports: [NgTemplateOutlet, TranslocoPipe, LocalDatePipe, Alert, Button, Icon],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'kit.revisions.title' | transloco }}
        </h2>
        @if (revisions().length > 1) {
          <app-button
            size="sm"
            variant="secondary"
            [disabled]="selected().length !== 2 || viewLoading()"
            (click)="compareSelected()"
            data-testid="revisions-compare"
          >
            {{ 'kit.revisions.compareSelected' | transloco }}
          </app-button>
        }
      </div>

      @if (loading()) {
        <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (loadErrorKey(); as key) {
        <p class="text-[13px] text-fg-muted">{{ key | transloco }}</p>
      } @else if (revisions().length === 0) {
        <div
          class="rounded-[10px] border border-dashed border-border px-4 py-5"
          data-testid="revisions-empty"
        >
          <p class="text-[13.5px] font-semibold text-fg">
            {{ 'kit.revisions.empty' | transloco }}
          </p>
          <p class="mt-1 text-[12.5px] text-fg-muted">
            {{ 'kit.revisions.emptyHint' | transloco }}
          </p>
        </div>
      } @else {
        @if (revisions().length > 1) {
          <p class="mb-2 text-[12.5px] text-fg-subtle">
            {{ 'kit.revisions.compareHint' | transloco }}
          </p>
        }
        <ol class="flex flex-col divide-y divide-border rounded-[10px] border border-border">
          @for (rev of revisions(); track rev.id; let i = $index) {
            <li class="flex gap-3 px-3 py-2.5" data-testid="revision">
              @if (revisions().length > 1) {
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 flex-none accent-[var(--accent)]"
                  [checked]="isSelected(rev.id)"
                  [disabled]="!isSelected(rev.id) && selected().length >= 2"
                  [attr.aria-label]="'kit.revisions.select' | transloco: { no: rev.revision_no }"
                  (change)="toggle(rev.id)"
                />
              }
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="text-[13.5px] font-semibold text-fg">{{
                    'kit.revisions.revision' | transloco: { no: rev.revision_no }
                  }}</span>
                  <span class="text-[12px] text-fg-muted">{{ actorText(rev) }}</span>
                  <time class="text-[12px] text-fg-subtle" [attr.datetime]="rev.created_at">{{
                    rev.created_at | localDate: 'medium'
                  }}</time>
                </div>
                <p class="mt-0.5 text-[12.5px] text-fg-muted">
                  @if (rev.revision_no === 1) {
                    {{ 'kit.revisions.created' | transloco }}
                  } @else {
                    {{ 'kit.revisions.changed' | transloco: { fields: changedText(rev) } }}
                  }
                </p>
                @if (rev.change_reason) {
                  <p class="mt-0.5 text-[12.5px] whitespace-pre-wrap text-fg">
                    {{ 'kit.revisions.reason' | transloco: { reason: rev.change_reason } }}
                  </p>
                }
              </div>
              <div class="flex-none">
                @if (i < revisions().length - 1) {
                  <button
                    type="button"
                    class="text-[12px] font-semibold text-accent hover:underline disabled:opacity-60"
                    [disabled]="viewLoading()"
                    (click)="compareWithPrevious(i)"
                  >
                    {{ 'kit.revisions.showChanges' | transloco }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="text-[12px] font-semibold text-accent hover:underline disabled:opacity-60"
                    [disabled]="viewLoading()"
                    (click)="showSnapshot(rev)"
                  >
                    {{ 'kit.revisions.showSnapshot' | transloco }}
                  </button>
                }
              </div>
            </li>
          }
        </ol>

        @if (viewErrorKey(); as key) {
          <div class="mt-3">
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          </div>
        }

        @if (viewLoading()) {
          <p class="mt-3 text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (view(); as v) {
          <div
            class="mt-4 rounded-[10px] border border-border bg-surface-2/40"
            data-testid="revision-view"
            aria-live="polite"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"
            >
              <h3 class="text-[13.5px] font-semibold text-fg">
                @if (v.kind === 'compare') {
                  {{
                    'kit.revisions.comparing'
                      | transloco: { from: v.data.from.revision_no, to: v.data.to.revision_no }
                  }}
                } @else {
                  {{ 'kit.revisions.snapshotTitle' | transloco: { no: v.data.revision_no } }}
                }
              </h3>
              <div class="flex items-center gap-2">
                @if (v.kind === 'compare' && aiAvailable() && v.data.changes.length > 0) {
                  <app-button size="sm" variant="ghost" (click)="explain(v.data)">
                    <app-icon name="spark" [size]="14" />
                    {{ 'kit.revisions.explain' | transloco }}
                  </app-button>
                }
                <app-button size="sm" variant="ghost" (click)="view.set(null)">
                  {{ 'kit.revisions.hide' | transloco }}
                </app-button>
              </div>
            </div>
            @if (rows().length === 0) {
              <p class="px-3 py-3 text-[13px] text-fg-muted">
                {{ 'kit.revisions.noChanges' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[480px] text-left text-[12.5px]">
                  <thead>
                    <tr class="text-[11.5px] tracking-[0.04em] text-fg-subtle uppercase">
                      <th scope="col" class="w-[24%] px-3 py-2 font-semibold">
                        {{ 'kit.revisions.field' | transloco }}
                      </th>
                      @if (v.kind === 'compare') {
                        <th scope="col" class="px-3 py-2 font-semibold">
                          {{ 'kit.revisions.before' | transloco: { no: v.data.from.revision_no } }}
                        </th>
                        <th scope="col" class="px-3 py-2 font-semibold">
                          {{ 'kit.revisions.after' | transloco: { no: v.data.to.revision_no } }}
                        </th>
                      } @else {
                        <th scope="col" class="px-3 py-2 font-semibold">
                          {{ 'kit.revisions.value' | transloco }}
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (row of rows(); track row.field) {
                      <tr class="align-top" data-testid="revision-row">
                        <th scope="row" class="px-3 py-2 font-semibold text-fg">{{ row.label }}</th>
                        @if (v.kind === 'compare') {
                          <td class="bg-fail-soft/40 px-3 py-2 text-fg">
                            <ng-container
                              *ngTemplateOutlet="valueTpl; context: { $implicit: row.before }"
                            />
                          </td>
                        }
                        <td
                          [class]="
                            v.kind === 'compare'
                              ? 'bg-pass-soft/40 px-3 py-2 text-fg'
                              : 'px-3 py-2 text-fg'
                          "
                        >
                          <ng-container
                            *ngTemplateOutlet="valueTpl; context: { $implicit: row.after }"
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      }
    </section>

    <ng-template #valueTpl let-value>
      @if (!value || value.empty) {
        <span class="text-fg-subtle italic">{{ 'kit.revisions.emptyValue' | transloco }}</span>
      } @else if (value.block) {
        <pre class="font-sans break-words whitespace-pre-wrap">{{ value.text }}</pre>
      } @else {
        <span class="break-words">{{ value.text }}</span>
      }
    </ng-template>
  `,
})
export class RevisionHistory {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Snapshot field name -> i18n key of its label. */
  readonly fieldLabels = input<Readonly<Record<string, string>> | undefined>(undefined);

  protected readonly headingId = `cf-revisions-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly revisions = signal<readonly RevisionSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly view = signal<RevisionView | null>(null);
  protected readonly viewLoading = signal(false);
  protected readonly viewErrorKey = signal<string | null>(null);

  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected readonly rows = computed<readonly ViewRow[]>(() => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const yes = this.language.translate('kit.revisions.yes');
    const no = this.language.translate('kit.revisions.no');
    if (view.kind === 'compare') {
      return view.data.changes.map((change) => ({
        field: change.field,
        label: this.label(change.field),
        before: displayValue(change.before, yes, no),
        after: displayValue(change.after, yes, no),
      }));
    }
    return Object.entries(view.data.snapshot).map(([field, value]) => ({
      field,
      label: this.label(field),
      before: null,
      after: displayValue(value, yes, no),
    }));
  });

  private loadSub: Subscription | null = null;
  private viewSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(orgId, entityType, entityId));
    });
    inject(DestroyRef).onDestroy(() => {
      this.loadSub?.unsubscribe();
      this.viewSub?.unsubscribe();
    });
  }

  protected actorText(rev: RevisionSummary): string {
    if (rev.actor.kind === 'ai') {
      return this.language.translate('kit.revisions.byAssistant');
    }
    if (rev.actor.kind === 'system') {
      return this.language.translate('kit.revisions.bySystem');
    }
    return rev.actor.name
      ? this.language.translate('kit.revisions.by', { name: rev.actor.name })
      : this.language.translate('kit.revisions.unknownActor');
  }

  protected changedText(rev: RevisionSummary): string {
    return rev.changed_fields.map((f) => this.label(f)).join(', ');
  }

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string): void {
    this.selected.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-2),
    );
  }

  protected compareSelected(): void {
    const [a, b] = this.selected()
      .map((id) => this.revisions().find((r) => r.id === id))
      .filter((r): r is RevisionSummary => !!r)
      .sort((x, y) => x.revision_no - y.revision_no);
    if (a && b) {
      this.compare(a.id, b.id);
    }
  }

  /** Revisions are newest first, so the previous one is the next in the list. */
  protected compareWithPrevious(index: number): void {
    const list = this.revisions();
    const current = list[index];
    const previous = list[index + 1];
    if (current && previous) {
      this.compare(previous.id, current.id);
    }
  }

  protected showSnapshot(rev: RevisionSummary): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.startView();
    this.viewSub = this.api.revision(orgId, rev.id).subscribe({
      next: (data) => this.finishView({ kind: 'snapshot', data }),
      error: (error: unknown) => this.failView(error),
    });
  }

  protected explain(data: RevisionCompare): void {
    this.ask.showWith(
      this.language.translate('kit.ai.explainRevisions', {
        from: data.from.revision_no,
        to: data.to.revision_no,
        type: this.entityTypes.label(this.entityType()),
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      }),
    );
  }

  private compare(fromId: string, toId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.startView();
    this.viewSub = this.api.compareRevisions(orgId, fromId, toId).subscribe({
      next: (data) => this.finishView({ kind: 'compare', data }),
      error: (error: unknown) => this.failView(error),
    });
  }

  private startView(): void {
    this.viewSub?.unsubscribe();
    this.viewLoading.set(true);
    this.viewErrorKey.set(null);
    this.view.set(null);
  }

  private finishView(view: RevisionView): void {
    this.viewLoading.set(false);
    this.view.set(view);
  }

  private failView(error: unknown): void {
    this.viewLoading.set(false);
    this.viewErrorKey.set(kitErrorKey(error));
  }

  private label(field: string): string {
    return fieldLabel(field, this.fieldLabels(), (key) => this.language.translate(key));
  }

  private load(orgId: string | null, entityType: string, entityId: string): void {
    this.loadSub?.unsubscribe();
    this.viewSub?.unsubscribe();
    this.revisions.set([]);
    this.selected.set([]);
    this.view.set(null);
    this.viewLoading.set(false);
    this.viewErrorKey.set(null);
    this.loadErrorKey.set(null);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadSub = this.api.revisions(orgId, entityType, entityId).subscribe({
      next: (list) => {
        this.revisions.set(list.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadErrorKey.set(kitErrorKey(error));
        this.loading.set(false);
      },
    });
  }
}
