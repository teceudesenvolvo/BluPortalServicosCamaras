import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
    LiaBuildingSolid,
    LiaCalendarAltSolid,
    LiaCheckCircleSolid,
    LiaClipboardListSolid,
    LiaFileAltSolid,
    LiaHeadsetSolid,
    LiaPlusSolid,
    LiaSearchSolid,
    LiaTachometerAltSolid,
    LiaUsersSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import QueueManagerModal from '../../components/QueueManagerModal';
import { auth, firestore } from '../../firebase';
import { buildSupplierRanking, getComplaintSupplier } from '../../utils/proconAnalytics';
import { parseTimes, WEEK_DAYS } from '../../utils/proconSchedule';

const NAV_ITEMS = [
    { id: 'overview', label: 'Visão geral', icon: LiaTachometerAltSolid },
    { id: 'attendances', label: 'Atendimentos', icon: LiaHeadsetSolid },
    { id: 'queue', label: 'Fila operacional', icon: LiaClipboardListSolid },
    { id: 'consumers', label: 'Consumidores', icon: LiaUsersSolid },
    { id: 'suppliers', label: 'Fornecedores', icon: LiaBuildingSolid },
    { id: 'hearings', label: 'Audiências', icon: LiaCalendarAltSolid },
    { id: 'opinions', label: 'Pareceres', icon: LiaFileAltSolid },
    { id: 'appointments', label: 'Agendamentos', icon: LiaCalendarAltSolid },
];

const EMPTY_FORMS = {
    suppliers: { nome: '', cnpj: '', contato: '', email: '' },
    hearings: { titulo: '', protocolo: '', data: '', horario: '', local: '', status: 'Agendada' },
    opinions: { titulo: '', protocolo: '', responsavel: '', resumo: '', status: 'Em elaboração' },
    appointments: { nome: '', cpf: '', email: '', assunto: '', appointmentDate: '', appointmentTime: '', status: 'Agendado' },
};

