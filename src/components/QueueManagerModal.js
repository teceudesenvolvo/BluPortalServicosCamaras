import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    collection,
    doc,
    onSnapshot,
    runTransaction,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import {
    LiaBullhornSolid,
    LiaCheckCircleSolid,
    LiaExchangeAltSolid,
    LiaPauseCircleSolid,
    LiaPlayCircleSolid,
    LiaPlusSolid,
    LiaRedoAltSolid,
    LiaTimesSolid,
    LiaUserClockSolid,
} from 'react-icons/lia';
import { auth, firestore } from '../firebase';

const SERVICES = [
    'Todos os serviços',
    'Balcão do Cidadão',
    'Assessoria ao Microempreendedor',
    'Ouvidoria',
    'Procuradoria da Mulher',
    'PIEL',
];

const REQUEST_COLLECTIONS = {
    'Balcão do Cidadão': 'balcao-cidadao',
    'Assessoria ao Microempreendedor': 'assessoria-microempreendedor',
    Ouvidoria: 'ouvidoria',
    'Procuradoria da Mulher': 'procuradoria-mulher',
    PIEL: 'piel-atendimentos',
};

const isToday = (value) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
};

const getTime = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    return new Date(value).getTime() || 0;
};

const formatTicketDate = (value) => {
    if (!value) return 'Data não informada';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleDateString('pt-BR');
};

const getAppointmentSortTime = (ticket) => {
    const dateValue = ticket?.appointmentDate;
    const timeValue = ticket?.appointmentTime;
    if (!dateValue || !timeValue) return Number.POSITIVE_INFINITY;

    let normalizedDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) {
        normalizedDate = String(dateValue);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(dateValue))) {
        const [day, month, year] = String(dateValue).split('/');
        normalizedDate = `${year}-${month}-${day}`;
    }

    if (!normalizedDate) return Number.POSITIVE_INFINITY;
    const parsed = new Date(`${normalizedDate}T${String(timeValue).slice(0, 5)}:00-03:00`).getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const queueOrder = (a, b) => {
    const priorityDifference = Number(Boolean(b.prioridade)) - Number(Boolean(a.prioridade));
    return priorityDifference
        || getAppointmentSortTime(a) - getAppointmentSortTime(b)
        || getTime(a.ordemFilaEm || a.criadoEm) - getTime(b.ordemFilaEm || b.criadoEm);
};

