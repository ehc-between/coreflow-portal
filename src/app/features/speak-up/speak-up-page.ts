import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, filter, last, of } from 'rxjs';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { AuthService } from '../../core/auth/auth.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { formatDueDay } from '../../shared/locale/locale-pipes';
import { RegistrerApi } from '../../shared/registrer/registrer-api';
import { QuickType } from '../../shared/registrer/registrer.models';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { SpeakUpApi } from './data/speak-up.api';
import {
  Affected,
  KINDS,
  LegalDeadline,
  NextStep,
  ProposedOwner,
  SEVERITIES,
  SPEAK_UP_TYPES,
  SpeakUpResult,
  SpeakUpType,
} from './data/speak-up.models';
import {
  SpeakUpForm,
  breachDeadline,
  chipTypes,
  dayOf,
  fallbackForm,
  formFromProposal,
  needsCustomerName,
  nextStepKey,
  toRequest,
  whenText,
} from './speak-up-logic';

type Step = 1 | 2 | 3;
type AttachState = 'none' | 'uploading' | 'done' | 'failed';

const FULL_FORM: Record<string, string> = {
  deviation: '/deviations/new',
  data_breach: '/privacy/breaches/new',
  customer_feedback: '/feedback/items/new',
};

/**
 * Meld fra (IA v2 §5.2, prototype `meldStep`): "1 · Hva har skjedd?" (a chip and the
 * reporter's own words) → "2 · Sjekk forslaget" (the proposal from `POST
 * /speak-up/propose`, or the same fields empty when suggestions are off) → "3 · Ferdig"
 * (the code, who was told and what happens next). Only the types the caller may file
 * are offered (quick create's `available`).
 */