const toDate = value => {
    if (!value) return null;
    const parsed = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatDate = value => toDate(value)?.toLocaleDateString('pt-BR') || 'Não informado';
const formatAppointment = item => `${item.appointmentDate?.split('-').reverse().join('/') || 'Sem data'} · ${item.appointmentTime || '--:--'}`;
const getStatus = item => item.status || item.situacao || 'Em Análise';
const getConsumer = item => item.userDataAtTimeOfComplaint?.name || item.dadosUsuario?.name || item.consumidorNome || item.nome || 'Consumidor não identificado';
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const AdminProconModule = () => {
    const [active, setActive] = useState('overview');
    const [complaints, setComplaints] = useState([]);
    const [users, setUsers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [hearings, setHearings] = useState([]);
    const [opinions, setOpinions] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [queue, setQueue] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [showQueue, setShowQueue] = useState(false);
    const [formType, setFormType] = useState('');
    const [forms, setForms] = useState(EMPTY_FORMS);

    useEffect(() => {
        const subscriptions = [
            onSnapshot(collection(firestore, 'procon-atendimentos'), snap => setComplaints(snap.docs.map(item => ({ id: item.id, source: 'procon', ...item.data() })))),
            onSnapshot(collection(firestore, 'procon-consumidores'), snap => setUsers(snap.docs.map(item => ({ id: item.id, ...item.data() })))),
            onSnapshot(collection(firestore, 'procon-fornecedores'), snap => setSuppliers(snap.docs.map(item => ({ id: item.id, ...item.data() })))),
            onSnapshot(collection(firestore, 'procon-audiencias'), snap => setHearings(snap.docs.map(item => ({ id: item.id, ...item.data() })))),
            onSnapshot(collection(firestore, 'procon-pareceres'), snap => setOpinions(snap.docs.map(item => ({ id: item.id, ...item.data() })))),
            onSnapshot(collection(firestore, 'procon-agendamentos'), snap => setAppointments(snap.docs.map(item => ({ id: item.id, ...item.data() })))),
            onSnapshot(collection(firestore, 'atendimento-fila'), snap => setQueue(snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.setor === 'PROCON'))),
        ];
        return () => subscriptions.forEach(unsubscribe => unsubscribe());
    }, []);

    const ranking = useMemo(() => buildSupplierRanking(complaints), [complaints]);
    const consumers = useMemo(() => users, [users]);
    const statuses = useMemo(() => ['Todos', ...new Set(complaints.map(getStatus))], [complaints]);
    const filteredComplaints = useMemo(() => complaints.filter(item => {
        if (statusFilter !== 'Todos' && getStatus(item) !== statusFilter) return false;
        const supplier = getComplaintSupplier(item);
        return normalize([item.protocolo, item.assuntoDenuncia, item.assunto, getConsumer(item), supplier.name, supplier.cnpj].join(' ')).includes(normalize(search));
    }), [complaints, search, statusFilter]);
    const activeCases = complaints.filter(item => !['Finalizada', 'Concluído', 'Arquivada', 'Cancelado'].includes(getStatus(item))).length;
    const today = new Date().toISOString().slice(0, 10);
    const todayAppointments = appointments.filter(item => item.appointmentDate === today);
    const waiting = queue.filter(item => item.status === 'Aguardando').length;

    const updateForm = (type, field, value) => setForms(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
    const createRecord = async event => {
        event.preventDefault();
        const collectionByType = { suppliers: 'procon-fornecedores', hearings: 'procon-audiencias', opinions: 'procon-pareceres', appointments: 'procon-agendamentos' };
        const payload = { ...forms[formType], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: auth.currentUser?.uid || '', createdByEmail: auth.currentUser?.email || '' };
        if (formType === 'appointments') payload.dadosUsuario = { name: payload.nome, cpf: payload.cpf, email: payload.email };
        await addDoc(collection(firestore, collectionByType[formType]), payload);
        setForms(prev => ({ ...prev, [formType]: EMPTY_FORMS[formType] }));
        setFormType('');
    };

    const changeComplaintStatus = async (item, status) => {
        await updateDoc(doc(firestore, 'procon-atendimentos', item.id), { status, updatedAt: serverTimestamp() });
    };

    const confirmAppointment = async appointment => {
        const dateKey = new Date().toISOString().slice(0, 10);
        const counterRef = doc(firestore, 'atendimento-fila-meta', `${dateKey}-C`);
        const queueRef = doc(collection(firestore, 'atendimento-fila'));
        await runTransaction(firestore, async transaction => {
            const counterSnap = await transaction.get(counterRef);
            const next = Number(counterSnap.data()?.ultimoNumero || 0) + 1;
            const senha = `C${String(next).padStart(3, '0')}`;
            const now = new Date();
            transaction.set(counterRef, { ultimoNumero: next, data: dateKey, setor: 'PROCON', prefixo: 'C' }, { merge: true });
            transaction.set(queueRef, {
                senha, protocolo: appointment.id, nome: appointment.nome || appointment.dadosUsuario?.name || 'Consumidor', cpf: appointment.cpf || appointment.dadosUsuario?.cpf || '', userId: appointment.userId || '', userEmail: appointment.email || appointment.dadosUsuario?.email || '', assunto: appointment.assunto || 'Atendimento PROCON', appointmentDate: appointment.appointmentDate, appointmentTime: appointment.appointmentTime, collectionName: 'procon-agendamentos', setor: 'PROCON', prioridade: Boolean(appointment.prioridade), status: 'Aguardando', criadoEm: now, ordemFilaEm: now, criadoPor: auth.currentUser?.email || 'PROCON',
            });
            transaction.update(doc(firestore, 'procon-agendamentos', appointment.id), { status: 'Confirmado', statusFila: 'Aguardando', senhaAtendimento: senha, chegadaRecepcaoEm: now, updatedAt: now });
        });
    };

    const cancelAppointment = async appointment => {
        const slotsRef = doc(firestore, 'procon-config', 'bookedSlots');
        const appointmentRef = doc(firestore, 'procon-agendamentos', appointment.id);
        await runTransaction(firestore, async transaction => {
            const slotsSnap = await transaction.get(slotsRef);
            const slots = slotsSnap.data() || {};
            const remaining = (slots[appointment.appointmentDate] || []).filter(time => time !== appointment.appointmentTime);
            transaction.set(slotsRef, { [appointment.appointmentDate]: remaining }, { merge: true });
            transaction.update(appointmentRef, { status: 'Cancelado', updatedAt: new Date(), canceladoPor: auth.currentUser?.email || '' });
        });
    };

    const renderToolbar = () => (
        <div className="procon-toolbar">
            <label><LiaSearchSolid /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar protocolo, consumidor ou fornecedor" /></label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{statuses.map(status => <option key={status}>{status}</option>)}</select>
        </div>
    );

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <main className="dashboard-content procon-admin-page">
                <header className="procon-admin-header">
                    <div><span>Gestão integrada</span><h1>PROCON</h1><p>Atendimentos, operação, cadastros e processos em um único módulo.</p></div>
                    <div className="procon-header-actions"><button onClick={() => setFormType('appointments')}><LiaPlusSolid /> Novo agendamento</button><button className="primary" onClick={() => setShowQueue(true)}><LiaClipboardListSolid /> Abrir fila</button></div>
                    <nav aria-label="Navegação do módulo PROCON">{NAV_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}><Icon />{item.label}</button>; })}</nav>
                </header>

                {active === 'overview' && <>
                    <section className="procon-kpis"><article><span>Atendimentos</span><strong>{complaints.length}</strong><small>{activeCases} em andamento</small></article><article><span>Fila agora</span><strong>{waiting}</strong><small>aguardando chamada</small></article><article><span>Agendamentos hoje</span><strong>{todayAppointments.length}</strong><small>{todayAppointments.filter(item => item.status === 'Confirmado').length} confirmados</small></article><article><span>Fornecedores citados</span><strong>{ranking.length}</strong><small>base consolidada</small></article></section>
                    <section className="procon-overview-grid"><div className="data-card"><div className="card-header"><h3>Atendimentos recentes</h3><button onClick={() => setActive('attendances')}>Ver todos</button></div><div className="procon-record-list">{complaints.slice(0, 6).map(item => <article key={`${item.source}-${item.id}`}><div><strong>{item.protocolo || item.id}</strong><span>{getConsumer(item)}</span></div><small>{getComplaintSupplier(item).name}</small><b>{getStatus(item)}</b></article>)}</div></div><div className="data-card"><div className="card-header"><h3>Ranking de fornecedores</h3><button onClick={() => setActive('suppliers')}>Ver ranking</button></div><div className="procon-ranking">{ranking.slice(0, 6).map((item, index) => <article key={item.key}><b>{index + 1}</b><div><strong>{item.name}</strong><span>{item.resolved} resolvidos · {item.pending} pendentes</span></div><strong>{item.total}</strong></article>)}</div></div></section>
                </>}

                {active === 'attendances' && <section className="data-card procon-module-card"><div className="card-header"><div><h2>Atendimentos</h2><p>Atendimentos registrados na base própria do módulo PROCON.</p></div></div>{renderToolbar()}<div className="procon-table"><div className="procon-table-head"><span>Protocolo</span><span>Consumidor</span><span>Fornecedor</span><span>Status</span></div>{filteredComplaints.map(item => <article key={`${item.source}-${item.id}`}><strong>{item.protocolo || item.id}</strong><span>{getConsumer(item)}</span><span>{getComplaintSupplier(item).name}</span><select value={getStatus(item)} onChange={event => changeComplaintStatus(item, event.target.value)}><option>Recebida</option><option>Em Análise</option><option>Pendente</option><option>Em Negociação</option><option>Finalizada</option><option>Arquivada</option><option>Cancelado</option></select></article>)}</div></section>}

                {active === 'queue' && <section className="data-card procon-module-card"><div className="card-header"><div><h2>Fila operacional</h2><p>Chamadas alternadas entre atendimentos prioritários e normais.</p></div><button className="procon-card-action" onClick={() => setShowQueue(true)}>Gerenciar chamadas</button></div><div className="procon-kpis compact"><article><span>Aguardando</span><strong>{waiting}</strong></article><article><span>Chamando</span><strong>{queue.filter(item => item.status === 'Chamando').length}</strong></article><article><span>Em atendimento</span><strong>{queue.filter(item => item.status === 'Em Atendimento').length}</strong></article><article><span>Concluídos hoje</span><strong>{queue.filter(item => item.status === 'Concluído').length}</strong></article></div><div className="procon-record-list">{queue.filter(item => item.status === 'Aguardando').map(item => <article key={item.id}><div><strong>{item.senha}</strong><span>{item.nome}</span></div><small>{item.assunto}</small><b>{item.prioridade ? 'Prioritário' : 'Normal'}</b></article>)}</div></section>}

                {active === 'consumers' && <section className="data-card procon-module-card"><div className="card-header"><div><h2>Consumidores</h2><p>Cadastros vinculados aos atendimentos do PROCON.</p></div><span>{consumers.length}</span></div><div className="procon-toolbar single"><label><LiaSearchSolid /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome, CPF ou e-mail" /></label></div><div className="procon-card-grid">{consumers.filter(user => normalize([user.name, user.nome, user.email, user.cpf].join(' ')).includes(normalize(search))).map(user => <article key={user.id}><LiaUsersSolid /><div><strong>{user.name || user.nome || 'Sem nome'}</strong><span>{user.email || 'Sem e-mail'}</span><small>CPF: {user.cpf || 'Não informado'}</small></div></article>)}</div></section>}

                {active === 'suppliers' && <section className="data-card procon-module-card"><div className="card-header"><div><h2>Fornecedores e ranking</h2><p>Classificação pelo volume de reclamações.</p></div><button className="procon-card-action" onClick={() => setFormType('suppliers')}><LiaPlusSolid /> Cadastrar</button></div><div className="procon-ranking detailed">{ranking.map((item, index) => <article key={item.key}><b>{index + 1}</b><div><strong>{item.name}</strong><span>{item.cnpj || 'CNPJ não informado'} · {item.resolutionRate}% resolvidos</span></div><strong>{item.total} reclamações</strong></article>)}</div>{suppliers.length > 0 && <p className="procon-base-note">{suppliers.length} fornecedor(es) também cadastrado(s) na base administrativa.</p>}</section>}

                {active === 'hearings' && <RecordsSection title="Audiências" subtitle="Agenda, conciliação e acompanhamento." items={hearings} action={() => setFormType('hearings')} render={item => <><div><strong>{item.titulo || item.protocolo || 'Audiência'}</strong><span>Protocolo {item.protocolo || 'não informado'}</span></div><small>{item.data ? `${item.data.split('-').reverse().join('/')} · ${item.horario || '--:--'}` : formatDate(item.createdAt)}</small><b>{item.status || 'Agendada'}</b></>} />}
                {active === 'opinions' && <RecordsSection title="Pareceres" subtitle="Fundamentação e decisões dos processos." items={opinions} action={() => setFormType('opinions')} render={item => <><div><strong>{item.titulo || 'Parecer'}</strong><span>{item.responsavel || 'Responsável não informado'}</span></div><small>Protocolo {item.protocolo || 'não informado'}</small><b>{item.status || 'Em elaboração'}</b></>} />}
                {active === 'appointments' && <ProconAppointmentsAdmin appointments={appointments} onConfirm={confirmAppointment} onCancel={cancelAppointment} onCreate={() => setFormType('appointments')} />}

                {formType && <RecordModal type={formType} values={forms[formType]} onChange={(field, value) => updateForm(formType, field, value)} onClose={() => setFormType('')} onSubmit={createRecord} />}
                {showQueue && <QueueManagerModal lockedService="PROCON" onClose={() => setShowQueue(false)} />}
            </main>
        </div>
    );
};

