import { emptyFeedbackForm, toCreateRequest, toUpdateRequest } from './feedback-form-model';
import { emptySurveyForm, toSurveyCreate } from './survey-form-model';

describe('feedback Kunde field (customer register)', () => {
  it('sends the customer with the feedback and patches a change', () => {
    const form = { ...emptyFeedbackForm(new Date('2026-11-19')), title: 'Sen levering' };
    expect(toCreateRequest(form).customer_id).toBeNull();
    const linked = { ...form, customer_id: 'cus-1' };
    expect(toCreateRequest(linked).customer_id).toBe('cus-1');
    expect(toUpdateRequest(form, linked, '')).toEqual({ customer_id: 'cus-1' });
    expect(toUpdateRequest(linked, form, '')).toEqual({ customer_id: null });
  });

  it('sends the survey customer', () => {
    expect(toSurveyCreate({ ...emptySurveyForm(), customer_id: 'cus-1' }).customer_id).toBe(
      'cus-1',
    );
  });
});