const QueueManagerModal = ({ onClose, lockedService = '' }) => {
    const [tickets, setTickets] = useState([]);
    const [counters, setCounters] = useState([]);
    const [service, setService] = useState(lockedService || 'Balcão do Cidadão');
    const [selectedCounter, setSelectedCounter] = useState('');
    const [newCounterName, setNewCounterName] = useState('');
    const [counterFeedback, setCounterFeedback] = useState(null);
    const [activeTab, setActiveTab] = useState('fila');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsubscribeTickets = onSnapshot(collection(firestore, 'atendimento-fila'), (snapshot) => {
            setTickets(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        });
        const unsubscribeCounters = onSnapshot(collection(firestore, 'atendimento-guiches'), (snapshot) => {
            const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            setCounters(items.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')));
        });
        return () => {
            unsubscribeTickets();
            unsubscribeCounters();
        };
    }, []);

    const serviceMatches = useCallback((ticket) => (
        service === 'Todos os serviços' || (ticket.setor || 'Balcão do Cidadão') === service
    ), [service]);
    const todayTickets = useMemo(() => tickets.filter(ticket => isToday(ticket.criadoEm)), [tickets]);
    const filteredTickets = useMemo(() => todayTickets.filter(serviceMatches), [serviceMatches, todayTickets]);
    const counterByTicketId = useMemo(() => new Map(counters
        .filter(counter => counter.ticketAtualId)
        .map(counter => [counter.ticketAtualId, counter])), [counters]);
    const busyCounterIds = useMemo(() => new Set([
        ...counters.filter(counter => counter.ticketAtualId).map(counter => counter.id),
        ...tickets
            .filter(ticket => ['Chamando', 'Em Atendimento'].includes(ticket.status) && ticket.guicheId)
            .map(ticket => ticket.guicheId),
    ]), [counters, tickets]);
    const serviceCounters = useMemo(() => counters.filter(counter => (
        counter.ativo !== false
        && (!lockedService || !counter.servicos?.length || counter.servicos.includes(lockedService))
    )), [counters, lockedService]);
    const waiting = useMemo(() => filteredTickets.filter(ticket => ticket.status === 'Aguardando').sort(queueOrder), [filteredTickets]);
    const active = useMemo(() => tickets
        .filter(ticket => serviceMatches(ticket) && (['Chamando', 'Em Atendimento'].includes(ticket.status) || counterByTicketId.has(ticket.id)))
        .map(ticket => {
            const linkedCounter = counterByTicketId.get(ticket.id);
            return linkedCounter ? {
                ...ticket,
                guicheId: ticket.guicheId || linkedCounter.id,
                guiche: ticket.guiche || linkedCounter.nome,
            } : ticket;
        })
        .sort((a, b) => getTime(b.chamadoEm || b.criadoEm) - getTime(a.chamadoEm || a.criadoEm)), [counterByTicketId, serviceMatches, tickets]);
    const completed = filteredTickets.filter(ticket => ticket.status === 'Concluído').length;
    const absent = filteredTickets.filter(ticket => ticket.status === 'Ausente').length;
    const suggestedCounterName = useMemo(() => {
        const highestNumber = counters.reduce((highest, counter) => {
            const number = Number(String(counter.nome || '').match(/\d+/)?.[0] || 0);
            return Math.max(highest, number);
        }, 0);
        return `Guichê ${String(highestNumber + 1).padStart(2, '0')}`;
    }, [counters]);

    useEffect(() => {
        if (selectedCounter && serviceCounters.some(counter => counter.id === selectedCounter)) return;
        // A criação do guichê chega primeiro no estado local e depois no snapshot.
        // Preserve a seleção nesse intervalo para não voltar ao primeiro guichê ocupado.
        if (selectedCounter && !counters.some(counter => counter.id === selectedCounter)) return;
        const firstCounter = serviceCounters[0];
        setSelectedCounter(firstCounter?.id || '');
    }, [counters, selectedCounter, serviceCounters]);

    const updateTicket = async (ticket, status, extra = {}) => {
        const now = new Date();
        const timestamps = {
            Chamando: { chamadoEm: now },
            'Em Atendimento': { atendimentoIniciadoEm: now },
            Concluído: { concluidoEm: now },
            Ausente: { ausenteEm: now },
            Aguardando: { retornouFilaEm: now },
        };
        const updates = [updateDoc(doc(firestore, 'atendimento-fila', ticket.id), {
            status,
            ...timestamps[status],
            ...extra,
            atualizadoEm: now,
            atualizadoPor: auth.currentUser?.email || 'admin',
        })];
        if (ticket.guicheId && ['Concluído', 'Ausente', 'Aguardando'].includes(status)) {
            updates.push(setDoc(doc(firestore, 'atendimento-guiches', ticket.guicheId), {
                senhaAtual: null,
                ticketAtualId: null,
                atualizadoEm: now,
            }, { merge: true }));
        }
        const ticketService = ticket.setor || 'Balcão do Cidadão';
        const requestCollection = ticket.collectionName || REQUEST_COLLECTIONS[ticketService];
        if (status === 'Concluído' && ticket.protocolo && ticketService === 'Balcão do Cidadão' && requestCollection) {
            updates.push(setDoc(doc(firestore, requestCollection, ticket.protocolo), {
                status: 'Documento em emissão',
                statusFila: 'Atendimento Presencial Concluído',
                atendimentoPresencialConcluidoEm: now,
                ultimaAtualizacao: now,
            }, { merge: true }));
        }
        await Promise.all(updates);
    };

    const callNext = async () => {
        if (!selectedCounter) {
            alert('Selecione ou crie um guichê antes de chamar.');
            return;
        }
        const nextTicket = waiting[0];
        if (!nextTicket) {
            alert('Não há cidadãos aguardando nesta fila.');
            return;
        }
        setLoading(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const ticketRef = doc(firestore, 'atendimento-fila', nextTicket.id);
                const counterRef = doc(firestore, 'atendimento-guiches', selectedCounter);
                const [ticketSnap, counterSnap] = await Promise.all([
                    transaction.get(ticketRef),
                    transaction.get(counterRef),
                ]);
                if (!ticketSnap.exists() || ticketSnap.data().status !== 'Aguardando') {
                    throw new Error('A senha já foi movimentada por outro atendente.');
                }
                const counter = counterSnap.data();
                if (!counterSnap.exists() || counter?.ativo === false) {
                    throw new Error('O guichê selecionado não está disponível.');
                }
                if (counter?.ticketAtualId) {
                    const currentTicketRef = doc(firestore, 'atendimento-fila', counter.ticketAtualId);
                    const currentTicketSnap = await transaction.get(currentTicketRef);
                    const currentTicket = currentTicketSnap.exists() ? currentTicketSnap.data() : null;
                    if (currentTicket && ['Chamando', 'Em Atendimento'].includes(currentTicket.status)) {
                        const now = new Date();
                        transaction.update(currentTicketRef, {
                            status: 'Concluído',
                            concluidoEm: now,
                            atualizadoEm: now,
                            atualizadoPor: auth.currentUser?.email || 'admin',
                        });

                        const currentService = currentTicket.setor || 'Balcão do Cidadão';
                        const requestCollection = currentTicket.collectionName || REQUEST_COLLECTIONS[currentService];
                        if (currentTicket.protocolo && currentService === 'Balcão do Cidadão' && requestCollection) {
                            transaction.set(doc(firestore, requestCollection, currentTicket.protocolo), {
                                status: 'Documento em emissão',
                                statusFila: 'Atendimento Presencial Concluído',
                                atendimentoPresencialConcluidoEm: now,
                                ultimaAtualizacao: now,
                            }, { merge: true });
                        }
                    }
                }
                const now = new Date();
                transaction.update(ticketRef, {
                    status: 'Chamando',
                    guicheId: selectedCounter,
                    guiche: counter.nome,
                    chamadoEm: now,
                    chamadoPor: auth.currentUser?.email || 'admin',
                    chamadas: (ticketSnap.data().chamadas || 0) + 1,
                });
                transaction.set(counterRef, {
                    ativo: true,
                    senhaAtual: nextTicket.senha,
                    ticketAtualId: nextTicket.id,
                    atualizadoEm: now,
                }, { merge: true });
            });
        } catch (error) {
            alert(error.message || 'Não foi possível chamar a próxima senha.');
        } finally {
            setLoading(false);
        }
    };

    const returnToQueueAndCallNext = async (ticket) => {
        if (!ticket.guicheId) {
            await updateTicket(ticket, 'Aguardando', {
                ordemFilaEm: new Date(),
                guiche: null,
                guicheId: null,
            });
            return;
        }

        const nextTicket = waiting.find(item => item.id !== ticket.id) || null;
        setLoading(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const currentRef = doc(firestore, 'atendimento-fila', ticket.id);
                const counterRef = doc(firestore, 'atendimento-guiches', ticket.guicheId);
                const currentSnap = await transaction.get(currentRef);
                const counterSnap = await transaction.get(counterRef);

                if (!currentSnap.exists() || !['Chamando', 'Em Atendimento'].includes(currentSnap.data().status)) {
                    throw new Error('Esta chamada já foi movimentada por outro atendente.');
                }

                let nextSnap = null;
                let nextRef = null;
                if (nextTicket) {
                    nextRef = doc(firestore, 'atendimento-fila', nextTicket.id);
                    nextSnap = await transaction.get(nextRef);
                    if (!nextSnap.exists() || nextSnap.data().status !== 'Aguardando') {
                        throw new Error('A próxima senha já foi movimentada. Atualize e tente novamente.');
                    }
                }

                const now = new Date();
                transaction.update(currentRef, {
                    status: 'Aguardando',
                    ordemFilaEm: now,
                    retornouFilaEm: now,
                    motivoRetornoFila: 'Não compareceu ao guichê',
                    guiche: null,
                    guicheId: null,
                    atualizadoEm: now,
                    atualizadoPor: auth.currentUser?.email || 'admin',
                });

                if (nextSnap && nextRef) {
                    const counter = counterSnap.data();
                    transaction.update(nextRef, {
                        status: 'Chamando',
                        guicheId: ticket.guicheId,
                        guiche: counter.nome || ticket.guiche,
                        chamadoEm: now,
                        chamadoPor: auth.currentUser?.email || 'admin',
                        chamadas: (nextSnap.data().chamadas || 0) + 1,
                    });
                    transaction.set(counterRef, {
                        ativo: true,
                        senhaAtual: nextSnap.data().senha,
                        ticketAtualId: nextTicket.id,
                        atualizadoEm: now,
                    }, { merge: true });
                } else {
                    transaction.set(counterRef, {
                        senhaAtual: null,
                        ticketAtualId: null,
                        atualizadoEm: now,
                    }, { merge: true });
                }
            });
        } catch (error) {
            alert(error.message || 'Não foi possível devolver a senha e chamar a próxima.');
        } finally {
            setLoading(false);
        }
    };

    const createCounter = async () => {
        const nome = newCounterName.trim() || suggestedCounterName;
        if (loading) return;
        setLoading(true);
        setCounterFeedback(null);
        try {
            const counterRef = doc(collection(firestore, 'atendimento-guiches'));
            setSelectedCounter(counterRef.id);
            const counterData = {
                nome,
                ativo: true,
                servicos: service === 'Todos os serviços' ? SERVICES.slice(1) : [service],
                senhaAtual: null,
                ticketAtualId: null,
                criadoEm: new Date(),
                criadoPor: auth.currentUser?.email || 'admin',
            };
            await setDoc(counterRef, counterData);
            setCounters(current => current.some(counter => counter.id === counterRef.id)
                ? current
                : [...current, { id: counterRef.id, ...counterData }].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')));
            setNewCounterName('');
            setCounterFeedback({ type: 'success', text: `${nome} criado e selecionado para as próximas chamadas.` });
        } catch (error) {
            setSelectedCounter('');
            const message = error.message || 'Não foi possível criar o guichê.';
            setCounterFeedback({ type: 'error', text: message });
            alert(message);
        } finally {
            setLoading(false);
        }
    };

    const toggleCounter = async (counter) => {
        await updateDoc(doc(firestore, 'atendimento-guiches', counter.id), {
            ativo: counter.ativo === false,
            atualizadoEm: new Date(),
        });
    };

    const clearOrphanedCounter = async (counter) => {
        await updateDoc(doc(firestore, 'atendimento-guiches', counter.id), {
            senhaAtual: null,
            ticketAtualId: null,
            atualizadoEm: new Date(),
            atualizadoPor: auth.currentUser?.email || 'admin',
        });
        setCounterFeedback({ type: 'success', text: `A pendência de ${counter.nome} foi removida. O guichê está disponível novamente.` });
    };

    const transferTicket = async (ticket, targetService) => {
        if (!targetService) return;
        await updateTicket(ticket, 'Aguardando', {
            setor: targetService,
            guiche: null,
            guicheId: null,
            transferidoEm: new Date(),
        });
    };

    return (
        <div className="modal-overlay queue-manager-overlay" onClick={onClose}>
            <div className="modal-content queue-manager-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header queue-manager-header">
                    <div>
                        <span>Atendimento presencial</span>
                        <h2>Organizar fila</h2>
                        <p>Prioridades são chamadas primeiro; depois vale a ordem de chegada.</p>
                    </div>
                    <button type="button" onClick={onClose} className="modal-close-btn" aria-label="Fechar"><LiaTimesSolid /></button>
                </div>

                <div className="queue-manager-tabs" role="tablist">
                    <button className={activeTab === 'fila' ? 'active' : ''} onClick={() => setActiveTab('fila')}>Fila e chamadas</button>
                    <button className={activeTab === 'guiches' ? 'active' : ''} onClick={() => setActiveTab('guiches')}>Guichês</button>
                </div>

                {activeTab === 'fila' && (
                    <>
                        <div className="queue-manager-toolbar">
                            <label>
                                <span>Fila de serviço</span>
                                <select className="form-input" value={service} onChange={(event) => setService(event.target.value)} disabled={Boolean(lockedService)}>
                                    {(lockedService ? [lockedService] : SERVICES).map(item => <option key={item}>{item}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Guichê responsável</span>
                                <select className="form-input" value={selectedCounter} onChange={(event) => setSelectedCounter(event.target.value)}>
                                    <option value="">Selecione um guichê</option>
                                    {serviceCounters.map(counter => (
                                        <option key={counter.id} value={counter.id}>
                                            {counter.nome}{busyCounterIds.has(counter.id) ? ' · atendimento em andamento' : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="queue-call-next" onClick={callNext} disabled={loading || waiting.length === 0}>
                                <LiaBullhornSolid /> {loading ? 'Chamando...' : 'Chamar próximo'}
                            </button>
                        </div>

                        <div className="queue-manager-stats">
                            <div><LiaUserClockSolid /><span>Aguardando</span><strong>{waiting.length}</strong></div>
                            <div><LiaBullhornSolid /><span>Em chamada</span><strong>{active.length}</strong></div>
                            <div><LiaCheckCircleSolid /><span>Concluídos</span><strong>{completed}</strong></div>
                            <div><LiaPauseCircleSolid /><span>Ausentes</span><strong>{absent}</strong></div>
                        </div>

                        <div className="queue-manager-columns">
                            <section>
                                <div className="queue-section-title"><h3>Próximos da fila</h3><span>{waiting.length}</span></div>
                                <div className="queue-manager-list">
                                    {waiting.length === 0 && <p className="queue-empty">Nenhuma senha aguardando neste serviço.</p>}
                                    {waiting.map((ticket, index) => (
                                        <article key={ticket.id} className="queue-manager-ticket">
                                            <div className="queue-position">{index + 1}</div>
                                            <strong>{ticket.senha}</strong>
                                            <div className="queue-ticket-info">
                                                <b>{ticket.nome}</b>
                                                <span>{ticket.assunto}</span>
                                                <small>{ticket.prioridade ? 'Atendimento prioritário · ' : ''}{ticket.setor || 'Balcão do Cidadão'}</small>
                                            </div>
                                            <button type="button" className="queue-icon-button" title={ticket.prioridade ? 'Remover prioridade' : 'Marcar como prioritário'} onClick={() => updateTicket(ticket, 'Aguardando', { prioridade: !ticket.prioridade })}>
                                                <LiaUserClockSolid />
                                            </button>
                                        </article>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <div className="queue-section-title"><h3>Em atendimento</h3><span>{active.length}</span></div>
                                <div className="queue-manager-list">
                                    {active.length === 0 && <p className="queue-empty">Nenhuma chamada ativa.</p>}
                                    {active.map(ticket => (
                                        <article key={ticket.id} className={`queue-manager-ticket active ${ticket.status === 'Em Atendimento' ? 'serving' : ''} ${!isToday(ticket.criadoEm) ? 'overdue' : ''}`}>
                                            <strong>{ticket.senha}</strong>
                                            <div className="queue-ticket-info">
                                                <b>{ticket.nome}</b>
                                                <span>{ticket.guiche || 'Guichê não informado'} · {ticket.status}</span>
                                                <small>{!isToday(ticket.criadoEm) ? `Pendente desde ${formatTicketDate(ticket.criadoEm)}` : 'Chamada de hoje'}</small>
                                            </div>
                                            <div className="queue-ticket-actions">
                                                {ticket.status === 'Chamando' && <button title="Rechamar" onClick={() => updateTicket(ticket, 'Chamando', { chamadoEm: new Date(), chamadas: (ticket.chamadas || 1) + 1 })}><LiaRedoAltSolid /></button>}
                                                {ticket.status === 'Chamando' && <button title="Iniciar atendimento" onClick={() => updateTicket(ticket, 'Em Atendimento')}><LiaPlayCircleSolid /></button>}
                                                {ticket.status === 'Chamando' && <button className="queue-no-show-button" title="Não compareceu: voltar para a fila e chamar o próximo" onClick={() => returnToQueueAndCallNext(ticket)}><LiaUserClockSolid /></button>}
                                                <button title="Concluir" onClick={() => updateTicket(ticket, 'Concluído')}><LiaCheckCircleSolid /></button>
                                                <button title="Ausente" onClick={() => updateTicket(ticket, 'Ausente')}><LiaPauseCircleSolid /></button>
                                            </div>
                                            <label className="queue-transfer-select" title="Transferir para outra fila">
                                                <LiaExchangeAltSolid />
                                                <select value="" onChange={(event) => transferTicket(ticket, event.target.value)}>
                                                    <option value="">Transferir</option>
                                                    {SERVICES.slice(1).filter(item => item !== ticket.setor).map(item => <option key={item}>{item}</option>)}
                                                </select>
                                            </label>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </>
                )}

                {activeTab === 'guiches' && (
                    <div className="queue-counters-panel">
                        <div className="queue-counter-create">
                            <input className="form-input" value={newCounterName} onChange={(event) => { setNewCounterName(event.target.value); setCounterFeedback(null); }} onKeyDown={(event) => event.key === 'Enter' && createCounter()} placeholder={`Nome opcional — próximo: ${suggestedCounterName}`} />
                            <button type="button" className="btn-primary" onClick={createCounter} disabled={loading}><LiaPlusSolid /> {loading ? 'Criando...' : `Criar ${newCounterName.trim() || suggestedCounterName}`}</button>
                        </div>
                        {counterFeedback && <p className={`queue-counter-feedback ${counterFeedback.type}`} role="status">{counterFeedback.text}</p>}
                        <div className="queue-counter-grid">
                            {counters.filter(counter => !lockedService || !counter.servicos?.length || counter.servicos.includes(lockedService)).map(counter => (
                                <article key={counter.id} className={counter.ativo === false ? 'disabled' : busyCounterIds.has(counter.id) ? 'busy' : ''}>
                                    <div><span>{counter.ativo === false ? 'Fechado' : busyCounterIds.has(counter.id) ? 'Em atendimento' : 'Disponível'}</span><strong>{counter.nome}</strong><small>{(counter.servicos || []).join(' · ') || 'Todos os serviços'}</small></div>
                                    {counter.ticketAtualId && !tickets.some(ticket => ticket.id === counter.ticketAtualId) ? (
                                        <button type="button" onClick={() => clearOrphanedCounter(counter)}>Liberar pendência</button>
                                    ) : (
                                        <button type="button" onClick={() => toggleCounter(counter)} disabled={busyCounterIds.has(counter.id)}>{counter.ativo === false ? 'Abrir guichê' : busyCounterIds.has(counter.id) ? 'Atendimento aberto' : 'Fechar guichê'}</button>
                                    )}
                                </article>
                            ))}
                            {counters.length === 0 && <p className="queue-empty">Crie o primeiro guichê para começar as chamadas.</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QueueManagerModal;
