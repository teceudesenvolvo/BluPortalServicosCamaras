const getTime = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    return new Date(value).getTime() || 0;
};

const getAppointmentSortTime = (ticket) => {
    const dateValue = ticket?.appointmentDate;
    const timeValue = ticket?.appointmentTime;
    if (!dateValue || !timeValue) return Number.POSITIVE_INFINITY;

    let normalizedDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) {
        normalizedDate = String(dateValue);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(dateValue))) {
        const [day, month, year] = String(dateValue).split('/');
        normalizedDate = `${year}-${month}-${day}`;
    }

    if (!normalizedDate) return Number.POSITIVE_INFINITY;
    const parsed = new Date(`${normalizedDate}T${String(timeValue).slice(0, 5)}:00-03:00`).getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const arrivalOrder = (a, b) => (
    getAppointmentSortTime(a) - getAppointmentSortTime(b)
    || getTime(a.ordemFilaEm || a.criadoEm) - getTime(b.ordemFilaEm || b.criadoEm)
);

export const getLastCalledPriority = (tickets = []) => {
    const lastCalled = tickets
        .filter(ticket => ticket.chamadoEm)
        .reduce((latest, ticket) => (
            !latest || getTime(ticket.chamadoEm) > getTime(latest.chamadoEm) ? ticket : latest
        ), null);

    return lastCalled ? Boolean(lastCalled.prioridade) : null;
};

export const buildAlternatingQueue = (tickets = [], lastCalledPriority = null) => {
    const priorityQueue = tickets.filter(ticket => Boolean(ticket.prioridade)).sort(arrivalOrder);
    const regularQueue = tickets.filter(ticket => !ticket.prioridade).sort(arrivalOrder);
    const result = [];
    let takePriority = lastCalledPriority === null ? true : !lastCalledPriority;

    while (priorityQueue.length || regularQueue.length) {
        const preferredQueue = takePriority ? priorityQueue : regularQueue;
        const fallbackQueue = takePriority ? regularQueue : priorityQueue;
        const nextTicket = preferredQueue.shift() || fallbackQueue.shift();
        if (!nextTicket) break;
        result.push(nextTicket);
        takePriority = !Boolean(nextTicket.prioridade);
    }

    return result;
};

