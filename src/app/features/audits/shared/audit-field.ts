import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One control of an audit form, a thin layer over the shared `app-form-field`
 * (docs/ux-guide.md §2.4): label row (label, required `*`, the field help "?" and an
 * optional `[ask]` button), then the control, then the hint (`[hint]`) and the
 * error ("what to fix"). `span="full"` takes both columns of an `app-form-section`.
 *
 *   <app-audit-field inputId="plan-title" labelKey="audits.fields.title" [required]="true"
 *       helpPage="planForm" helpField="title">
 *     <input id="plan-title" … />
 *   </app-audit-field>
 */
@Component({
  selector: 'app-audit-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-2]': "span() === 'full'",
  },
  template: `
    <app-form-field
      [label]="labelKey() | transloco"
      [inputId]="legend() ? '' : inputId()"
      [required]="required()"
      [error]="error() ? (error()! | transloco) : ''"
    >
      <span label-suffix class="inline-flex items-center gap-1.5 empty:hidden">
        @if (helpField(); as field) {
          <app-field-help
            scope="audits"
            [page]="helpPage()"
            [field]="field"
            [label]="labelKey() | transloco"
          />
        }
        <ng-content select="[ask]" />
      </span>
      <ng-content />
      <div hint class="text-meta leading-snug text-fg-subtle empty:hidden">
        <ng-content select="[hint]" />
      </div>
    </app-form-field>
  `,
})
export class AuditField {
  readonly inputId = input('');
  readonly labelKey = input.required<string>();
  readonly required = input(false);
  /** Guidance page of the field help (`pages.<page>.fields.<field>` in audits.json). */
  readonly helpPage = input('planForm');
  readonly helpField = input<string | null>(null);
  /** Kept for callers: pickers that draw their own box. The shared field leaves them alone. */
  readonly plain = input(false);
  /** The label names a group (checkboxes), not one input. */
  readonly legend = input(false);
  /** i18n key of the error to show under the control. */
  readonly error = input<string | null>(null);
  /** Grid span inside an `app-form-section`. */
  readonly span = input<'half' | 'full'>('half');
}
