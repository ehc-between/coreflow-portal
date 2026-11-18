import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { internalLink } from '../../../core/search/internal-link';
import { ClauseAuditFacts, SoaInfo } from '../../../core/standards/standards.models';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';

/** A translation for `key`, or the humanised raw value when there is none. */
export function labelOr(translate: (key: string) => string, key: string, raw: string): string {
  const text = translate(key);
  return text && text !== key ? text : raw.replace(/_/g, ' ');
}

/** In-app navigation for API urls; modified clicks keep their browser meaning. */
function follow(router: Router, event: MouseEvent, url: string): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  if (internalLink(url)) {
    event.preventDefault();
    void router.navigateByUrl(url);
  }
}

/**
 * The Statement of Applicability entry of an Annex A control (ISO 27001 / 42001),
 * shown on the control's section: the SoA is the one place applicability and
 * justification are decided, so the workspace shows it and links to it. Every
 * requirement of the control follows it.
 */
@Component({
  selector: 'app-soa-panel',
  imports: [TranslocoPipe, LocalDatePipe, Badge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = soa();
    <section
      class="rounded-tile border border-border bg-surface px-3.5 py-3"
      data-testid="soa-panel"
      [attr.aria-label]="'standards.soa.title' | transloco"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="flex text-fg-subtle"><app-icon name="shield" [size]="15" /></span>
        <h3 class="text-ui font-bold text-fg">{{ 'standards.soa.title' | transloco }}</h3>
        <app-badge [tone]="s.applicable ? 'pass' : 'neutral'">{{
          (s.applicable ? 'standards.soa.applicable' : 'standards.soa.notApplicable') | transloco
        }}</app-badge>
        @if (s.applicable) {
          <app-badge [tone]="implementationTone()">{{ implementationLabel() }}</app-badge>
        }
        <span class="flex-1"></span>
        <a
          [href]="s.url"
          class="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline"
          data-testid="soa-open"
          (click)="open($event, s.url)"
        >
          {{ 'standards.soa.open' | transloco }}
          <app-icon name="arrow" [size]="12" />
        </a>
      </div>
      <dl class="mt-2 grid gap-x-4 gap-y-1.5 text-meta sm:grid-cols-[max-content_1fr]">
        @if (s.justification) {
          <dt class="font-semibold text-fg-muted">
            {{ 'standards.soa.justification' | transloco }}
          </dt>
          <dd class="text-fg">{{ s.justification }}</dd>
        }
        @if (reasons().length > 0) {
          <dt class="font-semibold text-fg-muted">{{ 'standards.soa.reasons' | transloco }}</dt>
          <dd class="text-fg">{{ reasons().join(', ') }}</dd>
        }
        <dt class="font-semibold text-fg-muted">{{ 'standards.soa.owner' | transloco }}</dt>
        <dd class="text-fg">{{ s.owner?.name || ('standards.notSet' | transloco) }}</dd>
        <dt class="font-semibold text-fg-muted">{{ 'standards.soa.reviewed' | transloco }}</dt>
        <dd class="text-fg">
          @if (s.reviewed_at) {
            {{ s.reviewed_at | localDate: 'mediumDate' }}
          } @else {
            {{ 'standards.notSet' | transloco }}
          }
        </dd>
        @if ((s.risks ?? []).length > 0) {
          <dt class="font-semibold text-fg-muted">{{ 'standards.soa.risks' | transloco }}</dt>
          <dd class="flex flex-wrap gap-x-3 gap-y-1">
            @for (risk of s.risks; track risk.id) {
              <a
                [href]="risk.url"
                class="text-accent hover:underline"
                (click)="open($event, risk.url)"
                ><span class="font-mono">{{ risk.code }}</span> {{ risk.title }}</a
              >
            }
            @if (s.treatment_count) {
              <span class="text-fg-muted">{{
                'standards.soa.treatments' | transloco: { count: s.treatment_count }
              }}</span>
            }
          </dd>
        }
      </dl>
      <p class="mt-2 text-micro text-fg-subtle">{{ 'standards.soa.hint' | transloco }}</p>
    </section>
  `,
})
export class SoaPanel {
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  readonly soa = input.required<SoaInfo>();

  protected readonly reasons = computed(() =>
    (this.soa().inclusion_reasons ?? []).map((r) =>
      labelOr((k) => this.language.translate(k), `standards.soa.reason.${r}`, r),
    ),
  );
  protected readonly implementationLabel = computed(() => {
    const status = this.soa().implementation_status;
    return labelOr(
      (k) => this.language.translate(k),
      `standards.soa.implementation.${status}`,
      status,
    );
  });
  protected readonly implementationTone = computed(() => {
    switch (this.soa().implementation_status) {
      case 'implemented':
        return 'pass' as const;
      case 'partial':
      case 'planned':
        return 'warn' as const;
      default:
        return 'neutral' as const;
    }
  });

  protected open(event: MouseEvent, url: string): void {
    follow(this.router, event, url);
  }
}

/**
 * What the audits module says about a clause, in one line under its heading:
 * last audited, next audit, and open findings / nonconformities (linked). Only
 * users who may read the audits module receive these facts.
 */
@Component({
  selector: 'app-clause-audit',
  imports: [TranslocoPipe, LocalDatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = audit();
    @if (hasFacts()) {
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
        data-testid="clause-audit"
      >
        <span class="flex text-fg-subtle"><app-icon name="audit" [size]="14" /></span>
        @if (a.last_audited_at) {
          <span>{{
            'standards.audit.lastAudited'
              | transloco: { date: (a.last_audited_at | localDate: 'mediumDate') }
          }}</span>
        } @else {
          <span>{{ 'standards.audit.neverAudited' | transloco }}</span>
        }
        @if (a.next_audit_at) {
          <span>{{
            'standards.audit.nextAudit'
              | transloco: { date: (a.next_audit_at | localDate: 'mediumDate') }
          }}</span>
        }
        @if ((a.open_findings_count ?? 0) > 0) {
          <span class="font-semibold text-warn-ink">{{
            'standards.audit.openFindings'
              | transloco: { count: a.open_findings_count, nc: a.open_nc_count ?? 0 }
          }}</span>
        }
        @for (f of a.open_findings ?? []; track f.id) {
          <a [href]="f.url" class="text-accent hover:underline" (click)="open($event, f.url)"
            ><span class="font-mono">{{ f.code }}</span> {{ f.title }}</a
          >
        }
        @for (p of plans(); track p.id) {
          <a [href]="p.url" class="text-accent hover:underline" (click)="open($event, p.url)"
            ><span class="font-mono">{{ p.code }}</span></a
          >
        }
      </div>
    }
  `,
})
export class ClauseAudit {
  private readonly router = inject(Router);

  readonly audit = input.required<ClauseAuditFacts>();

  /** At most three plans, newest first as the API sends them. */
  protected readonly plans = computed(() => (this.audit().plans ?? []).slice(0, 3));
  protected readonly hasFacts = computed(() => {
    const a = this.audit();
    return (
      !!a.last_audited_at ||
      !!a.next_audit_at ||
      (a.plans ?? []).length > 0 ||
      (a.open_findings_count ?? 0) > 0
    );
  });

  protected open(event: MouseEvent, url: string): void {
    follow(this.router, event, url);
  }
}
