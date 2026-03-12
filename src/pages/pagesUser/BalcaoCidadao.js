import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { db } from '../../firebase';
import { ref, get, query, orderByChild, equalTo, onValue, push, set, serverTimestamp, update } from 'firebase/database';
import Sidebar from '../../components/Sidebar';
import config from '../../config';

// Ícones
import { LiaPlusSolid, LiaTimesSolid, LiaPaperPlane } from "react-icons/lia";

// Componente para Agendamento
const AgendamentoSection = ({ solicitacaoId, onScheduled }) => {
    const [formData, setFormData] = useState({ appointmentDate: '', appointmentTime: '' });
    const [availability, setAvailability] = useState(null);
    const [bookedSlots, setBookedSlots] = useState({});
    const [blockedDates, setBlockedDates] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            const availabilityRef = ref(db, `${config.cityCollection}/balcao-config/availability`);
            const bookedSlotsRef = ref(db, `${config.cityCollection}/balcao-config/bookedSlots`);
            const blockedDatesRef = ref(db, `${config.cityCollection}/balcao-config/blockedDates`);
            try {
                const [availSnap, bookedSnap, blockedSnap] = await Promise.all([
                    get(availabilityRef), get(bookedSlotsRef), get(blockedDatesRef)
                ]);
                if (availSnap.exists()) setAvailability(availSnap.val());
                if (bookedSnap.exists()) setBookedSlots(bookedSnap.val());
                if (blockedSnap.exists()) setBlockedDates(blockedSnap.val());
            } catch (err) {
                setError('Erro ao carregar horários.');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleDateChange = (e) => {
        const date = e.target.value;
        setFormData({ appointmentDate: date, appointmentTime: '' });

        if (!availability || !date || blockedDates.includes(date)) {
            setAvailableTimes([]);
            if (blockedDates.includes(date)) setError('Este dia não está disponível para agendamento.');
            else setError('');
            return;
        }
        setError('');

        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
        const allSlotsForDay = availability[dayOfWeek] || [];
        const alreadyBookedSlots = bookedSlots[date] || [];
        const freeSlots = allSlotsForDay.filter(slot => !alreadyBookedSlots.includes(slot));
        setAvailableTimes(freeSlots);
    };

    const handleSchedule = () => {
        if (!formData.appointmentDate || !formData.appointmentTime) {
            setError('Por favor, selecione data e hora.');
            return;
        }
        onScheduled(solicitacaoId, formData.appointmentDate, formData.appointmentTime);
    };

    if (loading) return <p>Carregando opções de agendamento...</p>;

    return (
        <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginTop: '20px' }}>
            <h4>Realizar Agendamento</h4>
            <div className="form-row">
                <div className="form-group">
                    <label>Data</label>
                    <input type="date" value={formData.appointmentDate} onChange={handleDateChange} className="form-input" />
                </div>
                <div className="form-group">
                    <label>Horário</label>
                    <select value={formData.appointmentTime} onChange={(e) => setFormData(prev => ({ ...prev, appointmentTime: e.target.value }))} className="form-input" disabled={!formData.appointmentDate || availableTimes.length === 0}>
                        <option value="">Selecione</option>
                        {availableTimes.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                </div>
            </div>
            {error && <p className="error-message-inline">{error}</p>}
            <button onClick={handleSchedule} className="btn-primary" style={{ width: '100%' }}>Confirmar Agendamento</button>
        </div>
    );
};

