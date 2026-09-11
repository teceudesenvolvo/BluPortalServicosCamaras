import { canAccessModule } from '../config/rolePermissions';
import React, { useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { auth, firestore } from '../firebase';

export const isFutureCouncilSlot = slot => Boolean(slot?.date && slot?.time && new Date(`${slot.date}T${slot.time}:00-03:00`).getTime() > Date.now());

export default function VereadorAppointmentOffer({ request, review = false, onSaved = () => {} }) {
    const [slots, setSlots] = useState([{ date: '', time: '' }]);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async (action, slot) => {
        setBusy(true); setError('');
        try {
            await runTransaction(firestore, async tx => {
                const ref = doc(firestore, 'solicitacoes-vereadores', request.id);
                const snapshot = await tx.get(ref);
                const data = snapshot.data();
                if (!data) throw new Error('Solicitação não encontrada.');
                const uid = auth.currentUser?.uid;
                if (!uid) throw new Error('Entre novamente para continuar.');
                if (action !== 'book') {
                    if (data.dadosSolicitacao?.vereadorId !== uid) throw new Error('Somente o vereador escolhido pode analisar este motivo.');
                    if (!['Aguardando Análise', 'Aguardando Confirmação', 'Datas Liberadas'].includes(data.status)) throw new Error('Esta solicitação já foi processada.');
                    if (action === 'approve' && (!slots.length || slots.some(s => !isFutureCouncilSlot(s)))) throw new Error('Informe datas e horários futuros para todas as opções.');
                    if (action === 'reject' && !reason.trim()) throw new Error('Informe o motivo da recusa.');
                    tx.update(ref, { status: action === 'approve' ? 'Datas Liberadas' : 'Recusado', horariosOferecidos: action === 'approve' ? slots.filter((s, i) => slots.findIndex(other => other.date === s.date && other.time === s.time) === i) : [], aprovadoPor: action === 'approve' ? uid : null, analisadoPor: uid, parecerVereador: reason.trim(), analisadoEm: new Date(), ultimaAtualizacao: new Date() });
                } else {
                    if (data.userId !== uid) {
                        const profile = await tx.get(doc(firestore, 'users', uid));
                        const control = await tx.get(doc(firestore, 'system-control', 'portal'));
                        if (!canAccessModule(control.data() || {}, profile.data()?.tipo, auth.currentUser.email, 'recepcao', 'admin')) throw new Error('Somente o solicitante ou a recepção pode escolher o horário.');
                    }
                    if (data.status !== 'Datas Liberadas' || data.aprovadoPor !== data.dadosSolicitacao?.vereadorId || !data.horariosOferecidos?.some(s => s.date === slot.date && s.time === slot.time) || !isFutureCouncilSlot(slot)) throw new Error('Horário indisponível. Atualize a solicitação.');
                    const slotsRef = doc(firestore, `vereadores-agenda-config/${data.dadosSolicitacao.vereadorId}/agenda/bookedSlots`);
                    const booked = await tx.get(slotsRef);
                    const times = booked.data()?.[slot.date] || [];
                    if (times.includes(slot.time)) throw new Error('Este horário já foi reservado. Escolha outra opção.');
                    tx.set(slotsRef, { [slot.date]: [...times, slot.time] }, { merge: true });
                    tx.update(ref, { status: 'Agendado', appointmentDate: slot.date, appointmentTime: slot.time, agendadoPor: uid, ultimaAtualizacao: new Date() });
                }
            });
            onSaved();
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };
    return <section className="data-card">
        <h3>{review ? 'Analisar motivo e liberar datas' : 'Escolha um horário liberado pelo vereador'}</h3>
        {error && <p role="alert">{error}</p>}
        {review ? <>
            <p>{request.dadosSolicitacao?.descricao}</p>
            {slots.map((slot, i) => <div className="form-row" key={i} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <label>Data<input className="form-input" type="date" value={slot.date} onChange={e => setSlots(slots.map((s, n) => n === i ? { ...s, date: e.target.value } : s))} /></label>
                <label>Horário<input className="form-input" type="time" value={slot.time} onChange={e => setSlots(slots.map((s, n) => n === i ? { ...s, time: e.target.value } : s))} /></label>
                {slots.length > 1 && <button type="button" onClick={() => setSlots(slots.filter((_, n) => n !== i))}>Remover</button>}
            </div>)}
            <button className="btn-secondary" disabled={busy} onClick={() => setSlots([...slots, { date: '', time: '' }])}>Adicionar horário</button>
            <label style={{ display: 'block', margin: '16px 0' }}>Parecer / motivo da recusa<textarea className="form-input" value={reason} onChange={e => setReason(e.target.value)} /></label>
            <button className="btn-primary" disabled={busy} onClick={() => save('approve')}>Aceitar motivo e liberar horários</button>{' '}
            <button className="btn-secondary" disabled={busy} onClick={() => save('reject')}>Recusar solicitação</button>
        </> : <>
            <p>{request.parecerVereador}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{(request.horariosOferecidos || []).filter(isFutureCouncilSlot).map(slot => <button className="btn-primary" key={`${slot.date}-${slot.time}`} disabled={busy} onClick={() => save('book', slot)}>{slot.date.split('-').reverse().join('/')} às {slot.time}</button>)}</div>
            {!(request.horariosOferecidos || []).some(isFutureCouncilSlot) && <p>Os horários expiraram. Solicite novas opções ao gabinete.</p>}
        </>}
    </section>;
}
