import { getAppointmentSortTime } from './queueOrdering';

const toDate = (value) => {
    if (!value) return null;
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value) => {
    const date = toDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const duration = (startValue, endValue) => {
    const start = toDate(startValue);
    const end = toDate(endValue);
    if (!start || !end || end < start) return null;
    return Math.round((end.getTime() - start.getTime()) / 60000);
};

export const getAttendanceTimes = (item = {}) => {
    const scheduled = getAppointmentSortTime(item);
    const call = toDate(item.chamadoEm || item.atendimentoIniciadoEm || item.horarioInicio);
    return {
    wait: Number.isFinite(scheduled) && call ? Math.max(0, Math.round((call.getTime() - scheduled) / 60000)) : duration(
        item.entradaFilaEm || item.chegadaRecepcaoEm || item.ordemFilaEm || item.criadoEm,
        item.chamadoEm || item.atendimentoIniciadoEm || item.horarioInicio,
    ),
    service: duration(
        item.atendimentoIniciadoEm || item.horarioInicio || item.chamadoEm,
        item.concluidoEm || item.horarioFim || item.dataAtendimento,
    ),
};
};

const average = (values) => values.length
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;

const percentile = (values, ratio) => {
    if (!values.length) return null;
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.ceil(ordered.length * ratio) - 1];
};

export const summarizeTimes = (items = []) => {
    const times = items.map(getAttendanceTimes);
    const waits = times.map(item => item.wait).filter(Number.isFinite);
    const services = times.map(item => item.service).filter(Number.isFinite);
    return {
        total: items.length,
        measured: times.filter(item => Number.isFinite(item.wait) || Number.isFinite(item.service)).length,
        waitMeasured: waits.length,
        serviceMeasured: services.length,
        averageWait: average(waits),
        averageService: average(services),
        p90Wait: percentile(waits, 0.9),
        maxWait: waits.length ? Math.max(...waits) : null,
    };
};

export const buildDailyTimeSeries = (items = [], month = '') => {
    const [year, monthNumber] = month.split('-').map(Number);
    const totalDays = year && monthNumber ? new Date(year, monthNumber, 0).getDate() : 0;
    return Array.from({ length: totalDays }, (_, index) => {
        const key = `${month}-${String(index + 1).padStart(2, '0')}`;
        return { day: index + 1, key, ...summarizeTimes(items.filter(item => dateKey(item.dataAtendimento) === key)) };
    });
};

export const buildAttendantTimeStats = (items = [], getAttendantName = () => 'Atendente não identificado') => {
    const grouped = new Map();
    items.forEach(item => {
        const name = getAttendantName(item);
        const key = item.atendenteUid || name;
        const group = grouped.get(key) || { key, name, items: [] };
        group.items.push(item);
        grouped.set(key, group);
    });
    return [...grouped.values()]
        .map(group => ({ key: group.key, name: group.name, ...summarizeTimes(group.items) }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
};

export const buildAttendanceConsultancy = (items = [], getAttendantName = () => 'Atendente não identificado') => {
    const summary = summarizeTimes(items);
    const coverage = summary.total ? Math.round((summary.measured / summary.total) * 100) : 0;
    const attendantStats = buildAttendantTimeStats(items, getAttendantName)
        .filter(item => Number.isFinite(item.averageWait));
    const waitSpread = attendantStats.length > 1
        ? Math.max(...attendantStats.map(item => item.averageWait)) - Math.min(...attendantStats.map(item => item.averageWait))
        : 0;
    let status = 'Sem dados suficientes';
    let tone = 'neutral';
    if (summary.waitMeasured >= 3) {
        if (summary.averageWait <= 10 && summary.p90Wait <= 20) {
            status = 'Atendimento fluindo bem';
            tone = 'good';
        } else if (summary.averageWait <= 20 && summary.p90Wait <= 35) {
            status = 'Operação estável, com pontos de ajuste';
            tone = 'attention';
        } else {
            status = 'Tempo de espera precisa de atenção';
            tone = 'critical';
        }
    }

    const findings = [];
    const recommendations = [];
    if (!summary.total) {
        findings.push('Não há atendimentos no período e nos filtros selecionados.');
        recommendations.push('Selecione um período com atendimentos concluídos para gerar o parecer.');
    } else if (coverage < 70) {
        findings.push(`Apenas ${coverage}% dos atendimentos possuem marcações de tempo suficientes.`);
        recommendations.push('Garanta o registro de entrada, chamada, início e conclusão em todos os guichês.');
    } else {
        findings.push(`A espera média foi de ${summary.averageWait ?? 0} min e 90% das esperas ficaram em até ${summary.p90Wait ?? 0} min.`);
        if (Number.isFinite(summary.averageService)) findings.push(`O atendimento durou, em média, ${summary.averageService} min.`);
    }
    if (Number.isFinite(summary.averageWait) && summary.averageWait > 20) {
        recommendations.push('Reforce os guichês nos horários de maior chegada e faça uma triagem rápida antes da fila.');
    }
    if (Number.isFinite(summary.p90Wait) && summary.p90Wait > 35) {
        recommendations.push('Acompanhe os casos de espera longa separadamente; poucos picos estão elevando a experiência dos cidadãos.');
    }
    if (Number.isFinite(summary.averageService) && summary.averageService > 30) {
        recommendations.push('Revise documentos e etapas mais frequentes para reduzir interrupções durante o atendimento.');
    }
    if (waitSpread > 10) {
        findings.push(`A diferença de espera média entre atendentes chegou a ${waitSpread} min.`);
        recommendations.push('Distribua a fila entre os guichês e compartilhe o fluxo dos atendentes com menor espera.');
    }
    if (summary.waitMeasured >= 3 && recommendations.length === 0) {
        recommendations.push('Mantenha a distribuição atual e monitore os picos para preservar o bom resultado.');
    }

    return { ...summary, coverage, status, tone, findings, recommendations };
};
