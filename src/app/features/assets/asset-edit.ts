import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { changedFields } from './data/asset-display';
import { assetErrorKey } from './data/asset-errors';
import { AssetDetail } from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { AssetForm, AssetFormValue, assetDraftFrom, assetFieldsFrom } from './asset-form';
import { AssetOptionsService } from './shared/asset-select';

/** Edit an asset (`/assets/:id/edit`); only changed fields are sent, with a reason. */
@Component({
  selector: 'app-asset-edit',
  imports: [RouterLink, TranslocoPipe, Alert, AssetForm, GuideIntro, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="['/assets', id()]"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'assets.common.backToAsset' | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'assets.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert>{{ 'assets.detail.notFound' | transloco }}</app-alert>
        }
        @default {
          @if (asset(); as a) {
            <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
              {{ 'assets.form.editTitle' | transloco: { code: a.code, name: a.name } }}
            </h1>
            <div class="mt-3 mb-4"><app-guide-intro scope="assets" page="form" /></div>
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-asset-form
              [value]="a"
              [busy]="busy()"
              (submitted)="save(a, $event)"
              (cancelled)="back()"
            />
          }
        }
      }
    </div>
  `,
})
export class AssetEdit {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly options = inject(AssetOptionsService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly asset = signal<AssetDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'assets',
      entityType: 'asset',
      entityId: this.id(),
      view: 'edit',
      title: this.asset()?.name ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.get(orgId, id).subscribe({
          next: (a) => {
            this.asset.set(a);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected save(current: AssetDetail, value: AssetFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const changes = changedFields(assetFieldsFrom(assetDraftFrom(current)), value.fields);
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .update(orgId, current.id, { ...changes, change_reason: value.changeReason })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.options.refresh();
          this.notifications.success('assets.form.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(assetErrorKey(err));
        },
      });
  }

  protected back(): void {
    void this.router.navigate(['/assets', this.id()]);
  }
}
