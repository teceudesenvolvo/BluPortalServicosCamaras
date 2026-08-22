import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import Chart from 'chart.js/auto';
import {
    LiaCalendarAltSolid,
    LiaCommentDotsSolid,
    LiaClockSolid,
    LiaStarSolid,
    LiaUserCheckSolid,
    LiaUserPlusSolid,
    LiaUserTimesSolid,
    LiaUsersSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { useTheme } from '../../contexts/ThemeContext';
import { firestore } from '../../firebase';

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

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const formatTime = (value) => toDate(value)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '--:--';
const formatCpf = (value = '') => value || 'Não informado';
const getReviewScores = (review = {}) => {
    const attendance = Number(review.notaAtendimento || review.attendanceRating || review.avaliacaoAtendimento || review.nota_atendimento || review.nota || review.rating || 0);
    const service = Number(review.notaServico || review.serviceRating || review.avaliacaoServico || review.nota_servico || review.notaGeral || review.avaliacaoGeral || review.nota || review.rating || 0);
    const available = [attendance, service].filter(score => score > 0);
    return {
        attendance,
        service,
        overall: available.length ? available.reduce((sum, score) => sum + score, 0) / available.length : 0,
    };
};

const AdminAtendimentosGuiches = () => {
    const { theme } = useTheme();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const [attendances, setAttendances] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [queueTickets, setQueueTickets] = useState([]);
    const [counters, setCounters] = useState([]);
    const [missedRequests, setMissedRequests] = useState([]);
    const [reviewsError, setReviewsError] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
    const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
    const [selectedCounter, setSelectedCounter] = useState('all');
    const [selectedYear, selectedMonthNumber] = selectedMonth.split('-');
    const availableYears = useMemo(() => {
        const years = new Set([new Date().getFullYear(), Number(selectedYear)]);
        attendances.forEach(item => {
            const year = toDate(item.dataAtendimento)?.getFullYear();
            if (year) years.add(year);
        });
        reviews.forEach(item => {
            const year = toDate(item.updatedAt || item.createdAt || item.timestamp)?.getFullYear();
            if (year) years.add(year);
        });
        return [...years].sort((a, b) => b - a);
    }, [attendances, reviews, selectedYear]);

    const changePeriod = (year, month) => {
        const nextMonth = `${year}-${String(month).padStart(2, '0')}`;
        setSelectedMonth(nextMonth);
        setSelectedDate(`${nextMonth}-01`);
    };

    useEffect(() => {
        const unsubscribeAttendances = onSnapshot(collection(firestore, 'atendimento-calendario'), snapshot => {
            setAttendances(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        });
        const unsubscribeReviews = onSnapshot(collection(firestore, 'atendimento-avaliacoes'), snapshot => {
            setReviewsError('');
            setReviews(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        }, error => {
            console.error('Erro ao carregar atendimento-avaliacoes:', error);
            setReviewsError('Não foi possível carregar as avaliações do Firestore.');
        });
        const unsubscribeQueue = onSnapshot(collection(firestore, 'atendimento-fila'), snapshot => {
            setQueueTickets(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        });
        const unsubscribeCounters = onSnapshot(collection(firestore, 'atendimento-guiches'), snapshot => {
            setCounters(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        });
        const unsubscribeRequests = onSnapshot(query(collection(firestore, 'balcao-cidadao'), where('statusFila', '==', 'Não compareceu')), snapshot => {
            setMissedRequests(snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
            );
        });
        return () => {
            unsubscribeAttendances();
            unsubscribeReviews();
            unsubscribeQueue();
            unsubscribeCounters();
            unsubscribeRequests();
        };
    }, []);

    const counterOptions = useMemo(() => {
        const options = new Map();
        counters.forEach(counter => {
            const name = counter.nome || counter.guiche || 'Guichê sem nome';
            options.set(counter.id, { value: counter.id, id: counter.id, name });
        });
        attendances.forEach(attendance => {
            const id = attendance.guicheId;
            const name = attendance.guiche;
            if (id && !options.has(id)) options.set(id, { value: id, id, name: name || 'Guichê' });
            if (!id && name) {
                const value = `name:${String(name).trim().toLocaleLowerCase('pt-BR')}`;
                if (!options.has(value)) options.set(value, { value, id: '', name });
            }
        });
        return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    }, [attendances, counters]);
    const selectedCounterData = useMemo(() => counterOptions.find(counter => counter.value === selectedCounter), [counterOptions, selectedCounter]);
    const matchesSelectedCounter = useCallback((item = {}) => {
        if (selectedCounter === 'all') return true;
        if (selectedCounterData?.id && item.guicheId === selectedCounterData.id) return true;
        return Boolean(selectedCounterData?.name && String(item.guiche || item.guicheAtendimento || '').trim().toLocaleLowerCase('pt-BR') === selectedCounterData.name.trim().toLocaleLowerCase('pt-BR'));
    }, [selectedCounter, selectedCounterData]);

    useEffect(() => {
        if (selectedCounter !== 'all' && !counterOptions.some(counter => counter.value === selectedCounter)) setSelectedCounter('all');
    }, [counterOptions, selectedCounter]);

    const monthAttendances = useMemo(() => attendances.filter(item => (
        dateKey(item.dataAtendimento).startsWith(selectedMonth) && matchesSelectedCounter(item)
    )), [attendances, matchesSelectedCounter, selectedMonth]);
    const dayAttendances = useMemo(() => monthAttendances
        .filter(item => dateKey(item.dataAtendimento) === selectedDate)
        .sort((a, b) => (toDate(a.horarioInicio)?.getTime() || 0) - (toDate(b.horarioInicio)?.getTime() || 0)), [monthAttendances, selectedDate]);

    const reviewByProtocol = useMemo(() => new Map(reviews.filter(item => item.protocolo).map(item => [item.protocolo, item])), [reviews]);
    const reviewBySession = useMemo(() => new Map(reviews.filter(item => item.sessaoGuicheId).map(item => [item.sessaoGuicheId, item])), [reviews]);
    const getAttendanceReview = (attendance) => reviewByProtocol.get(attendance.protocolo) || reviewBySession.get(attendance.sessaoGuicheId);
    const monthReviews = useMemo(() => reviews.filter(review => {
        const reviewDate = review.updatedAt || review.createdAt || review.timestamp || review.dataAvaliacao || review.data;
        const key = dateKey(reviewDate);
        if (key && !key.startsWith(selectedMonth)) return false;
        if (selectedCounter === 'all') return true;
        const attendance = attendances.find(item => (
            (review.protocolo && item.protocolo === review.protocolo)
            || (review.sessaoGuicheId && item.sessaoGuicheId === review.sessaoGuicheId)
        ));
        return matchesSelectedCounter(attendance || review);
    }), [attendances, matchesSelectedCounter, reviews, selectedCounter, selectedMonth]);
    const ranking = useMemo(() => {
        const attendanceByProtocol = new Map(attendances.filter(item => item.protocolo).map(item => [item.protocolo, item]));
        const attendanceBySession = new Map(attendances.filter(item => item.sessaoGuicheId).map(item => [item.sessaoGuicheId, item]));
        const grouped = new Map();
        monthReviews.forEach(review => {
            const attendance = attendanceByProtocol.get(review.protocolo) || attendanceBySession.get(review.sessaoGuicheId) || {};
            const uid = review.atendenteUid || attendance.atendenteUid;
            const name = review.atendenteNome || attendance.atendenteNome;
            const key = uid || name || 'nao-identificado';
            const scores = getReviewScores(review);
            const current = grouped.get(key) || { key, nome: name || 'Atendente não identificado', total: 0, soma: 0, somaAtendimento: 0, somaServico: 0 };
            current.total += 1;
            current.soma += scores.overall;
            current.somaAtendimento += scores.attendance;
            current.somaServico += scores.service;
            grouped.set(key, current);
        });
        return [...grouped.values()]
            .map(item => ({
                ...item,
                media: item.total ? item.soma / item.total : 0,
                mediaAtendimento: item.total ? item.somaAtendimento / item.total : 0,
                mediaServico: item.total ? item.somaServico / item.total : 0,
            }))
            .sort((a, b) => b.media - a.media || b.total - a.total);
    }, [attendances, monthReviews]);

    const calendarDays = useMemo(() => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const firstDay = new Date(year, month - 1, 1);
        const totalDays = new Date(year, month, 0).getDate();
        const cells = Array(firstDay.getDay()).fill(null);
        for (let day = 1; day <= totalDays; day += 1) {
            const key = `${selectedMonth}-${String(day).padStart(2, '0')}`;
            cells.push({ day, key, total: monthAttendances.filter(item => dateKey(item.dataAtendimento) === key).length });
        }
        while (cells.length % 7) cells.push(null);
        return cells;
    }, [monthAttendances, selectedMonth]);

    useEffect(() => {
        if (!chartRef.current) return undefined;
        chartInstance.current?.destroy();
        chartInstance.current = new Chart(chartRef.current, {
            type: 'bar',
            data: {
                labels: ranking.slice(0, 8).map(item => item.nome),
                datasets: [{
                    label: 'Média geral das avaliações',
                    data: ranking.slice(0, 8).map(item => Number(item.media.toFixed(2))),
                    backgroundColor: ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#14b8a6', '#2563eb', '#f97316', '#64748b'],
                    borderRadius: 8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { display: false } },
                    y: { beginAtZero: true, max: 5, ticks: { stepSize: 1, color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { color: theme === 'dark' ? 'rgba(148, 197, 229, .14)' : 'rgba(100, 116, 139, .12)' } },
                },
                plugins: { legend: { display: false } },
            },
        });
        return () => chartInstance.current?.destroy();
    }, [ranking, theme]);

    const uniqueAttendants = new Set(monthAttendances.map(item => item.atendenteUid || item.atendenteNome).filter(Boolean)).size;
    const reviewedThisMonth = monthAttendances.filter(item => Boolean(getAttendanceReview(item))).length;
    const serviceScores = monthReviews.map(review => getReviewScores(review).service).filter(score => score > 0);
    const serviceAverage = serviceScores.length ? serviceScores.reduce((sum, score) => sum + score, 0) / serviceScores.length : 0;
    const recentComments = monthReviews
        .filter(review => String(review.comentario || review.comment || review.observacao || '').trim())
        .sort((a, b) => (toDate(b.updatedAt || b.createdAt || b.timestamp)?.getTime() || 0) - (toDate(a.updatedAt || a.createdAt || a.timestamp)?.getTime() || 0))
        .slice(0, 6);
    const monthQueueTickets = queueTickets.filter(item => dateKey(item.criadoEm).startsWith(selectedMonth) && matchesSelectedCounter(item));
    const missedAppointmentIds = new Set(monthQueueTickets.filter(item => (
        !item.semAgendamento && (item.status === 'Ausente' || item.motivoRetornoFila === 'Não compareceu ao guichê')
    )).map(item => item.protocolo || item.id));
    missedRequests.forEach(item => {
        const previousDate = item.agendamentoAnteriorData || item.appointmentDate || item.dadosSolicitacao?.appointmentDate || '';
        if (String(previousDate).slice(0, 7) === selectedMonth && matchesSelectedCounter(item)) missedAppointmentIds.add(item.id);
    });
    const missedAppointments = missedAppointmentIds.size;
    const walkIns = monthQueueTickets.filter(item => item.semAgendamento || item.tipoEntrada === 'Encaixe').length;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <main className="dashboard-content counter-calendar-page">
                <header className="page-header-container counter-calendar-header">
                    <div className="header-title-section">
                        <h1>Atendimentos dos Guichês</h1>
                        <p>Agenda operacional, desempenho dos atendentes e avaliações dos cidadãos.</p>
                    </div>
                    <div className="counter-calendar-period-filters" aria-label="Período do calendário">
                        <label className="counter-calendar-month-filter">
                            <span>Mês</span>
                            <select value={selectedMonthNumber} onChange={event => changePeriod(selectedYear, event.target.value)}>
                                {MONTHS.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
                            </select>
                        </label>
                        <label className="counter-calendar-month-filter year">
                            <span>Ano</span>
                            <select value={selectedYear} onChange={event => changePeriod(event.target.value, selectedMonthNumber)}>
                                {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                            </select>
                        </label>
                        <label className="counter-calendar-month-filter counter">
                            <span>Guichê</span>
                            <select value={selectedCounter} onChange={event => setSelectedCounter(event.target.value)}>
                                <option value="all">Todos os guichês</option>
                                {counterOptions.map(counter => <option key={counter.value} value={counter.value}>{counter.name}</option>)}
                            </select>
                        </label>
                    </div>
                </header>

                <section className="counter-calendar-summary" aria-label="Resumo do mês">
                    <article><LiaUsersSolid /><div><span>Atendimentos</span><strong>{monthAttendances.length}</strong></div></article>
                    <article><LiaUserCheckSolid /><div><span>Atendentes ativos</span><strong>{uniqueAttendants}</strong></div></article>
                    <article><LiaStarSolid /><div><span>Avaliações recebidas</span><strong>{monthReviews.length}</strong></div></article>
                    <article><LiaStarSolid /><div><span>Média geral do serviço</span><strong>{serviceAverage.toFixed(1)}</strong></div></article>
                    <article><LiaUserCheckSolid /><div><span>Vinculadas ao calendário</span><strong>{reviewedThisMonth}</strong></div></article>
                    <article className="missed"><LiaUserTimesSolid /><div><span>Não compareceram</span><strong>{missedAppointments}</strong></div></article>
                    <article className="walk-in"><LiaUserPlusSolid /><div><span>Encaixes</span><strong>{walkIns}</strong></div></article>
                </section>

                <section className="counter-calendar-layout">
                    <div className="data-card counter-month-card">
                        <div className="card-header"><h3><LiaCalendarAltSolid /> Calendário de atendimentos</h3></div>
                        <div className="counter-calendar-weekdays">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span key={day}>{day}</span>)}</div>
                        <div className="counter-calendar-grid">
                            {calendarDays.map((item, index) => item ? (
                                <button key={item.key} type="button" className={selectedDate === item.key ? 'selected' : ''} onClick={() => setSelectedDate(item.key)}>
                                    <span>{item.day}</span>
                                    {item.total > 0 && <strong>{item.total} atendimento{item.total > 1 ? 's' : ''}</strong>}
                                </button>
                            ) : <span key={`empty-${index}`} className="empty" />)}
                        </div>
                    </div>

                    <div className="data-card counter-day-card">
                        <div className="card-header"><h3>Agenda de {toDate(`${selectedDate}T12:00:00`)?.toLocaleDateString('pt-BR')}</h3><span>{dayAttendances.length}</span></div>
                        <div className="counter-day-list">
                            {dayAttendances.map(item => {
                                const review = getAttendanceReview(item);
                                const reviewScores = getReviewScores(review);
                                return (
                                    <article key={item.id}>
                                        <div className="counter-day-time"><LiaClockSolid /><strong>{formatTime(item.horarioInicio)}</strong><span>{formatTime(item.horarioFim)}</span></div>
                                        <div><strong>{item.nome}</strong><span>CPF: {formatCpf(item.cpf)}</span><small>{item.guiche || 'Guichê'} · {item.setor || 'Atendimento'}</small></div>
                                        <div className="counter-day-attendant"><span>Atendente</span><strong>{item.atendenteNome || 'Não informado'}</strong>{review && <small title={`Atendimento: ${reviewScores.attendance}/5 · Serviço: ${reviewScores.service}/5`}><LiaStarSolid /> {reviewScores.overall.toFixed(1)}/5</small>}</div>
                                    </article>
                                );
                            })}
                            {dayAttendances.length === 0 && <p className="queue-empty">Nenhum atendimento registrado nesta data.</p>}
                        </div>
                    </div>
                </section>

                <section className="counter-ranking-layout">
                    <div className="data-card counter-ranking-chart"><div className="card-header"><h3>Ranking das avaliações</h3><span>Notas recebidas pelo aplicativo</span></div><div><canvas ref={chartRef} /></div></div>
                    <div className="data-card counter-ranking-list"><div className="card-header"><h3>Desempenho</h3></div>{ranking.map((item, index) => <article key={item.key}><b>{index + 1}</b><div><strong>{item.nome}</strong><span>{item.total} avaliação{item.total > 1 ? 'ões' : ''} · Atendimento {item.mediaAtendimento.toFixed(1)} · Serviço {item.mediaServico.toFixed(1)}</span></div><strong>{item.media.toFixed(1)} <LiaStarSolid /></strong></article>)}{ranking.length === 0 && <p className="queue-empty">As avaliações aparecerão aqui quando forem enviadas pelo aplicativo.</p>}</div>
                </section>

                <section className="data-card counter-comments-card">
                    <div className="card-header"><h3><LiaCommentDotsSolid /> Últimos comentários</h3><span>{recentComments.length}</span></div>
                    {reviewsError && <p className="counter-reviews-error">{reviewsError}</p>}
                    <div className="counter-comments-grid">
                        {recentComments.map(review => {
                            const scores = getReviewScores(review);
                            const comment = review.comentario || review.comment || review.observacao;
                            return <article key={review.id}><div><strong>{review.atendenteNome || 'Atendente não identificado'}</strong><span><LiaStarSolid /> {scores.overall.toFixed(1)}/5</span></div><p>{comment}</p><small>{toDate(review.updatedAt || review.createdAt || review.timestamp)?.toLocaleString('pt-BR') || 'Data não informada'} · {review.assunto || review.setor || 'Atendimento'}</small></article>;
                        })}
                        {!reviewsError && recentComments.length === 0 && <p className="queue-empty">Nenhum comentário recebido neste período.</p>}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default AdminAtendimentosGuiches;
