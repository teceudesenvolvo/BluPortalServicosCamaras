import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "../../services/firebaseApi.js";
import Chart from 'chart.js/auto';
import {
    LiaCalendarAltSolid,
    LiaChartBarSolid,
    LiaClockSolid,
    LiaLightbulbSolid,
    LiaPrintSolid,
    LiaTimesSolid,
    LiaUserCheckSolid,
    LiaUserPlusSolid,
    LiaUserTimesSolid,
    LiaUsersSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { useTheme } from '../../contexts/ThemeContext';
import { auth, firestore } from "../../services/firebaseApi.js";
import { printTableReport } from '../../utils/printReport';
import { isWalkIn, mergeCompletedWalkIns } from '../../utils/attendanceCalendar';
import { buildAttendanceConsultancy, buildAttendantTimeStats, buildDailyTimeSeries, getAttendanceTimes } from '../../utils/attendanceInsights';

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
const getDurationInMinutes = (startValue, endValue) => {
    const start = toDate(startValue);
    const end = toDate(endValue);
    if (!start || !end || end < start) return null;
    return Math.round((end.getTime() - start.getTime()) / 60000);
};
const formatDuration = (minutes) => {
    if (minutes === null) return 'N/A';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
};
const getServiceStartTime = (item) => item.atendimentoIniciadoEm || item.horarioInicio || item.chamadoEm;
const getServiceEndTime = (item) => item.concluidoEm || item.horarioFim || item.dataAtendimento;
const normalizeSearch = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

const AdminAtendimentosGuiches = () => {
    const { theme } = useTheme();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const timeChartRef = useRef(null);
    const timeChartInstance = useRef(null);
    const attendantTimeChartRef = useRef(null);
    const attendantTimeChartInstance = useRef(null);
    const [calendarRecords, setAttendances] = useState([]);
    const [users, setUsers] = useState([]);
    const [queueTickets, setQueueTickets] = useState([]);
    const [counters, setCounters] = useState([]);
    const [missedRequests, setMissedRequests] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
    const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
    const [selectedCounter, setSelectedCounter] = useState('all');
    const [analysisAttendant, setAnalysisAttendant] = useState('all');
    const [agendaSearch, setAgendaSearch] = useState('');
    const [agendaAttendant, setAgendaAttendant] = useState('all');
    const [agendaEntryType, setAgendaEntryType] = useState('all');
    const [reportOpen, setReportOpen] = useState(false);
    const [summaryModal, setSummaryModal] = useState('');
    const [savingStatusId, setSavingStatusId] = useState('');
    const [summaryDrafts, setSummaryDrafts] = useState({});
    const [selectedSummaryRows, setSelectedSummaryRows] = useState([]);
    const [bulkSummaryStatus, setBulkSummaryStatus] = useState('');
    const [statusFeedback, setStatusFeedback] = useState('');
    const [reportStartDate, setReportStartDate] = useState(dateKey(new Date()));
    const [reportEndDate, setReportEndDate] = useState(dateKey(new Date()));
    const [reportCounter, setReportCounter] = useState('all');
    const [reportAttendant, setReportAttendant] = useState('all');
    const attendances = useMemo(() => mergeCompletedWalkIns(calendarRecords, queueTickets), [calendarRecords, queueTickets]);
    const [selectedYear, selectedMonthNumber] = selectedMonth.split('-');
    const availableYears = useMemo(() => {
        const years = new Set([new Date().getFullYear(), Number(selectedYear)]);
        attendances.forEach(item => {
            const year = toDate(item.dataAtendimento)?.getFullYear();
            if (year) years.add(year);
        });
        return [...years].sort((a, b) => b - a);
    }, [attendances, selectedYear]);

    const changePeriod = (year, month) => {
        const nextMonth = `${year}-${String(month).padStart(2, '0')}`;
        setSelectedMonth(nextMonth);
        setSelectedDate(`${nextMonth}-01`);
    };

    useEffect(() => {
        const unsubscribeAttendances = onSnapshot(collection(firestore, 'atendimento-calendario'), snapshot => {
            setAttendances(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        });
        const unsubscribeUsers = onSnapshot(collection(firestore, 'users'), snapshot => {
            setUsers(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        }, error => console.error('Erro ao carregar nomes dos atendentes:', error));
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
            unsubscribeUsers();
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
    const matchesCounter = useCallback((item = {}, counterValue = 'all') => {
        if (counterValue === 'all') return true;
        const counterData = counterOptions.find(counter => counter.value === counterValue);
        if (counterData?.id && item.guicheId === counterData.id) return true;
        return Boolean(counterData?.name && String(item.guiche || item.guicheAtendimento || '').trim().toLocaleLowerCase('pt-BR') === counterData.name.trim().toLocaleLowerCase('pt-BR'));
    }, [counterOptions]);
    const matchesSelectedCounter = useCallback((item = {}) => matchesCounter(item, selectedCounter), [matchesCounter, selectedCounter]);

    useEffect(() => {
        if (selectedCounter !== 'all' && !counterOptions.some(counter => counter.value === selectedCounter)) setSelectedCounter('all');
    }, [counterOptions, selectedCounter]);

    const monthAttendances = useMemo(() => attendances.filter(item => (
        dateKey(item.dataAtendimento).startsWith(selectedMonth) && matchesSelectedCounter(item)
    )), [attendances, matchesSelectedCounter, selectedMonth]);
    const dayAttendances = useMemo(() => monthAttendances
        .filter(item => dateKey(item.dataAtendimento) === selectedDate)
        .sort((a, b) => (toDate(a.horarioInicio)?.getTime() || 0) - (toDate(b.horarioInicio)?.getTime() || 0)), [monthAttendances, selectedDate]);

    const getAttendantName = useCallback((item) => {
        const email = String(item.atendenteEmail || item.atendenteNome || '').trim().toLowerCase();
        const user = users.find(user => (item.atendenteUid && (user.id === item.atendenteUid || user.uid === item.atendenteUid))
            || (email.includes('@') && String(user.email || '').toLowerCase() === email));
        return [user?.nome, user?.name, user?.displayName, item.atendenteNome]
            .find(name => typeof name === 'string' && name.trim() && !name.includes('@')) || 'Atendente não identificado';
    }, [users]);
    const ranking = useMemo(() => {
        const grouped = new Map();
        dayAttendances.forEach(item => {
            const key = item.atendenteUid || item.atendenteNome || 'nao-identificado';
            const current = grouped.get(key) || { key, nome: getAttendantName(item), total: 0 };
            current.total += 1;
            grouped.set(key, current);
        });
        return [...grouped.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
    }, [dayAttendances, getAttendantName]);
    const dayAttendantOptions = useMemo(() => {
        const options = new Map();
        dayAttendances.forEach(item => {
            const name = getAttendantName(item);
            const value = item.atendenteUid ? `uid:${item.atendenteUid}` : `name:${normalizeSearch(name)}`;
            options.set(value, { value, name });
        });
        return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [dayAttendances, getAttendantName]);
    const filteredDayAttendances = useMemo(() => {
        const term = normalizeSearch(agendaSearch);
        return dayAttendances.filter(item => {
            if (agendaEntryType === 'walk-in' && !isWalkIn(item)) return false;
            if (agendaEntryType === 'appointment' && isWalkIn(item)) return false;
            if (agendaAttendant.startsWith('uid:') && item.atendenteUid !== agendaAttendant.slice(4)) return false;
            if (agendaAttendant.startsWith('name:') && normalizeSearch(getAttendantName(item)) !== agendaAttendant.slice(5)) return false;
            if (!term) return true;
            return normalizeSearch([
                item.nome,
                item.cpf,
                item.protocolo,
                item.assunto,
                item.setor,
                item.guiche,
                getAttendantName(item),
            ].filter(Boolean).join(' ')).includes(term);
        });
    }, [agendaAttendant, agendaEntryType, agendaSearch, dayAttendances, getAttendantName]);
    const agendaHasFilters = Boolean(agendaSearch.trim() || agendaAttendant !== 'all' || agendaEntryType !== 'all');

    useEffect(() => {
        if (agendaAttendant !== 'all' && !dayAttendantOptions.some(item => item.value === agendaAttendant)) setAgendaAttendant('all');
    }, [agendaAttendant, dayAttendantOptions]);

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
                labels: calendarDays.filter(Boolean).map(item => String(item.day)),
                datasets: [{
                    label: 'Atendimentos',
                    data: calendarDays.filter(Boolean).map(item => item.total),
                    backgroundColor: calendarDays.filter(Boolean).map(item => item.key === selectedDate ? '#025aa1' : '#38bdf8'),
                    borderRadius: 8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { color: theme === 'dark' ? 'rgba(148, 197, 229, .14)' : 'rgba(100, 116, 139, .12)' } },
                },
                plugins: { legend: { display: false } },
            },
        });
        return () => chartInstance.current?.destroy();
    }, [calendarDays, selectedDate, theme]);

    const uniqueAttendants = new Set(dayAttendances.map(item => item.atendenteUid || item.atendenteNome).filter(Boolean)).size;
    const activeCounters = new Set(dayAttendances.map(item => item.guicheId || item.guiche).filter(Boolean)).size;
    const dayQueueTickets = queueTickets.filter(item => dateKey(item.criadoEm) === selectedDate && matchesSelectedCounter(item));
    const missedAppointmentIds = new Set(dayQueueTickets.filter(item => (
        item.status === 'Ausente' || item.motivoRetornoFila === 'Não compareceu ao guichê'
    )).map(item => item.protocolo || item.id));
    missedRequests.forEach(item => {
        const previousDate = item.agendamentoAnteriorData || item.appointmentDate || item.dadosSolicitacao?.appointmentDate || '';
        if (String(previousDate).slice(0, 10) === selectedDate && matchesSelectedCounter(item)) missedAppointmentIds.add(item.id);
    });
    const missedAppointments = missedAppointmentIds.size;
    const walkIns = dayAttendances.filter(isWalkIn).length;
    const missedQueueRows = dayQueueTickets.filter(item => (
        item.status === 'Ausente' || item.motivoRetornoFila === 'Não compareceu ao guichê'
    )).map(item => ({ ...item, source: 'queue' }));
    const missedRequestRows = missedRequests.filter(item => {
        const previousDate = item.agendamentoAnteriorData || item.appointmentDate || item.dadosSolicitacao?.appointmentDate || '';
        return String(previousDate).slice(0, 10) === selectedDate && matchesSelectedCounter(item);
    }).map(item => ({ ...item, source: 'request' }));

    const summaryModalTitles = {
        attendances: 'Atendimentos do dia',
        attendants: 'Atendimentos por atendente',
        counters: 'Atendimentos por guichê',
        missed: 'Não compareceram',
        walkIns: 'Encaixes atendidos',
    };
    const summaryModalRows = summaryModal === 'missed'
        ? [...missedQueueRows, ...missedRequestRows]
        : dayAttendances
            .filter(item => summaryModal !== 'walkIns' || isWalkIn(item))
            .filter(item => summaryModal !== 'attendants' || Boolean(item.atendenteUid || item.atendenteNome))
            .filter(item => summaryModal !== 'counters' || Boolean(item.guicheId || item.guiche))
            .map(item => ({
                ...item,
                source: 'attendance',
                queueTicket: queueTickets.find(ticket => (
                    ticket.id === item.ticketId
                    || ticket.id === item.id
                    || item.id === `fila:${ticket.id}`
                )),
            }));

    const getSummaryRowKey = row => `${row.source}:${row.id}`;
    const openSummaryModal = key => {
        setSummaryDrafts({});
        setSelectedSummaryRows([]);
        setBulkSummaryStatus('');
        setStatusFeedback('');
        setSummaryModal(key);
    };
    const persistSummaryStatus = async (row, nextStatus) => {
        if (row.source === 'request') {
            await updateDoc(doc(firestore, 'balcao-cidadao', row.id), {
                statusFila: nextStatus,
                ultimaAtualizacao: new Date(),
            });
            return;
        }

        const ticket = row.queueTicket || row;
        if (!ticket.id || !queueTickets.some(item => item.id === ticket.id)) {
            throw new Error('Este registro histórico não está vinculado a uma senha editável da fila.');
        }
        const now = new Date();
        await updateDoc(doc(firestore, 'atendimento-fila', ticket.id), {
            status: nextStatus,
            concluidoEm: nextStatus === 'Concluído' ? now : null,
            ausenteEm: nextStatus === 'Ausente' ? now : null,
            atualizadoEm: now,
            atualizadoPor: users.find(user => user.id === auth.currentUser?.uid)?.nome || auth.currentUser?.email || 'Admin',
        });
        if (ticket.guicheId && ['Aguardando', 'Ausente', 'Concluído'].includes(nextStatus)) {
            await setDoc(doc(firestore, 'atendimento-guiches', ticket.guicheId), {
                senhaAtual: null,
                ticketAtualId: null,
                atualizadoEm: now,
            }, { merge: true });
        }
        const calendarRecord = calendarRecords.find(item => item.ticketId === ticket.id);
        if (calendarRecord && nextStatus !== 'Concluído') {
            await deleteDoc(doc(firestore, 'atendimento-calendario', calendarRecord.id));
        } else if (nextStatus === 'Concluído' && ticket.sessaoGuicheId) {
            await setDoc(doc(firestore, 'atendimento-calendario', `${ticket.sessaoGuicheId}_${ticket.id}`), {
                ticketId: ticket.id,
                nome: ticket.nome || 'Cidadão',
                cpf: ticket.cpf || '',
                protocolo: ticket.protocolo || '',
                setor: ticket.setor || 'Balcão do Cidadão',
                guicheId: ticket.guicheId || '',
                guiche: ticket.guiche || '',
                atendenteUid: ticket.atendenteUid || '',
                atendenteNome: ticket.atendenteNome || '',
                semAgendamento: Boolean(ticket.semAgendamento || ticket.tipoEntrada === 'Encaixe'),
                tipoEntrada: ticket.tipoEntrada || '',
                dataAtendimento: now,
                horarioInicio: ticket.atendimentoIniciadoEm || ticket.chamadoEm || now,
                horarioFim: now,
                concluidoEm: now,
            }, { merge: true });
        }
    };
    const handleSaveSummaryStatuses = async () => {
        const rowsToSave = summaryModalRows.filter(row => (
            Object.prototype.hasOwnProperty.call(summaryDrafts, getSummaryRowKey(row))
            && (selectedSummaryRows.length === 0 || selectedSummaryRows.includes(getSummaryRowKey(row)))
        ));
        if (!rowsToSave.length) {
            setStatusFeedback('Selecione pelo menos um registro alterado para salvar.');
            return;
        }
        setStatusFeedback('');
        const savedKeys = [];
        const failures = [];
        for (const row of rowsToSave) {
            const rowKey = getSummaryRowKey(row);
            setSavingStatusId(rowKey);
            try {
                await persistSummaryStatus(row, summaryDrafts[rowKey]);
                savedKeys.push(rowKey);
            } catch (error) {
                console.error('Erro ao atualizar status pelo resumo dos guichês:', error);
                failures.push(`${row.protocolo || row.id}: ${error.message || 'falha ao salvar'}`);
            }
        }
        setSavingStatusId('');
        setSummaryDrafts(current => Object.fromEntries(
            Object.entries(current).filter(([key]) => !savedKeys.includes(key))
        ));
        setSelectedSummaryRows(current => current.filter(key => !savedKeys.includes(key)));
        setBulkSummaryStatus('');
        setStatusFeedback(failures.length
            ? `${savedKeys.length} salvo(s); ${failures.length} falhou/falharam. ${failures.join(' · ')}`
            : `${savedKeys.length} status salvo(s) com sucesso.`);
    };

    const attendantOptions = useMemo(() => {
        const options = new Map();
        attendances.forEach(item => {
            const name = getAttendantName(item);
            if (!name && !item.atendenteUid) return;
            const value = item.atendenteUid
                ? `uid:${item.atendenteUid}`
                : `name:${name.toLocaleLowerCase('pt-BR')}`;
            options.set(value, { value, name: name || 'Atendente não identificado' });
        });
        return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [attendances, getAttendantName]);

    const analysisAttendances = useMemo(() => monthAttendances.filter(item => {
        if (analysisAttendant === 'all') return true;
        if (analysisAttendant.startsWith('uid:')) return item.atendenteUid === analysisAttendant.slice(4);
        return getAttendantName(item).trim().toLocaleLowerCase('pt-BR') === analysisAttendant.slice(5);
    }), [analysisAttendant, getAttendantName, monthAttendances]);
    const dailyTimeSeries = useMemo(() => buildDailyTimeSeries(analysisAttendances, selectedMonth), [analysisAttendances, selectedMonth]);
    const attendantTimeStats = useMemo(() => buildAttendantTimeStats(analysisAttendances, getAttendantName), [analysisAttendances, getAttendantName]);
    const consultancy = useMemo(() => buildAttendanceConsultancy(analysisAttendances, getAttendantName), [analysisAttendances, getAttendantName]);
    const analysisAttendantLabel = analysisAttendant === 'all'
        ? 'Todos os atendentes'
        : attendantOptions.find(item => item.value === analysisAttendant)?.name || 'Atendente selecionado';

    useEffect(() => {
        if (analysisAttendant !== 'all' && !attendantOptions.some(item => item.value === analysisAttendant)) setAnalysisAttendant('all');
    }, [analysisAttendant, attendantOptions]);

    useEffect(() => {
        if (!timeChartRef.current) return undefined;
        timeChartInstance.current?.destroy();
        const points = dailyTimeSeries.filter(item => item.measured > 0);
        timeChartInstance.current = new Chart(timeChartRef.current, {
            type: 'line',
            data: {
                labels: points.map(item => String(item.day)),
                datasets: [
                    { label: 'Espera média', data: points.map(item => item.averageWait), borderColor: '#ea580c', backgroundColor: 'rgba(234,88,12,.12)', tension: .3, spanGaps: true },
                    { label: 'Atendimento médio', data: points.map(item => item.averageService), borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,.12)', tension: .3, spanGaps: true },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { title: { display: true, text: 'Dia do mês', color: theme === 'dark' ? '#dbeafe' : '#64748b' }, ticks: { color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { display: false } },
                    y: { beginAtZero: true, title: { display: true, text: 'Minutos', color: theme === 'dark' ? '#dbeafe' : '#64748b' }, ticks: { color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { color: theme === 'dark' ? 'rgba(148,197,229,.14)' : 'rgba(100,116,139,.12)' } },
                },
                plugins: { legend: { labels: { color: theme === 'dark' ? '#dbeafe' : '#334155' } } },
            },
        });
        return () => timeChartInstance.current?.destroy();
    }, [dailyTimeSeries, theme]);

    useEffect(() => {
        if (!attendantTimeChartRef.current) return undefined;
        attendantTimeChartInstance.current?.destroy();
        attendantTimeChartInstance.current = new Chart(attendantTimeChartRef.current, {
            type: 'bar',
            data: {
                labels: attendantTimeStats.map(item => item.name),
                datasets: [
                    { label: 'Espera média', data: attendantTimeStats.map(item => item.averageWait), backgroundColor: '#fb923c', borderRadius: 6 },
                    { label: 'Atendimento médio', data: attendantTimeStats.map(item => item.averageService), backgroundColor: '#38bdf8', borderRadius: 6 },
                ],
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Minutos', color: theme === 'dark' ? '#dbeafe' : '#64748b' }, ticks: { color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { color: theme === 'dark' ? 'rgba(148,197,229,.14)' : 'rgba(100,116,139,.12)' } },
                    y: { ticks: { color: theme === 'dark' ? '#dbeafe' : '#475569' }, grid: { display: false } },
                },
                plugins: { legend: { labels: { color: theme === 'dark' ? '#dbeafe' : '#334155' } } },
            },
        });
        return () => attendantTimeChartInstance.current?.destroy();
    }, [attendantTimeStats, theme]);

    const reportRows = useMemo(() => attendances.filter(item => {
        const itemDate = dateKey(item.dataAtendimento);
        const matchesPeriod = Boolean(reportStartDate && reportEndDate)
            && itemDate >= reportStartDate
            && itemDate <= reportEndDate;
        if (!matchesPeriod || !matchesCounter(item, reportCounter)) return false;
        if (reportAttendant === 'all') return true;
        if (reportAttendant.startsWith('uid:')) return item.atendenteUid === reportAttendant.slice(4);
        return getAttendantName(item).trim().toLocaleLowerCase('pt-BR') === reportAttendant.slice(5);
    }).sort((a, b) => {
        const dateDifference = (toDate(a.dataAtendimento)?.getTime() || 0) - (toDate(b.dataAtendimento)?.getTime() || 0);
        if (dateDifference) return dateDifference;
        return (toDate(a.horarioInicio)?.getTime() || 0) - (toDate(b.horarioInicio)?.getTime() || 0);
    }), [attendances, matchesCounter, reportAttendant, reportCounter, reportStartDate, reportEndDate, getAttendantName]);

    const openReport = () => {
        setReportStartDate(selectedDate);
        setReportEndDate(selectedDate);
        setReportCounter(selectedCounter);
        setReportAttendant('all');
        setReportOpen(true);
    };

    const generateReport = () => {
        const formatDateLabel = value => toDate(`${value}T12:00:00`)?.toLocaleDateString('pt-BR') || value;
        const periodLabel = `Período de ${formatDateLabel(reportStartDate)} a ${formatDateLabel(reportEndDate)}`;
        const counterLabel = reportCounter === 'all'
            ? 'Todos os guichês'
            : counterOptions.find(item => item.value === reportCounter)?.name || 'Guichê selecionado';
        const attendantLabel = reportAttendant === 'all'
            ? 'Todos os atendentes'
            : attendantOptions.find(item => item.value === reportAttendant)?.name || 'Atendente selecionado';

        printTableReport({
            title: 'Relatório de Atendimentos dos Guichês',
            subtitle: `${periodLabel} | ${counterLabel} | ${attendantLabel} | Total: ${reportRows.length} atendimentos (incluindo ${reportRows.filter(isWalkIn).length} encaixes)`,
            columns: [
                { label: '#', width: '3%', render: (_, index) => index + 1 },
                { label: 'Data', width: '8%', render: item => toDate(item.dataAtendimento)?.toLocaleDateString('pt-BR') || 'N/A' },
                { label: 'Horário', width: '8%', render: item => `${formatTime(item.horarioInicio)} - ${formatTime(item.horarioFim)}` },
                { label: 'Guichê', width: '8%', render: item => item.guiche || 'Não informado' },
                { label: 'Atendente', width: '13%', render: item => getAttendantName(item) },
                { label: 'Cidadão / Beneficiário', width: '15%', render: item => item.nome || 'Não informado' },
                { label: 'CPF', width: '11%', render: item => formatCpf(item.cpf) },
                { label: 'Serviço', width: '12%', render: item => item.assunto || item.setor || 'Atendimento' },
                { label: 'Protocolo', width: '11%', render: item => item.protocolo || 'Não informado' },
                { label: 'Observações', width: '11%', render: () => '' },
            ],
            rows: reportRows,
        });
    };

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <main className="dashboard-content counter-calendar-page">
                <header className="page-header-container counter-calendar-header">
                    <div className="header-title-section">
                        <h1>Atendimentos dos Guichês</h1>
                        <p>Acompanhe a agenda diária e o volume de atendimentos dos guichês. Todos os totais incluem encaixes.</p>
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
                        <button type="button" className="counter-report-button" onClick={openReport}>
                            <LiaPrintSolid /> Relatório
                        </button>
                    </div>
                </header>

                <section className="counter-calendar-summary" aria-label="Resumo do dia selecionado">
                    <h2 className="counter-summary-date">Resumo de {toDate(`${selectedDate}T12:00:00`)?.toLocaleDateString('pt-BR')}</h2>
                    <button type="button" className="counter-summary-card" onClick={() => openSummaryModal('attendances')}><LiaUsersSolid /><div><span>Atendimentos</span><strong>{dayAttendances.length}</strong></div></button>
                    <button type="button" className="counter-summary-card" onClick={() => openSummaryModal('attendants')}><LiaUserCheckSolid /><div><span>Atendentes ativos</span><strong>{uniqueAttendants}</strong></div></button>
                    <button type="button" className="counter-summary-card" onClick={() => openSummaryModal('counters')}><LiaCalendarAltSolid /><div><span>Guichês com atendimentos</span><strong>{activeCounters}</strong></div></button>
                    <button type="button" className="counter-summary-card missed" onClick={() => openSummaryModal('missed')}><LiaUserTimesSolid /><div><span>Não compareceram</span><strong>{missedAppointments}</strong></div></button>
                    <button type="button" className="counter-summary-card walk-in" onClick={() => openSummaryModal('walkIns')}><LiaUserPlusSolid /><div><span>Encaixes atendidos</span><strong>{walkIns}</strong></div></button>
                </section>

                <section className="counter-calendar-layout">
                    <div className="data-card counter-month-card">
                        <div className="card-header"><h3><LiaCalendarAltSolid /> Calendário de atendimentos</h3></div>
                        <div className="counter-calendar-weekdays">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span key={day}>{day}</span>)}</div>
                        <div className="counter-calendar-grid">
                            {calendarDays.map((item, index) => item ? (
                                <button key={item.key} type="button" className={selectedDate === item.key ? 'selected' : ''} aria-pressed={selectedDate === item.key} aria-label={`${item.day}: ${item.total} atendimentos`} onClick={() => setSelectedDate(item.key)}>
                                    <span>{item.day}</span>
                                    {item.total > 0 && <strong>{item.total} atend</strong>}
                                </button>
                            ) : <span key={`empty-${index}`} className="empty" />)}
                        </div>
                    </div>

                    <div className="data-card counter-day-card">
                        <div className="card-header"><h3>Agenda de {toDate(`${selectedDate}T12:00:00`)?.toLocaleDateString('pt-BR')}</h3><span>{agendaHasFilters ? `${filteredDayAttendances.length}/${dayAttendances.length}` : dayAttendances.length}</span></div>
                        <div className="counter-agenda-filters">
                            <label className="counter-agenda-search"><span>Pesquisar na agenda</span><input type="search" value={agendaSearch} onChange={event => setAgendaSearch(event.target.value)} placeholder="Nome, CPF, protocolo, serviço..." /></label>
                            <label><span>Atendente</span><select value={agendaAttendant} onChange={event => setAgendaAttendant(event.target.value)}><option value="all">Todos</option>{dayAttendantOptions.map(attendant => <option key={attendant.value} value={attendant.value}>{attendant.name}</option>)}</select></label>
                            <label><span>Entrada</span><select value={agendaEntryType} onChange={event => setAgendaEntryType(event.target.value)}><option value="all">Todas</option><option value="appointment">Agendamentos</option><option value="walk-in">Encaixes</option></select></label>
                            {agendaHasFilters && <button type="button" onClick={() => { setAgendaSearch(''); setAgendaAttendant('all'); setAgendaEntryType('all'); }}>Limpar</button>}
                        </div>
                        <div className="counter-day-list">
                            {filteredDayAttendances.map(item => {
                                const waitMinutes = getAttendanceTimes(item).wait;
                                const serviceMinutes = getDurationInMinutes(getServiceStartTime(item), getServiceEndTime(item));
                                return (
                                    <article key={item.id}>
                                        <div className="counter-day-time"><LiaClockSolid /><strong>{formatTime(item.horarioInicio)}</strong><span>{formatTime(item.horarioFim)}</span></div>
                                        <div className="counter-day-citizen">{isWalkIn(item) && <small className="counter-walk-in-badge">Encaixe atendido</small>}<strong>{item.nome || 'Cidadão não informado'}</strong><span>CPF: {formatCpf(item.cpf)}</span><small>{item.guiche || 'Guichê'} · {item.setor || 'Atendimento'}</small></div>
                                        <div className="counter-day-attendant"><span>Atendente</span><strong>{getAttendantName(item)}</strong></div>
                                        <div className="counter-day-durations">
                                            <span><b>Espera</b>{formatDuration(waitMinutes)}</span>
                                            <span><b>Atendimento</b>{formatDuration(serviceMinutes)}</span>
                                        </div>
                                    </article>
                                );
                            })}
                            {dayAttendances.length === 0 && <p className="queue-empty">Nenhum atendimento registrado nesta data.</p>}
                            {dayAttendances.length > 0 && filteredDayAttendances.length === 0 && <p className="queue-empty">Nenhum atendimento corresponde à pesquisa e aos filtros.</p>}
                        </div>
                    </div>
                </section>

                <section className="counter-ranking-layout">
                    <div className="data-card counter-ranking-chart"><div className="card-header"><h3>Atendimentos por dia</h3><span>{MONTHS[Number(selectedMonthNumber) - 1]} de {selectedYear} · {monthAttendances.length} atendimentos</span></div><div><canvas ref={chartRef} role="img" aria-label={`Volume diário de atendimentos: ${monthAttendances.length} no mês`} /></div></div>
                    <div className="data-card counter-ranking-list"><div className="card-header"><h3>Atendimentos por atendente</h3><span>{toDate(`${selectedDate}T12:00:00`)?.toLocaleDateString('pt-BR')}</span></div>{ranking.map((item, index) => <article key={item.key}><b>{index + 1}</b><div><strong>{item.nome}</strong><span>Atendimentos no dia</span></div><strong>{item.total}</strong></article>)}{ranking.length === 0 && <p className="queue-empty">Nenhum atendimento registrado nesta data.</p>}</div>
                </section>

                <section className="counter-time-analysis" aria-label="Análise dos tempos de atendimento">
                    <div className="counter-analysis-header">
                        <div><span>Análise operacional</span><h2><LiaChartBarSolid /> Tempos dos atendimentos</h2><p>Médias calculadas pelos registros de entrada, chamada, início e conclusão.</p></div>
                        <label><span>Atendente</span><select value={analysisAttendant} onChange={event => setAnalysisAttendant(event.target.value)}><option value="all">Todos os atendentes</option>{attendantOptions.map(attendant => <option key={attendant.value} value={attendant.value}>{attendant.name}</option>)}</select></label>
                    </div>
                    <div className="counter-time-kpis">
                        <article><span>Espera média</span><strong>{formatDuration(consultancy.averageWait)}</strong><small>{consultancy.waitMeasured} registros medidos</small></article>
                        <article><span>90% das esperas em até</span><strong>{formatDuration(consultancy.p90Wait)}</strong><small>Maior espera: {formatDuration(consultancy.maxWait)}</small></article>
                        <article><span>Atendimento médio</span><strong>{formatDuration(consultancy.averageService)}</strong><small>{consultancy.serviceMeasured} registros medidos</small></article>
                        <article><span>Cobertura dos dados</span><strong>{consultancy.coverage}%</strong><small>{consultancy.measured} de {consultancy.total} atendimentos</small></article>
                    </div>
                    <div className="counter-time-charts">
                        <div className="data-card"><div className="card-header"><h3>Evolução diária</h3><span>{analysisAttendantLabel}</span></div><div className="counter-time-chart"><canvas ref={timeChartRef} role="img" aria-label="Evolução diária dos tempos médios de espera e atendimento" /></div></div>
                        <div className="data-card"><div className="card-header"><h3>Comparativo por atendente</h3><span>Tempo médio em minutos</span></div><div className="counter-time-chart"><canvas ref={attendantTimeChartRef} role="img" aria-label="Comparativo dos tempos médios por atendente" /></div></div>
                    </div>
                </section>

                <section className={`counter-ai-consultancy ${consultancy.tone}`} aria-label="Consultoria automática dos atendimentos">
                    <header><div className="counter-ai-icon"><LiaLightbulbSolid /></div><div><span>Consultoria inteligente baseada nos dados</span><h2>{consultancy.status}</h2><p>{MONTHS[Number(selectedMonthNumber) - 1]} de {selectedYear} · {analysisAttendantLabel} · {consultancy.total} atendimentos</p></div></header>
                    <div className="counter-ai-columns">
                        <div><h3>Parecer</h3>{consultancy.findings.map(item => <p key={item}>{item}</p>)}</div>
                        <div><h3>O que podemos melhorar</h3><ul>{consultancy.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div>
                    </div>
                    <small>Diagnóstico automático operacional. Os tempos ajudam a localizar gargalos e devem ser analisados junto ao tipo e à complexidade de cada atendimento.</small>
                </section>

                {summaryModal && (
                    <div className="modal-overlay counter-report-overlay" role="presentation" onMouseDown={event => {
                        if (event.target === event.currentTarget) setSummaryModal('');
                    }}>
                        <section className="modal-content counter-summary-modal" role="dialog" aria-modal="true" aria-labelledby="counter-summary-modal-title">
                            <header className="modal-header">
                                <div>
                                    <h3 id="counter-summary-modal-title">{summaryModalTitles[summaryModal]}</h3>
                                    <p>{toDate(`${selectedDate}T12:00:00`)?.toLocaleDateString('pt-BR')} · {summaryModalRows.length} registro(s). Selecione as linhas e salve as alterações para confirmar.</p>
                                </div>
                                <button type="button" className="modal-close-btn" onClick={() => setSummaryModal('')} aria-label="Fechar"><LiaTimesSolid /></button>
                            </header>
                            {statusFeedback && <p className="counter-summary-feedback" role="status">{statusFeedback}</p>}
                            <div className="counter-summary-bulk-actions">
                                <label>
                                    <span>Status para selecionados</span>
                                    <select
                                        value={bulkSummaryStatus}
                                        disabled={!selectedSummaryRows.length || Boolean(savingStatusId)}
                                        onChange={event => {
                                            const nextStatus = event.target.value;
                                            setBulkSummaryStatus(nextStatus);
                                            if (!nextStatus) return;
                                            setSummaryDrafts(current => {
                                                const next = { ...current };
                                                summaryModalRows.forEach(row => {
                                                    const rowKey = getSummaryRowKey(row);
                                                    const requestStatuses = [
                                                        'Não compareceu',
                                                        'Aguardando Atendimento Presencial',
                                                        'Atendimento Presencial Concluído',
                                                    ];
                                                    const queueStatuses = [
                                                        'Aguardando',
                                                        'Chamando',
                                                        'Em Atendimento',
                                                        'Concluído',
                                                        'Ausente',
                                                    ];
                                                    const supportedStatuses = row.source === 'request'
                                                        ? requestStatuses
                                                        : queueStatuses;
                                                    if (selectedSummaryRows.includes(rowKey)
                                                        && supportedStatuses.includes(nextStatus)) {
                                                        next[rowKey] = nextStatus;
                                                    }
                                                });
                                                return next;
                                            });
                                        }}
                                    >
                                        <option value="">Escolha um status...</option>
                                        {[
                                            'Aguardando',
                                            'Chamando',
                                            'Em Atendimento',
                                            'Concluído',
                                            'Ausente',
                                            'Não compareceu',
                                            'Aguardando Atendimento Presencial',
                                            'Atendimento Presencial Concluído',
                                        ].map(status => <option key={status} value={status}>{status}</option>)}
                                    </select>
                                </label>
                                <span>{selectedSummaryRows.length} selecionado(s)</span>
                            </div>
                            <div className="counter-summary-table-wrap">
                                <table className="counter-summary-table">
                                    <thead><tr>
                                        <th><input
                                            type="checkbox"
                                            aria-label="Selecionar todos os registros editáveis"
                                            checked={summaryModalRows.filter(row => row.source === 'request' || row.queueTicket || queueTickets.some(item => item.id === row.id)).length > 0 && summaryModalRows.filter(row => row.source === 'request' || row.queueTicket || queueTickets.some(item => item.id === row.id)).every(row => selectedSummaryRows.includes(getSummaryRowKey(row)))}
                                            disabled={Boolean(savingStatusId) || !summaryModalRows.some(row => row.source === 'request' || row.queueTicket || queueTickets.some(item => item.id === row.id))}
                                            onChange={event => {
                                                const editableRows = summaryModalRows.filter(row => row.source === 'request' || row.queueTicket || queueTickets.some(item => item.id === row.id));
                                                setSelectedSummaryRows(event.target.checked ? editableRows.map(getSummaryRowKey) : []);
                                            }}
                                        /></th>
                                        <th>Cidadão</th><th>CPF</th><th>Atendente</th><th>Guichê</th><th>Protocolo</th><th>Status</th>
                                    </tr></thead>
                                    <tbody>
                                        {summaryModalRows.map(row => {
                                            const ticket = row.queueTicket || row;
                                            const rowKey = getSummaryRowKey(row);
                                            const currentStatus = row.source === 'request' ? row.statusFila || 'Não compareceu' : ticket.status || row.status || 'Concluído';
                                            const draftStatus = summaryDrafts[rowKey] || currentStatus;
                                            const canEdit = row.source === 'request' || Boolean(row.queueTicket || queueTickets.some(item => item.id === row.id));
                                            const statusOptions = row.source === 'request'
                                                ? ['Não compareceu', 'Aguardando Atendimento Presencial', 'Atendimento Presencial Concluído']
                                                : ['Aguardando', 'Chamando', 'Em Atendimento', 'Concluído', 'Ausente'];
                                            return (
                                                <tr key={rowKey}>
                                                    <td><input
                                                        type="checkbox"
                                                        aria-label={`Selecionar ${row.protocolo || row.id}`}
                                                        checked={selectedSummaryRows.includes(rowKey)}
                                                        disabled={!canEdit || Boolean(savingStatusId)}
                                                        onChange={event => setSelectedSummaryRows(current => event.target.checked
                                                            ? [...current, rowKey]
                                                            : current.filter(key => key !== rowKey))}
                                                    /></td>
                                                    <td>{row.nome || row.beneficiarioNome || row.dadosBeneficiario?.name || row.dadosUsuario?.name || 'Não informado'}</td>
                                                    <td>{row.cpf || row.dadosBeneficiario?.cpf || row.dadosUsuario?.cpf || '—'}</td>
                                                    <td>{getAttendantName(ticket)}</td>
                                                    <td>{ticket.guiche || ticket.guicheAtendimento || '—'}</td>
                                                    <td>{row.protocolo || row.id}</td>
                                                    <td>
                                                        <select
                                                            aria-label={`Status do protocolo ${row.protocolo || row.id}`}
                                                            value={draftStatus}
                                                            disabled={!canEdit || Boolean(savingStatusId)}
                                                            onChange={event => setSummaryDrafts(current => ({ ...current, [rowKey]: event.target.value }))}
                                                        >
                                                            {!statusOptions.includes(draftStatus) && <option value={draftStatus}>{draftStatus}</option>}
                                                            {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {summaryModalRows.length === 0 && <tr><td colSpan="7" className="counter-summary-empty">Nenhum registro encontrado para esta categoria nesta data.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                            <footer className="counter-report-actions">
                                <button type="button" className="btn-secondary" onClick={() => setSummaryModal('')}>Fechar</button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={handleSaveSummaryStatuses}
                                    disabled={Boolean(savingStatusId) || !Object.keys(summaryDrafts).some(key => selectedSummaryRows.length === 0 || selectedSummaryRows.includes(key))}
                                >
                                    {savingStatusId ? 'Salvando...' : 'Salvar alterações'}
                                </button>
                            </footer>
                        </section>
                    </div>
                )}

                {reportOpen && (
                    <div className="modal-overlay counter-report-overlay" role="presentation" onMouseDown={event => {
                        if (event.target === event.currentTarget) setReportOpen(false);
                    }}>
                        <section className="modal-content counter-report-modal" role="dialog" aria-modal="true" aria-labelledby="counter-report-title">
                            <header className="modal-header">
                                <div>
                                    <h3 id="counter-report-title">Gerar relatório de atendimentos</h3>
                                    <p>Informe as datas inicial e final para reunir os atendimentos do período.</p>
                                </div>
                                <button type="button" className="modal-close-btn" onClick={() => setReportOpen(false)} aria-label="Fechar">
                                    <LiaTimesSolid />
                                </button>
                            </header>
                            <div className="counter-report-form">
                                <label><span>Data inicial</span><input type="date" value={reportStartDate} max={reportEndDate || undefined} onChange={event => setReportStartDate(event.target.value)} /></label>
                                <label><span>Data final</span><input type="date" value={reportEndDate} min={reportStartDate || undefined} onChange={event => setReportEndDate(event.target.value)} /></label>
                                <label>
                                    <span>Guichê</span>
                                    <select value={reportCounter} onChange={event => setReportCounter(event.target.value)}>
                                        <option value="all">Todos os guichês</option>
                                        {counterOptions.map(counter => <option key={counter.value} value={counter.value}>{counter.name}</option>)}
                                    </select>
                                </label>
                                <label>
                                    <span>Atendente</span>
                                    <select value={reportAttendant} onChange={event => setReportAttendant(event.target.value)}>
                                        <option value="all">Todos os atendentes</option>
                                        {attendantOptions.map(attendant => <option key={attendant.value} value={attendant.value}>{attendant.name}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className="counter-report-preview">
                                <span>Registros encontrados</span>
                                <strong>{reportRows.length}</strong>
                            </div>
                            <footer className="counter-report-actions">
                                <button type="button" className="btn-secondary" onClick={() => setReportOpen(false)}>Cancelar</button>
                                <button type="button" className="btn-primary" disabled={!reportStartDate || !reportEndDate || reportEndDate < reportStartDate} onClick={generateReport}><LiaPrintSolid /> Imprimir / Salvar PDF</button>
                            </footer>
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminAtendimentosGuiches;
