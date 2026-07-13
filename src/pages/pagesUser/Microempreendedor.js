import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { LiaPaperPlane, LiaPlusSolid, LiaTimesSolid } from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { firestore } from '../../firebase';
import { printProtocolReceipt } from '../../utils/printReport';

const getStatusClass = (status) => {
    switch (status) {
        case 'Recebida': return 'status-pending';
        case 'Em Análise': return 'status-in-progress';
        case 'Agendamento Liberado': return 'status-in-progress';
        case 'Agendado': return 'status-in-progress';
        case 'Concluída': return 'status-completed';
        case 'Cancelada': return 'status-cancelled';
        default: return '';
    }
};

const getOrderedMessages = (messages = {}) => Object.entries(messages || {})
    .map(([id, message]) => ({ id, ...message }))
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

const getTodayDateInputValue = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const AgendamentoSection = ({ solicitacaoId, onScheduled }) => {
    const [formData, setFormData] = useState({ appointmentDate: '', appointmentTime: '' });
    const [availability, setAvailability] = useState(null);
    const [bookedSlots, setBookedSlots] = useState({});
    const [blockedDates, setBlockedDates] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const todayDate = getTodayDateInputValue();

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            try {
                const [availSnap, bookedSnap, blockedSnap] = await Promise.all([
                    getDoc(doc(firestore, 'microempreendedor-config', 'availability')),
                    getDoc(doc(firestore, 'microempreendedor-config', 'bookedSlots')),
                    getDoc(doc(firestore, 'microempreendedor-config', 'blockedDates')),
                ]);

                if (availSnap.exists()) setAvailability(availSnap.data());
                if (bookedSnap.exists()) setBookedSlots(bookedSnap.data());
                if (blockedSnap.exists()) setBlockedDates(blockedSnap.data().dates || []);
            } catch (err) {
                console.error('Erro ao carregar horários da assessoria:', err);
                setError('Erro ao carregar horários.');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleDateChange = (event) => {
        const date = event.target.value;
        setFormData({ appointmentDate: date, appointmentTime: '' });

        if (date && date < todayDate) {
            setAvailableTimes([]);
            setError('Não é possível agendar para uma data anterior a hoje.');
            return;
        }

        const dateBR = date ? date.split('-').reverse().join('/') : '';
        if (!availability || !date || blockedDates.includes(dateBR)) {
            setAvailableTimes([]);
            setError(blockedDates.includes(dateBR) ? 'Este dia não está disponível para agendamento.' : '');
            return;
        }

        const dayOfWeek = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const allSlots = availability[dayOfWeek] || [];
        const booked = bookedSlots[date] || [];
        const freeSlots = allSlots.filter(slot => !booked.includes(slot));
        setAvailableTimes(freeSlots);
        setError(freeSlots.length ? '' : 'Não há horários disponíveis para esta data.');
    };

    const handleSchedule = () => {
        if (!formData.appointmentDate || !formData.appointmentTime) {
            setError('Selecione data e horário.');
            return;
        }
        onScheduled(solicitacaoId, formData.appointmentDate, formData.appointmentTime);
    };

    if (loading) return <p>Carregando opções de agendamento...</p>;

    return (
        <div className="data-card" style={{ marginTop: '20px' }}>
            <div className="card-header"><h3>Agendamento</h3></div>
            <div className="form-row">
                <div className="form-group">
                    <label>Data</label>
                    <input type="date" value={formData.appointmentDate} min={todayDate} onChange={handleDateChange} className="form-input" />
                </div>
                <div className="form-group">
                    <label>Horário</label>
                    <select
                        value={formData.appointmentTime}
                        onChange={(event) => setFormData(prev => ({ ...prev, appointmentTime: event.target.value }))}
                        className="form-input"
                        disabled={!formData.appointmentDate || availableTimes.length === 0}
                    >
                        <option value="">Selecione</option>
                        {availableTimes.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                </div>
            </div>
            {error && <p className="error-message-inline">{error}</p>}
            <button type="button" onClick={handleSchedule} className="btn-primary" style={{ width: '100%' }}>Confirmar Agendamento</button>
        </div>
    );
};

const AssessoriaModal = ({ solicitacao, onClose, onSendMessage, onScheduleSubmit }) => {
    const [activeTab, setActiveTab] = useState('dados');
    const [message, setMessage] = useState('');

    if (!solicitacao) return null;

    const handleSend = () => {
        if (!message.trim()) return;
        onSendMessage(solicitacao.id, message.trim());
        setMessage('');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content micro-modal-content" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Assessoria</h3>
                    <button type="button" onClick={onClose} className="modal-close-btn">
                        <LiaTimesSolid />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="admin-modal-tabs user-modal-tabs">
                        <button className={activeTab === 'dados' ? 'active' : ''} onClick={() => setActiveTab('dados')}>Dados</button>
                        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>Chat</button>
                    </div>

                    {activeTab === 'dados' && (
                        <>
                            <div className="detail-item">
                                <strong>Status:</strong> <span className={`status-badge ${getStatusClass(solicitacao.status)}`}>{solicitacao.status}</span>
                            </div>
                            <div className="detail-item"><strong>Data:</strong> {new Date(solicitacao.timestamp || Date.now()).toLocaleDateString('pt-BR')}</div>
                            {solicitacao.status === 'Agendado' && (
                                <div className="data-card" style={{ marginTop: '16px' }}>
                                    <div className="card-header"><h3>Agendamento confirmado</h3></div>
                                    <div className="detail-item"><strong>Data:</strong> {solicitacao.appointmentDate || 'N/A'}</div>
                                    <div className="detail-item"><strong>Horário:</strong> {solicitacao.appointmentTime || 'N/A'}</div>
                                </div>
                            )}
                            <hr />
                            <h4>Solicitação</h4>
                            <div className="detail-item"><strong>Tipo de orientação:</strong> {solicitacao.dadosAssessoria?.tipo || 'N/A'}</div>
                            <div className="detail-item"><strong>Negócio:</strong> {solicitacao.dadosAssessoria?.nomeNegocio || 'N/A'}</div>
                            <div className="detail-item"><strong>Contato preferencial:</strong> {solicitacao.dadosAssessoria?.contatoPreferencial || 'N/A'}</div>
                            <p className="detail-description">{solicitacao.dadosAssessoria?.descricao || 'N/A'}</p>
                            {solicitacao.status === 'Agendamento Liberado' && (
                                <AgendamentoSection solicitacaoId={solicitacao.id} onScheduled={onScheduleSubmit} />
                            )}
                        </>
                    )}

                    {activeTab === 'chat' && (
                        <div className="modal-chat-shell">
                            <div className="modal-chat-header">
                                <div>
                                    <h4>Conversa com a Assessoria</h4>
                                    <span>Use este canal para complementar informações sobre sua solicitação.</span>
                                </div>
                            </div>
                            <div className="message-history whatsapp-history">
                                {getOrderedMessages(solicitacao.messages).length > 0 ? (
                                    getOrderedMessages(solicitacao.messages).map((msg) => (
                                        <div key={msg.id} className={`message-bubble ${msg.sender === 'admin' ? 'user' : 'admin'}`}>
                                            <p>{msg.text}</p>
                                            <small>{new Date(msg.timestamp).toLocaleString('pt-BR')}</small>
                                        </div>
                                    ))
                                ) : (
                                    <p className="chat-empty-state">Nenhuma mensagem trocada.</p>
                                )}
                            </div>
                            <div className="modal-chat-composer">
                                <textarea
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && !event.shiftKey) {
                                            event.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder="Digite sua mensagem..."
                                    rows="2"
                                />
                                <button type="button" onClick={handleSend} disabled={!message.trim()} title="Enviar mensagem">
                                    <LiaPaperPlane />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Microempreendedor = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) return;
        try {
            const snapshot = await getDoc(doc(firestore, 'users', currentUser.uid));
            setLoggedInUserData(snapshot.exists() ? snapshot.data() : { name: currentUser.email, tipo: 'Cidadão' });
        } catch (err) {
            console.error('Erro ao buscar perfil:', err);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return undefined;
        }

        fetchUserProfile();
        setLoading(true);
        const q = query(collection(firestore, 'assessoria-microempreendedor'), where('userId', '==', currentUser.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                const timestamp = data.dataSolicitacao?.toMillis ? data.dataSolicitacao.toMillis() : data.dataSolicitacao;
                return { id: docSnap.id, ...data, timestamp };
            }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            setSolicitacoes(items);
            setLoading(false);
        }, (err) => {
            console.error('Erro ao buscar solicitações de assessoria:', err);
            setError('Não foi possível carregar suas solicitações.');
            setLoading(false);
        });

        return unsubscribe;
    }, [currentUser, fetchUserProfile, navigate]);

    useEffect(() => {
        if (!selectedSolicitacao) return;
        const updatedSolicitacao = solicitacoes.find((item) => item.id === selectedSolicitacao.id);
        if (updatedSolicitacao) setSelectedSolicitacao(updatedSolicitacao);
    }, [solicitacoes, selectedSolicitacao]);

    const handleSendMessage = async (solicitacaoId, text) => {
        const msgId = Date.now().toString();
        await updateDoc(doc(firestore, 'assessoria-microempreendedor', solicitacaoId), {
            [`messages.${msgId}`]: {
                text,
                sender: 'user',
                timestamp: new Date().toISOString(),
                readByAdmin: false,
                readByUser: true,
            },
            ultimaAtualizacao: new Date(),
        });
    };

    const handleScheduleSubmit = async (solicitacaoId, date, time) => {
        const solicitacao = solicitacoes.find((item) => item.id === solicitacaoId);
        const itemRef = doc(firestore, 'assessoria-microempreendedor', solicitacaoId);
        const bookedSlotRef = doc(firestore, 'microempreendedor-config', 'bookedSlots');

        try {
            await runTransaction(firestore, async (transaction) => {
                const bookedSnap = await transaction.get(bookedSlotRef);
                const currentBooked = bookedSnap.exists() ? bookedSnap.data() : {};
                const dateSlots = currentBooked[date] || [];

                if (dateSlots.includes(time)) {
                    throw new Error('Este horário acabou de ser reservado. Escolha outro horário.');
                }

                transaction.set(bookedSlotRef, { [date]: [...dateSlots, time] }, { merge: true });
                transaction.update(itemRef, {
                    status: 'Agendado',
                    appointmentDate: date,
                    appointmentTime: time,
                    ultimaAtualizacao: new Date(),
                });
            });

            printProtocolReceipt({
                title: 'Comprovante de Agendamento - Assessoria ao Microempreendedor',
                protocol: solicitacaoId,
                status: 'Agendado',
                createdAt: new Date(),
                requester: {
                    Nome: loggedInUserData?.name || currentUser?.email,
                    Email: currentUser?.email,
                },
                details: {
                    Setor: 'Assessoria ao Microempreendedor',
                    'Tipo de orientação': solicitacao?.dadosAssessoria?.tipo || 'N/A',
                    'Data agendada': date,
                    'Horário agendado': time,
                },
            });
            alert('Agendamento realizado com sucesso!');
        } catch (scheduleError) {
            console.error('Erro ao realizar agendamento da assessoria:', scheduleError);
            alert(scheduleError.message || 'Erro ao realizar agendamento.');
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={(path) => navigate(path)} />
            <div className="dashboard-content micro-page-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Assessoria ao Microempreendedor</h1>
                        <p>Orientação para MEI, finanças, impostos e melhoria do negócio.</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.name || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <section className="user-dashboard-summary micro-summary-grid">
                    <article className="user-dashboard-summary-card micro-service-card">
                        <span>
                            <strong>Abertura de MEI</strong>
                            <small>Orientação para iniciar um novo negócio.</small>
                        </span>
                    </article>
                    <article className="user-dashboard-summary-card micro-service-card">
                        <span>
                            <strong>Gestão e obrigações</strong>
                            <small>Finanças, impostos e melhorias para sua rotina.</small>
                        </span>
                    </article>
                </section>

                <div className="page-actions-bar">
                    <button className="btn-send-solicita" onClick={() => navigate('/microempreendedor/novo')}>
                        <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                        Nova Assessoria
                    </button>
                </div>

                <div className="data-list-container micro-list-card">
                    <div className="card-header">
                        <h3>Minhas solicitações</h3>
                    </div>
                    {loading && <p>Carregando solicitações...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && solicitacoes.length === 0 && !error && <p>Você ainda não solicitou assessoria.</p>}
                    {!loading && solicitacoes.length > 0 && (
                        <ul className="data-list">
                            {solicitacoes.map((item) => (
                                <li key={item.id} className="data-list-item" onClick={() => setSelectedSolicitacao(item)}>
                                    <div className="item-main-info">
                                        <strong>{item.dadosAssessoria?.tipo || 'Assessoria ao Microempreendedor'}</strong>
                                        <span>Data: {new Date(item.timestamp || Date.now()).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${getStatusClass(item.status)}`}>{item.status}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <AssessoriaModal
                    solicitacao={selectedSolicitacao}
                    onClose={() => setSelectedSolicitacao(null)}
                    onSendMessage={handleSendMessage}
                    onScheduleSubmit={handleScheduleSubmit}
                />
            </div>
        </div>
    );
};

export default Microempreendedor;
