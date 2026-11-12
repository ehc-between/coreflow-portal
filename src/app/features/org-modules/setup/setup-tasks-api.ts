import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';

/** The subset of F2's `POST /tasks` body the wizard sends. */
export interface SetupTaskCreate {
  readonly title: string;
  readonly description?: string;
  readonly due_at?: string;
  readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
  readonly kind?: string;
}

/** The fields of F2's task response the wizard reads. */
export interface CreatedTask {
  readonly id: string;
  readonly title: string;
}

/**
 * Creates the wizard's "first tasks" through the platform tasks API (F2,
 * `POST v1/orgs/{orgId}/tasks`). A 404 means the tasks module isn't available
 * on this backend; the wizard then skips the step gracefully.
 */
@Injectable({ providedIn: 'root' })
export class SetupTasksApi {
  private readonly api = inject(ApiService);

  create(orgId: string, task: SetupTaskCreate): Observable<CreatedTask> {
    return this.api.post<CreatedTask>(`v1/orgs/${orgId}/tasks`, task, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}
