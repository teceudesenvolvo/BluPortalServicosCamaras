import { mergeCompletedWalkIns } from './attendanceCalendar';

const ticket = { id: 't1', sessaoGuicheId: 's1', semAgendamento: true, status: 'Concluído', concluidoEm: '2026-09-09T12:00:00', criadoEm: '2026-09-08T12:00:00' };
test('includes completed walk-ins on the completion date and excludes waiting/absent tickets', () => {
    const result = mergeCompletedWalkIns([], [ticket, { ...ticket, id: 't2', status: 'Aguardando' }, { ...ticket, id: 't3', status: 'Ausente' }]);
    expect(result).toHaveLength(1);
    expect(result[0].dataAtendimento).toBe(ticket.concluidoEm);
});
test('enriches existing calendar entries without counting the ticket twice', () => {
    const result = mergeCompletedWalkIns([{ id: 's1_t1', nome: 'Cidadão' }], [ticket]);
    expect(result).toEqual([{ id: 's1_t1', nome: 'Cidadão', semAgendamento: true, tipoEntrada: 'Encaixe' }]);
});
test('matches explicit ticket IDs and preserves regular appointments', () => {
    const result = mergeCompletedWalkIns([{ id: 'legacy', ticketId: 't1' }, { id: 'appointment' }], [ticket]);
    expect(result).toHaveLength(2);
    expect(result[0].tipoEntrada).toBe('Encaixe');
    expect(result[1]).toEqual({ id: 'appointment' });
});
