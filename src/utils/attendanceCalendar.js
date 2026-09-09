export const isWalkIn = (item) => Boolean(item.semAgendamento || item.tipoEntrada === 'Encaixe');

// Older calendar records do not carry the ticket's entry type.
export const mergeCompletedWalkIns = (records, tickets) => {
    const merged = new Map(records.map(item => [item.id, { ...item }]));
    tickets.filter(ticket => ticket.status === 'Concluído').forEach(ticket => {
        const calendarId = ticket.sessaoGuicheId ? `${ticket.sessaoGuicheId}_${ticket.id}` : '';
        const existing = merged.get(calendarId) || records.find(item => item.ticketId === ticket.id);
        if (existing) {
            merged.set(existing.id, {
                ...existing,
                entradaFilaEm: existing.entradaFilaEm || ticket.entradaFilaEm || ticket.chegadaRecepcaoEm || ticket.ordemFilaEm || ticket.criadoEm,
                chamadoEm: existing.chamadoEm || ticket.chamadoEm,
                atendimentoIniciadoEm: existing.atendimentoIniciadoEm || ticket.atendimentoIniciadoEm || ticket.chamadoEm,
                concluidoEm: existing.concluidoEm || ticket.concluidoEm,
                semAgendamento: Boolean(existing.semAgendamento || isWalkIn(ticket)),
                tipoEntrada: existing.tipoEntrada || ticket.tipoEntrada || (isWalkIn(ticket) ? 'Encaixe' : ''),
            });
            return;
        }
        if (!isWalkIn(ticket)) return;
        if (!ticket.concluidoEm) return;
        const id = `fila:${ticket.id}`;
        merged.set(id, {
            ...ticket,
            id,
            ticketId: ticket.id,
            cpf: ticket.cpf || ticket.dadosBeneficiario?.cpf || ticket.dadosUsuario?.cpf || '',
            dataAtendimento: ticket.concluidoEm,
            horarioInicio: ticket.atendimentoIniciadoEm || ticket.chamadoEm,
            horarioFim: ticket.concluidoEm,
            entradaFilaEm: ticket.entradaFilaEm || ticket.chegadaRecepcaoEm || ticket.ordemFilaEm || ticket.criadoEm,
            chamadoEm: ticket.chamadoEm,
            atendimentoIniciadoEm: ticket.atendimentoIniciadoEm || ticket.chamadoEm,
            concluidoEm: ticket.concluidoEm,
            semAgendamento: true,
            tipoEntrada: 'Encaixe',
        });
    });
    return [...merged.values()];
};
