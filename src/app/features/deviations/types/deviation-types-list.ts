import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { DeviationType } from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Switch } from '../../../shared/ui/switch/switch';
import { DEVIATIONS_ROOT_CRUMB } from '../deviation-display';
import { standardLabelKey } from '../deviation-enums';

/**
 * Admin list of the org's deviation types on the shared page frame: name, code
 * prefix, standards, number of fields (or "own workflow") and an active switch.
 * The technical key is not shown (finding 28). "Maler" opens the built-in
 * templates; delete asks first and explains a type in use. Gated upstream on
 * `deviations:admin`.
 */
@Component({
  selector: 'app-deviation-types-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    Switch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="deviations.types.title"
        descriptionKey="deviations.types.subtitle"
        [breadcrumbs]="breadcrumbs"
        backLink="/deviations"
      >
        <a secondary routerLink="/deviations/templates" tabindex="-1">
          <app-button variant="secondary">
            <app-icon name="template" [size]="15" />
            {{ 'deviations.templates.link' | transloco }}
          </app-button>
        </a>
        <a primary routerLink="/deviations/types/new" tabindex="-1">
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'deviations.types.new' | transloco }}
          </app-button>
        </a>
      </app-page-header>
      <app-help-strip scope="deviations" page="types" lesson="designing-your-process" />

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (loading()) {
        <app-loading-state [rows]="4" />
      } @else if (types().length === 0) {
        <app-empty-state
          icon="template"
          titleKey="deviations.types.empty"
          bodyKey="deviations.types.emptyBody"
          ctaKey="deviations.templates.link"
          ctaLink="/deviations/templates"
        />
      } @else {
        <ul class="overflow-hidden rounded-card border border-border bg-surface">
          @for (type of types(); track type.id) {
            <li
              class="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <a
                [routerLink]="['/deviations/types', type.id]"
                class="flex min-w-0 flex-1 items-center gap-3 hover:underline"
              >
                <span class="w-[64px] flex-none font-mono text-meta text-fg-subtle">{{
                  type.code_prefix
                }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-body font-semibold text-fg">{{
                    type.name
                  }}</span>
                  @if (type.description) {
                    <span class="block truncate text-meta text-fg-muted">{{
                      type.description
                    }}</span>
                  }
                </span>
              </a>
              <span class="flex flex-wrap items-center gap-1.5">
                @for (std of type.standards; track std) {
                  <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                }
                @if (type.record_type_id) {
                  <app-badge tone="accent">{{
                    'deviations.wf.workflowBadge' | transloco
                  }}</app-badge>
                } @else {
                  <span class="text-meta text-fg-muted">
                    {{
                      (type.schema.length === 1
                        ? 'deviations.types.fieldCountOne'
                        : 'deviations.types.fieldCount'
                      ) | transloco: { count: type.schema.length }
                    }}
                  </span>
                }
              </span>
              <span class="flex flex-none items-center gap-3">
                <app-switch [checked]="type.is_active" (checkedChange)="toggleActive(type)">
                  {{
                    (type.is_active ? 'deviations.types.active' : 'deviations.types.inactive')
                      | transloco
                  }}
                </app-switch>
                <button
                  type="button"
                  (click)="confirmDelete.set(type)"
                  [disabled]="busyId() === type.id"
                  [attr.aria-label]="
                    'deviations.types.deleteNamed' | transloco: { name: type.name }
                  "
                  [title]="'deviations.types.delete' | transloco"
                  class="flex flex-none items-center gap-1 rounded-lg px-2 py-1.5 text-meta font-semibold text-fg-muted hover:bg-fail-soft hover:text-fail-ink disabled:opacity-50"
                >
                  <app-icon name="trash" [size]="14" />
                  <span class="hidden sm:inline">{{ 'deviations.types.delete' | transloco }}</span>
                </button>
              </span>
            </li>
          }
        </ul>
      }
    </div>

    <app-confirm-dialog
      [open]="confirmDelete() !== null"
      [busy]="busyId() !== null"
      [title]="'deviations.types.deleteTitle' | transloco"
      [message]="
        'deviations.types.deleteConfirm' | transloco: { name: confirmDelete()?.name ?? '' }
      "
      [confirmLabel]="'deviations.types.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="removeConfirmed()"
      (cancelled)="confirmDelete.set(null)"
    />
  `,
})
export class DeviationTypesList {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly breadcrumbs = [DEVIATIONS_ROOT_CRUMB, { labelKey: 'deviations.types.title' }];
  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirmDelete = signal<DeviationType | null>(null);

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation_type',
      view: 'settings',
      title: this.language.translate('deviations.types.title'),
    }));
    effect(() => {
      const orgId = this.orgId();
      this.types.set([]);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.load(orgId);
    }
  }

  protected toggleActive(type: DeviationType): void {
    const orgId = this.orgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(type.id);
    this.api.updateType(orgId, type.id, { is_active: !type.is_active }).subscribe({
      next: (updated) => {
        this.types.set(this.types().map((t) => (t.id === updated.id ? updated : t)));
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        notifyDeviationError(this.notifications, error);
      },
    });
  }

  protected removeConfirmed(): void {
    const type = this.confirmDelete();
    const orgId = this.orgId();
    if (!type || !orgId || this.busyId()) {
      return;
    }
    this.busyId.set(type.id);
    this.api.deleteType(orgId, type.id).subscribe({
      next: () => {
        this.types.set(this.types().filter((t) => t.id !== type.id));
        this.busyId.set(null);
        this.confirmDelete.set(null);
        this.notifications.success('deviations.types.deletedToast');
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.confirmDelete.set(null);
        notifyDeviationError(this.notifications, error, 'deviations.types.inUseToast');
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.listTypes(orgId).subscribe({
      next: (types) => {
        this.types.set(types);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
