import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { TERM_LANGS, Terminology } from '../../../core/modules/module.models';
import { ModulesApi, moduleErrorDetail } from '../../../core/modules/modules-api';
import { TerminologyService } from '../../../core/modules/terminology.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GUIDE_CLAUSES } from '../frameworks';
import { ModulesGuide } from '../guide/modules-guide';
import { TermRow, buildTermsForm, readTermsForm } from './terminology-form';

type Defaults = Readonly<Record<string, Readonly<Record<string, { one: string; other: string }>>>>;

/**
 * Settings → Terminology (`org:manage`): the organisation's own words for core
 * terms, per language (singular + plural). Empty means "use the default". On
 * save the overrides apply app-wide straight away through the terminology
 * transpiler (`{{ term.deviation }}` in any translation).
 */
@Component({
  selector: 'app-terminology-settings',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ModulesGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = 'modules.terminology';
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <nav class="mb-2 text-[13px]" [attr.aria-label]="'modules.common.breadcrumb' | transloco">
        <a routerLink="/settings" class="font-semibold text-accent hover:underline">
          {{ 'nav.settings' | transloco }}
        </a>
      </nav>
      <div class="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ t + '.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">{{ t + '.subtitle' | transloco }}</p>
        </div>
        <app-button variant="secondary" size="sm" (click)="askSuggest()">
          <app-icon name="spark" [size]="15" />
          {{ t + '.askSuggest' | transloco }}
        </app-button>
      </div>

      <app-modules-guide class="mb-5 block" page="terminology" [steps]="3" [clauses]="clauses" />

      <app-card class="mb-5 block">
        <p class="text-[12px] font-bold tracking-[0.04em] text-fg-subtle uppercase">
          {{ t + '.previewLabel' | transloco }}
        </p>
        <p class="mt-1 text-[14px] text-fg" data-testid="terminology-preview">
          {{ t + '.preview' | transloco }}
        </p>
      </app-card>

      @if (!orgId()) {
        <app-card>
          <p class="py-8 text-center text-[14px] text-fg-muted">
            {{ 'modules.common.noOrg' | transloco }}
          </p>
        </app-card>
      } @else if (loading()) {
        <app-card>
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else if (form(); as terms) {
        <form [formGroup]="terms" (ngSubmit)="save()" novalidate>
          <app-card [padded]="false">
            <div
              class="hidden grid-cols-[1.2fr_repeat(4,1fr)] gap-3 border-b border-border px-4 py-2.5 text-[12px] font-bold text-fg-subtle uppercase md:grid"
            >
              <span>{{ t + '.term' | transloco }}</span>
              @for (lang of langs; track lang) {
                <span>{{
                  t + '.singular' | transloco: { lang: ('language.' + lang | transloco) }
                }}</span>
                <span>{{
                  t + '.plural' | transloco: { lang: ('language.' + lang | transloco) }
                }}</span>
              }
            </div>
            <ul>
              @for (key of keys(); track key) {
                <li
                  class="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1.2fr_repeat(4,1fr)] md:items-center"
                  [formGroupName]="key"
                >
                  <div class="text-[13.5px] font-semibold text-fg" [id]="'term-' + key">
                    {{ label(key) }}
                  </div>
                  @for (lang of langs; track lang) {
                    @for (form of forms; track form) {
                      <label class="flex flex-col gap-1 text-[12px] text-fg-subtle">
                        <span class="md:sr-only">
                          {{
                            t + (form === 'one' ? '.singular' : '.plural')
                              | transloco: { lang: ('language.' + lang | transloco) }
                          }}
                        </span>
                        <input
                          type="text"
                          maxlength="64"
                          class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
                          [formControlName]="lang + '_' + form"
                          [placeholder]="placeholder(key, lang, form)"
                          [attr.aria-describedby]="'term-' + key"
                        />
                      </label>
                    }
                  }
                  @if (rowIncomplete(terms.controls[key])) {
                    <p role="alert" class="text-[12px] font-medium text-fail md:col-span-5">
                      {{ t + '.errors.incomplete' | transloco }}
                    </p>
                  }
                </li>
              }
            </ul>
          </app-card>

          @if (error(); as message) {
            <app-alert class="mt-4 block">{{ message | transloco }}</app-alert>
          }

          <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
            <app-button
              variant="ghost"
              (click)="confirmReset.set(true)"
              [disabled]="!hasOverrides()"
            >
              {{ t + '.resetAll' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="saving()">{{
              'common.save' | transloco
            }}</app-button>
          </div>
        </form>
      }

      <app-confirm-dialog
        [open]="confirmReset()"
        [title]="'modules.terminology.resetTitle' | transloco"
        [message]="'modules.terminology.resetBody' | transloco"
        [confirmLabel]="'modules.terminology.resetConfirm' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="saving()"
        (confirmed)="resetAll()"
        (cancelled)="confirmReset.set(false)"
      />
    </div>
  `,
})
export class TerminologySettings {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ModulesApi);
  private readonly terminology = inject(TerminologyService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly ask = inject(AskPanelService);

  protected readonly clauses = GUIDE_CLAUSES.terminology;
  protected readonly langs = TERM_LANGS;
  protected readonly forms = ['one', 'other'] as const;

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly keys = signal<readonly string[]>([]);
  protected readonly form = signal<FormRecord<TermRow> | null>(null);
  protected readonly defaults = signal<Defaults>({});
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmReset = signal(false);
  protected readonly hasOverrides = signal(false);

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.form.set(null);
        if (orgId) {
          this.load(orgId);
        }
      });
    });
  }

  /** The term's default name in the UI language (falls back to the key). */
  protected label(key: string): string {
    const lang = this.transloco.getActiveLang();
    const value = this.defaults()[key]?.[lang]?.other;
    return value ? value.charAt(0).toLocaleUpperCase(lang) + value.slice(1) : key;
  }

  protected placeholder(key: string, lang: string, form: 'one' | 'other'): string {
    return this.defaults()[key]?.[lang]?.[form] ?? '';
  }

  protected rowIncomplete(row: TermRow | undefined): boolean {
    return !!row && row.hasError('incomplete') && (row.dirty || row.touched);
  }

  protected save(): void {
    const orgId = this.orgId();
    const form = this.form();
    if (!orgId || !form || this.saving()) {
      return;
    }
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    this.persist(orgId, readTermsForm(form), 'modules.terminology.savedToast');
  }

  protected resetAll(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.persist(orgId, {}, 'modules.terminology.resetToast');
    }
  }

  protected askSuggest(): void {
    this.ask.showWith(this.transloco.translate('modules.terminology.askSuggestPrompt'));
  }

  private persist(orgId: string, terms: Readonly<Record<string, object>>, toast: string): void {
    this.saving.set(true);
    this.error.set(null);
    this.terminology.update(orgId, terms).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.confirmReset.set(false);
        this.applyResult(result);
        this.notifications.success(toast);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.confirmReset.set(false);
        const detail = moduleErrorDetail(err);
        this.error.set(
          detail?.code === 'unknown_term'
            ? 'modules.terminology.errors.unknownTerm'
            : 'modules.common.saveFailed',
        );
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    forkJoin([
      this.api.getTerminology(orgId),
      ...TERM_LANGS.map((lang) => this.transloco.load(lang)),
    ]).subscribe({
      next: ([result]) => {
        if (this.orgId() !== orgId) {
          return;
        }
        this.defaults.set(this.readDefaults(result.term_keys));
        this.applyResult(result);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('modules.common.loadFailed');
      },
    });
  }

  private applyResult(result: Terminology): void {
    this.keys.set(result.term_keys);
    this.form.set(buildTermsForm(this.fb, result.term_keys, result.terms));
    this.hasOverrides.set(Object.keys(result.terms).length > 0);
  }

  private readDefaults(keys: readonly string[]): Defaults {
    const result: Record<string, Record<string, { one: string; other: string }>> = {};
    for (const key of keys) {
      result[key] = {};
      for (const lang of TERM_LANGS) {
        const translation = this.transloco.getTranslation(lang);
        const one = translation[`terms.${key}.one`];
        const other = translation[`terms.${key}.other`];
        if (typeof one === 'string' && typeof other === 'string') {
          result[key][lang] = { one, other };
        }
      }
    }
    return result;
  }
}
