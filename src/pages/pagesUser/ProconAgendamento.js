import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { LiaArrowLeftSolid, LiaCalendarCheckSolid } from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { firestore } from '../../firebase';
import { dateToBr, getFreeTimes } from '../../utils/proconSchedule';

const ProconAgendamento = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [profile, setProfile] = useState({});
    const [availability, setAvailability] = useState({});
    const [blockedDates, setBlockedDates] = useState([]);
    const [bookedSlots, setBookedSlots] = useState({});
    const [form, setForm] = useState({ appointmentDate: '', appointmentTime: '', assunto: '', observacoes: '', prioridade: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const load = async () => {
            const [availabilitySnap, blockedSnap, bookedSnap, profileSnap] = await Promise.all([
                getDoc(doc(firestore,'procon-config','availability')), getDoc(doc(firestore,'procon-config','blockedDates')),
                getDoc(doc(firestore,'procon-config','bookedSlots')), currentUser ? getDoc(doc(firestore,'users',currentUser.uid)) : Promise.resolve(null),
            ]);
            setAvailability(availabilitySnap.data() || {}); setBlockedDates(blockedSnap.data()?.dates || []); setBookedSlots(bookedSnap.data() || {}); setProfile(profileSnap?.data() || {}); setLoading(false);
        };
        load().catch(() => { setMessage('Não foi possível carregar a agenda.'); setLoading(false); });
    }, [currentUser]);
    const freeTimes = useMemo(() => getFreeTimes({ date: form.appointmentDate, availability, blockedDates, bookedSlots }), [availability, blockedDates, bookedSlots, form.appointmentDate]);
    const today = new Date().toISOString().slice(0,10);

    const submit = async event => {
        event.preventDefault();
        if (!currentUser || !form.appointmentDate || !form.appointmentTime || !form.assunto.trim()) return;
        setSaving(true); setMessage('');
        const slotsRef = doc(firestore,'procon-config','bookedSlots');
        const appointmentRef = doc(collection(firestore,'procon-agendamentos'));
        try {
            await runTransaction(firestore, async transaction => {
                const slotsSnap = await transaction.get(slotsRef);
                const slots = slotsSnap.data() || {};
                const dateSlots = slots[form.appointmentDate] || [];
                if (dateSlots.includes(form.appointmentTime)) throw new Error('Este horário acabou de ser reservado. Escolha outro.');
                transaction.set(slotsRef, { [form.appointmentDate]: [...dateSlots, form.appointmentTime].sort() }, { merge: true });
                transaction.set(appointmentRef, { ...form, protocolo: appointmentRef.id, userId: currentUser.uid, nome: profile.name || currentUser.displayName || currentUser.email, cpf: profile.cpf || '', email: currentUser.email || '', telefone: profile.phone || profile.telefone || '', dadosUsuario: { name: profile.name || currentUser.displayName || currentUser.email, cpf: profile.cpf || '', email: currentUser.email || '' }, status: 'Agendado', setorAtendimento: 'PROCON', origem: 'portal', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            });
            setMessage(`Agendamento confirmado para ${dateToBr(form.appointmentDate)} às ${form.appointmentTime}.`);
            setBookedSlots(previous => ({ ...previous, [form.appointmentDate]: [...(previous[form.appointmentDate] || []), form.appointmentTime] }));
            setForm(previous => ({ ...previous, appointmentTime: '' }));
        } catch (error) { setMessage(error.message || 'Não foi possível concluir o agendamento.'); }
        finally { setSaving(false); }
    };
    return <div className="dashboard-layout"><Sidebar onItemClick={navigate} /><main className="dashboard-content procon-citizen-page"><header className="procon-citizen-hero compact"><div><span><LiaCalendarCheckSolid /> Atendimento presencial</span><h1>Agendar PROCON</h1><p>Escolha entre os dias e horários liberados pela equipe.</p></div><button onClick={() => navigate('/procon')}><LiaArrowLeftSolid /> Voltar</button></header><section className="data-card procon-schedule-card">{loading ? <p>Carregando agenda...</p> : <form onSubmit={submit}><div className="system-fields-grid"><label><span>Data</span><input type="date" min={today} value={form.appointmentDate} onChange={event => setForm({ ...form, appointmentDate:event.target.value, appointmentTime:'' })} required /></label><label><span>Horário</span><select value={form.appointmentTime} onChange={event => setForm({ ...form, appointmentTime:event.target.value })} disabled={!freeTimes.length} required><option value="">{form.appointmentDate ? 'Selecione um horário' : 'Escolha primeiro a data'}</option>{freeTimes.map(time => <option key={time}>{time}</option>)}</select></label><label className="wide"><span>Assunto</span><input value={form.assunto} onChange={event => setForm({ ...form, assunto:event.target.value })} placeholder="Ex.: orientação sobre cobrança indevida" required /></label><label className="wide"><span>Observações</span><textarea rows="4" value={form.observacoes} onChange={event => setForm({ ...form, observacoes:event.target.value })} /></label></div>{form.appointmentDate && !freeTimes.length && <p className="procon-schedule-warning">Não há horários disponíveis nesta data.</p>}<label className="procon-priority-check"><input type="checkbox" checked={form.prioridade} onChange={event => setForm({ ...form, prioridade:event.target.checked })} /> Necessito atendimento prioritário</label>{message && <p className="procon-schedule-message">{message}</p>}<button className="btn-primary" disabled={saving || !freeTimes.length}>{saving ? 'Confirmando...' : 'Confirmar agendamento'}</button></form>}</section></main></div>;
};
export default ProconAgendamento;
