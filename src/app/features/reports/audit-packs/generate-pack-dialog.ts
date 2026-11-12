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
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { localized } from '../data/report-display';
import { reportErrorKey } from '../data/report-errors';
import { AuditPack, REPORT_LANGS, Register, ReportLang } from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { StandardOptions } from '../data/standard-options';

/** Registers that never go into a pack as a sheet (they are the pack's own sections). */
const PACK_SECTIONS = new Set(['soa', 'evidence_index', 'readiness']);

/**
 * Generates an audit pack for one enabled standard: title, language, whether to
 * include approved policies, and which registers to add (all by default).
 * Generation runs during the request; the dialog stays open, busy, until the
 * pack is ready.
 */
@Component({
  selector: 'app-generate-pack-dialog',
  imports: [TranslocoPipe, FieldHelp, Alert, Button, FormField, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'reports.packs.generateTitle' | transloco"
      [closeLabel]="'reports.common.close' | transloco"
      [width]="520"
      (closed)="close()"
    >
      @if (open()) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()" novalidate>
          <p class="text-[13px] text-fg-muted">{{ 'reports.packs.generateIntro' | transloco }}</p>
          @if (standardsReady() && standards().length === 0) {
            <app-alert tone="info">{{ 'reports.packs.noStandards' | transloco }}</app-alert>
          }
          <div>
            <app-form-field [label]="'reports.packs.standard' | transloco" inputId="pack-standard">
              <select
                id="pack-standard"
                required
                [attr.aria-invalid]="submitted() && !standardKey()"
                (change)="standardKey.set($any($event.target).value)"
              >
                <option value="" [selected]="!standardKey()">
                  {{ 'reports.filters.chooseStandard' | transloco }}
                </option>
                @for (s of standards(); track s.standard_key) {
                  <option [value]="s.standard_key" [selected]="s.standard_key === standardKey()">
                    {{ s.name }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help class="mt-1 block" scope="reports" page="auditPacks" field="standard" />
            @if (submitted() && !standardKey()) {
              <p class="mt-1 text-[12px] text-fail" role="alert">
                {{ 'reports.packs.standardRequired' | transloco }}
              </p>
            }
          </div>
          <app-form-field [label]="'reports.packs.packTitle' | transloco" inputId="pack-title">
            <input
              id="pack-title"
              type="text"
              maxlength="255"
              [value]="title()"
              [placeholder]="'reports.packs.packTitlePlaceholder' | transloco"
              (input)="title.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'reports.form.lang' | transloco" inputId="pack-lang">
            <select id="pack-lang" (change)="lang.set($any($event.target).value)">
              @for (l of langs; track l) {
                <option [value]="l" [selected]="l === lang()">
                  {{ 'reports.langs.' + l | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <label class="inline-flex items-center gap-2 text-[13px] text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="includePolicies()"
              (change)="includePolicies.set($any($event.target).checked)"
            />
            {{ 'reports.packs.includePolicies' | transloco }}
          </label>
          @if (registers().length) {
            <fieldset>
              <legend class="mb-1 text-[12.5px] font-semibold text-fg-muted">
                {{ 'reports.packs.registers' | transloco }}
              </legend>
              <div class="flex flex-col gap-1">
                @for (reg of registers(); track reg.key) {
                  <label class="inline-flex items-center gap-2 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="isChosen(reg.key)"
                      (change)="toggle(reg.key)"
                    />
                    {{ name(reg) }}
                  </label>
                }
              </div>
              <p class="mt-1 text-[11.5px] text-fg-subtle">
                {{ 'reports.packs.registersHint' | transloco }}
              </p>
            </fieldset>
          }
          @if (saving()) {
            <p class="text-[12.5px] text-fg-muted" role="status">
              {{ 'reports.packs.building' | transloco }}
            </p>
          }
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" [disabled]="saving()" (click)="close()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()">{{
              'reports.packs.generateSubmit' | transloco
            }}</app-button>
          </div>
        </form>
      }
    </app-slide-over>
  `,
})
export class GeneratePackDialog {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly standardOptions = inject(StandardOptions);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly generated = output<AuditPack>();

  protected readonly langs = REPORT_LANGS;
  protected readonly standards = this.standardOptions.items;
  protected readonly standardsReady = this.standardOptions.ready;

  protected readonly standardKey = signal('');
  protected readonly title = signal('');
  protected readonly lang = signal<ReportLang>('en');
  protected readonly includePolicies = signal(true);
  /** null = all registers (the API default). */
  protected readonly chosen = signal<readonly string[] | null>(null);
  protected readonly allRegisters = signal<readonly Register[]>([]);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly registers = computed(() =>
    this.allRegisters().filter((r) => !PACK_SECTIONS.has(r.key)),
  );

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      untracked(() => this.prepare());
    });
  }

  protected name(reg: Register): string {
    return localized(reg.label, this.language.active(), reg.key);
  }

  protected isChosen(key: string): boolean {
    const chosen = this.chosen();
    return chosen === null || chosen.includes(key);
  }

  protected toggle(key: string): void {
    const all = this.registers().map((r) => r.key);
    const current = this.chosen() ?? all;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    this.chosen.set(next.length === all.length ? null : all.filter((k) => next.includes(k)));
  }

  protected close(): void {
    if (!this.saving()) {
      this.closed.emit();
    }
  }

  protected submit(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.standardKey() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createAuditPack(orgId, {
        standard_key: this.standardKey(),
        title: this.title().trim() || null,
        lang: this.lang(),
        include_policies: this.includePolicies(),
        registers: this.chosen(),
      })
      .subscribe({
        next: (pack) => {
          this.saving.set(false);
          this.generated.emit(pack);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(reportErrorKey(error));
        },
      });
  }

  private prepare(): void {
    this.submitted.set(false);
    this.error.set(null);
    const lang = this.language.active();
    this.lang.set((REPORT_LANGS as readonly string[]).includes(lang) ? (lang as ReportLang) : 'en');
    this.standardOptions.ensure();
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId && this.allRegisters().length === 0) {
      this.api.registers(orgId).subscribe({
        next: (list) => this.allRegisters.set(list.items),
        error: () => this.allRegisters.set([]),
      });
    }
  }
}
