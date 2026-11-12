import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Layout of an audit create / edit page: back link, heading, learning-mode intro and
 * why note, the projected fields in a card, and Save / Cancel. Submitting the form
 * (Enter in a field or the Save button) emits `save`.
 */
@Component({
  selector: 'app-audit-form-page',
  imports: [RouterLink, TranslocoPipe, GuideIntro, WhyItMatters, Button, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[820px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'audits.common.back' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ titleKey() | transloco }}
      </h1>
      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="audits" [page]="guidePage()" />
        <app-why-it-matters scope="audits" [page]="guidePage()" />
      </div>
      <ng-content select="[before]" />
      @if (ready()) {
        <app-card>
          <form
            class="flex flex-col gap-4"
            novalidate
            (submit)="$event.preventDefault(); save.emit()"
          >
            <ng-content />
            <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <app-button variant="secondary" (click)="cancelled.emit()">
                {{ 'audits.common.cancel' | transloco }}
              </app-button>
              <app-button type="submit" [loading]="busy()" [disabled]="!canSave() || busy()">
                {{ 'audits.common.save' | transloco }}
              </app-button>
            </div>
          </form>
        </app-card>
      }
    </div>
  `,
})
export class AuditFormPage {
  readonly titleKey = input.required<string>();
  readonly guidePage = input.required<string>();
  readonly backLink = input.required<string | readonly unknown[]>();
  readonly busy = input(false);
  readonly canSave = input(true);
  /** Show the form (false while the record to edit is loading). */
  readonly ready = input(true);
  readonly save = output<void>();
  readonly cancelled = output<void>();
}
