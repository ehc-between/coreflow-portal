import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../../shared/ui/icon/icon';
import { ContextApi } from '../context/data/context-api';

/** Document types that context records are published as (U16). */
export const CONTEXT_DOCUMENT_TYPES = ['policy', 'scope', 'context_analysis'] as const;

/**
 * U16 — one policy concept. Shown above the documents list when it is filtered by
 * type (`/documents?type=policy`, which is also where `/context/policies` lands):
 * a removable "only policies" chip, a "New policy" action, and a "Lag utkast" row
 * for every policy type the enabled standards expect that has no approved policy yet.
 */
@Component({
  selector: 'app-policy-docs-bar',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('context')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-col gap-3" data-testid="policy-docs-bar">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="inline-flex h-8 items-center gap-2 rounded-full border border-accent-border bg-accent-soft px-3 text-ui font-semibold text-accent"
          data-testid="type-chip"
        >
          {{ 'context.policyDocs.type.' + typeKey() | transloco }}
          <button
            type="button"
            class="rounded-full p-0.5 hover:bg-bg"
            [attr.aria-label]="'context.policyDocs.showAll' | transloco"
            (click)="clear.emit()"
            data-testid="type-chip-clear"
          >
            <app-icon name="x" [size]="13" />
          </button>
        </span>
        @if (type() === 'policy' && canWriteContext()) {
          <a
            routerLink="/context/policies/new"
            class="inline-flex h-8 items-center gap-1 rounded-tile px-2 text-ui font-semibold text-accent hover:underline"
            data-testid="new-policy"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'context.policyDocs.newPolicy' | transloco }}
          </a>
        }
      </div>
      @if (type() === 'policy' && missing().length) {
        <div
          class="flex flex-col gap-2 rounded-tile border border-warn/40 bg-warn-soft p-3"
          data-testid="policy-gaps"
        >
          <p class="text-ui font-semibold text-warn-ink">
            {{ 'context.policyDocs.missingTitle' | transloco }}
          </p>
          <ul class="flex flex-col gap-1">
            @for (kind of missing(); track kind) {
              <li class="flex flex-wrap items-center justify-between gap-2 text-ui text-fg">
                <span>{{ 'context.policyKinds.' + kind | transloco }}</span>
                @if (canWriteContext()) {
                  <a
                    routerLink="/context/policies/new"
                    [queryParams]="{ kind }"
                    class="font-semibold text-accent hover:underline"
                    [attr.data-testid]="'draft-' + kind"
                  >
                    {{ 'context.policyDocs.draft' | transloco }} →
                  </a>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class PolicyDocsBar {
  private readonly contextApi = inject(ContextApi);
  private readonly modules = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** The `?type=` the documents list is filtered by. */
  readonly type = input.required<string>();
  /** Remove the type filter (show every document). */
  readonly clear = output<void>();

  protected readonly missing = signal<readonly string[]>([]);

  protected readonly typeKey = computed(() =>
    (CONTEXT_DOCUMENT_TYPES as readonly string[]).includes(this.type()) ? this.type() : 'other',
  );
  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  private readonly contextOn = computed(
    () => this.modules.isEnabled('context') && this.permissions().includes('context:read'),
  );
  protected readonly canWriteContext = computed(
    () => this.contextOn() && this.permissions().includes('context:write'),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const wanted = this.type() === 'policy' && this.contextOn();
      untracked(() => {
        this.missing.set([]);
        if (!orgId || !wanted) {
          return;
        }
        this.contextApi.overview(orgId).subscribe({
          next: (overview) => this.missing.set(overview.policy_kinds_missing ?? []),
          error: () => this.missing.set([]),
        });
      });
    });
  }
}