const ProconAppointmentsAdmin = ({ appointments, onConfirm, onCancel, onCreate }) => {
    const [schedule, setSchedule] = useState(Object.fromEntries(WEEK_DAYS.map(([day]) => [day, ''])));
    const [blockedDates, setBlockedDates] = useState('');
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState('');
    const today = new Date().toISOString().slice(0, 10);

    useEffect(() => {
        Promise.all([getDoc(doc(firestore,'procon-config','availability')), getDoc(doc(firestore,'procon-config','blockedDates'))]).then(([availabilitySnap, blockedSnap]) => {
            if (availabilitySnap.exists()) setSchedule(Object.fromEntries(WEEK_DAYS.map(([day]) => [day, (availabilitySnap.data()[day] || []).join(', ')])));
            if (blockedSnap.exists()) setBlockedDates((blockedSnap.data().dates || []).join(', '));
        }).catch(error => console.error('Erro ao carregar agenda do PROCON:', error));
    }, []);

    const saveSchedule = async () => {
        setSaving(true); setFeedback('');
        try {
            const availability = Object.fromEntries(WEEK_DAYS.map(([day]) => [day, parseTimes(schedule[day])]));
            const dates = blockedDates.split(',').map(value => value.trim()).filter(Boolean);
            await Promise.all([
                setDoc(doc(firestore,'procon-config','availability'), { ...availability, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '' }),
                setDoc(doc(firestore,'procon-config','blockedDates'), { dates, updatedAt: serverTimestamp() }),
            ]);
            setFeedback('Disponibilidade publicada para os cidadãos.');
        } catch (error) { setFeedback('Não foi possível salvar a disponibilidade.'); }
        finally { setSaving(false); }
    };

    return <section className="data-card procon-module-card"><div className="card-header"><div><h2>Agendamentos</h2><p>Configure a agenda pública e confirme a chegada para encaminhar ao painel.</p></div><button className="procon-card-action" onClick={onCreate}><LiaPlusSolid /> Agendar</button></div>
        <div className="procon-schedule-admin"><div><h3>Horários disponíveis</h3><p>Informe horários separados por vírgula.</p><div className="procon-week-grid">{WEEK_DAYS.map(([day,label]) => <label key={day}><span>{label}</span><input value={schedule[day]} onChange={event => setSchedule(previous => ({ ...previous, [day]: event.target.value }))} placeholder="08:00, 09:00, 10:00" /></label>)}</div><label className="procon-blocked-field"><span>Datas bloqueadas (DD/MM/AAAA)</span><textarea rows="2" value={blockedDates} onChange={event => setBlockedDates(event.target.value)} placeholder="25/12/2026, 01/01/2027" /></label><button className="btn-primary" onClick={saveSchedule} disabled={saving}>{saving ? 'Salvando...' : 'Publicar horários'}</button>{feedback && <p className="procon-schedule-feedback">{feedback}</p>}</div></div>
        <div className="procon-record-list">{[...appointments].sort((a,b) => `${a.appointmentDate}${a.appointmentTime}`.localeCompare(`${b.appointmentDate}${b.appointmentTime}`)).map(item => <article key={item.id}><div><strong>{item.nome || item.dadosUsuario?.name}</strong><span>{item.assunto || 'Atendimento PROCON'}</span></div><small>{formatAppointment(item)}</small>{item.status === 'Agendado' ? <div className="procon-appointment-actions">{item.appointmentDate === today && <button className="procon-confirm-button" onClick={() => onConfirm(item)}><LiaCheckCircleSolid /> Confirmar chegada</button>}<button className="procon-cancel-button" onClick={() => onCancel(item)}>Cancelar</button></div> : <b>{item.status}</b>}</article>)}{appointments.length === 0 && <p className="queue-empty">Nenhum agendamento cadastrado.</p>}</div>
    </section>;
};

