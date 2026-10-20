import { HttpErrorResponse } from '@angular/common/http';
import {
  codedErrorDetail,
  deviationErrorMessage,
  invalidDataErrors,
  notifyDeviationSaveError,
} from './deviation-errors';

const http = (status: number, detail: unknown) =>
  new HttpErrorResponse({ status, error: { detail } });

describe('deviation errors', () => {
  it('reads a coded detail', () => {
    expect(
      codedErrorDetail(http(409, { code: 'type_key_exists', message: 'm', params: { key: 'nc' } })),
    ).toEqual({ code: 'type_key_exists', message: 'm', params: { key: 'nc' } });
    expect(codedErrorDetail(http(400, 'plain string'))).toBeNull();
  });

  it('translates known codes with their params', () => {
    expect(
      deviationErrorMessage(
        http(422, { code: 'duplicate_field_key', message: 'Duplicate', params: { key: 'a' } }),
      ),
    ).toEqual({ message: 'deviations.errors.duplicate_field_key', params: { key: 'a' } });
  });

  it('falls back to the backend message for unknown codes', () => {
    expect(deviationErrorMessage(http(422, { code: 'brand_new', message: 'Raw text' }))).toEqual({
      message: 'Raw text',
    });
  });

  it('falls back to the caller key, then the status message, for uncoded errors', () => {
    expect(deviationErrorMessage(http(409, 'in use'), 'deviations.types.inUseToast')).toEqual({
      message: 'deviations.types.inUseToast',
    });
    expect(deviationErrorMessage(http(500, null), 'deviations.types.inUseToast')).toEqual({
      message: 'errors.server',
    });
    expect(deviationErrorMessage(http(403, null))).toBeNull();
  });

  it('extracts per-field errors from coded and legacy 422s only', () => {
    const coded = { required_field: { code: 'required', params: {}, message: 'x' } };
    expect(invalidDataErrors(http(422, { code: 'invalid_data', message: 'x', data: coded }))).toBe(
      coded,
    );
    expect(invalidDataErrors(http(422, { data: { f: 'This field is required' } }))).toEqual({
      f: 'This field is required',
    });
    expect(invalidDataErrors(http(422, { code: 'invalid_clause', message: 'x' }))).toBeNull();
    expect(invalidDataErrors(http(400, { data: {} }))).toBeNull();
  });

  it('maps a legacy uncoded 400 on save to the bad-reference toast', () => {
    const errors: unknown[][] = [];
    const notifier = { error: (...args: unknown[]) => errors.push(args) };
    notifyDeviationSaveError(notifier, http(400, 'owner_user_id is not a member'));
    notifyDeviationSaveError(notifier, http(400, { code: 'owner_not_member', message: 'x' }));
    expect(errors).toEqual([
      ['deviations.create.badReferenceToast', undefined],
      ['deviations.errors.owner_not_member', {}],
    ]);
  });
});
