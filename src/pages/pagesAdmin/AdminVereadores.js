import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, query, onValue, update, push, set, serverTimestamp, get } from 'firebase/database';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaTimesSolid, LiaUploadSolid, LiaPaperPlane } from "react-icons/lia";

// Modal Component
const SolicitacaoModal = ({ solicitacao, onClose, onStatusChange, onSendMessage, onFileUpload }) => {
    const [newStatus, setNewStatus] = useState(solicitacao ? solicitacao.status || '' : '');
    const [message, setMessage] = useState('');
    const [consumerProfile, setConsumerProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    useEffect(() => {
        if (solicitacao) {
            setNewStatus(solicitacao.status || '');
            const fetchConsumerProfile = async () => {
                const userId = solicitacao.userId;
                if (!userId) {
                    setConsumerProfile(solicitacao.dadosUsuario || {});
                    setLoadingProfile(false);
                    return;
                }
                setLoadingProfile(true);
                const userRef = ref(db, `users/${userId}`);
                try {
                    const snapshot = await get(userRef);
                    setConsumerProfile(snapshot.exists() ? snapshot.val() : solicitacao.dadosUsuario);
                } catch (error) {
                    console.error("Erro ao buscar perfil:", error);
                    setConsumerProfile(solicitacao.dadosUsuario);
                } finally {
                    setLoadingProfile(false);
                }
            };
            fetchConsumerProfile();
        }
    }, [solicitacao]);

    if (!solicitacao) return null;

    const handleStatusSave = () => onStatusChange(solicitacao.id, newStatus);
    const handleFileUpload = (e) => onFileUpload(solicitacao.id, e.target.files[0]);
    const handleSendMessage = () => {
        if (message.trim() === '') return;
        onSendMessage(solicitacao.id, message);
        setMessage('');
    };

    const formatDate = (dateStringOrTimestamp) => {
        if (!dateStringOrTimestamp) return 'N/A';
        const date = new Date(dateStringOrTimestamp);
        return date.toLocaleDateString('pt-BR');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Solicitação</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="data-sections-grid">
                        <div className="data-card">
                            <div className="card-header"><h3>Dados do Solicitante</h3></div>
                            {loadingProfile ? <p>Carregando...</p> : (
                                <>
                                    <div className="detail-item"><strong>Nome:</strong> {consumerProfile?.name || 'N/A'}</div>
                                    <div className="detail-item"><strong>Email:</strong> {consumerProfile?.email || 'N/A'}</div>
                                    <div className="detail-item"><strong>Telefone:</strong> {consumerProfile?.phone || 'N/A'}</div>
                                    <div className="detail-item"><strong>Endereço:</strong> {`${consumerProfile?.address || ''}, ${consumerProfile?.city || ''}`}</div>
                                </>
                            )}
                        </div>

                        <div className="data-card">
                            <div className="card-header"><h3>Detalhes da Solicitação</h3></div>
                            <div className="detail-item"><strong>Data da Solicitação:</strong> {formatDate(solicitacao.dataSolicitacao)}</div>
                            <div className="detail-item"><strong>Vereador(a):</strong> {solicitacao.dadosSolicitacao?.vereadorNome || 'N/A'}</div>
                            <div className="detail-item"><strong>Assunto:</strong> {solicitacao.dadosSolicitacao?.assunto || 'N/A'}</div>
                            <div className="detail-item"><strong>Data Preferencial:</strong> {formatDate(solicitacao.dadosSolicitacao?.dataPreferencial)}</div>
                            <div className="detail-item"><strong>Horário Preferencial:</strong> {solicitacao.dadosSolicitacao?.horarioPreferencial || 'N/A'}</div>
                            <div className="detail-item"><strong>Descrição:</strong><p className="detail-description">{solicitacao.dadosSolicitacao?.descricao || 'N/A'}</p></div>
                        </div>
                    </div>

                    <hr />
                    <h4>Gerenciamento</h4>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Alterar Status</label>
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="form-input">
                                <option value="Aguardando Confirmação">Aguardando Confirmação</option>
                                <option value="Agendado">Agendado</option>
                                <option value="Realizado">Realizado</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </div>
                        <button onClick={handleStatusSave} className="btn-primary" style={{ alignSelf: 'flex-end', height: '45px' }}>Salvar Status</button>
                    </div>

                    <hr />
                    <h4>Mensagens</h4>
                    <div className="message-history">
                        {solicitacao.messages && Object.values(solicitacao.messages).map((msg, index) => (
                            <div key={index} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
                                <p>{msg.text}</p>
                                <small>{new Date(msg.timestamp).toLocaleString('pt-BR')}</small>
                            </div>
                        ))}
                    </div>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." rows="3" className="form-input"></textarea>
                    </div>
                    <button onClick={handleSendMessage} className="btn-primary" style={{ width: '100%' }}>
                        <LiaPaperPlane /> Enviar Mensagem
                    </button>

                    <div className="form-actions" style={{ marginTop: '20px' }}>
                        <label className="btn-secondary"><LiaUploadSolid /> Enviar Arquivo<input type="file" hidden onChange={handleFileUpload} /></label>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main Dashboard Component
const AdminVereadoresDashboard = () => {
    const navigate = useNavigate();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [currentTab, setCurrentTab] = useState('Todas');
    const [statusCounts, setStatusCounts] = useState({});
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (!isAuthReady) return;

        const fetchUserProfile = async () => {
            const user = auth.currentUser;
            if (user) {
                const userRef = ref(db, `users/${user.uid}`);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    setLoggedInUserData(snapshot.val());
                }
            }
        };

        fetchUserProfile();
    }, [isAuthReady]);

    useEffect(() => {
        if (!isAuthReady || !loggedInUserData) return;

        const solicitacoesRef = ref(db, 'solicitacoes-vereadores');
        const q = query(solicitacoesRef);

        const unsubscribe = onValue(q, (snapshot) => {
            const data = snapshot.val();
            let fetchedSolicitacoes = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];

            if (loggedInUserData.tipo === 'Vereador') {
                fetchedSolicitacoes = fetchedSolicitacoes.filter(item => item.dadosSolicitacao?.vereadorNome === loggedInUserData.name);
            }

            setSolicitacoes(fetchedSolicitacoes);

            const counts = fetchedSolicitacoes.reduce((acc, item) => {
                const status = item.status || 'Não Classificado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Aguardando Confirmação', 'Agendado', 'Realizado', 'Cancelado', 'Não Classificado'];
            const orderedCounts = {};
            fixedStatuses.forEach(status => {
                orderedCounts[status] = counts[status] || 0;
            });
            setStatusCounts(orderedCounts);
        });

        return () => unsubscribe();
    }, [isAuthReady, loggedInUserData]);

    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Total de Solicitações',
                    data: Object.values(statusCounts),
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Solicitações por Status', font: { size: 16, weight: '600' } }
                }
            }
        });

        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [statusCounts]);

    const filteredSolicitacoes = currentTab === 'Todas'
        ? solicitacoes
        : solicitacoes.filter(d => d.status === currentTab);

    const handleOpenModal = (solicitacao) => setSelectedSolicitacao(solicitacao);
    const handleCloseModal = () => setSelectedSolicitacao(null);

    const sendNotification = async (solicitacao) => {
        if (!solicitacao.userId || solicitacao.userId === 'anonimo') {
            console.log("Usuário anônimo, notificação não enviada.");
            return;
        }

        const notificacoesRef = ref(db, 'notifications');
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            isRead: false,
            protocolo: solicitacao.id,
            targetUserId: solicitacao.userId,
            timestamp: serverTimestamp(),
            tituloNotification: "Sua solicitação para os Vereadores teve movimentação.",
            descricaoNotification: "Abra agora mesmo o aplicativo da Câmara Municipal de Pacatuba para acompanhar.",
            userEmail: solicitacao.dadosUsuario.email,
            userId: solicitacao.userId
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = ref(db, `solicitacoes-vereadores/${id}`);
        await update(itemRef, { status: newStatus });
        await sendNotification({ ...selectedSolicitacao, id, status: newStatus });
        alert('Status atualizado!');
        handleCloseModal();
    };

    const handleSendMessage = async (id, text) => {
        const messagesRef = ref(db, `solicitacoes-vereadores/${id}/messages`);
        const newMessageRef = push(messagesRef);
        await set(newMessageRef, { text, sender: 'admin', timestamp: serverTimestamp() });
        await sendNotification({ ...selectedSolicitacao, id });
        alert('Mensagem enviada!');
    };

    const handleAdminFileUpload = async (id, file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const fileData = { name: file.name, type: file.type, data: reader.result, sender: 'admin', timestamp: serverTimestamp() };
            const itemRef = ref(db, `solicitacoes-vereadores/${id}`);
            const snapshot = await get(itemRef);
            const currentData = snapshot.val();
            const currentFiles = currentData.arquivos || [];
            await update(itemRef, { arquivos: [...currentFiles, fileData] });
            alert("Arquivo enviado!");
        };
    };

    const statusTabs = ['Todas', 'Aguardando Confirmação', 'Agendado', 'Realizado', 'Cancelado'];

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Admin Vereadores</h1>
                        <p>Visão geral das solicitações de atendimento</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{auth.currentUser?.email || 'Admin'}</p>
                            <p className="user-type-display">Administrador</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <div className="data-sections-grid">
                    <div className="data-card">
                        <div className="card-header"><h3>Atividades Recentes</h3></div>
                        <div className="tabs-header" style={{ marginBottom: '20px' }}>
                            {statusTabs.map(tab => (
                                <button key={tab} className={`tab-button ${currentTab === tab ? 'active' : ''}`} onClick={() => setCurrentTab(tab)}>
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <div className="chart-container">
                            <div style={{ height: '350px', width: '100%' }}>
                                {loading ? <p>Carregando...</p> : <canvas ref={chartRef}></canvas>}
                            </div>
                        </div>
                    </div>

                    <div className="data-card">
                        <div className="card-header"><h3>Últimas Solicitações ({currentTab})</h3></div>
                        {loading && <p>Carregando...</p>}
                        {!loading && filteredSolicitacoes.length === 0 && <p>Nenhuma solicitação com o status "{currentTab}".</p>}
                        <ul className="data-list">
                            {filteredSolicitacoes.slice(0, 5).map(item => (
                                <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}>
                                    <div className="item-main-info">
                                        <strong>Vereador(a): {item.dadosSolicitacao?.vereadorNome || 'N/A'}</strong>
                                        <span>Solicitante: {item.dadosUsuario?.name || 'N/A'}</span>
                                    </div>
                                    <div className="item-status"><span className={`status-badge status-${item.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>{item.status || 'Pendente'}</span></div>
                                </li>
                            ))}
                        </ul>
                        {filteredSolicitacoes.length > 5 && <p style={{ marginTop: '15px', fontSize: '0.9rem', color: '#6b7280', textAlign: 'center' }}>e mais {filteredSolicitacoes.length - 5} solicitações...</p>}
                    </div>
                </div>

                <SolicitacaoModal
                    solicitacao={selectedSolicitacao}
                    onClose={handleCloseModal}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleAdminFileUpload}
                />
            </div>
        </div>
    );
};

export default AdminVereadoresDashboard;