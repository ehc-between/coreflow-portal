import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { hasAnyPermission } from '../../../core/auth/permission';
import { ModulesApi } from '../../../core/modules/modules-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { Icon } from '../../../shared/ui/icon/icon';

const DISMISS_PREFIX = 'coreflow.setupBanner.dismissed.';

/**
 * Dashboard banner offering the setup wizard to `org:manage` users while the
 * org's setup isn't complete. No forced redirect; dismissable for the session.
 */
@Component({
  selector: 'app-setup-banner',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('modules')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <section
        class="flex flex-col gap-3 rounded-card border border-accent-border bg-accent-soft px-4 py-3.5 sm:flex-row sm:items-center"
        aria-labelledby="setup-banner-title"
        data-testid="setup-banner"
      >
        <span class="flex flex-none text-accent" aria-hidden="true">
          <app-icon name="spark" [size]="20" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 id="setup-banner-title" class="text-[14px] font-bold text-fg">
            {{ 'modules.banner.title' | transloco }}
          </h2>
          <p class="text-[13px] text-fg-muted">{{ 'modules.banner.body' | transloco }}</p>
        </div>
        <div class="flex flex-none gap-2">
          <a
            routerLink="/setup"
            class="inline-flex h-9 items-center rounded-tile border border-transparent bg-accent px-4 text-[13.5px] font-semibold text-white hover:bg-accent-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {{ 'modules.banner.start' | transloco }}
          </a>
          <button
            type="button"
            class="inline-flex h-9 items-center rounded-tile px-3 text-[13px] font-semibold text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            (click)="dismiss()"
          >
            {{ 'modules.banner.later' | transloco }}
          </button>
        </div>
      </section>
    }
  `,
})
export class SetupBanner {
  private readonly api = inject(ModulesApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly canManage = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'org:manage'),
  );
  /** Org ids whose setup is still open (answered by `GET /setup`). */
  private readonly pending = signal<string | null>(null);
  private readonly dismissed = signal(false);

  protected readonly show = computed(
    () =>
      this.canManage() &&
      !this.dismissed() &&
      this.pending() !== null &&
      this.pending() === this.selectedOrg.currentOrgId(),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canManage = this.canManage();
      untracked(() => {
        this.pending.set(null);
        this.dismissed.set(!!orgId && readDismissed(orgId));
        if (!orgId || !canManage) {
          return;
        }
        this.api.setup(orgId).subscribe({
          next: (state) => {
            if (!state.completed_at && this.selectedOrg.currentOrgId() === orgId) {
              this.pending.set(orgId);
            }
          },
          // Older backends without the setup API: offer nothing.
          error: () => undefined,
        });
      });
    });
  }

  protected dismiss(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.dismissed.set(true);
    if (orgId) {
      try {
        globalThis.sessionStorage?.setItem(DISMISS_PREFIX + orgId, '1');
      } catch {
        // Best-effort.
      }
    }
  }
}

function readDismissed(orgId: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(DISMISS_PREFIX + orgId) === '1';
  } catch {
    return false;
  }
}
