import { describe, expect, it } from 'vitest';
import { createInitialProgress, scheduleNext } from './scheduler';

describe('scheduleNext', () => {
  it('first attempt: good sets a 3-day interval and leaves ease untouched', () => {
    const progress = createInitialProgress('q1', 1);
    const result = scheduleNext(progress, 'good');
    expect(result.interval_days).toBe(3);
    expect(result.ease).toBe(progress.ease);
  });

  it('first attempt: easy sets a 4-day interval', () => {
    const progress = createInitialProgress('q1', 1);
    expect(scheduleNext(progress, 'easy').interval_days).toBe(4);
  });

  it('first attempt: again and difficult both set a 1-day interval', () => {
    const progress = createInitialProgress('q1', 1);
    expect(scheduleNext(progress, 'again').interval_days).toBe(1);
    expect(scheduleNext(progress, 'difficult').interval_days).toBe(1);
  });

  it('repeat again resets interval to 1 day and lowers ease', () => {
    const progress = { ...createInitialProgress('q1', 1), attempts: 3, interval_days: 10, ease: 2.5 };
    const result = scheduleNext(progress, 'again');
    expect(result.interval_days).toBe(1);
    expect(result.ease).toBeCloseTo(2.3);
  });

  it('repeat difficult multiplies interval by 1.2 and leaves ease unchanged', () => {
    const progress = { ...createInitialProgress('q1', 1), attempts: 3, interval_days: 10, ease: 2.5 };
    const result = scheduleNext(progress, 'difficult');
    expect(result.interval_days).toBe(12);
    expect(result.ease).toBe(2.5);
  });

  it('repeat good multiplies interval by ease and leaves ease unchanged', () => {
    const progress = { ...createInitialProgress('q1', 1), attempts: 3, interval_days: 4, ease: 2.5 };
    const result = scheduleNext(progress, 'good');
    expect(result.interval_days).toBe(10);
    expect(result.ease).toBe(2.5);
  });

  it('repeat easy multiplies aggressively and raises ease, clamped to MAX_EASE', () => {
    const progress = { ...createInitialProgress('q1', 1), attempts: 3, interval_days: 4, ease: 2.95 };
    const result = scheduleNext(progress, 'easy');
    expect(result.ease).toBeCloseTo(3.0);
  });

  it('clamps the interval to MAX_INTERVAL_DAYS', () => {
    const progress = { ...createInitialProgress('q1', 1), attempts: 3, interval_days: 170, ease: 3.0 };
    const result = scheduleNext(progress, 'good');
    expect(result.interval_days).toBe(180);
  });

  it('never lets ease drop below MIN_EASE', () => {
    const progress = { ...createInitialProgress('q1', 1), attempts: 3, interval_days: 1, ease: 1.35 };
    const result = scheduleNext(progress, 'again');
    expect(result.ease).toBeCloseTo(1.3);
  });
});
