import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { internalLink } from '../../core/search/internal-link';
import { Button } from '../ui/button/button';
import { trapTabKey } from '../ui/focus-trap';
import { FormField } from '../ui/form-field/form-field';
import { Icon } from '../ui/icon/icon';
import { RegistrerApi } from './registrer-api';
import {
  TYPE_ICONS,
  TriageOption,
  buildRequest,
  errorCode,
  isContextError,
  missingRequired,
  pickOptions,
} from './registrer-data';
import { QuickCreateResponse, QuickField, QuickType, QuickTypeKey } from './registrer.models';
import { RegistrerService } from './registrer.service';

type Step = 'pick' | 'form' | 'done';

/** Types whose `kind` select gets its own question ("Hva slags hendelse?"). */
const KIND_QUESTION_TYPES: ReadonlySet<string> = new Set([
  'near_miss',
  'security_incident',
  'customer_feedback',
]);

/**
 * "Hva vil du registrere?" (U05, simplify-plan §3.2). Step 1 asks in plain words what
 * happened (the answer picks avvik, nestenulykke, sikkerhetshendelse, personvernbrudd
 * or klage) or offers the other common types; step 2 is the type's quick form (3-5
 * fields from the backend, owner defaults to me), with "Hva skjer videre" and the
 * record or requirement it will be linked to. On save the new record opens with
 * "Fullfør posten" (`app-registrer-complete`).
 *
 * Mounted once by the main layout; opened through `RegistrerService.show()`.
 */