const RecordsSection = ({ title, subtitle, items, action, render }) => <section className="data-card procon-module-card"><div className="card-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="procon-card-action" onClick={action}><LiaPlusSolid /> Novo registro</button></div><div className="procon-record-list">{items.map(item => <article key={item.id}>{render(item)}</article>)}{items.length === 0 && <p className="queue-empty">Nenhum registro cadastrado.</p>}</div></section>;

const FIELD_CONFIG = {
    suppliers: [['nome', 'Nome ou razão social'], ['cnpj', 'CNPJ'], ['contato', 'Telefone'], ['email', 'E-mail']],
    hearings: [['titulo', 'Título'], ['protocolo', 'Protocolo'], ['data', 'Data', 'date'], ['horario', 'Horário', 'time'], ['local', 'Local']],
    opinions: [['titulo', 'Título'], ['protocolo', 'Protocolo'], ['responsavel', 'Responsável'], ['resumo', 'Resumo', 'textarea']],
    appointments: [['nome', 'Consumidor'], ['cpf', 'CPF'], ['email', 'E-mail'], ['assunto', 'Assunto'], ['appointmentDate', 'Data', 'date'], ['appointmentTime', 'Horário', 'time']],
};
const MODAL_TITLES = { suppliers: 'Cadastrar fornecedor', hearings: 'Agendar audiência', opinions: 'Criar parecer', appointments: 'Novo agendamento PROCON' };
const RecordModal = ({ type, values, onChange, onClose, onSubmit }) => <div className="modal-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal-content procon-record-modal" onSubmit={onSubmit}><div className="modal-header"><h3>{MODAL_TITLES[type]}</h3><button type="button" className="modal-close-btn" onClick={onClose}>×</button></div><div className="procon-form-grid">{FIELD_CONFIG[type].map(([field, label, inputType = 'text']) => <label key={field}><span>{label}</span>{inputType === 'textarea' ? <textarea value={values[field]} onChange={event => onChange(field, event.target.value)} rows="4" required /> : <input type={inputType} value={values[field]} onChange={event => onChange(field, event.target.value)} required={!['email', 'contato', 'cnpj', 'cpf'].includes(field)} />}</label>)}</div><footer><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary">Salvar</button></footer></form></div>;

export default AdminProconModule;
