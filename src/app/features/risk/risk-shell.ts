import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RiskSubnav } from './shared/risk-subnav';

/** Frame of the risk module: the section navigation above the active page. */
@Component({
  selector: 'app-risk-shell',
  imports: [RouterOutlet, RiskSubnav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-risk-subnav />
    <router-outlet />
  `,
})
export class RiskShell {}
