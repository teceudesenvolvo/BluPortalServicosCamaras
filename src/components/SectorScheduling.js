import React, { useEffect, useState } from 'react';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { LiaCalendarCheckSolid, LiaTimesSolid } from 'react-icons/lia';
import { firestore } from '../firebase';

const DAYS = [
    ['monday', 'Segunda-feira'], ['tuesday', 'Terça-feira'],
    ['wednesday', 'Quarta-feira'], ['thursday', 'Quinta-feira'],
    ['friday', 'Sexta-feira'],
];

const emptyAvailability = () => Object.fromEntries(DAYS.map(([day]) => [day, { enabled: false, times: '' }]));
const toForm = (data = {}) => ({
    ...emptyAvailability(),
    ...Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([day, times]) => [day, { enabled: true, times: times.join(', ') }]))
});

export const SectorAvailabilityModal = ({ configCollection, sectorLabel, onClose }) => {
    const [availability, setAvailability] = useState(emptyAvailability);
    const [blockedDates, setBlockedDates] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            getDoc(doc(firestore, configCollection, 'availability')),
            getDoc(doc(firestore, configCollection, 'blockedDates')),
        ]).then(([availableSnap, blockedSnap]) => {
            if (availableSnap.exists()) setAvailability(toForm(availableSnap.data()));
            if (blockedSnap.exists()) setBlockedDates((blockedSnap.data().dates || []).join(', '));
        }).catch(error => console.error(`Erro ao carregar horários de ${sectorLabel}:`, error));
    }, [configCollection, sectorLabel]);

    const save = async () => {
        setSaving(true);
        const finalAvailability = {};
        Object.entries(availability).forEach(([day, value]) => {
            if (value.enabled) finalAvailability[day] = value.times.split(',').map(time => time.trim()).filter(Boolean);
        });
        try {
            await Promise.all([
                setDoc(doc(firestore, configCollection, 'availability'), finalAvailability),
                setDoc(doc(firestore, configCollection, 'blockedDates'), { dates: blockedDates.split(',').map(date => date.trim()).filter(Boolean) }),
            ]);
            alert(`Horários de ${sectorLabel} salvos com sucesso!`);
            onClose();
        } catch (error) {
            console.error('Erro ao salvar horários:', error);
            alert('Não foi possível salvar os horários.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content sector-availability-modal" onClick={event => event.stopPropagation()}>
                <div className="modal-header"><h3>Horários - {sectorLabel}</h3><button className="modal-close-btn" onClick={onClose}><LiaTimesSolid /></button></div>
                <div className="modal-body">
                    <p className="detail-description">Ative os dias e informe os horários separados por vírgula.</p>
                    <div className="sector-availability-days">
                        {DAYS.map(([day, label]) => (
                            <div className="sector-availability-day" key={day}>
                                <label><input type="checkbox" checked={availability[day].enabled} onChange={() => setAvailability(current => ({ ...current, [day]: { ...current[day], enabled: !current[day].enabled } }))} /> {label}</label>
                                <input className="form-input" placeholder="08:00, 08:30, 09:00" disabled={!availability[day].enabled} value={availability[day].times} onChange={event => setAvailability(current => ({ ...current, [day]: { ...current[day], times: event.target.value } }))} />
                            </div>
                        ))}
                    </div>
                    <div className="form-group"><label>Datas bloqueadas</label><input className="form-input" value={blockedDates} onChange={event => setBlockedDates(event.target.value)} placeholder="25/12/2026, 01/01/2027" /></div>
                    <button className="btn-primary btn-success" type="button" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar horários'}</button>
                </div>
            </div>
        </div>
    );
};

export const SectorAppointment = ({ collectionName, configCollection, request, sectorLabel, onScheduled }) => {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [times, setTimes] = useState([]);
    const [config, setConfig] = useState(null);
    const [blocked, setBlocked] = useState([]);
    const [error, setError] = useState('');
    const today = new Date().toLocaleDateString('en-CA');

    useEffect(() => {
        Promise.all([
            getDoc(doc(firestore, configCollection, 'availability')),
            getDoc(doc(firestore, configCollection, 'blockedDates')),
        ]).then(([availableSnap, blockedSnap]) => {
            setConfig(availableSnap.exists() ? availableSnap.data() : {});
            setBlocked(blockedSnap.exists() ? blockedSnap.data().dates || [] : []);
        }).catch(() => setError('Não foi possível carregar os horários.'));
    }, [configCollection]);

    const chooseDate = async (value) => {
        setDate(value); setTime(''); setError('');
        if (!value || value < today) { setTimes([]); setError('Selecione uma data válida a partir de hoje.'); return; }
        const br = value.split('-').reverse().join('/');
        if (blocked.includes(br)) { setTimes([]); setError('Esta data não está disponível.'); return; }
        const weekday = new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const bookedSnap = await getDoc(doc(firestore, configCollection, 'bookedSlots'));
        const booked = bookedSnap.exists() ? bookedSnap.data()[value] || [] : [];
        const free = (config?.[weekday] || []).filter(slot => !booked.includes(slot));
        setTimes(free);
        if (!free.length) setError('Não há horários livres nesta data.');
    };

    const confirm = async () => {
        if (!date || !time) { setError('Selecione a data e o horário.'); return; }
        try {
            await runTransaction(firestore, async transaction => {
                const bookedRef = doc(firestore, configCollection, 'bookedSlots');
                const requestRef = doc(firestore, collectionName, request.id);
                const bookedSnap = await transaction.get(bookedRef);
                const current = bookedSnap.exists() ? bookedSnap.data() : {};
                const slots = current[date] || [];
                if (slots.includes(time)) throw new Error('Este horário acabou de ser reservado. Escolha outro.');
                transaction.set(bookedRef, { [date]: [...slots, time] }, { merge: true });
                transaction.update(requestRef, { status: 'Agendado', appointmentDate: date, appointmentTime: time, ultimaAtualizacao: new Date() });
            });
            alert(`Agendamento em ${sectorLabel} confirmado!`);
            onScheduled?.();
        } catch (scheduleError) {
            setError(scheduleError.message || 'Não foi possível concluir o agendamento.');
        }
    };

    return (
        <section className="sector-appointment-card">
            <h4><LiaCalendarCheckSolid /> Escolha seu atendimento</h4>
            <div className="form-row"><div className="form-group"><label>Data</label><input className="form-input" type="date" min={today} value={date} onChange={event => chooseDate(event.target.value)} /></div><div className="form-group"><label>Horário</label><select className="form-input" value={time} onChange={event => setTime(event.target.value)} disabled={!times.length}><option value="">Selecione</option>{times.map(slot => <option key={slot}>{slot}</option>)}</select></div></div>
            {error && <p className="error-message-inline">{error}</p>}
            <button className="btn-primary" type="button" onClick={confirm}>Confirmar agendamento</button>
        </section>
    );
};
