import { dateToBr, getFreeTimes, parseTimes, weekdayKey } from './proconSchedule';

test('normalizes configured appointment times', () => {
    expect(parseTimes('09:00, 08:00, 09:00, inválido')).toEqual(['08:00', '09:00']);
});

test('returns only free slots for a configured day', () => {
    expect(weekdayKey('2026-09-09')).toBe('wednesday');
    expect(getFreeTimes({
        date: '2026-09-09',
        availability: { wednesday: ['08:00', '09:00'] },
        bookedSlots: { '2026-09-09': ['08:00'] },
    })).toEqual(['09:00']);
});

test('blocks manually unavailable dates', () => {
    expect(dateToBr('2026-12-25')).toBe('25/12/2026');
    expect(getFreeTimes({ date: '2026-12-25', availability: { friday: ['08:00'] }, blockedDates: ['25/12/2026'] })).toEqual([]);
});
