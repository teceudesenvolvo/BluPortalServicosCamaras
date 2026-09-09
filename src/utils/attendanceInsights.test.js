import { buildAttendanceConsultancy, buildDailyTimeSeries, summarizeTimes } from './attendanceInsights';

const record = (day, waitMinutes, service, attendant = 'Ana') => ({
    dataAtendimento: `2026-09-${String(day).padStart(2, '0')}T12:00:00-03:00`,
    entradaFilaEm: `2026-09-${String(day).padStart(2, '0')}T09:00:00-03:00`,
    chamadoEm: `2026-09-${String(day).padStart(2, '0')}T09:${String(waitMinutes).padStart(2, '0')}:00-03:00`,
    atendimentoIniciadoEm: `2026-09-${String(day).padStart(2, '0')}T09:${String(waitMinutes).padStart(2, '0')}:00-03:00`,
    concluidoEm: new Date(new Date(`2026-09-${String(day).padStart(2, '0')}T09:${String(waitMinutes).padStart(2, '0')}:00-03:00`).getTime() + service * 60000).toISOString(),
    atendenteNome: attendant,
});

test('calculates average wait and service times', () => {
    expect(summarizeTimes([record(1, 10, 20), record(2, 20, 40)])).toMatchObject({
        averageWait: 15,
        averageService: 30,
        waitMeasured: 2,
        serviceMeasured: 2,
    });
});

test('builds one time point for every day of the selected month', () => {
    const series = buildDailyTimeSeries([record(2, 12, 18)], '2026-09');
    expect(series).toHaveLength(30);
    expect(series[1]).toMatchObject({ day: 2, averageWait: 12, averageService: 18 });
});

test('generates an actionable assessment from measured records', () => {
    const consultancy = buildAttendanceConsultancy([
        record(1, 30, 35, 'Ana'), record(2, 40, 40, 'Ana'), record(3, 50, 45, 'Bia'),
    ], item => item.atendenteNome);
    expect(consultancy.status).toBe('Tempo de espera precisa de atenção');
    expect(consultancy.recommendations.length).toBeGreaterThan(0);
    expect(consultancy.coverage).toBe(100);
});
