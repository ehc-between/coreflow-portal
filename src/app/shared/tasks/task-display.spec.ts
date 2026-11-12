import {
  addDays,
  dayOf,
  decodeAssignee,
  dueAtFromDay,
  encodeAssignee,
  isClosedStatus,
  taskPriorityTone,
  taskStatusTone,
} from './task-display';

describe('task display helpers', () => {
  it('encodes and decodes assignees', () => {
    expect(encodeAssignee({ type: 'role', value: 'quality_manager' })).toBe('role:quality_manager');
    expect(encodeAssignee(null)).toBe('');
    expect(decodeAssignee('user:u-1')).toEqual({ type: 'user', value: 'u-1' });
    expect(decodeAssignee('department:d:1')).toEqual({ type: 'department', value: 'd:1' });
    expect(decodeAssignee('')).toBeNull();
    expect(decodeAssignee('team:x')).toBeNull();
    expect(decodeAssignee('user:')).toBeNull();
  });

  it('sends a picked day as the end of that day and reads the day back', () => {
    expect(dueAtFromDay('2026-11-30')).toBe('2026-11-30T23:59:59');
    expect(dueAtFromDay('')).toBeNull();
    expect(dueAtFromDay('30.11.2026')).toBeNull();
    expect(dayOf('2026-11-30T23:59:59')).toBe('2026-11-30');
    expect(dayOf(null)).toBe('');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-11-28', 6)).toBe('2026-12-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('classifies statuses and priorities', () => {
    expect(isClosedStatus('done')).toBe(true);
    expect(isClosedStatus('cancelled')).toBe(true);
    expect(isClosedStatus('blocked')).toBe(false);
    expect(taskStatusTone('done')).toBe('pass');
    expect(taskStatusTone('blocked')).toBe('warn');
    expect(taskPriorityTone('urgent')).toBe('fail');
    expect(taskPriorityTone('low')).toBe('neutral');
  });
});
