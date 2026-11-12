import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { supplierErrorKey } from './data/supplier-errors';
import { SuppliersApi } from './data/suppliers-api';
import { SupplierForm, SupplierFormValue } from './supplier-form';

/** Register a new supplier (`/suppliers/new`). It starts as "prospective". */
@Component({
  selector: 'app-supplier-new',
  imports: [RouterLink, TranslocoPipe, Alert, GuideIntro, Icon, SupplierForm, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/suppliers"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'suppliers.common.backToRegister' | transloco }}
      </a>
      <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ 'suppliers.form.newTitle' | transloco }}
      </h1>
      <p class="mb-4 text-[14px] text-fg-muted">{{ 'suppliers.form.newSubtitle' | transloco }}</p>
      <div class="mb-4"><app-guide-intro scope="suppliers" page="form" /></div>
      @if (error(); as key) {
        <div class="mb-4">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
      <app-supplier-form [busy]="busy()" (submitted)="save($event)" (cancelled)="back()" />
      <div class="mt-6"><app-why-it-matters scope="suppliers" page="form" /></div>
    </div>
  `,
})
export class SupplierNew {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: 'suppliers',
      entityType: 'supplier',
      view: 'new',
      title: this.language.translate('suppliers.form.newTitle'),
    }));
  }

  protected save(value: SupplierFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.create(orgId, value.fields).subscribe({
      next: (supplier) => {
        this.busy.set(false);
        this.notifications.success('suppliers.form.created', { code: supplier.code });
        void this.router.navigate(['/suppliers', supplier.id]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(supplierErrorKey(err));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/suppliers']);
  }
}
