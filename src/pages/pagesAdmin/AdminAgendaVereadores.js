import CabinetOverlay from '../../components/CabinetOverlay';
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
    const [profile, setProfile] = useState(null);
    const [resolvingCabinet, setResolvingCabinet] = useState(true);
    const [authorName, setAuthorName] = useState('');
    const [items, setItems] = useState([]);
    const [availableCabinets, setAvailableCabinets] = useState([]);
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
        setRole(''); setProfile(null); setGabineteId(''); setResolvingCabinet(Boolean(currentUser));
        if (currentUser) getDoc(doc(firestore, 'users', currentUser.uid))
            .then(snap => {
                if (!active) return;
                const userProfile = snap.data() || {};
                setProfile(userProfile);
                setRole(userProfile.tipo || 'Cidadão');
                setAuthorName(userProfile.name || userProfile.nome || currentUser.displayName || currentUser.email || 'Vereador');
            })
            .catch(() => { if (active) { setError('Não foi possível verificar seu acesso.'); setResolvingCabinet(false); } });
        return () => { active = false; };
    }, [currentUser]);
    useEffect(() => {
        if (!currentUser || !role) return;
        const normalizedRole = String(role).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const directCabinetId = profile?.gabineteId || profile?.vereadorId || '';
        if (normalizedRole.includes('vereador') || profile?.vereadorPublicoId) {
            setGabineteId(directCabinetId || currentUser.uid);
            setCabinetAccess('gestao');
            setResolvingCabinet(false);
            return;
        }
        if (normalizedRole.includes('assessor')) {
            getDocs(query(collection(firestore, 'gabinetes-equipe'), where('userId', '==', currentUser.uid)))
                .then(snap => {
                    const membership = snap.docs[0]?.data();
                    setGabineteId(membership?.gabineteId || directCabinetId || '');
                    setCabinetAccess(membership?.nivelAcesso || 'operacional');
                })
                .catch(() => setError('Não foi possível localizar o vínculo deste assessor.'))
                .finally(() => setResolvingCabinet(false));
            return;
        }
        setGabineteId(directCabinetId);
        setResolvingCabinet(false);
    }, [currentUser, role, profile]);
    useEffect(() => {
        if (!admin) { setAvailableCabinets([]); return undefined; }
        return onSnapshot(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')), snapshot => {
            setAvailableCabinets(snapshot.docs
                .map(item => ({ id: item.id, name: item.data().vereadorNome || item.data().name || item.data().nome || 'Vereador(a)' }))
                .filter(item => Boolean(item.id)));
        }, () => setError('Não foi possível carregar os gabinetes disponíveis.'));
    }, [admin]);
    useEffect(() => {
        if (!allowed) return undefined;
        const requests = collection(firestore, 'solicitacoes-vereadores');
        if (!admin && !gabineteId) return undefined;
        const unsubscribe = onSnapshot(admin ? requests : query(requests, where('dadosSolicitacao.vereadorId', '==', gabineteId)), snap => {
            setItems(snap.docs.map(item => ({ ...item.data(), id: item.id })));
        }, () => setError('Não foi possível carregar os agendamentos.'));
        return () => unsubscribe();
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
    const selectedGabineteId = admin ? (gabineteId || availableCabinets[0]?.id || '') : gabineteId;
    if (!allowed) return <main className="dashboard-content"><p>{error || (role ? 'Acesso disponível para administradores e vereadores.' : 'Verificando acesso…')}</p></main>;
    return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content cabinet-page-content">
        <header className="page-header-container"><div><h1>Gabinete Vereador</h1><p>Agenda, demandas, visitantes, equipe e atividades do gabinete.</p></div>{admin && <label className="cabinet-admin-selector">Gabinete <select value={selectedGabineteId} onChange={event => setGabineteId(event.target.value)}><option value="">Selecione o gabinete</option>{availableCabinets.map(cabinet => <option key={cabinet.id} value={cabinet.id}>{cabinet.name}</option>)}</select></label>}</header>
        {error && <p role="alert">{error}</p>}
        {resolvingCabinet && <section className="data-card"><h2>Carregando gabinete</h2><p>Verificando o vínculo do usuário autenticado.</p></section>}
        {!resolvingCabinet && !selectedGabineteId && <section className="data-card"><h2>Gabinete não vinculado</h2><p>Este acesso não possui vínculo de vereador ou equipe. Vincule o assessor em Minha equipe para liberar o gabinete.</p></section>}
        {selectedGabineteId && <CabinetWorkspace gabineteId={selectedGabineteId} authorName={authorName || currentUser?.displayName || currentUser?.email || 'Vereador'} items={items} canManageTeam={role === 'Vereador' || role === 'Admin' || admin} canApprove={role === 'Vereador' || role === 'Admin' || admin} canOperate={role === 'Vereador' || role === 'Admin' || admin || ['operacional','gestao'].includes(cabinetAccess)} onOpenAvailability={() => setAvailability({ id: selectedGabineteId, name: 'gabinete' })} onAnalyze={setSelected} onChangeStatus={changeStatus} busy={busy} />}
        {selected && <CabinetOverlay><div className="modal-content"><button className="btn-secondary" onClick={() => setSelected(null)}>Fechar</button><VereadorAppointmentOffer key={selected.id} request={selected} review onSaved={() => setSelected(null)} /></div></CabinetOverlay>}
        {availability && <SectorAvailabilityModal configCollection={`vereadores-agenda-config/${availability.id}/agenda`} sectorLabel={availability.name || availability.nome} onClose={() => setAvailability(null)} />}
    </main></div>;
}
