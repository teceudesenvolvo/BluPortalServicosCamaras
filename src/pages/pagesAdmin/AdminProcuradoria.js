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
                if (!userId || userId === 'anonimo') {
                    setConsumerProfile({ name: 'Anônimo' });
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

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes do Atendimento</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="data-card">
                        <div className="card-header"><h3>Dados da Solicitante</h3></div>
                        {loadingProfile ? <p>Carregando...</p> : (
                            <>
                                <div className="detail-item"><strong>Identificação:</strong> {solicitacao.dadosSolicitacao?.identificacao || 'N/A'}</div>
                                <div className="detail-item"><strong>Nome:</strong> {consumerProfile?.name || 'Anônimo'}</div>
                                <div className="detail-item"><strong>Email:</strong> {consumerProfile?.userEmail || 'N/A'}</div>
                                <div className="detail-item"><strong>Telefone:</strong> {consumerProfile?.phone || 'N/A'}</div>
                                <div className="detail-item"><strong>CPF:</strong> {consumerProfile?.cpf || 'N/A'}</div>
                            </>
                        )}
                    </div>

                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Detalhes da Solicitação</h3></div>
                        <div className="detail-item"><strong>Tipo de Atendimento:</strong> {solicitacao.dadosSolicitacao?.tipoAtendimento || 'N/A'}</div>
                        {solicitacao.dadosSolicitacao?.tipoViolencia && <div className="detail-item"><strong>Tipo de Violência:</strong> {solicitacao.dadosSolicitacao?.tipoViolencia}</div>}
                        <div className="detail-item"><strong>Assunto:</strong> {solicitacao.dadosSolicitacao?.assunto || 'N/A'}</div>
                        <div className="detail-item"><strong>Descrição:</strong><p className="detail-description">{solicitacao.dadosSolicitacao?.descricao || 'N/A'}</p></div>
                    </div>

                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Informações do Fato</h3></div>
                        <div className="detail-item"><strong>Data do Fato:</strong> {formatDate(solicitacao.dadosSolicitacao?.dataFato)}</div>
                        <div className="detail-item"><strong>Nome do Acusado:</strong> {solicitacao.dadosSolicitacao?.nomeAgressor || 'N/A'}</div>
                        <div className="detail-item"><strong>Relação com o Acusado:</strong> {solicitacao.dadosSolicitacao?.relacaoAgressor || 'N/A'}</div>
                    </div>

                    <hr />
                    <h4>Gerenciamento</h4>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Alterar Status</label>
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="form-input">
                                <option value="Recebida">Recebida</option>
                                <option value="Em Acolhimento">Em Acolhimento</option>
                                <option value="Encaminhada">Encaminhada</option>
                                <option value="Concluída">Concluída</option>
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
const AdminProcuradoriaDashboard = () => {
    const navigate = useNavigate();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [currentTab, setCurrentTab] = useState('Todas');
    const [statusCounts, setStatusCounts] = useState({});
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

        const solicitacoesRef = ref(db, 'procuradoria-mulher');
        const q = query(solicitacoesRef);

        const unsubscribe = onValue(q, (snapshot) => {
            const data = snapshot.val();
            const fetchedData = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setSolicitacoes(fetchedData);

            const counts = fetchedData.reduce((acc, item) => {
                const status = item.status || 'Não Classificado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Recebida', 'Em Acolhimento', 'Encaminhada', 'Concluída', 'Não Classificado'];
            const orderedCounts = {};
            fixedStatuses.forEach(status => {
                orderedCounts[status] = counts[status] || 0;
            });
            setStatusCounts(orderedCounts);
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Total de Atendimentos',
                    data: Object.values(statusCounts),
                    backgroundColor: ['#FFC107', '#2196F3', '#FF9800', '#4CAF50', '#9E9E9E'],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Atendimentos por Status', font: { size: 16, weight: '600' } }
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
            tituloNotification: "Sua solicitação para a Procuradoria da Mulher teve movimentação.",
            descricaoNotification: "Abra agora mesmo o aplicativo da Câmara Municipal de Pacatuba para acompanhar.",
            userEmail: solicitacao.dadosUsuario.email,
            userId: solicitacao.userId
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = ref(db, `procuradoria-mulher/${id}`);
        await update(itemRef, { status: newStatus });
        await sendNotification({ ...selectedSolicitacao, id, status: newStatus });
        alert('Status atualizado!');
        handleCloseModal();
    };

    const handleSendMessage = async (id, text) => {
        const messagesRef = ref(db, `procuradoria-mulher/${id}/messages`);
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
            const itemRef = ref(db, `procuradoria-mulher/${id}`);
            const snapshot = await get(itemRef);
            const currentData = snapshot.val();
            const currentFiles = currentData.arquivos || [];
            await update(itemRef, { arquivos: [...currentFiles, fileData] });
            alert("Arquivo enviado!");
        };
    };

    const statusTabs = ['Todas', 'Recebida', 'Em Acolhimento', 'Encaminhada', 'Concluída'];

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Admin Procuradoria da Mulher</h1>
                        <p>Visão geral dos atendimentos</p>
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
                        <div className="card-header"><h3>Últimos Atendimentos ({currentTab})</h3></div>
                        {loading && <p>Carregando...</p>}
                        {!loading && filteredSolicitacoes.length === 0 && <p>Nenhum atendimento com o status "{currentTab}".</p>}
                        <ul className="data-list">
                            {filteredSolicitacoes.slice(0, 5).map(item => (
                                <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}>
                                    <div className="item-main-info">
                                        <strong>{item.dadosSolicitacao?.assunto || 'Sem assunto'}</strong>
                                        <span>Solicitante: {item.dadosUsuario?.name || 'Anônimo'}</span>
                                    </div>
                                    <div className="item-status"><span className={`status-badge status-${item.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>{item.status || 'Pendente'}</span></div>
                                </li>
                            ))}
                        </ul>
                        {filteredSolicitacoes.length > 5 && <p style={{ marginTop: '15px', fontSize: '0.9rem', color: '#6b7280', textAlign: 'center' }}>e mais {filteredSolicitacoes.length - 5} atendimentos...</p>}
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

export default AdminProcuradoriaDashboard;