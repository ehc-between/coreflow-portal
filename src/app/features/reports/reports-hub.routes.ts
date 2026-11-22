import { Routes } from '@angular/router';
import { modulePlaceholderRoutes } from '../module-placeholder/module-placeholder.routes';

/**
 * STUB (IA v2 §9.2): the shell wires this route so its branch builds alone. The area
 * engineer delivers the real file at this path; their version wins on merge.
 */
export default [...modulePlaceholderRoutes('nav.areas.reports.label')] satisfies Routes;
