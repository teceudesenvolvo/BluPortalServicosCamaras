import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { LiaArrowLeftSolid, LiaCogSolid, LiaPaperPlane, LiaSearchSolid, LiaTimesSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { auth, firestore } from '../../firebase';

const STATUSES = ['Recebida', 'Em Análise', 'Agendamento Liberado', 'Agendado', 'Concluída', 'Cancelada'];

const getDefaultDailyAvailability = () => ({
    monday: { enabled: false, times: '' },
    tuesday: { enabled: false, times: '' },
    wednesday: { enabled: false, times: '' },
    thursday: { enabled: false, times: '' },
    friday: { enabled: false, times: '' },
});

const getCurrentMonthKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const formatConfigForForm = (data = {}) => {
    const formattedData = {};
    for (const day in data) {
        if (Array.isArray(data[day]) && data[day].length > 0) {
            formattedData[day] = { enabled: true, times: data[day].join(', ') };
        }
    }
    return { ...getDefaultDailyAvailability(), ...formattedData };
};

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

const AvailabilityModal = ({ onClose, onSave }) => {
    const [selectedMonth, setSelectedMonth] = useState('');
    const [currentMonthAvailability, setCurrentMonthAvailability] = useState(getDefaultDailyAvailability);
    const [blockedDates, setBlockedDates] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMonth, setLoadingMonth] = useState(false);

    const monthOptions = Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() + index, 1);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });

    useEffect(() => {
        const fetchInitialConfig = async () => {
            setLoading(true);
            try {
                const blockedSnap = await getDoc(doc(firestore, 'microempreendedor-config', 'blockedDates'));
                if (blockedSnap.exists()) {
                    setBlockedDates((blockedSnap.data().dates || []).join(', '));
                }
                setSelectedMonth(getCurrentMonthKey());
            } catch (error) {
                console.error('Erro ao buscar configuração da assessoria:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialConfig();
    }, []);

    useEffect(() => {
        if (!selectedMonth) return;
        const loadMonth = async () => {
            setLoadingMonth(true);
            try {
                const monthlySnap = await getDoc(doc(firestore, 'microempreendedor-monthly-configs', selectedMonth));
                if (monthlySnap.exists()) {
                    setCurrentMonthAvailability(formatConfigForForm(monthlySnap.data()));
                    return;
                }

                if (selectedMonth === getCurrentMonthKey()) {
                    const liveSnap = await getDoc(doc(firestore, 'microempreendedor-config', 'availability'));
                    setCurrentMonthAvailability(liveSnap.exists() ? formatConfigForForm(liveSnap.data()) : getDefaultDailyAvailability());
                } else {
                    setCurrentMonthAvailability(getDefaultDailyAvailability());
                }
            } catch (error) {
                console.error('Erro ao carregar horários do mês:', error);
            } finally {
                setLoadingMonth(false);
            }
        };
        loadMonth();
    }, [selectedMonth]);

    const formatFormForFirestore = () => {
        const finalConfig = {};
        Object.entries(currentMonthAvailability).forEach(([day, config]) => {
            if (config.enabled && config.times.trim()) {
                finalConfig[day] = config.times.split(',').map(time => time.trim()).filter(Boolean);
            }
        });
        return finalConfig;
    };

    const handleDayToggle = (day) => {
        setCurrentMonthAvailability(prev => ({
            ...prev,
            [day]: { ...prev[day], enabled: !prev[day].enabled },
        }));
    };

    const handleTimesChange = (day, times) => {
        setCurrentMonthAvailability(prev => ({
            ...prev,
            [day]: { ...prev[day], times },
        }));
    };

    const handleSave = async () => {
        const finalConfig = formatFormForFirestore();
        const blockedDatesConfig = blockedDates.split(',').map(item => item.trim()).filter(Boolean);
        try {
            await setDoc(doc(firestore, 'microempreendedor-monthly-configs', selectedMonth), finalConfig);
            if (selectedMonth === getCurrentMonthKey()) {
                await onSave(finalConfig, blockedDatesConfig);
                return;
            }
            alert('Configuração mensal salva. Para publicar agora, selecione o mês atual.');
        } catch (error) {
            console.error('Erro ao salvar horários:', error);
            alert('Não foi possível salvar os horários.');
        }
    };

    const daysOfWeek = {
        monday: 'Segunda-feira',
        tuesday: 'Terça-feira',
        wednesday: 'Quarta-feira',
        thursday: 'Quinta-feira',
        friday: 'Sexta-feira',
    };

    if (loading) {
        return (
            <div className="modal-overlay">
                <div className="modal-content micro-modal-content"><p>Carregando configuração...</p></div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content micro-modal-content" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>Configurar Horários da Assessoria</h3>
                    <button type="button" onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="data-card">
                        <div className="form-group">
                            <label>Mês de atendimento</label>
                            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="form-input">
                                {monthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Dias bloqueados</label>
                            <input
                                type="text"
                                value={blockedDates}
                                onChange={(event) => setBlockedDates(event.target.value)}
                                className="form-input"
                                placeholder="Ex.: 25/12/2026, 01/01/2027"
                            />
                        </div>
                    </div>

                    <div className="data-card" style={{ marginTop: '16px' }}>
                        <div className="card-header"><h3>Horários por dia</h3></div>
                        {loadingMonth ? <p>Carregando mês...</p> : Object.entries(daysOfWeek).map(([day, label]) => (
                            <div key={day} className="form-row" style={{ alignItems: 'center' }}>
                                <label className="form-group" style={{ flex: '0 0 190px' }}>
                                    <span>{label}</span>
                                    <input
                                        type="checkbox"
                                        checked={currentMonthAvailability[day]?.enabled || false}
                                        onChange={() => handleDayToggle(day)}
                                    />
                                </label>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={currentMonthAvailability[day]?.times || ''}
                                        disabled={!currentMonthAvailability[day]?.enabled}
                                        onChange={(event) => handleTimesChange(day, event.target.value)}
                                        placeholder="08:00, 08:30, 09:00"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <button type="button" className="btn-primary btn-save-status" onClick={handleSave} style={{ width: '100%', marginTop: '18px' }}>
                        Salvar Horários
                    </button>
                </div>
            </div>
        </div>
    );
};

const AssessoriaAdminModal = ({ solicitacao, onClose, onStatusChange, onSendMessage }) => {
    const [newStatus, setNewStatus] = useState(solicitacao?.status || 'Recebida');
    const [activeTab, setActiveTab] = useState('dados');
    const [message, setMessage] = useState('');

    useEffect(() => {
        setNewStatus(solicitacao?.status || 'Recebida');
    }, [solicitacao]);

    if (!solicitacao) return null;

    const handleSendMessage = () => {
        if (!message.trim()) return;
        onSendMessage(solicitacao.id, message.trim());
        setMessage('');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content micro-modal-content" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Assessoria</h3>
                    <button type="button" onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="admin-modal-tabs">
                        <button className={activeTab === 'dados' ? 'active' : ''} onClick={() => setActiveTab('dados')}>Dados</button>
                        <button className={activeTab === 'situacao' ? 'active' : ''} onClick={() => setActiveTab('situacao')}>Situação</button>
                        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>Chat</button>
                    </div>

                    {activeTab === 'dados' && (
                        <>
                            <div className="data-card">
                                <div className="card-header"><h3>Dados do Cidadão</h3></div>
                                <div className="detail-item"><strong>Nome:</strong> {solicitacao.dadosUsuario?.name || 'N/A'}</div>
                                <div className="detail-item"><strong>Email:</strong> {solicitacao.dadosUsuario?.email || 'N/A'}</div>
                                <div className="detail-item"><strong>CPF:</strong> {solicitacao.dadosUsuario?.cpf || 'N/A'}</div>
                                <div className="detail-item"><strong>Telefone:</strong> {solicitacao.dadosUsuario?.phone || 'N/A'}</div>
                            </div>

                            <div className="data-card" style={{ marginTop: '20px' }}>
                                <div className="card-header"><h3>Solicitação</h3></div>
                                <div className="detail-item"><strong>Tipo:</strong> {solicitacao.dadosAssessoria?.tipo || 'N/A'}</div>
                                <div className="detail-item"><strong>Negócio:</strong> {solicitacao.dadosAssessoria?.nomeNegocio || 'N/A'}</div>
                                <div className="detail-item"><strong>CNPJ:</strong> {solicitacao.dadosAssessoria?.cnpj || 'N/A'}</div>
                                {solicitacao.dadosAssessoria?.cnpjData && (
                                    <>
                                        <div className="detail-item"><strong>Razão Social:</strong> {solicitacao.dadosAssessoria.cnpjData.razaoSocial || 'N/A'}</div>
                                        <div className="detail-item"><strong>Situação Cadastral:</strong> {solicitacao.dadosAssessoria.cnpjData.situacaoCadastral || 'N/A'}</div>
                                        <div className="detail-item"><strong>Atividade:</strong> {solicitacao.dadosAssessoria.cnpjData.cnaeFiscalDescricao || 'N/A'}</div>
                                    </>
                                )}
                                <div className="detail-item"><strong>Contato preferencial:</strong> {solicitacao.dadosAssessoria?.contatoPreferencial || 'N/A'}</div>
                                {solicitacao.status === 'Agendado' && (
                                    <>
                                        <div className="detail-item"><strong>Data agendada:</strong> {solicitacao.appointmentDate || 'N/A'}</div>
                                        <div className="detail-item"><strong>Horário agendado:</strong> {solicitacao.appointmentTime || 'N/A'}</div>
                                    </>
                                )}
                                <p className="detail-description">{solicitacao.dadosAssessoria?.descricao || 'N/A'}</p>
                            </div>
                        </>
                    )}

                    {activeTab === 'situacao' && (
                        <div className="data-card">
                            <div className="card-header"><h3>Gerenciamento</h3></div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Status</label>
                                    <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)} className="form-input">
                                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                                    </select>
                                </div>
                                <button type="button" className="btn-primary" style={{ alignSelf: 'flex-end', height: '45px' }} onClick={() => onStatusChange(solicitacao.id, newStatus)}>
                                    Salvar Status
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'chat' && (
                        <div className="modal-chat-shell">
                            <div className="modal-chat-header">
                                <div>
                                    <h4>Conversa com o cidadão</h4>
                                    <span>Responda dúvidas e solicite informações adicionais.</span>
                                </div>
                            </div>
                            <div className="message-history whatsapp-history">
                                {getOrderedMessages(solicitacao.messages).length > 0 ? (
                                    getOrderedMessages(solicitacao.messages).map((msg) => (
                                        <div key={msg.id} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
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
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Digite sua mensagem..."
                                    rows="2"
                                />
                                <button type="button" onClick={handleSendMessage} disabled={!message.trim()} title="Enviar mensagem">
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

const AdminMicroempreendedor = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Todas');
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);
    const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchSolicitacoes = useCallback(async () => {
        if (!isAuthReady) return;
        setLoading(true);
        try {
            const snapshot = await getDocs(query(collection(firestore, 'assessoria-microempreendedor'), orderBy('dataSolicitacao', 'desc')));
            const items = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                const timestamp = data.dataSolicitacao?.toMillis ? data.dataSolicitacao.toMillis() : data.dataSolicitacao;
                return { id: docSnap.id, ...data, timestamp };
            });
            setSolicitacoes(items);
        } catch (error) {
            console.error('Erro ao buscar assessorias:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthReady]);

    useEffect(() => {
        if (!isAuthReady) return undefined;
        setLoading(true);
        const q = query(collection(firestore, 'assessoria-microempreendedor'), orderBy('dataSolicitacao', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                const timestamp = data.dataSolicitacao?.toMillis ? data.dataSolicitacao.toMillis() : data.dataSolicitacao;
                return { id: docSnap.id, ...data, timestamp };
            });
            setSolicitacoes(items);
            setLoading(false);
        }, (error) => {
            console.error('Erro ao observar assessorias:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [isAuthReady]);

    useEffect(() => {
        if (!selectedSolicitacao) return;
        const updatedSolicitacao = solicitacoes.find((item) => item.id === selectedSolicitacao.id);
        if (updatedSolicitacao) setSelectedSolicitacao(updatedSolicitacao);
    }, [solicitacoes, selectedSolicitacao]);

    const handleStatusChange = async (id, status) => {
        try {
            await updateDoc(doc(firestore, 'assessoria-microempreendedor', id), {
                status,
                ultimaAtualizacao: new Date(),
            });
            setSelectedSolicitacao(null);
            fetchSolicitacoes();
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            alert('Não foi possível atualizar o status.');
        }
    };

    const handleSendMessage = async (id, text) => {
        const msgId = Date.now().toString();
        try {
            await updateDoc(doc(firestore, 'assessoria-microempreendedor', id), {
                [`messages.${msgId}`]: {
                    text,
                    sender: 'admin',
                    timestamp: new Date().toISOString(),
                    readByAdmin: true,
                    readByUser: false,
                },
                ultimaAtualizacao: new Date(),
            });
            fetchSolicitacoes();
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            alert('Não foi possível enviar a mensagem.');
        }
    };

    const handleSaveAvailability = async (availabilityConfig, blockedDatesConfig) => {
        try {
            await setDoc(doc(firestore, 'microempreendedor-config', 'availability'), availabilityConfig);
            await setDoc(doc(firestore, 'microempreendedor-config', 'blockedDates'), { dates: blockedDatesConfig });
            alert('Horários da assessoria salvos com sucesso!');
            setIsAvailabilityModalOpen(false);
        } catch (error) {
            console.error('Erro ao salvar disponibilidade da assessoria:', error);
            alert('Falha ao salvar a disponibilidade.');
        }
    };

    const filteredSolicitacoes = solicitacoes.filter((item) => {
        const searchable = `${item.dadosUsuario?.name || ''} ${item.dadosUsuario?.email || ''} ${item.dadosUsuario?.cpf || ''} ${item.dadosAssessoria?.tipo || ''} ${item.dadosAssessoria?.nomeNegocio || ''}`.toLowerCase();
        const matchesSearch = !searchTerm || searchable.includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'Todas' || item.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content admin-balcao-dashboard-content micro-admin-content">
                <header className="page-header-container admin-balcao-page-header">
                    <div className="header-title-section">
                        <button onClick={() => navigate('/admin-balcao')} className="btn-secondary" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                            <LiaArrowLeftSolid /> Voltar ao Dashboard
                        </button>
                        <h1>Admin Assessoria ao Microempreendedor</h1>
                        <p>Gerencie solicitações de orientação para MEI, finanças, impostos e melhorias de negócio.</p>
                    </div>
                    <div className="admin-balcao-header-actions">
                        <button onClick={fetchSolicitacoes} className="admin-action-button action-refresh" disabled={loading}>
                            <span className="admin-action-icon">↻</span>
                            <span className="admin-action-label">Atualizar dados</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsAvailabilityModalOpen(true)}
                            className="admin-header-gear-button"
                            aria-label="Configurar horários"
                            title="Configurar horários"
                        >
                            <LiaCogSolid size={24} />
                        </button>
                    </div>
                </header>

                <div className="data-card micro-filter-card">
                    <div className="search-box">
                        <LiaSearchSolid />
                        <input
                            type="text"
                            placeholder="Buscar por nome, CPF, email, negócio ou tipo..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                        />
                    </div>
                    <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="form-input">
                        <option value="Todas">Todos os status</option>
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                </div>

                <div className="data-card micro-admin-list-card">
                    <div className="card-header">
                        <h3>Solicitações ({filteredSolicitacoes.length})</h3>
                    </div>
                    {loading && <p>Carregando assessorias...</p>}
                    {!loading && filteredSolicitacoes.length === 0 && <p>Nenhuma solicitação encontrada.</p>}
                    {!loading && filteredSolicitacoes.length > 0 && (
                        <ul className="data-list">
                            {filteredSolicitacoes.map((item) => (
                                <li key={item.id} className="data-list-item" onClick={() => setSelectedSolicitacao(item)}>
                                    <div className="item-main-info">
                                        <strong>{item.dadosAssessoria?.tipo || 'Assessoria ao Microempreendedor'}</strong>
                                        <span>Solicitante: {item.dadosUsuario?.name || 'N/A'}</span>
                                        <span>Data: {new Date(item.timestamp || Date.now()).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${getStatusClass(item.status)}`}>{item.status}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <AssessoriaAdminModal
                    solicitacao={selectedSolicitacao}
                    onClose={() => setSelectedSolicitacao(null)}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                />
                {isAvailabilityModalOpen && (
                    <AvailabilityModal
                        onClose={() => setIsAvailabilityModalOpen(false)}
                        onSave={handleSaveAvailability}
                    />
                )}
            </div>
        </div>
    );
};

export default AdminMicroempreendedor;
