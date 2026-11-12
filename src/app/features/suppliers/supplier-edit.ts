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
import { changedFields } from './data/supplier-display';
import { supplierErrorKey } from './data/supplier-errors';
import { SupplierDetail } from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { SupplierForm, SupplierFormValue, draftFrom, fieldsFrom } from './supplier-form';

/** Edit a supplier (`/suppliers/:id/edit`); only changed fields are sent, with a reason. */
@Component({
  selector: 'app-supplier-edit',
  imports: [RouterLink, TranslocoPipe, Alert, GuideIntro, Icon, SupplierForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="['/suppliers', id()]"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'suppliers.common.backToSupplier' | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'suppliers.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert>{{ 'suppliers.detail.notFound' | transloco }}</app-alert>
        }
        @default {
          @if (supplier(); as s) {
            <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
              {{ 'suppliers.form.editTitle' | transloco: { code: s.code, name: s.name } }}
            </h1>
            @if (!s.can_edit) {
              <app-alert tone="info">{{ 'suppliers.form.readOnly' | transloco }}</app-alert>
            } @else {
              <div class="mt-3 mb-4"><app-guide-intro scope="suppliers" page="form" /></div>
              @if (error(); as key) {
                <div class="mb-4">
                  <app-alert>{{ key | transloco }}</app-alert>
                </div>
              }
              <app-supplier-form
                [value]="s"
                [busy]="busy()"
                (submitted)="save(s, $event)"
                (cancelled)="back()"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class SupplierEdit {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly supplier = signal<SupplierDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'suppliers',
      entityType: 'supplier',
      entityId: this.id(),
      view: 'edit',
      title: this.supplier()?.name ?? null,
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
          next: (s) => {
            this.supplier.set(s);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected save(current: SupplierDetail, value: SupplierFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const changes = changedFields(fieldsFrom(draftFrom(current)), value.fields);
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
          this.notifications.success('suppliers.form.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(supplierErrorKey(err));
        },
      });
  }

  protected back(): void {
    void this.router.navigate(['/suppliers', this.id()]);
  }
}
