import { canAccessModule } from '../../config/rolePermissions';
import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { isSystemRootEmail } from '../../config/systemModules';
import { firestore } from '../../firebase';
import VereadorAppointmentOffer from '../../components/VereadorAppointmentOffer';
import AdminSidebar from '../../components/AdminSidebar';
import { SectorAvailabilityModal } from '../../components/SectorScheduling';

export default function AdminAgendaVereadores() {
    const { currentUser } = useAuth();
    const { settings } = useSystemControl();
    const [role, setRole] = useState('');
    const [items, setItems] = useState([]);
    const [members, setMembers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [availability, setAvailability] = useState(null);
    const [filter, setFilter] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [teamEmail, setTeamEmail] = useState('');
    const admin = (role !== 'Vereador' && canAccessModule(settings, role, currentUser?.email, 'agendaVereadores', 'admin')) || isSystemRootEmail(settings, currentUser?.email);
    const allowed = Boolean(currentUser && role && canAccessModule(settings, role, currentUser?.email, 'agendaVereadores', 'admin'));
    useEffect(() => {
        let active = true;
        setRole('');
        if (currentUser) getDoc(doc(firestore, 'users', currentUser.uid))
            .then(snap => { if (active) setRole(snap.data()?.tipo || 'Cidadão'); })
            .catch(() => { if (active) setError('Não foi possível verificar seu acesso.'); });
        return () => { active = false; };
    }, [currentUser]);
    useEffect(() => {
        if (!allowed) return undefined;
        const requests = collection(firestore, 'solicitacoes-vereadores');
        const unsubscribe = onSnapshot(admin ? requests : query(requests, where('dadosSolicitacao.vereadorId', '==', currentUser.uid)), snap => {
            setItems(snap.docs.map(item => ({ ...item.data(), id: item.id })));
        }, () => setError('Não foi possível carregar os agendamentos.'));
        const unsubscribeMembers = onSnapshot(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')), snap => {
            setMembers(snap.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => admin || item.id === currentUser.uid));
        }, () => setError('Não foi possível carregar os vereadores.'));
        return () => { unsubscribe(); unsubscribeMembers(); };
    }, [allowed, admin, currentUser]);
    const changeStatus = async (item, status) => {
        setBusy(true); setError('');
        try {
            await runTransaction(firestore, async transaction => {
                const ref = doc(firestore, 'solicitacoes-vereadores', item.id);
                const snap = await transaction.get(ref);
                const data = snap.data();
                if (!data || ['Cancelado', 'Realizado'].includes(data.status)) throw new Error('Este atendimento já foi encerrado.');
                const slotsRef = doc(firestore, `vereadores-agenda-config/${data.dadosSolicitacao.vereadorId}/agenda/bookedSlots`);
                const slots = status === 'Cancelado' && data.appointmentDate ? await transaction.get(slotsRef) : null;
                if (slots) transaction.set(slotsRef, { [data.appointmentDate]: (slots.data()?.[data.appointmentDate] || []).filter(time => time !== data.appointmentTime) }, { merge: true });
                transaction.update(ref, { status, ultimaAtualizacao: new Date(), atualizadoPor: currentUser.uid });
            });
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };
    const addTeamMember = async event => {
        event.preventDefault();
        if (!teamEmail.trim()) return;
        try { await addDoc(collection(firestore, 'gabinetes-equipe'), { gabineteId: currentUser.uid, vereadorId: currentUser.uid, email: teamEmail.trim().toLowerCase(), papel: 'Equipe do gabinete', ativo: true, criadoPor: currentUser.uid, criadoEm: serverTimestamp() }); setTeamEmail(''); }
        catch (err) { setError('Não foi possível adicionar o membro da equipe.'); }
    };
    if (!allowed) return <main className="dashboard-content"><p>{error || (role ? 'Acesso disponível para administradores e vereadores.' : 'Verificando acesso…')}</p></main>;
    return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content">
        <header className="page-header-container"><div><h1>Agendamentos dos vereadores</h1><p>Confirme horários e acompanhe os atendimentos dos gabinetes.</p></div></header>
        {error && <p role="alert">{error}</p>}
        <section className="data-card"><h2>Horários dos gabinetes</h2><div className="form-row">{members.map(member => <button className="btn-secondary" key={member.id} onClick={() => setAvailability(member)}>Horários de {member.name || member.nome}</button>)}</div></section>
        {role === 'Vereador' && <section className="data-card"><h2>Equipe do gabinete</h2><p>Adicione colaboradores pelo e-mail para apoiar o tratamento das demandas.</p><form className="form-row" onSubmit={addTeamMember}><input className="form-input" type="email" required placeholder="colaborador@camara.gov.br" value={teamEmail} onChange={event => setTeamEmail(event.target.value)} /><button className="btn-primary">Adicionar membro</button></form></section>}
        <section className="data-card"><label>Status <select className="form-input" value={filter} onChange={event => setFilter(event.target.value)}><option value="">Todos</option>{['Aguardando Análise', 'Aguardando Confirmação', 'Datas Liberadas', 'Recusado', 'Agendado', 'Realizado', 'Cancelado'].map(status => <option key={status}>{status}</option>)}</select></label>
            <ul className="data-list">{items.filter(item => !filter || item.status === filter).sort((a,b) => String(a.appointmentDate || a.dadosSolicitacao?.dataPreferencial || '').localeCompare(String(b.appointmentDate || b.dadosSolicitacao?.dataPreferencial || ''))).map(item => <li className="data-list-item" key={item.id}><div className="item-main-info"><strong>{item.dadosUsuario?.name || 'Cidadão'}</strong><span>{item.dadosSolicitacao?.vereadorNome} · {item.dadosSolicitacao?.assunto}</span><span>{item.appointmentDate || item.dadosSolicitacao?.dataPreferencial} · {item.appointmentTime || item.dadosSolicitacao?.horarioPreferencial}</span><span>{item.status}</span><p>{item.dadosSolicitacao?.descricao}</p><div className="form-row">{['Aguardando Análise', 'Aguardando Confirmação', 'Datas Liberadas'].includes(item.status) && item.dadosSolicitacao?.vereadorId === currentUser.uid && <button className="btn-primary" onClick={() => setSelected(item)}>Analisar motivo / liberar horários</button>}{item.status === 'Agendado' && <button className="btn-primary" disabled={busy} onClick={() => changeStatus(item, 'Realizado')}>Concluir</button>}{['Agendado','Aguardando Confirmação','Aguardando Análise','Datas Liberadas'].includes(item.status) && <button className="btn-secondary" disabled={busy} onClick={() => changeStatus(item, 'Cancelado')}>Cancelar</button>}</div></div></li>)}</ul>{!items.length && <p>Nenhum atendimento solicitado.</p>}</section>
        {selected && <div className="modal-overlay"><div className="modal-content"><button className="btn-secondary" onClick={() => setSelected(null)}>Fechar</button><VereadorAppointmentOffer key={selected.id} request={selected} review onSaved={() => setSelected(null)} /></div></div>}
        {availability && <SectorAvailabilityModal configCollection={`vereadores-agenda-config/${availability.id}/agenda`} sectorLabel={availability.name || availability.nome} onClose={() => setAvailability(null)} />}
    </main></div>;
}
