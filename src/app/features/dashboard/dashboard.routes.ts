import { Routes } from '@angular/router';
import { Dashboard } from './dashboard';

/** Feature routes for the dashboard area (lazy-loaded from app.routes). */
const routes: Routes = [{ path: '', component: Dashboard }];

export default routes;
