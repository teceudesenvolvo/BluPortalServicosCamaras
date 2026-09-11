import { buildAlternatingQueue, getLastCalledPriority } from './queueOrdering';
import { getAttendanceTimes } from './attendanceInsights';

test('orders appointments by scheduled time ahead of walk-ins within each group', () => {
    const result = buildAlternatingQueue([
        { id: 'walk', criadoEm: '2026-09-10T07:00:00-03:00' },
        { id: 'later', appointmentDate: '2026-09-10', appointmentTime: '10:00' },
        { id: 'earlier', appointmentDate: '10/09/2026', appointmentTime: '9:00' },
    ]);
    expect(result.map(item => item.id)).toEqual(['earlier', 'later', 'walk']);
});

test('wait starts at the appointment, clamps early calls and falls back for walk-ins', () => {
    const item = { appointmentDate: '2026-09-10', appointmentTime: '09:00', entradaFilaEm: '2026-09-10T08:00:00-03:00', chamadoEm: '2026-09-10T09:15:00-03:00' };
    expect(getAttendanceTimes(item).wait).toBe(15);
    expect(getAttendanceTimes({ ...item, chamadoEm: '2026-09-10T08:50:00-03:00' }).wait).toBe(0);
    expect(getAttendanceTimes({ entradaFilaEm: item.entradaFilaEm, chamadoEm: item.chamadoEm }).wait).toBe(75);
});

const ticket = (id, prioridade, criadoEm, chamadoEm = null) => ({ id, prioridade, criadoEm, chamadoEm });

test('alternates priority and regular queues while preserving arrival order', () => {
    const result = buildAlternatingQueue([
        ticket('n2', false, '2026-09-09T09:02:00'),
        ticket('p2', true, '2026-09-09T09:03:00'),
        ticket('p1', true, '2026-09-09T09:01:00'),
        ticket('n1', false, '2026-09-09T09:00:00'),
    ]);

    expect(result.map(item => item.id)).toEqual(['p1', 'n1', 'p2', 'n2']);
});

test('starts with the opposite queue from the last called ticket', () => {
    const waiting = [ticket('p1', true, '2026-09-09T09:01:00'), ticket('n1', false, '2026-09-09T09:00:00')];
    expect(buildAlternatingQueue(waiting, true).map(item => item.id)).toEqual(['n1', 'p1']);
    expect(buildAlternatingQueue(waiting, false).map(item => item.id)).toEqual(['p1', 'n1']);
});

test('continues serving when only one queue has tickets', () => {
    const result = buildAlternatingQueue([
        ticket('n2', false, '2026-09-09T09:02:00'),
        ticket('n1', false, '2026-09-09T09:00:00'),
    ], false);

    expect(result.map(item => item.id)).toEqual(['n1', 'n2']);
});

test('detects the priority of the most recent call', () => {
    expect(getLastCalledPriority([
        ticket('p1', true, '2026-09-09T08:00:00', '2026-09-09T09:00:00'),
        ticket('n1', false, '2026-09-09T08:01:00', '2026-09-09T09:05:00'),
    ])).toBe(false);
    expect(getLastCalledPriority([])).toBeNull();
});
