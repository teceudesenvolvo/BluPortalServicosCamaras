import { mergeCompletedWalkIns } from './attendanceCalendar';

const ticket = {
    id: 't1',
    sessaoGuicheId: 's1',
    semAgendamento: true,
    status: 'Concluído',
    criadoEm: '2026-09-09T08:00:00',
    chamadoEm: '2026-09-09T08:12:00',
    atendimentoIniciadoEm: '2026-09-09T08:15:00',
    concluidoEm: '2026-09-09T08:35:00',
};
test('includes completed walk-ins on the completion date and excludes waiting/absent tickets', () => {
    const result = mergeCompletedWalkIns([], [ticket, { ...ticket, id: 't2', status: 'Aguardando' }, { ...ticket, id: 't3', status: 'Ausente' }]);
    expect(result).toHaveLength(1);
    expect(result[0].dataAtendimento).toBe(ticket.concluidoEm);
});
test('enriches existing calendar entries without counting the ticket twice', () => {
    const result = mergeCompletedWalkIns([{ id: 's1_t1', nome: 'Cidadão' }], [ticket]);
    expect(result).toEqual([{
        id: 's1_t1',
        nome: 'Cidadão',
        entradaFilaEm: ticket.criadoEm,
        chamadoEm: ticket.chamadoEm,
        atendimentoIniciadoEm: ticket.atendimentoIniciadoEm,
        concluidoEm: ticket.concluidoEm,
        semAgendamento: true,
        tipoEntrada: 'Encaixe',
    }]);
});
test('matches explicit ticket IDs and preserves regular appointments', () => {
    const result = mergeCompletedWalkIns([{ id: 'legacy', ticketId: 't1' }, { id: 'appointment' }], [ticket]);
    expect(result).toHaveLength(2);
    expect(result[0].tipoEntrada).toBe('Encaixe');
    expect(result[1]).toEqual({ id: 'appointment' });
});
