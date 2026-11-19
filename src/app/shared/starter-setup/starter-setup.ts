import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { SlideOver } from '../ui/slide-over/slide-over';
import { SseStream } from '../../core/ai/sse-client';
import { StarterSetupApi } from './starter-setup-api';
import {
  StarterEvent,
  StarterExclusion,
  StarterField,
  StarterResult,
  providerI18nKey,
} from './starter-setup.models';
import {
  RaciSlot,
  StarterRow,
  groupRows,
  missingRequired,
  parseTags,
  raciHints,
  raciSlots,
  selectedItems,
  setField,
  setRaciAssignee,
  setRaciLetter,
  toRows,
  updateRow,
} from './starter-setup.state';

export const STARTER_SCOPE = 'starter';
type Phase = 'idle' | 'loading' | 'review' | 'error';
const LETTERS: readonly RaciSlot['raci'][] = ['R', 'A', 'C', 'I'];

/**
 * "Kom i gang med et forslag": proposes a starter setup for one register from the
 * organisation profile and what the other registers already hold (the assistant, or a
 * standard setup for the industry when the assistant is off), and lets the user review
 * it — tick, edit, see why — before anything is created. Nothing is saved until
 * "Opprett" (one call; the server tags each record with its source and audits it).
 *
 *   <app-starter-setup #starter provider="context.interested_parties" (created)="reload()" />
 *   <button (click)="starter.open()">…</button>
 *
 * Texts per provider: `starter.providers.<provider with _>.{title,intro}`.
 */
