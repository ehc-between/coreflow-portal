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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PrivacyApi } from './data/privacy-api';
import { PrivacyRecord } from './data/privacy.models';
import { nowDateTimeInput } from './data/privacy-dates';
import { PrivacyErrorMessage, privacyError } from './data/privacy-errors';
import { createBody, emptyValues, updateBody, valuesFromRecord } from './data/privacy-form-model';
import { PrivacyRefsService } from './data/privacy-refs.service';
import { FormValues, REGISTERS, RegisterKey } from './data/privacy-registers';
import { PrivacyFormSubmit, PrivacyRegisterForm } from './register-form';

/** Date-time fields pre-filled with "now" on create (the backend default). */
const NOW_FIELDS = ['received_at', 'aware_at', 'given_at'];

/**
 * Create (`/privacy/<segment>/new`) and edit (`/privacy/<segment>/:id/edit`)
 * page of any register. Edit sends only the changed fields (plus the change
 * reason, kept on the revision); create leaves empty fields to the backend.
 */
@Component({
  selector: 'app-privacy-register-edit',
  imports: [RouterLink, TranslocoPipe, GuideIntro, WhyItMatters, Alert, Icon, PrivacyRegisterForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'privacy.common.back' | transloco }}
      </a>
      <h1
        class="mb-2 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        data-testid="privacy-form-heading"
      >
        @if (isEdit()) {
          {{ 'privacy.form.editTitle' | transloco: { code: record()?.code ?? '' } }}
        } @else {
          {{ 'privacy.registers.' + def().key + '.new' | transloco }}
        }
      </h1>
      <div class="mb-5 flex flex-col gap-3">
        <app-guide-intro scope="privacy" page="form" />
        @if (def().personal) {
          <app-alert tone="info">{{ 'privacy.form.personalNotice' | transloco }}</app-alert>
        }
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'privacy.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ loadError() | transloco }}</app-alert>
        }
        @default {
          @if (values(); as v) {
            <app-privacy-register-form
              [register]="def()"
              [mode]="isEdit() ? 'edit' : 'create'"
              [value]="v"
              [entityId]="id() ?? null"
              [busy]="saving()"
              [error]="saveError()"
              (submitted)="save($event)"
              (cancelled)="cancel()"
            />
          }
        }
      }

      <div class="mt-6">
        <app-why-it-matters scope="privacy" [page]="def().key" />
      </div>
    </div>
  `,
})
export class PrivacyRegisterEdit {
  private readonly api = inject(PrivacyApi);
  private readonly refs = inject(PrivacyRefsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  readonly register = input.required<RegisterKey>();
  /** Route param; absent on `new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly def = computed(() => REGISTERS[this.register()]);
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly loadError = signal('privacy.common.loadFailed');
  protected readonly record = signal<PrivacyRecord | null>(null);
  protected readonly values = signal<FormValues | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<PrivacyErrorMessage | null>(null);

  protected readonly backLink = computed(() =>
    this.id() ? ['/privacy', this.def().segment, this.id()] : ['/privacy', this.def().segment],
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'privacy',
      entityType: this.def().entityType,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title:
        this.record()?.code ?? this.language.translate(`privacy.registers.${this.def().key}.new`),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const register = this.register();
      untracked(() => this.load(orgId, register, id));
    });
  }

  private load(orgId: string | null, register: RegisterKey, id: string | undefined): void {
    this.request.unsubscribe();
    const def = REGISTERS[register];
    if (!id) {
      const values: Record<string, unknown> = { ...emptyValues(def) };
      for (const key of NOW_FIELDS) {
        if (def.fields.some((f) => f.key === key)) {
          values[key] = nowDateTimeInput();
        }
      }
      this.values.set(values);
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, def, id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.values.set(valuesFromRecord(def, record));
        this.state.set('ready');
      },
      error: (err) => {
        this.loadError.set(privacyError(err).key);
        this.state.set('error');
      },
    });
  }

  protected save(event: PrivacyFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const def = this.def();
    const id = this.id();
    this.saveError.set(null);
    if (id) {
      const original = valuesFromRecord(def, this.record()!);
      const body = updateBody(def, original, event.values, event.changeReason);
      if (!Object.keys(body).length) {
        void this.router.navigate(['/privacy', def.segment, id]);
        return;
      }
      this.saving.set(true);
      this.api.update(orgId, def, id, body).subscribe({
        next: (saved) => this.done(saved, 'privacy.notices.saved'),
        error: (err) => this.failed(err),
      });
    } else {
      this.saving.set(true);
      this.api.create(orgId, def, createBody(def, event.values)).subscribe({
        next: (saved) => {
          this.refs.invalidate(def.key);
          this.done(saved, 'privacy.notices.created');
        },
        error: (err) => this.failed(err),
      });
    }
  }

  protected cancel(): void {
    void this.router.navigate(this.backLink());
  }

  private done(saved: PrivacyRecord, key: string): void {
    this.saving.set(false);
    this.notify.success(key, { code: saved.code });
    void this.router.navigate(['/privacy', this.def().segment, saved.id]);
  }

  private failed(err: unknown): void {
    this.saving.set(false);
    this.saveError.set(privacyError(err));
  }
}