@Component({
  selector: 'app-speak-up-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    DateInput,
    ErrorState,
    FormField,
    Icon,
    LoadingState,
    ReqPills,
  ],
  viewProviders: [provideSharedScope('speakup')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7" data-testid="speak-up-page">
      <header class="mb-6">
        <h1 class="font-display text-page font-bold text-fg">
          {{ 'speakup.meld.title' | transloco }}
        </h1>
        <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted">
          {{ 'speakup.meld.intro' | transloco }}
        </p>
      </header>

      <ol
        class="mb-5 flex flex-wrap gap-2"
        [attr.aria-label]="'speakup.meld.steps.label' | transloco"
      >
        @for (s of stepKeys; track s.n) {
          <li
            class="rounded-full px-3 py-1 text-ui"
            [class]="stepClass(s.n)"
            [attr.aria-current]="step() === s.n ? 'step' : null"
            [attr.data-testid]="'step-' + s.n"
          >
            {{ s.key | transloco }}
          </li>
        }
      </ol>

      <div class="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
        @if (typesError()) {
          <app-error-state (retry)="loadTypes()" />
        } @else if (types() === null) {
          <app-loading-state [rows]="3" />
        } @else if (chips().length === 0) {
          <p class="text-body text-fg-muted" data-testid="no-types">
            {{ 'speakup.meld.noTypes' | transloco }}
          </p>
        } @else {
          @switch (step()) {
            @case (1) {
              <label for="meld-what" class="mb-1.5 block text-card font-semibold text-fg">
                {{ 'speakup.meld.whatHappened' | transloco }}
              </label>
              <div
                class="mt-3 mb-4 flex flex-wrap gap-2"
                role="group"
                [attr.aria-label]="'speakup.meld.chipsLabel' | transloco"
              >
                @for (t of chips(); track t) {
                  <button
                    type="button"
                    class="rounded-full border px-3.5 py-2 text-body transition-colors"
                    [class]="
                      chosen() === t
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border bg-surface text-fg hover:bg-surface-2'
                    "
                    [attr.aria-pressed]="chosen() === t"
                    [attr.data-testid]="'chip-' + t"
                    (click)="chosen.set(t)"
                  >
                    {{ 'speakup.types.' + t + '.chip' | transloco }}
                  </button>
                }
              </div>
              <textarea
                id="meld-what"
                data-testid="meld-text"
                class="min-h-[130px] w-full resize-y rounded-tile border border-border bg-bg px-3.5 py-3 text-body text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                maxlength="5000"
                [placeholder]="'speakup.meld.placeholder' | transloco"
                [value]="text()"
                (input)="text.set($any($event.target).value)"
              ></textarea>
              @if (file(); as f) {
                <p
                  class="mt-2 flex items-center gap-2 text-ui text-fg-muted"
                  data-testid="attachment"
                >
                  <app-icon name="link" [size]="14" />
                  <span class="truncate">{{ f.name }}</span>
                  <button
                    type="button"
                    class="rounded p-0.5 hover:bg-surface-2"
                    [attr.aria-label]="
                      'speakup.meld.removeAttachment' | transloco: { name: f.name }
                    "
                    (click)="file.set(null)"
                  >
                    <app-icon name="x" [size]="14" />
                  </button>
                </p>
              }
              @if (textMissing()) {
                <p class="mt-2 text-ui text-fail-ink" role="alert">
                  {{ 'speakup.meld.textRequired' | transloco }}
                </p>
              }
              <div class="mt-4 flex flex-wrap items-center gap-2.5">
                <app-button
                  data-testid="make-proposal"
                  [loading]="proposing()"
                  (click)="makeProposal()"
                >
                  {{
                    (proposing() ? 'speakup.meld.making' : 'speakup.meld.makeProposal') | transloco
                  }}
                </app-button>
                <input
                  #picker
                  type="file"
                  accept="image/*,application/pdf"
                  class="hidden"
                  (change)="pickFile($event)"
                />
                <app-button variant="secondary" (click)="picker.click()">
                  {{ 'speakup.meld.attach' | transloco }}
                </app-button>
                <a
                  routerLink="/cases"
                  class="ml-auto py-1.5 text-ui font-semibold text-accent hover:underline"
                  data-testid="see-cases"
                >
                  @if (openCount() !== null) {
                    {{ 'speakup.meld.seeCases' | transloco: { count: openCount() } }}
                  } @else {
                    {{ 'speakup.meld.seeCasesNoCount' | transloco }}
                  }
                </a>
              </div>
              @if (fullFormLink(); as link) {
                <p class="mt-4 text-ui">
                  <a [routerLink]="link" class="text-fg-muted underline hover:text-fg">{{
                    'speakup.meld.fullForm' | transloco
                  }}</a>
                </p>
              }
            }
            @case (2) {
              @if (form(); as f) {
                @if (aiUsed()) {
                  <div
                    class="mb-5 flex items-start gap-2.5 rounded-tile bg-accent-soft px-3.5 py-3 text-ui text-fg"
                    data-testid="ai-note"
                  >
                    <span class="text-accent" aria-hidden="true"
                      ><app-icon name="spark" [size]="16"
                    /></span>
                    <div>
                      <b class="font-semibold text-accent">{{
                        'speakup.meld.aiNoteLead' | transloco
                      }}</b>
                      {{ 'speakup.meld.aiNote' | transloco }}
                      @if (rationale()) {
                        <span class="mt-1 block text-fg-muted">{{
                          'speakup.meld.aiWhy' | transloco: { why: rationale() }
                        }}</span>
                      }
                    </div>
                  </div>
                } @else {
                  <div
                    class="mb-5 rounded-tile bg-surface-2 px-3.5 py-3 text-ui text-fg-muted"
                    data-testid="manual-note"
                  >
                    {{ 'speakup.meld.manualNote' | transloco }}
                  </div>
                }

                <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'speakup.meld.fields.title' | transloco"
                      inputId="f-title"
                      [required]="true"
                    >
                      <input
                        id="f-title"
                        data-testid="f-title"
                        maxlength="255"
                        [value]="f.title"
                        (input)="patch({ title: $any($event.target).value })"
                      />
                    </app-form-field>
                  </div>
                  <app-form-field [label]="'speakup.meld.fields.type' | transloco" inputId="f-type">
                    <select
                      id="f-type"
                      data-testid="f-type"
                      (change)="setType($any($event.target).value)"
                    >
                      @for (t of chips(); track t) {
                        <option [value]="t" [selected]="t === f.type">
                          {{ 'speakup.types.' + t + '.label' | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field
                    [label]="'speakup.meld.fields.severity' | transloco"
                    inputId="f-sev"
                  >
                    <select
                      id="f-sev"
                      data-testid="f-sev"
                      (change)="patch({ severity: $any($event.target).value })"
                    >
                      @for (s of severities; track s) {
                        <option [value]="s" [selected]="s === f.severity">
                          {{ 'speakup.meld.severity.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  @if (kinds(); as list) {
                    <app-form-field
                      [label]="'speakup.meld.fields.kind' | transloco"
                      inputId="f-kind"
                    >
                      <select id="f-kind" (change)="patch({ kind: $any($event.target).value })">
                        @for (k of list; track k) {
                          <option [value]="k" [selected]="k === f.kind">
                            {{ 'speakup.kinds.' + k | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                  }
                  <div class="flex flex-col gap-1.5">
                    <span class="text-ui font-semibold text-fg-muted">{{
                      'speakup.meld.fields.affected' | transloco
                    }}</span>
                    <div
                      class="flex min-h-10 flex-wrap items-center gap-1.5"
                      data-testid="affected"
                    >
                      @for (a of f.affected; track a.id) {
                        <span
                          class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pr-1 pl-2.5 text-ui text-fg"
                        >
                          <span class="truncate">{{ a.label }}</span>
                          <span class="text-fg-subtle"
                            >({{ 'speakup.meld.affectedTypes.' + a.entity_type | transloco }})</span
                          >
                          <button
                            type="button"
                            class="rounded-full p-0.5 hover:bg-surface-3"
                            [attr.aria-label]="
                              'speakup.meld.fields.removeAffected' | transloco: { name: a.label }
                            "
                            (click)="removeAffected(a)"
                          >
                            <app-icon name="x" [size]="12" />
                          </button>
                        </span>
                      } @empty {
                        <span class="text-ui text-fg-subtle">{{
                          'speakup.meld.fields.affectedNone' | transloco
                        }}</span>
                      }
                    </div>
                  </div>
                  <app-form-field [label]="'speakup.meld.fields.owner' | transloco" inputId="f-own">
                    <select
                      id="f-own"
                      data-testid="f-owner"
                      (change)="patch({ ownerId: $any($event.target).value || null })"
                    >
                      @for (p of ownerOptions(); track p.id) {
                        <option [value]="p.id" [selected]="p.id === f.ownerId">
                          {{ p.label }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  @if (customerNeeded()) {
                    <app-form-field
                      [label]="'speakup.meld.fields.customer' | transloco"
                      inputId="f-customer"
                      [required]="true"
                    >
                      <input
                        id="f-customer"
                        data-testid="f-customer"
                        maxlength="200"
                        [value]="f.customerName"
                        (input)="patch({ customerName: $any($event.target).value })"
                      />
                    </app-form-field>
                  }
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'speakup.meld.fields.description' | transloco"
                      inputId="f-desc"
                    >
                      <textarea
                        id="f-desc"
                        rows="3"
                        maxlength="5000"
                        [value]="f.description"
                        (input)="patch({ description: $any($event.target).value })"
                      ></textarea>
                    </app-form-field>
                  </div>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'speakup.meld.fields.immediate' | transloco"
                      inputId="f-now"
                    >
                      <textarea
                        id="f-now"
                        rows="3"
                        maxlength="5000"
                        data-testid="f-now"
                        [value]="f.immediate"
                        (input)="patch({ immediate: $any($event.target).value })"
                      ></textarea>
                    </app-form-field>
                  </div>
                  <div class="sm:col-span-2" data-testid="f-due">
                    @if (legalDeadline(); as d) {
                      <span class="text-ui font-semibold text-fg-muted">{{
                        'speakup.meld.fields.due' | transloco
                      }}</span>
                      <p class="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          class="rounded-full bg-fail-soft px-2.5 py-0.5 text-ui font-semibold text-fail-ink"
                          >{{
                            'speakup.meld.deadline.' + d.key | transloco: { when: when(d.at) }
                          }}</span
                        >
                        <span class="text-ui text-fg-muted">{{
                          'speakup.meld.deadline.' + d.key + 'Hint' | transloco
                        }}</span>
                      </p>
                    } @else {
                      <app-form-field
                        class="sm:max-w-[calc(50%-8px)]"
                        [label]="'speakup.meld.fields.due' | transloco"
                        inputId="f-due-date"
                        [hint]="'speakup.meld.fields.dueHint' | transloco"
                      >
                        <app-date-input
                          inputId="f-due-date"
                          [value]="f.due"
                          (changed)="patch({ due: $event })"
                        />
                      </app-form-field>
                    }
                    <app-req-pills [refs]="refs()" />
                  </div>
                </div>

                @if (submitError(); as key) {
                  <p class="mt-4 text-ui text-fail-ink" role="alert" data-testid="submit-error">
                    {{ key | transloco }}
                  </p>
                }
                <div
                  class="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-4"
                >
                  <app-button variant="secondary" (click)="step.set(1)">
                    {{ 'speakup.meld.back' | transloco }}
                  </app-button>
                  <app-button data-testid="submit" [loading]="submitting()" (click)="submit()">
                    {{
                      (submitting() ? 'speakup.meld.submitting' : 'speakup.meld.submit') | transloco
                    }}
                  </app-button>
                </div>
              }
            }
            @case (3) {
              @if (result(); as r) {
                @let ownerFallback = 'speakup.next.theOwner' | transloco;
                @let customerFallback = 'speakup.next.theCustomer' | transloco;
                <div class="flex items-start gap-3.5" data-testid="done">
                  <span
                    class="grid h-10 w-10 flex-none place-items-center rounded-full bg-pass-soft text-pass-ink"
                    aria-hidden="true"
                    ><app-icon name="check" [size]="20"
                  /></span>
                  <div class="min-w-0">
                    <h2 class="font-display text-section font-semibold text-fg">
                      {{ 'speakup.meld.done.title' | transloco }}
                    </h2>
                    <p class="mt-1.5 text-body text-fg-muted">
                      @if (r.owner_name) {
                        {{
                          'speakup.meld.done.created'
                            | transloco: { code: r.code || '', owner: firstName(r.owner_name) }
                        }}
                      } @else {
                        {{ 'speakup.meld.done.createdNoOwner' | transloco: { code: r.code || '' } }}
                      }
                    </p>
                    <ol class="mt-2 list-decimal space-y-1.5 pl-5 text-body text-fg">
                      @for (s of r.next_steps; track $index) {
                        <li>
                          {{
                            stepKey(s) | transloco: stepParams(s, ownerFallback, customerFallback)
                          }}
                        </li>
                      }
                    </ol>
                    @switch (attach()) {
                      @case ('done') {
                        <p class="mt-3 text-ui text-pass-ink">
                          {{ 'speakup.meld.done.attached' | transloco }}
                        </p>
                      }
                      @case ('failed') {
                        <p class="mt-3 text-ui text-warn-ink">
                          {{ 'speakup.meld.done.attachFailed' | transloco }}
                        </p>
                      }
                    }
                    <div class="mt-5 flex flex-wrap gap-2.5">
                      <a routerLink="/home" tabindex="-1"
                        ><app-button>{{
                          'speakup.meld.done.toOverview' | transloco
                        }}</app-button></a
                      >
                      <app-button variant="secondary" data-testid="again" (click)="again()">
                        {{ 'speakup.meld.done.again' | transloco }}
                      </app-button>
                      @if (r.url) {
                        <a
                          [routerLink]="r.url"
                          class="self-center px-1 text-ui font-semibold text-accent hover:underline"
                          data-testid="open-case"
                          >{{ 'speakup.meld.done.openCase' | transloco }}</a
                        >
                      }
                    </div>
                  </div>
                </div>
              }
            }
          }
        }
      </div>
    </div>
  `,
})
export class SpeakUpPage {
  private readonly api = inject(SpeakUpApi);
  private readonly registrer = inject(RegistrerApi);
  private readonly attachments = inject(AttachmentsApi);
  private readonly org = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly stepKeys: readonly { n: Step; key: string }[] = [
    { n: 1, key: 'speakup.meld.steps.one' },
    { n: 2, key: 'speakup.meld.steps.two' },
    { n: 3, key: 'speakup.meld.steps.three' },
  ];
  protected readonly severities = SEVERITIES;

  protected readonly types = signal<readonly QuickType[] | null>(null);
  protected readonly typesError = signal(false);
  protected readonly openCount = signal<number | null>(null);
  private readonly people = signal<readonly { id: string; name: string }[]>([]);

  protected readonly step = signal<Step>(1);
  protected readonly chosen = signal<SpeakUpType>('deviation');
  protected readonly text = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly textMissing = signal(false);
  protected readonly proposing = signal(false);

  protected readonly form = signal<SpeakUpForm | null>(null);
  protected readonly aiUsed = signal(false);
  protected readonly rationale = signal<string | null>(null);
  private readonly proposedOwner = signal<ProposedOwner | null>(null);
  private readonly proposedDeadline = signal<LegalDeadline | null>(null);
  protected readonly refs = signal<readonly string[]>([]);

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly result = signal<SpeakUpResult | null>(null);
  protected readonly attach = signal<AttachState>('none');

  protected readonly chips = computed(() =>
    chipTypes(new Set((this.types() ?? []).filter((t) => t.available).map((t) => t.key))),
  );

  protected readonly kinds = computed(() => {
    const type = this.form()?.type;
    return type ? (KINDS[type] ?? null) : null;
  });

  protected readonly customerNeeded = computed(() => {
    const f = this.form();
    if (!f || !needsCustomerName(f)) {
      return false;
    }
    // Only a complaint filed as a deviation requires it.
    const route = this.types()?.find((t) => t.key === 'complaint');
    return route?.entity_type === 'deviation';
  });

  protected readonly legalDeadline = computed<LegalDeadline | null>(() => {
    const f = this.form();
    if (!f || f.type !== 'data_breach') {
      return null;
    }
    return this.proposedDeadline() ?? { key: 'gdpr72h', params: {}, at: breachDeadline() };
  });

  protected readonly fullFormLink = computed(() => {
    const entity = this.types()?.find((t) => t.key === this.chosen())?.entity_type;
    return entity ? (FULL_FORM[entity] ?? null) : null;
  });

  protected readonly ownerOptions = computed(() => {
    const me = this.auth.user();
    const options = new Map<string, string>();
    const proposed = this.proposedOwner();
    if (proposed) {
      options.set(
        proposed.user_id,
        proposed.reason ? `${proposed.name} (${proposed.reason})` : proposed.name,
      );
    }
    if (me) {
      options.set(me.id, options.get(me.id) ?? me.full_name ?? me.email);
    }
    for (const p of this.people()) {
      if (!options.has(p.id)) {
        options.set(p.id, p.name);
      }
    }
    return [...options].map(([id, label]) => ({ id, label }));
  });

  constructor() {
    effect(() => {
      const orgId = this.org.currentOrgId();
      if (orgId) {
        untracked(() => this.loadTypes());
      }
    });
    const hint = this.route.snapshot.queryParamMap.get('type');
    if (hint && (SPEAK_UP_TYPES as readonly string[]).includes(hint)) {
      this.chosen.set(hint as SpeakUpType);
    }
  }

  protected loadTypes(): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    this.typesError.set(false);
    this.types.set(null);
    this.registrer.listTypes(orgId).subscribe({
      next: (list) => {
        this.types.set(list.items);
        const chips = this.chips();
        if (chips.length && !chips.includes(this.chosen())) {
          this.chosen.set(chips[0]);
        }
      },
      error: () => this.typesError.set(true),
    });
    this.api
      .cases(orgId, { tab: 'open', type: null, q: null, limit: 1, lang: null })
      .pipe(catchError(() => of(null)))
      .subscribe((list) => this.openCount.set(list ? list.counts.open : null));
    this.registrer
      .listPeople(orgId)
      .pipe(catchError(() => of({ users: [] })))
      .subscribe((p) => this.people.set(p.users));
  }

  protected stepClass(n: Step): string {
    const current = this.step();
    if (n === current) {
      return 'bg-accent text-white';
    }
    return n < current ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-subtle';
  }

  protected pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
    input.value = '';
  }

  protected makeProposal(): void {
    const orgId = this.org.currentOrgId();
    const text = this.text().trim();
    if (!text) {
      this.textMissing.set(true);
      return;
    }
    if (!orgId || this.proposing()) {
      return;
    }
    this.textMissing.set(false);
    this.proposing.set(true);
    const lang = this.language.active();
    this.api
      .propose(orgId, {
        text,
        type_hint: this.chosen(),
        lang: lang === 'nb' || lang === 'en' ? lang : null,
      })
      .subscribe({
        next: (p) => {
          this.form.set(formFromProposal(p));
          this.aiUsed.set(true);
          this.rationale.set(p.rationale);
          this.proposedOwner.set(p.owner);
          this.proposedDeadline.set(p.deadline);
          this.refs.set(p.requirement_refs);
          this.toStep2();
        },
        error: () => {
          this.form.set(fallbackForm(text, this.chosen(), this.auth.user()?.id ?? null));
          this.aiUsed.set(false);
          this.rationale.set(null);
          this.proposedOwner.set(null);
          this.proposedDeadline.set(null);
          this.refs.set([]);
          this.toStep2();
        },
      });
  }

  private toStep2(): void {
    this.proposing.set(false);
    this.submitError.set(null);
    this.step.set(2);
  }

  protected patch(changes: Partial<SpeakUpForm>): void {
    this.form.update((f) => (f ? { ...f, ...changes } : f));
  }

  protected setType(type: SpeakUpType): void {
    const kinds = KINDS[type];
    this.patch({
      type,
      kind: kinds ? (kinds.includes(this.form()?.kind ?? '') ? this.form()!.kind : kinds[0]) : null,
    });
    if (type !== 'data_breach' && !this.form()?.due) {
      const due = new Date();
      due.setDate(due.getDate() + 14);
      this.patch({ due: dayOf(due) });
    }
  }

  protected removeAffected(a: Affected): void {
    this.form.update((f) => (f ? { ...f, affected: f.affected.filter((x) => x !== a) } : f));
  }

  protected submit(): void {
    const orgId = this.org.currentOrgId();
    const f = this.form();
    if (!orgId || !f || this.submitting()) {
      return;
    }
    if (!f.title.trim()) {
      this.submitError.set('speakup.meld.error');
      return;
    }
    if (this.customerNeeded() && !f.customerName.trim()) {
      this.submitError.set('speakup.meld.customerRequired');
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    const body = toRequest(f);
    const deadline = this.legalDeadline();
    this.api.create(orgId, deadline ? { ...body, due_at: null } : body).subscribe({
      next: (r) => {
        this.submitting.set(false);
        this.result.set(r);
        this.step.set(3);
        this.uploadFile(orgId, r);
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        const code = e instanceof HttpErrorResponse ? e.error?.detail?.field : null;
        this.submitError.set(
          code === 'customer_name' ? 'speakup.meld.customerRequired' : 'speakup.meld.error',
        );
      },
    });
  }

  private uploadFile(orgId: string, r: SpeakUpResult): void {
    const file = this.file();
    if (!file) {
      this.attach.set('none');
      return;
    }
    this.attach.set('uploading');
    this.attachments
      .upload(orgId, r.entity_type, r.id, file)
      .pipe(
        filter((e) => e.kind === 'done'),
        last(),
      )
      .subscribe({
        next: () => this.attach.set('done'),
        error: () => this.attach.set('failed'),
      });
  }

  protected again(): void {
    this.step.set(1);
    this.text.set('');
    this.file.set(null);
    this.form.set(null);
    this.result.set(null);
    this.attach.set('none');
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected firstName(name: string): string {
    return name.split(' ')[0] ?? name;
  }

  protected when(iso: string): string {
    return whenText(iso, this.language.locale());
  }

  protected stepKey(step: NextStep): string {
    return nextStepKey(step);
  }

  protected stepParams(
    step: NextStep,
    ownerFallback: string,
    customerFallback: string,
  ): Record<string, unknown> {
    const p = step.params;
    const locale = this.language.locale();
    return {
      owner: (p['owner'] as string) || ownerFallback,
      customer: (p['customer'] as string) || customerFallback,
      deadline: p['deadline'] ? whenText(String(p['deadline']), locale) : '',
      due: p['due'] ? formatDueDay(String(p['due']), locale) : '',
    };
  }
}