@Component({
  selector: 'app-starter-setup',
  imports: [TranslocoPipe, Button, Icon, SlideOver],
  viewProviders: [provideSharedScope(STARTER_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .cf-starter input:not([type='checkbox']),
      .cf-starter select,
      .cf-starter textarea {
        min-height: 34px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 10px;
        outline: none;
      }
      .cf-starter textarea {
        padding: 8px 10px;
      }
      .cf-starter input:focus,
      .cf-starter select:focus,
      .cf-starter textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
  template: `
    <app-slide-over
      [open]="isOpen()"
      [width]="640"
      [title]="'starter.providers.' + i18nKey() + '.title' | transloco"
      [subtitle]="'starter.subtitle' | transloco"
      [closeLabel]="'starter.close' | transloco"
      (closed)="close()"
    >
      <div class="cf-starter flex flex-col gap-4" data-testid="starter-setup">
        <details class="rounded-lg bg-surface-2 px-3 py-2 text-meta text-fg-muted">
          <summary class="cursor-pointer font-medium text-fg">
            {{ 'starter.providers.' + i18nKey() + '.whatTitle' | transloco }}
          </summary>
          <p class="mt-1">{{ 'starter.providers.' + i18nKey() + '.intro' | transloco }}</p>
        </details>

        @switch (phase()) {
          @case ('loading') {
            <div class="flex flex-col items-center gap-2 py-10 text-center" role="status">
              <app-icon name="spark" [size]="22" />
              <p class="text-ui text-fg">{{ statusKey() | transloco }}</p>
              <p class="text-meta text-fg-muted">{{ 'starter.loadingHint' | transloco }}</p>
            </div>
          }
          @case ('error') {
            <div class="flex flex-col items-start gap-3 py-6" role="alert">
              <p class="text-ui text-fg">{{ 'starter.errors.generate' | transloco }}</p>
              <div class="flex gap-2">
                <app-button variant="secondary" (click)="generate('auto')">
                  {{ 'starter.retry' | transloco }}
                </app-button>
                <app-button variant="secondary" (click)="generate('template')">
                  {{ 'starter.useStandard' | transloco }}
                </app-button>
              </div>
            </div>
          }
          @case ('review') {
            @if (result(); as r) {
              <div class="flex flex-col gap-1 text-meta text-fg-muted">
                @if (r.source === 'ai') {
                  <p data-testid="starter-source">{{ 'starter.source.ai' | transloco }}</p>
                } @else {
                  <p data-testid="starter-source">
                    {{ 'starter.source.' + (r.fallback ?? 'template') | transloco }}
                  </p>
                }
                <p>{{ basedOn() }}</p>
                @if (r.skipped.length) {
                  <p>{{ 'starter.skipped' | transloco: { count: r.skipped.length } }}</p>
                }
              </div>

              @if (r.mode === 'single' && header(); as h) {
                <div class="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <label class="flex flex-col gap-1 text-meta font-medium text-fg">
                    {{ 'starter.fields.title' | transloco }}
                    <input
                      class="w-full"
                      [value]="h['title'] ?? ''"
                      (input)="setHeader('title', $any($event.target).value)"
                    />
                  </label>
                  <label class="flex flex-col gap-1 text-meta font-medium text-fg">
                    {{ 'starter.fields.summary' | transloco }}
                    <textarea
                      class="w-full"
                      rows="3"
                      [value]="h['summary'] ?? ''"
                      (input)="setHeader('summary', $any($event.target).value)"
                    ></textarea>
                  </label>
                </div>
              }

              @if (rows().length === 0) {
                <p class="py-6 text-center text-ui text-fg-muted" data-testid="starter-nothing">
                  {{ 'starter.nothingNew' | transloco }}
                </p>
              } @else {
                <div class="flex items-center justify-between gap-2 text-meta">
                  <span class="text-fg-muted">
                    {{
                      'starter.selectedCount'
                        | transloco: { count: selectedCount(), total: rows().length }
                    }}
                  </span>
                  <span class="flex gap-3">
                    <button
                      type="button"
                      class="text-accent hover:underline"
                      (click)="selectAll(true)"
                    >
                      {{ 'starter.selectAll' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="text-accent hover:underline"
                      (click)="selectAll(false)"
                    >
                      {{ 'starter.selectNone' | transloco }}
                    </button>
                  </span>
                </div>

                @for (g of groups(); track g.group) {
                  <section class="flex flex-col gap-2">
                    <h3 class="text-meta font-semibold tracking-wide text-fg-muted uppercase">
                      {{ 'starter.options.' + r.group_set + '.' + g.group | transloco }}
                    </h3>
                    @for (row of g.rows; track row.key) {
                      <div
                        class="rounded-lg border border-border bg-surface p-3"
                        [class.opacity-60]="!row.selected"
                        data-testid="starter-row"
                      >
                        <div class="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            class="mt-1 h-4 w-4 flex-none"
                            [id]="'starter-' + row.key"
                            [checked]="row.selected"
                            (change)="toggle(row.key, $any($event.target).checked)"
                          />
                          <div class="min-w-0 flex-1">
                            <label
                              [for]="'starter-' + row.key"
                              class="block font-medium text-fg [overflow-wrap:anywhere]"
                            >
                              {{ titleOf(row, r) }}
                            </label>
                            @if (row.why) {
                              <p class="mt-0.5 text-meta text-fg-muted">
                                <span class="font-medium">{{ 'starter.why' | transloco }}</span>
                                {{ row.why }}
                              </p>
                            }
                            @for (hint of hintsOf(row, r); track hint) {
                              <p class="mt-1 text-meta text-warn-ink">
                                {{ 'starter.hints.' + hint | transloco }}
                              </p>
                            }
                          </div>
                          <button
                            type="button"
                            class="flex-none rounded-lg px-2 py-1 text-meta text-accent hover:bg-surface-2"
                            [attr.aria-expanded]="row.expanded"
                            (click)="expand(row.key, !row.expanded)"
                          >
                            {{ (row.expanded ? 'starter.done' : 'starter.edit') | transloco }}
                          </button>
                        </div>

                        @if (row.expanded) {
                          <div class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                            @for (f of r.fields; track f.name) {
                              <div class="flex flex-col gap-1 text-meta">
                                @let id = 'starter-' + row.key + '-' + f.name;
                                @switch (f.kind) {
                                  @case ('bool') {
                                    <label class="flex items-center gap-2 text-fg">
                                      <input
                                        type="checkbox"
                                        class="h-4 w-4"
                                        [checked]="!!row.fields[f.name]"
                                        (change)="set(row.key, f.name, $any($event.target).checked)"
                                      />
                                      {{ 'starter.fields.' + f.name | transloco }}
                                    </label>
                                  }
                                  @case ('textarea') {
                                    <label [for]="id" class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</label>
                                    <textarea
                                      [id]="id"
                                      class="w-full"
                                      rows="3"
                                      [value]="text(row.fields[f.name])"
                                      (input)="set(row.key, f.name, $any($event.target).value)"
                                    ></textarea>
                                  }
                                  @case ('select') {
                                    <label [for]="id" class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</label>
                                    <select
                                      [id]="id"
                                      (change)="set(row.key, f.name, $any($event.target).value)"
                                    >
                                      @if (!f.required && !row.fields[f.name]) {
                                        <option value="" selected>
                                          {{ 'starter.none' | transloco }}
                                        </option>
                                      }
                                      @for (o of f.options; track o) {
                                        <option [value]="o" [selected]="o === row.fields[f.name]">
                                          {{
                                            'starter.options.' + f.option_set + '.' + o | transloco
                                          }}
                                        </option>
                                      }
                                    </select>
                                  }
                                  @case ('lookup') {
                                    <label [for]="id" class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</label>
                                    <select
                                      [id]="id"
                                      (change)="
                                        set(row.key, f.name, $any($event.target).value || null)
                                      "
                                    >
                                      <option value="" [selected]="!row.fields[f.name]">
                                        {{ 'starter.none' | transloco }}
                                      </option>
                                      @for (o of lookup(f); track o[0]) {
                                        <option
                                          [value]="o[0]"
                                          [selected]="o[0] === row.fields[f.name]"
                                        >
                                          {{ o[1] }}
                                        </option>
                                      }
                                    </select>
                                  }
                                  @case ('tags') {
                                    <label [for]="id" class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</label>
                                    <textarea
                                      [id]="id"
                                      class="w-full"
                                      rows="3"
                                      [value]="tags(row.fields[f.name])"
                                      (change)="
                                        set(row.key, f.name, parse($any($event.target).value))
                                      "
                                    ></textarea>
                                    <span class="text-fg-muted">{{
                                      'starter.tagsHint' | transloco
                                    }}</span>
                                  }
                                  @case ('exclusions') {
                                    <span class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</span>
                                    @for (ex of exclusions(row.fields[f.name]); track $index) {
                                      <div class="flex flex-col gap-1 rounded-lg bg-surface-2 p-2">
                                        <div class="flex items-center gap-2">
                                          <input
                                            class="w-24"
                                            [attr.aria-label]="'starter.clause' | transloco"
                                            [value]="ex.clause"
                                            (input)="
                                              setExclusion(
                                                row,
                                                $index,
                                                'clause',
                                                $any($event.target).value
                                              )
                                            "
                                          />
                                          <button
                                            type="button"
                                            class="ml-auto text-fail-ink hover:underline"
                                            (click)="removeExclusion(row, $index)"
                                          >
                                            {{ 'starter.remove' | transloco }}
                                          </button>
                                        </div>
                                        <textarea
                                          class="w-full"
                                          rows="2"
                                          [attr.aria-label]="'starter.justification' | transloco"
                                          [value]="ex.justification"
                                          (input)="
                                            setExclusion(
                                              row,
                                              $index,
                                              'justification',
                                              $any($event.target).value
                                            )
                                          "
                                        ></textarea>
                                      </div>
                                    } @empty {
                                      <span class="text-fg-muted">{{
                                        'starter.noExclusions' | transloco
                                      }}</span>
                                    }
                                  }
                                  @case ('raci') {
                                    <span class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</span>
                                    @for (slot of slots(row.fields[f.name]); track $index) {
                                      <div class="flex items-center gap-2">
                                        <select
                                          class="min-w-0 flex-1"
                                          [attr.aria-label]="'starter.assignee' | transloco"
                                          (change)="
                                            setSlot(row, $index, 'who', $any($event.target).value)
                                          "
                                        >
                                          @for (o of lookup(f); track o[0]) {
                                            <option
                                              [value]="o[0]"
                                              [selected]="o[0] === slot.type + ':' + slot.value"
                                            >
                                              {{
                                                'starter.assigneeTypes.' + o[0].split(':')[0]
                                                  | transloco
                                              }}:
                                              {{ o[1] }}
                                            </option>
                                          }
                                        </select>
                                        <select
                                          class="w-20"
                                          [attr.aria-label]="'starter.raciLetter' | transloco"
                                          (change)="
                                            setSlot(
                                              row,
                                              $index,
                                              'letter',
                                              $any($event.target).value
                                            )
                                          "
                                        >
                                          @for (l of letters; track l) {
                                            <option [value]="l" [selected]="l === slot.raci">
                                              {{ l }}
                                            </option>
                                          }
                                        </select>
                                        <button
                                          type="button"
                                          class="text-fail-ink hover:underline"
                                          (click)="removeSlot(row, $index)"
                                        >
                                          {{ 'starter.remove' | transloco }}
                                        </button>
                                      </div>
                                    }
                                    @if (lookup(f).length) {
                                      <button
                                        type="button"
                                        class="self-start text-accent hover:underline"
                                        (click)="addSlot(row, f)"
                                      >
                                        {{ 'starter.addAssignee' | transloco }}
                                      </button>
                                    } @else {
                                      <span class="text-fg-muted">{{
                                        'starter.noAssignees' | transloco
                                      }}</span>
                                    }
                                    <span class="text-fg-muted">{{
                                      'starter.raciLegend' | transloco
                                    }}</span>
                                  }
                                  @default {
                                    <label [for]="id" class="font-medium text-fg">{{
                                      'starter.fields.' + f.name | transloco
                                    }}</label>
                                    <input
                                      [id]="id"
                                      class="w-full"
                                      [value]="text(row.fields[f.name])"
                                      (input)="set(row.key, f.name, $any($event.target).value)"
                                    />
                                  }
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </section>
                }
              }

              @if (acceptError()) {
                <p class="text-meta text-fail-ink" role="alert">{{ acceptError()! | transloco }}</p>
              }

              <div
                class="sticky -bottom-4 -mx-5 -mb-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface px-5 py-3"
              >
                <p class="mr-auto text-meta text-fg-muted">
                  {{ 'starter.confirmNote' | transloco }}
                </p>
                @if (r.source === 'ai') {
                  <app-button variant="ghost" (click)="generate('template')">
                    {{ 'starter.useStandard' | transloco }}
                  </app-button>
                }
                <app-button variant="secondary" (click)="close()">
                  {{ 'starter.cancel' | transloco }}
                </app-button>
                <app-button
                  data-testid="starter-accept"
                  [disabled]="!canAccept()"
                  [loading]="saving()"
                  (click)="accept()"
                >
                  {{ acceptKey() | transloco: { count: selectedCount() } }}
                </app-button>
              </div>
            }
          }
        }
      </div>
    </app-slide-over>
  `,
})
export class StarterSetup {
  private readonly api = inject(StarterSetupApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  /** The provider key, e.g. `context.interested_parties`. */
  readonly provider = input.required<string>();
  /** Fires after records were created (the page reloads its list). */
  readonly created = output<number>();

  protected readonly letters = LETTERS;
  protected readonly i18nKey = computed(() => providerI18nKey(this.provider()));
  protected readonly isOpen = signal(false);
  protected readonly phase = signal<Phase>('idle');
  protected readonly statusKey = signal('starter.status.preparing');
  protected readonly result = signal<StarterResult | null>(null);
  protected readonly rows = signal<readonly StarterRow[]>([]);
  protected readonly header = signal<Record<string, unknown> | null>(null);
  protected readonly saving = signal(false);
  protected readonly acceptError = signal<string | null>(null);

  protected readonly groups = computed(() => groupRows(this.rows()));
  protected readonly selectedCount = computed(() => this.rows().filter((r) => r.selected).length);
  protected readonly canAccept = computed(() => {
    const result = this.result();
    if (!result || this.saving() || this.selectedCount() === 0) {
      return false;
    }
    if (result.mode === 'single' && !String(this.header()?.['title'] ?? '').trim()) {
      return false;
    }
    return this.rows()
      .filter((r) => r.selected)
      .every((r) => missingRequired(r, result).length === 0);
  });
  protected readonly acceptKey = computed(() =>
    this.result()?.mode === 'single' ? 'starter.acceptSingle' : 'starter.accept',
  );
  protected readonly basedOn = computed(() => {
    const ctx = this.result()?.context;
    if (!ctx) {
      return '';
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    if (ctx.industry) {
      parts.push(ctx.industry);
    }
    if (ctx.size_band) {
      parts.push(t('starter.basedOnSize', { size: ctx.size_band }));
    }
    if (ctx.frameworks.length) {
      parts.push(ctx.frameworks.map((f) => t(`starter.options.framework.${f}`)).join(', '));
    }
    const records = Object.values(ctx.registers).reduce((sum, n) => sum + n, 0);
    if (records) {
      parts.push(t('starter.basedOnRecords', { count: records }));
    }
    return parts.length
      ? t('starter.basedOn', { facts: parts.join(' · ') })
      : t('starter.basedOnNothing');
  });

  private stream: SseStream | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stream?.cancel());
  }

  /** Opens the review sheet and asks for proposals. */
  open(): void {
    this.isOpen.set(true);
    this.generate('auto');
  }

  protected close(): void {
    this.stream?.cancel();
    this.stream = null;
    this.isOpen.set(false);
    this.phase.set('idle');
  }

  protected generate(mode: 'auto' | 'template'): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.stream?.cancel();
    this.phase.set('loading');
    this.statusKey.set('starter.status.preparing');
    this.acceptError.set(null);
    this.stream = this.api.propose(orgId, this.provider(), { mode }, (event) =>
      this.onEvent(event),
    );
  }

  private onEvent(event: StarterEvent): void {
    switch (event.type) {
      case 'status':
        this.statusKey.set(event.key ?? 'starter.status.preparing');
        break;
      case 'result':
        this.result.set(event.data);
        this.rows.set(toRows(event.data.items));
        this.header.set(event.data.header ? { ...event.data.header } : null);
        this.phase.set('review');
        break;
      case 'error':
      case 'not-configured':
        if (this.phase() !== 'review') {
          this.phase.set('error');
        }
        break;
      default:
        break;
    }
  }

  // --- review ------------------------------------------------------------------------

  protected titleOf(row: StarterRow, result: StarterResult): string {
    const title = row.fields[result.title_field];
    return typeof title === 'string' && title.trim()
      ? title
      : this.language.translate('starter.untitled');
  }

  protected hintsOf(row: StarterRow, result: StarterResult): readonly string[] {
    const raci = result.fields.find((f) => f.kind === 'raci');
    return raci ? raciHints(raciSlots(row.fields[raci.name])) : row.hints;
  }

  protected toggle(key: string, selected: boolean): void {
    this.rows.update((rows) => updateRow(rows, key, (r) => ({ ...r, selected })));
  }

  protected expand(key: string, expanded: boolean): void {
    this.rows.update((rows) => updateRow(rows, key, (r) => ({ ...r, expanded })));
  }

  protected selectAll(selected: boolean): void {
    this.rows.update((rows) => rows.map((r) => ({ ...r, selected })));
  }

  protected set(key: string, name: string, value: unknown): void {
    this.rows.update((rows) => updateRow(rows, key, (r) => setField(r, name, value)));
  }

  protected setHeader(name: string, value: string): void {
    this.header.update((h) => ({ ...(h ?? {}), [name]: value }));
  }

  protected text(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  protected tags(value: unknown): string {
    return Array.isArray(value) ? value.join('\n') : '';
  }

  protected parse(text: string): string[] {
    return parseTags(text);
  }

  protected lookup(field: StarterField): [string, string][] {
    const set = field.option_set ? this.result()?.lookups?.[field.option_set] : undefined;
    return set ? Object.entries(set) : [];
  }

  protected exclusions(value: unknown): StarterExclusion[] {
    return Array.isArray(value) ? (value as StarterExclusion[]) : [];
  }

  protected setExclusion(
    row: StarterRow,
    index: number,
    name: keyof StarterExclusion,
    value: string,
  ): void {
    const list = this.exclusions(row.fields['exclusions']).map((ex, i) =>
      i === index ? { ...ex, [name]: value } : ex,
    );
    this.set(row.key, 'exclusions', list);
  }

  protected removeExclusion(row: StarterRow, index: number): void {
    const list = this.exclusions(row.fields['exclusions']).filter((_, i) => i !== index);
    this.set(row.key, 'exclusions', list);
  }

  protected slots(value: unknown): RaciSlot[] {
    return raciSlots(value);
  }

  protected setSlot(row: StarterRow, index: number, what: 'who' | 'letter', value: string): void {
    const slots = raciSlots(row.fields['assignments']);
    const next =
      what === 'who'
        ? setRaciAssignee(slots, index, value)
        : setRaciLetter(slots, index, value as RaciSlot['raci']);
    this.set(row.key, 'assignments', next);
  }

  protected removeSlot(row: StarterRow, index: number): void {
    const slots = raciSlots(row.fields['assignments']).filter((_, i) => i !== index);
    this.set(row.key, 'assignments', slots);
  }

  protected addSlot(row: StarterRow, field: StarterField): void {
    const first = this.lookup(field)[0];
    if (!first) {
      return;
    }
    const slots = raciSlots(row.fields[field.name]);
    const raci: RaciSlot['raci'] = slots.some((s) => s.raci === 'A') ? 'R' : 'A';
    const [type, ...rest] = first[0].split(':');
    const slot: RaciSlot = { type: type as RaciSlot['type'], value: rest.join(':'), raci };
    this.set(row.key, field.name, [...slots, slot]);
  }

  // --- accept ------------------------------------------------------------------------

  protected accept(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const result = this.result();
    if (!orgId || !result || !this.canAccept()) {
      return;
    }
    this.saving.set(true);
    this.acceptError.set(null);
    this.api
      .accept(orgId, this.provider(), {
        source: result.source,
        items: selectedItems(this.rows()),
        header: result.mode === 'single' ? this.header() : null,
      })
      .subscribe({
        next: (out) => {
          this.saving.set(false);
          const count = out.created.length;
          if (count > 0) {
            this.notifications.success(
              result.mode === 'single' ? 'starter.toast.createdSingle' : 'starter.toast.created',
              { count },
            );
          } else {
            this.notifications.info('starter.toast.nothingCreated');
          }
          this.created.emit(count);
          this.close();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          this.acceptError.set(status === 422 ? 'starter.errors.invalid' : 'starter.errors.accept');
        },
      });
  }
}