@Component({
  selector: 'app-registrer-dialog',
  imports: [TranslocoPipe, RouterLink, Button, FormField, Icon],
  viewProviders: [provideSharedScope('registrer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (registrer.open()) {
      <div
        class="fixed inset-0 z-[60] flex items-end justify-center sm:items-start sm:px-4 sm:pt-[8vh]"
      >
        <button
          type="button"
          tabindex="-1"
          class="absolute inset-0 cursor-default bg-black/40"
          [attr.aria-label]="'registrer.close' | transloco"
          (click)="close()"
        ></button>
        <div
          #panel
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          aria-labelledby="registrer-title"
          data-testid="registrer-dialog"
          class="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-pop outline-none sm:max-w-[600px] sm:rounded-card"
          (keydown)="onPanelKeydown($event)"
        >
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5">
            @if (step() === 'form' && !directType()) {
              <button
                type="button"
                class="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'registrer.back' | transloco"
                data-testid="registrer-back"
                (click)="back()"
              >
                <app-icon name="back" [size]="16" />
              </button>
            }
            <h2
              id="registrer-title"
              class="flex-1 font-display text-section font-bold tracking-[-0.02em] text-fg"
            >
              @switch (step()) {
                @case ('form') {
                  {{ formTitleKey() | transloco }}
                }
                @case ('done') {
                  {{ 'registrer.done.title' | transloco }}
                }
                @default {
                  {{ 'registrer.title' | transloco }}
                }
              }
            </h2>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'registrer.close' | transloco"
              data-testid="registrer-close"
              (click)="close()"
            >
              <app-icon name="x" [size]="16" />
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            @switch (step()) {
              @case ('pick') {
                @if (types() === null) {
                  @if (loadFailed()) {
                    <p class="text-ui text-fail-ink" role="alert">
                      {{ 'registrer.errors.load' | transloco }}
                    </p>
                  } @else {
                    <p class="text-ui text-fg-subtle" role="status">
                      {{ 'registrer.loading' | transloco }}
                    </p>
                  }
                } @else if (options().triage.length === 0 && options().common.length === 0) {
                  <p class="text-ui text-fg-muted" data-testid="registrer-none">
                    {{ 'registrer.none' | transloco }}
                  </p>
                } @else {
                  @if (options().triage.length > 0) {
                    <section aria-labelledby="registrer-incident">
                      <h3 id="registrer-incident" class="text-ui font-bold text-fg">
                        {{ 'registrer.incident.heading' | transloco }}
                      </h3>
                      <p class="mt-0.5 text-meta text-fg-subtle">
                        {{ 'registrer.incident.question' | transloco }}
                      </p>
                      <ul class="mt-2 grid gap-1.5 sm:grid-cols-2">
                        @for (option of options().triage; track option.key) {
                          <li>
                            <button
                              type="button"
                              class="flex min-h-11 w-full items-start gap-2.5 rounded-tile border border-border bg-bg px-3 py-2.5 text-left hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                              [attr.data-testid]="'registrer-triage-' + option.key"
                              (click)="pickTriage(option)"
                            >
                              <span class="mt-0.5 flex text-fg-subtle"
                                ><app-icon [name]="option.icon" [size]="16"
                              /></span>
                              <span class="min-w-0">
                                <span class="block text-ui font-semibold text-fg">{{
                                  'registrer.triage.' + option.key + '.label' | transloco
                                }}</span>
                                <span class="block text-meta text-fg-subtle">{{
                                  'registrer.triage.' + option.key + '.term' | transloco
                                }}</span>
                              </span>
                            </button>
                          </li>
                        }
                      </ul>
                    </section>
                  }
                  @if (options().common.length > 0) {
                    <section aria-labelledby="registrer-other" class="mt-5">
                      <h3 id="registrer-other" class="text-ui font-bold text-fg">
                        {{ 'registrer.other' | transloco }}
                      </h3>
                      <ul class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        @for (type of options().common; track type.key) {
                          <li>
                            <button
                              type="button"
                              class="flex min-h-11 w-full items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2 text-left text-ui font-semibold text-fg hover:border-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                              [attr.data-testid]="'registrer-type-' + type.key"
                              (click)="pickType(type.key)"
                            >
                              <span class="flex text-fg-subtle"
                                ><app-icon [name]="icons[type.key]" [size]="16"
                              /></span>
                              {{ 'registrer.types.' + type.key | transloco }}
                            </button>
                          </li>
                        }
                      </ul>
                    </section>
                  }
                  @if (hasRegisters) {
                    <a
                      routerLink="/registers"
                      class="mt-4 inline-flex text-ui font-semibold text-accent hover:underline"
                      data-testid="registrer-all"
                      (click)="close()"
                      >{{ 'registrer.allTypes' | transloco }}</a
                    >
                  }
                  <p class="mt-4 text-meta text-fg-subtle">
                    {{ 'registrer.shortcutHint' | transloco }}
                  </p>
                }
              }
              @case ('form') {
                @if (selected(); as type) {
                  <form
                    class="flex flex-col gap-3.5"
                    data-testid="registrer-form"
                    novalidate
                    (submit)="$event.preventDefault(); submit()"
                  >
                    @for (field of type.fields; track field.key) {
                      @let id = 'registrer-f-' + field.key;
                      <app-form-field
                        [label]="labelKey(type, field) | transloco"
                        [inputId]="id"
                        [required]="field.required"
                      >
                        @switch (field.kind) {
                          @case ('textarea') {
                            <textarea
                              [id]="id"
                              rows="3"
                              [attr.maxlength]="field.max_length"
                              [value]="value(field.key)"
                              (input)="setValue(field.key, $event)"
                            ></textarea>
                          }
                          @case ('datetime') {
                            <input
                              [id]="id"
                              type="datetime-local"
                              [value]="value(field.key)"
                              (input)="setValue(field.key, $event)"
                            />
                          }
                          @case ('date') {
                            <input
                              [id]="id"
                              type="date"
                              [value]="value(field.key)"
                              (input)="setValue(field.key, $event)"
                            />
                          }
                          @case ('user') {
                            <select [id]="id" (change)="setValue(field.key, $event)">
                              <option value="" [selected]="!value(field.key)">
                                {{ 'registrer.me' | transloco }}
                              </option>
                              @for (person of otherPeople(); track person.id) {
                                <option
                                  [value]="person.id"
                                  [selected]="value(field.key) === person.id"
                                >
                                  {{ person.name }}
                                </option>
                              }
                            </select>
                          }
                          @case ('select') {
                            <select
                              [id]="id"
                              [attr.aria-required]="field.required"
                              (change)="setValue(field.key, $event)"
                            >
                              @if (!field.required || !value(field.key)) {
                                <option value="" [selected]="!value(field.key)">
                                  {{ 'registrer.choose' | transloco }}
                                </option>
                              }
                              @for (option of field.options; track option.value) {
                                <option
                                  [value]="option.value"
                                  [selected]="value(field.key) === option.value"
                                >
                                  {{
                                    option.label ??
                                      ('registrer.options.kind.' + option.value | transloco)
                                  }}
                                </option>
                              }
                            </select>
                          }
                          @default {
                            <input
                              [id]="id"
                              type="text"
                              [attr.aria-required]="field.required"
                              [attr.maxlength]="field.max_length"
                              [attr.data-autofocus]="field.key === 'title' ? '' : null"
                              [value]="value(field.key)"
                              (input)="setValue(field.key, $event)"
                            />
                          }
                        }
                      </app-form-field>
                    }

                    @if (registrer.context(); as linked) {
                      <div
                        class="flex items-center gap-2 rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted"
                        data-testid="registrer-context"
                      >
                        <app-icon name="link" [size]="14" />
                        <span class="min-w-0 flex-1 truncate">
                          @if (linked.title) {
                            {{ 'registrer.context.linked' | transloco: { title: linked.title } }}
                          } @else {
                            {{ 'registrer.context.linkedPage' | transloco }}
                          }
                        </span>
                        <button
                          type="button"
                          class="rounded-md px-1.5 font-semibold text-fg-subtle hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          data-testid="registrer-unlink"
                          (click)="registrer.unlink()"
                        >
                          {{ 'registrer.context.unlink' | transloco }}
                        </button>
                      </div>
                    }

                    @if (type.next_step) {
                      <p class="text-meta text-fg-muted" data-testid="registrer-next">
                        <span class="font-semibold text-fg">{{
                          'registrer.nextHeading' | transloco
                        }}</span>
                        {{ 'registrer.next.' + type.next_step | transloco }}
                      </p>
                    }

                    @if (error(); as err) {
                      <p class="text-ui text-fail-ink" role="alert" data-testid="registrer-error">
                        {{
                          'registrer.errors.' + err.code
                            | transloco
                              : {
                                  field: err.field ? (fieldLabelKey(err.field) | transloco) : '',
                                }
                        }}
                      </p>
                    }

                    <div class="flex justify-end gap-2 pt-1">
                      <app-button variant="secondary" [disabled]="busy()" (click)="close()">
                        {{ 'registrer.cancel' | transloco }}
                      </app-button>
                      <app-button type="submit" [loading]="busy()" data-testid="registrer-submit">
                        {{ 'registrer.submit' | transloco }}
                      </app-button>
                    </div>
                  </form>
                }
              }
              @case ('done') {
                @if (done(); as result) {
                  <div data-testid="registrer-done" class="flex flex-col gap-3">
                    <p class="text-ui text-fg">{{ 'registrer.done.body' | transloco }}</p>
                    <p class="text-meta text-fg-muted">
                      <span class="font-semibold text-fg">{{
                        'registrer.nextHeading' | transloco
                      }}</span>
                      {{ 'registrer.next.' + result.next_step.code | transloco }}
                    </p>
                    <div class="flex justify-end">
                      <app-button (click)="close()">{{ 'registrer.close' | transloco }}</app-button>
                    </div>
                  </div>
                }
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class RegistrerDialog {
  protected readonly registrer = inject(RegistrerService);
  private readonly api = inject(RegistrerApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly icons = TYPE_ICONS;
  /** "Alle typer…" opens the Registre hub (U04) when the app has it. */
  protected readonly hasRegisters = this.router.config.some(
    (route) =>
      route.path === 'registers' ||
      (route.children ?? []).some((child) => child.path === 'registers'),
  );

  protected readonly types = signal<readonly QuickType[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly step = signal<Step>('pick');
  private readonly selectedKey = signal<QuickTypeKey | null>(null);
  private readonly triage = signal<TriageOption | null>(null);
  /** Opened straight into a form (no first step to go back to). */
  protected readonly directType = signal(false);
  private readonly values = signal<Readonly<Record<string, string>>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal<{ code: string; field: string | null } | null>(null);
  protected readonly done = signal<QuickCreateResponse | null>(null);
  private readonly people = signal<readonly { id: string; name: string }[]>([]);

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnFocusTo: HTMLElement | null = null;
  private focusedStep: string | null = null;
  private peopleOrg: string | null = null;
  private typesOrg: string | null = null;

  protected readonly options = computed(() => pickOptions(this.types() ?? []));
  protected readonly selected = computed(
    () => this.types()?.find((t) => t.key === this.selectedKey() && t.available) ?? null,
  );
  protected readonly otherPeople = computed(() => {
    const me = this.auth.user()?.id;
    return this.people().filter((person) => person.id !== me);
  });
  protected readonly formTitleKey = computed(() => {
    const option = this.triage();
    return option
      ? `registrer.triage.${option.key}.label`
      : `registrer.types.${this.selectedKey() ?? 'deviation'}`;
  });

  constructor() {
    // A new `show()`: start over (keeping the cached types of this org).
    effect(() => {
      const request = this.registrer.options();
      const open = this.registrer.open();
      if (!open) {
        return;
      }
      untracked(() => this.start(request.type ?? null, request.kind ?? null));
    });

    // Focus: into the dialog when it opens or changes step, back out when it closes.
    afterRenderEffect(() => {
      const open = this.registrer.open();
      const step = this.step();
      const panel = this.panel()?.nativeElement;
      if (open && panel) {
        const key = `${step}:${this.selectedKey()}:${this.types() !== null}`;
        if (key !== this.focusedStep) {
          if (this.focusedStep === null) {
            const active = document.activeElement;
            this.returnFocusTo = active instanceof HTMLElement ? active : null;
          }
          this.focusedStep = key;
          const target =
            panel.querySelector<HTMLElement>('[data-autofocus]') ??
            panel.querySelector<HTMLElement>(
              '[data-testid^="registrer-triage-"], [data-testid^="registrer-type-"]',
            ) ??
            panel;
          target.focus();
        }
      } else if (!open && this.focusedStep !== null) {
        this.focusedStep = null;
        const target = this.returnFocusTo;
        this.returnFocusTo = null;
        if (target?.isConnected) {
          target.focus();
        }
      }
    });
  }

  private start(type: QuickTypeKey | null, kind: string | null): void {
    this.step.set('pick');
    this.selectedKey.set(null);
    this.triage.set(null);
    this.directType.set(false);
    this.values.set({});
    this.error.set(null);
    this.done.set(null);
    this.busy.set(false);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      this.types.set([]);
      return;
    }
    if (this.typesOrg !== orgId) {
      this.types.set(null);
    }
    this.loadFailed.set(false);
    const pending = { type, kind };
    this.api.listTypes(orgId).subscribe({
      next: (list) => {
        this.typesOrg = orgId;
        this.types.set(list.items);
        if (pending.type && this.step() === 'pick') {
          const available = list.items.some((t) => t.key === pending.type && t.available);
          if (available) {
            this.directType.set(true);
            this.openForm(pending.type, pending.kind);
          }
        }
      },
      error: () => {
        if (this.types() === null) {
          this.loadFailed.set(true);
        }
      },
    });
  }

  protected pickTriage(option: TriageOption): void {
    this.triage.set(option);
    this.openForm(option.type, option.kind ?? null);
  }

  protected pickType(key: QuickTypeKey): void {
    this.triage.set(null);
    this.openForm(key, null);
  }

  private openForm(key: QuickTypeKey, kind: string | null): void {
    const type = this.types()?.find((t) => t.key === key);
    if (!type) {
      return;
    }
    const values: Record<string, string> = {};
    for (const field of type.fields) {
      if (field.key === 'kind' && kind && field.options.some((o) => o.value === kind)) {
        values[field.key] = kind;
      } else if (field.default) {
        values[field.key] = field.default;
      } else if (field.kind === 'select' && field.required && field.options.length === 1) {
        values[field.key] = field.options[0].value;
      }
    }
    this.values.set(values);
    this.error.set(null);
    this.selectedKey.set(key);
    this.step.set('form');
    if (type.fields.some((field) => field.kind === 'user')) {
      this.loadPeople();
    }
  }

  private loadPeople(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.peopleOrg === orgId) {
      return;
    }
    this.peopleOrg = orgId;
    this.api.listPeople(orgId).subscribe({
      next: (subjects) =>
        this.people.set(subjects.users.map((user) => ({ id: user.id, name: user.name }))),
      // Without access to the list the owner stays "me".
      error: () => this.people.set([]),
    });
  }

  protected back(): void {
    this.step.set('pick');
    this.selectedKey.set(null);
    this.triage.set(null);
    this.error.set(null);
  }

  protected value(key: string): string {
    return this.values()[key] ?? '';
  }

  protected setValue(key: string, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.values.update((values) => ({ ...values, [key]: target.value }));
    if (this.error()?.code === 'field_required') {
      this.error.set(null);
    }
  }

  protected fieldLabelKey(key: string): string {
    return `registrer.fields.${key}`;
  }

  protected labelKey(type: QuickType, field: QuickField): string {
    return field.key === 'kind' && KIND_QUESTION_TYPES.has(type.key)
      ? `registrer.kindQuestion.${type.key}`
      : this.fieldLabelKey(field.key);
  }

  protected submit(): void {
    const type = this.selected();
    const orgId = this.selectedOrg.currentOrgId();
    if (!type || !orgId || this.busy()) {
      return;
    }
    const missing = missingRequired(type, this.values());
    if (missing.length > 0) {
      this.error.set({ code: 'field_required', field: missing[0] });
      this.panel()?.nativeElement.querySelector<HTMLElement>(`#registrer-f-${missing[0]}`)?.focus();
      return;
    }
    const context = this.registrer.context()?.context ?? null;
    this.busy.set(true);
    this.error.set(null);
    const send = (withContext: boolean): Observable<QuickCreateResponse> =>
      this.api.create(orgId, buildRequest(type, this.values(), withContext ? context : null));
    send(true)
      .pipe(
        catchError((err: unknown) =>
          context && isContextError(err) ? send(false) : throwError(() => err),
        ),
      )
      .subscribe({
        next: (response) => this.finish(response),
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(errorCode(err));
        },
      });
  }

  private finish(response: QuickCreateResponse): void {
    this.busy.set(false);
    const link = internalLink(response.record.url);
    if (!link) {
      // The reporter may not open the register it went to: confirm here instead.
      this.registrer.registered(null);
      this.done.set(response);
      this.step.set('done');
      return;
    }
    this.registrer.registered({ response, path: link.path });
    this.registrer.close();
    void this.router.navigate([link.path], { queryParams: link.queryParams ?? {} });
  }

  protected close(): void {
    if (!this.busy()) {
      this.registrer.close();
    }
  }

  protected onEscape(): void {
    if (this.registrer.open()) {
      this.close();
    }
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (panel) {
      trapTabKey(panel, event);
    }
  }
}
