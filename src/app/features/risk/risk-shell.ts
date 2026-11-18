import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Frame of the risk module. Each page renders its own header and the module
 * sub-navigation (`app-risk-nav`) under it, per the page anatomy.
 */
@Component({
  selector: 'app-risk-shell',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class RiskShell {}
