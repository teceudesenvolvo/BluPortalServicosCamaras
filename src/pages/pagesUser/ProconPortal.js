import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { LiaCalendarCheckSolid, LiaClipboardListSolid, LiaCommentDotsSolid, LiaPlusSolid, LiaShieldAltSolid } from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { firestore } from '../../firebase';

const ProconPortal = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [complaints, setComplaints] = useState([]);
    const [appointments, setAppointments] = useState([]);

    useEffect(() => {
        if (!currentUser) return undefined;
        const unsubComplaints = onSnapshot(query(collection(firestore, 'procon-atendimentos'), where('userId', '==', currentUser.uid)), snap => setComplaints(snap.docs.map(item => ({ id: item.id, ...item.data() }))));
        const unsubAppointments = onSnapshot(query(collection(firestore, 'procon-agendamentos'), where('userId', '==', currentUser.uid)), snap => setAppointments(snap.docs.map(item => ({ id: item.id, ...item.data() }))));
        return () => { unsubComplaints(); unsubAppointments(); };
    }, [currentUser]);

    const nextAppointment = [...appointments].filter(item => item.status !== 'Cancelado' && item.appointmentDate >= new Date().toISOString().slice(0,10)).sort((a,b) => `${a.appointmentDate}${a.appointmentTime}`.localeCompare(`${b.appointmentDate}${b.appointmentTime}`))[0];
    return <div className="dashboard-layout"><Sidebar onItemClick={navigate} /><main className="dashboard-content procon-citizen-page">
        <header className="procon-citizen-hero"><div><span><LiaShieldAltSolid /> Defesa do consumidor</span><h1>PROCON</h1><p>Registre reclamações, acompanhe seus atendimentos e agende atendimento presencial.</p></div><button onClick={() => navigate('/procon/reclamacao')}><LiaPlusSolid /> Nova reclamação</button></header>
        <section className="procon-citizen-actions">
            <button onClick={() => navigate('/procon/reclamacao')}><LiaCommentDotsSolid /><div><strong>Registrar reclamação</strong><span>Informe o problema e envie documentos.</span></div></button>
            <button onClick={() => navigate('/procon-atendimentos')}><LiaClipboardListSolid /><div><strong>Meus atendimentos</strong><span>{complaints.length} protocolo(s) registrado(s).</span></div></button>
            <button onClick={() => navigate('/procon/agendar')}><LiaCalendarCheckSolid /><div><strong>Agendar atendimento</strong><span>Escolha uma data e um horário disponível.</span></div></button>
        </section>
        <section className="data-card procon-citizen-status"><div className="card-header"><h2>Resumo</h2></div><div className="procon-kpis"><article><span>Reclamações</span><strong>{complaints.length}</strong><small>{complaints.filter(item => !['Finalizada','Arquivada','Cancelado'].includes(item.status)).length} em andamento</small></article><article><span>Agendamentos</span><strong>{appointments.length}</strong><small>histórico completo</small></article><article><span>Próximo atendimento</span><strong>{nextAppointment?.appointmentDate?.split('-').reverse().join('/') || '—'}</strong><small>{nextAppointment ? `${nextAppointment.appointmentTime} · ${nextAppointment.status}` : 'Nenhum agendamento futuro'}</small></article></div></section>
    </main></div>;
};
export default ProconPortal;