// Componente Modal para exibir detalhes
const SolicitacaoModal = ({ solicitacao, onClose, onSendMessage, onScheduleSubmit }) => {
    const [message, setMessage] = useState('');

    if (!solicitacao) return null;

    const { dadosSolicitacao, status, dataSolicitacao, messages, appointmentDate, appointmentTime } = solicitacao;

    const handleSend = () => {
        if (message.trim()) {
            onSendMessage(solicitacao.id, message);
            setMessage('');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Solicitação</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="detail-item"><strong>Status:</strong> <span className={`status-badge ${getStatusClass(status)}`}>{status}</span></div>
                    <div className="detail-item"><strong>Data da Solicitação:</strong> {new Date(dataSolicitacao).toLocaleDateString('pt-BR')}</div>
                    {status === 'Agendado' && (
                        <>
                            <div className="detail-item"><strong>Data Agendada:</strong> {appointmentDate}</div>
                            <div className="detail-item"><strong>Horário Agendado:</strong> {appointmentTime}</div>
                        </>
                    )}
                    <hr />
                    <h4>Detalhes</h4>
                    <div className="detail-item"><strong>Assunto:</strong> {dadosSolicitacao?.assunto || 'N/A'}</div> 
                    {dadosSolicitacao?.assunto === 'Agendamento' ? (
                        <>
                            <div className="detail-item"><strong>Data Agendada:</strong> {dadosSolicitacao?.appointmentDate || 'N/A'}</div>
                            <div className="detail-item"><strong>Horário Agendado:</strong> {dadosSolicitacao?.appointmentTime || 'N/A'}</div>
                            <div className="detail-item"><strong>Motivo:</strong></div>
                            <p className="detail-description">{dadosSolicitacao?.descricao || 'Não especificado'}</p>
                        </>
                    ) : (
                        <>
                            <div className="detail-item"><strong>Descrição:</strong></div>
                            <p className="detail-description">{dadosSolicitacao?.descricao || 'N/A'}</p>
                        </>
                    )}

                    {status === 'Agendamento Liberado' && (
                        <AgendamentoSection solicitacaoId={solicitacao.id} onScheduled={onScheduleSubmit} />
                    )}

                    <hr />
                    <h4>Mensagens</h4>
                    <div className="message-history">
                        {messages && Object.values(messages).length > 0 ? (
                            Object.values(messages).map((msg, index) => (
                                <div key={index} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
                                    <p>{msg.text}</p>
                                    <small>{new Date(msg.timestamp).toLocaleString('pt-BR')}</small>
                                </div>
                            ))
                        ) : (<p>Nenhuma mensagem trocada.</p>)}
                    </div>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." rows="3" className="form-input"></textarea>
                    </div>
                    <button onClick={handleSend} className="btn-submit" style={{ width: '100%' }}>
                        <LiaPaperPlane /> Enviar Mensagem
                    </button>
                </div>
            </div>
        </div>
    );
};

const getStatusClass = (status) => {
    switch (status) {
        case 'Aguardando Atendimento': return 'status-pending';
        case 'Agendamento Liberado': return 'status-in-progress';
        case 'Em Análise': return 'status-in-progress';
        case 'Agendado': return 'status-in-progress';
        case 'Concluído': return 'status-completed';
        default: return '';
    }
};

const BalcaoCidadao = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingProfile] = useState(true);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    useEffect(() => {
        const fetchSolicitacoes = () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            setLoading(true);
            try {
                const solicitacoesRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
                const q = query(solicitacoesRef, orderByChild('userId'), equalTo(currentUser.uid));

                onValue(q, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const solicitacoesList = Object.keys(data).map(key => ({
                            id: key,
                            ...data[key]
                        })).sort((a, b) => b.dataSolicitacao - a.dataSolicitacao);
                        setSolicitacoes(solicitacoesList);
                    } else {
                        setSolicitacoes([]);
                    }
                    setLoading(false);
                });

            } catch (err) {
                console.error("Erro ao buscar solicitações:", err);
                setError("Não foi possível carregar suas solicitações. Tente novamente mais tarde.");
                setLoading(false);
            }
        };

        fetchSolicitacoes();
    }, [currentUser, navigate]);

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) {
            setLoadingProfile(false);
            return;
        }

        const userId = currentUser.uid;
        const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                setLoggedInUserData({
                    nome: userData.name || currentUser.email,
                    tipo: userData.tipo || 'Cidadão',
                });
            } else {
                setLoggedInUserData({ nome: currentUser.displayName || 'Usuário', tipo: 'Cidadão' });
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        } finally {
            setLoadingProfile(false);
        }
    }, [currentUser]);

    useEffect(() => { fetchUserProfile(); }, [fetchUserProfile]);

    const handleNavigation = (path) => navigate(path);
    const handleOpenModal = (solicitacao) => setSelectedSolicitacao(solicitacao);

    const handleSendMessage = async (solicitacaoId, text) => {
        if (!currentUser) return;
        const messagesRef = ref(db, `${config.cityCollection}/balcao-cidadao/${solicitacaoId}/messages`);
        const newMessageRef = push(messagesRef);
        try {
            await set(newMessageRef, {
                text: text,
                sender: 'user',
                timestamp: serverTimestamp(),
                userId: currentUser.uid,
            });
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            setError("Falha ao enviar mensagem.");
        }
    };

    const handleScheduleSubmit = async (solicitacaoId, date, time) => {
        const solicitacaoRef = ref(db, `${config.cityCollection}/balcao-cidadao/${solicitacaoId}`);
        const bookedSlotRef = ref(db, `${config.cityCollection}/balcao-config/bookedSlots/${date}`);

        try {
            // Check again to prevent race conditions
            const snapshot = await get(bookedSlotRef);
            const existingBookings = snapshot.val() || [];
            if (existingBookings.includes(time)) {
                alert('Este horário foi agendado por outra pessoa. Por favor, escolha outro.');
                return;
            }

            await update(solicitacaoRef, { status: 'Agendado', appointmentDate: date, appointmentTime: time });
            await set(bookedSlotRef, [...existingBookings, time]);

            alert('Agendamento confirmado com sucesso!');
            setSelectedSolicitacao(null); // Fecha o modal
        } catch (error) {
            console.error("Erro ao confirmar agendamento:", error);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Paraipaba</h1>
                        <p>Balcão do Cidadão - Minhas Solicitações</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <div className="page-actions-bar">
                    <button className="btn-send-solicita" onClick={() => navigate('/balcao/novo')}>
                        <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                        Nova Solicitação
                    </button>
                </div>

                <div className="data-list-container">
                    {loading && <p>Carregando solicitações...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && solicitacoes.length === 0 && !error && (
                        <p>Você ainda não possui nenhuma solicitação no Balcão do Cidadão.</p>
                    )}
                    {!loading && solicitacoes.length > 0 && (
                        <ul className="data-list">
                            {solicitacoes.map(solicitacao => (
                                <li key={solicitacao.id} className="data-list-item" onClick={() => handleOpenModal(solicitacao)}>
                                    <div className="item-main-info">
                                        <strong>Assunto: {solicitacao.dadosSolicitacao?.assunto || 'Não especificado'}</strong>
                                        <span>Data: {new Date(solicitacao.dataSolicitacao).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${getStatusClass(solicitacao.status)}`}>
                                            {solicitacao.status}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <SolicitacaoModal
                    solicitacao={selectedSolicitacao}
                    onClose={() => setSelectedSolicitacao(null)}
                    onSendMessage={handleSendMessage}
                    onScheduleSubmit={handleScheduleSubmit}
                />
            </div>
        </div>
    );
};

export default BalcaoCidadao;