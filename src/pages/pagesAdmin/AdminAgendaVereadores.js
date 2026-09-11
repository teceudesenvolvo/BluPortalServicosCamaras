import { canAccessModule } from '../../config/rolePermissions';
import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { isSystemRootEmail } from '../../config/systemModules';
import { firestore } from '../../firebase';
import VereadorAppointmentOffer from '../../components/VereadorAppointmentOffer';
import AdminSidebar from '../../components/AdminSidebar';
import { SectorAvailabilityModal } from '../../components/SectorScheduling';
import CabinetWorkspace from '../../components/CabinetWorkspace';

export default function AdminAgendaVereadores() {
    const { currentUser } = useAuth();
    const { settings } = useSystemControl();
    const [role, setRole] = useState('');
    const [items, setItems] = useState([]);
    const [members, setMembers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [availability, setAvailability] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [gabineteId, setGabineteId] = useState('');
    const [cabinetAccess, setCabinetAccess] = useState('consulta');
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
        if (!currentUser || !role) return;
        if (role === 'Vereador') { setGabineteId(currentUser.uid); setCabinetAccess('gestao'); return; }
        if (role === 'Assessor') getDocs(query(collection(firestore, 'gabinetes-equipe'), where('userId', '==', currentUser.uid))).then(snap => { setGabineteId(snap.docs[0]?.data().gabineteId || ''); setCabinetAccess(snap.docs[0]?.data().nivelAcesso || 'operacional'); }).catch(() => setError('Seu usuário ainda não está vinculado a um gabinete.'));
    }, [currentUser, role]);
    useEffect(() => {
        if (!allowed) return undefined;
        const requests = collection(firestore, 'solicitacoes-vereadores');
        if (!admin && !gabineteId) return undefined;
        const unsubscribe = onSnapshot(admin ? requests : query(requests, where('dadosSolicitacao.vereadorId', '==', gabineteId)), snap => {
            setItems(snap.docs.map(item => ({ ...item.data(), id: item.id })));
        }, () => setError('Não foi possível carregar os agendamentos.'));
        const unsubscribeMembers = onSnapshot(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')), snap => {
            setMembers(snap.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => admin || item.id === currentUser.uid));
        }, () => setError('Não foi possível carregar os vereadores.'));
        return () => { unsubscribe(); unsubscribeMembers(); };
    }, [allowed, admin, currentUser, gabineteId]);
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
    if (!allowed) return <main className="dashboard-content"><p>{error || (role ? 'Acesso disponível para administradores e vereadores.' : 'Verificando acesso…')}</p></main>;
    return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content cabinet-page-content">
        <header className="page-header-container"><div><h1>Gabinete Vereador</h1><p>Agenda, demandas, visitantes, equipe e atividades do gabinete.</p></div></header>
        {error && <p role="alert">{error}</p>}
        <CabinetWorkspace gabineteId={gabineteId || members[0]?.id || ''} items={items} canManageTeam={role === 'Vereador' || admin} canApprove={role === 'Vereador' || admin} canOperate={role === 'Vereador' || admin || ['operacional','gestao'].includes(cabinetAccess)} onOpenAvailability={() => setAvailability({ id: gabineteId || members[0]?.id, name: 'gabinete' })} onAnalyze={setSelected} onChangeStatus={changeStatus} busy={busy} />
        {selected && <div className="modal-overlay"><div className="modal-content"><button className="btn-secondary" onClick={() => setSelected(null)}>Fechar</button><VereadorAppointmentOffer key={selected.id} request={selected} review onSaved={() => setSelected(null)} /></div></div>}
        {availability && <SectorAvailabilityModal configCollection={`vereadores-agenda-config/${availability.id}/agenda`} sectorLabel={availability.name || availability.nome} onClose={() => setAvailability(null)} />}
    </main></div>;
}
