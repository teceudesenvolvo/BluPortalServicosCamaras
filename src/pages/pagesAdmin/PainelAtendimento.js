import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from '../../firebase';

const PainelAtendimento = () => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const q = query(
            collection(firestore, 'atendimento-fila'),
            where('criadoEm', '>=', today),
            orderBy('criadoEm', 'asc'),
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTickets(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
            setLoading(false);
        }, (error) => {
            console.error('Erro ao carregar fila:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const waiting = useMemo(() => tickets.filter(ticket => ticket.status === 'Aguardando'), [tickets]);
    const calling = useMemo(() => tickets.filter(ticket => ticket.status === 'Chamando'), [tickets]);
    const done = useMemo(() => tickets.filter(ticket => ticket.status === 'Concluído'), [tickets]);
    const current = calling[calling.length - 1] || null;

    const updateTicket = async (ticket, status) => {
        await updateDoc(doc(firestore, 'atendimento-fila', ticket.id), {
            status,
            chamadoEm: status === 'Chamando' ? new Date() : ticket.chamadoEm || null,
            concluidoEm: status === 'Concluído' ? new Date() : null,
        });
    };

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content queue-panel-page">
                <header className="queue-panel-hero">
                    <div>
                        <span>Fila presencial</span>
                        <h1>Painel de Atendimento</h1>
                        <p>{waiting.length} aguardando · {calling.length} em chamada · {done.length} concluído{done.length === 1 ? '' : 's'}</p>
                    </div>
                    {current && (
                        <div className="queue-current-card">
                            <span>Chamando agora</span>
                            <strong>{current.senha}</strong>
                            <p>{current.nome}</p>
                        </div>
                    )}
                </header>

                <div className="queue-grid">
                    <section className="data-card">
                        <div className="card-header"><h3>Aguardando</h3></div>
                        {loading && <p>Carregando fila...</p>}
                        {!loading && waiting.length === 0 && <p>Nenhuma senha aguardando.</p>}
                        <div className="queue-ticket-list">
                            {waiting.map(ticket => (
                                <div key={ticket.id} className="queue-ticket">
                                    <strong>{ticket.senha}</strong>
                                    <div>
                                        <span>{ticket.nome}</span>
                                        <small>{ticket.assunto} · Protocolo {ticket.protocolo}</small>
                                    </div>
                                    <button onClick={() => updateTicket(ticket, 'Chamando')} className="btn-primary">Chamar</button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="data-card">
                        <div className="card-header"><h3>Chamando</h3></div>
                        {calling.length === 0 && <p>Nenhuma senha em chamada.</p>}
                        <div className="queue-ticket-list">
                            {calling.map(ticket => (
                                <div key={ticket.id} className="queue-ticket calling">
                                    <strong>{ticket.senha}</strong>
                                    <div>
                                        <span>{ticket.nome}</span>
                                        <small>{ticket.assunto}</small>
                                    </div>
                                    <button onClick={() => updateTicket(ticket, 'Concluído')} className="btn-save-status">Concluir</button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default PainelAtendimento;
