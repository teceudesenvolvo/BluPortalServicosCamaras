import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, query, onValue, update, push, set, serverTimestamp, get } from 'firebase/database';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaTimesSolid, LiaUploadSolid, LiaPaperPlane } from "react-icons/lia";

// =============================================================
// Componente Modal de Detalhes da Solicitação Jurídica
// =============================================================
const SolicitacaoJuridicoModal = ({ solicitacao, onClose, onStatusChange, onSendMessage, onFileUpload }) => {
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
                    console.error("Erro ao buscar perfil do consumidor:", error);
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
                                    <div className="detail-item"><strong>CPF:</strong> {consumerProfile?.cpf || 'N/A'}</div>
                                    <div className="detail-item"><strong>Email:</strong> {consumerProfile?.email || 'N/A'}</div>
                                    <div className="detail-item"><strong>Telefone:</strong> {consumerProfile?.phone || 'N/A'}</div>
                                    <div className="detail-item"><strong>Endereço:</strong> {`${consumerProfile?.address || ''}, ${consumerProfile?.city || ''} - ${consumerProfile?.state || ''}`}</div>
                                    <div className="detail-item"><strong>CEP:</strong> {consumerProfile?.cep || 'N/A'}</div>
                                </>
                            )}
                        </div>
                        <div className="data-card">
                            <div className="card-header"><h3>Detalhes do Acontecimento</h3></div>
                            <div className="detail-item"><strong>Data da Solicitação:</strong> {formatDate(solicitacao.dataSolicitacao)}</div>
                            <div className="detail-item"><strong>Assunto:</strong> {solicitacao.dadosAcontecimento?.assunto || 'N/A'}</div>
                            <div className="detail-item"><strong>Data do Fato:</strong> {formatDate(solicitacao.dadosAcontecimento?.dataAcontecimento)}</div>
                            <div className="detail-item"><strong>Endereço do Fato:</strong> {`${solicitacao.dadosAcontecimento?.enderecoAcontecimento || ''}, Nº ${solicitacao.dadosAcontecimento?.numeroAcontecimento || 's/n'}`}</div>
                            <div className="detail-item"><strong>Bairro do Fato:</strong> {solicitacao.dadosAcontecimento?.bairroAcontecimento || 'N/A'}</div>
                            <div className="detail-item"><strong>Cidade do Fato:</strong> {solicitacao.dadosAcontecimento?.cidadeAcontecimento || 'N/A'}</div>
                            <div className="detail-item"><strong>CEP do Fato:</strong> {solicitacao.dadosAcontecimento?.cepAcontecimento || 'N/A'}</div>
                        </div>
                    </div>

                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Descrição do Caso</h3></div>
                        <p className="detail-description">{solicitacao.dadosAcontecimento?.descricao || 'Nenhuma descrição fornecida.'}</p>
                    </div>

                    <hr />
                    <h4>Gerenciamento</h4>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Alterar Status</label>
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="form-input">
                                <option value="Aguardando Atendimento">Aguardando Atendimento</option>
                                <option value="Em Análise">Em Análise</option>
                                <option value="Concluído">Concluído</option>
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
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem para o usuário..." rows="3" className="form-input"></textarea>
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

// =============================================================
// Componente principal do Dashboard Jurídico
// =============================================================
const AdminJuridicoDashboard = () => {
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
            if (user) {
                setIsAuthReady(true);
            } else {
                navigate('/');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (!isAuthReady) return;

        const solicitacoesRef = ref(db, 'atendimento-juridico');
        const q = query(solicitacoesRef);

        const unsubscribe = onValue(q, (snapshot) => {
            const data = snapshot.val();
            const fetchedSolicitacoes = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setSolicitacoes(fetchedSolicitacoes);

            const counts = fetchedSolicitacoes.reduce((acc, item) => {
                const status = item.status || 'Não Classificado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Aguardando Atendimento', 'Em Análise', 'Concluído', 'Não Classificado'];
            const orderedCounts = {};
            fixedStatuses.forEach(status => {
                orderedCounts[status] = counts[status] || 0;
            });
            setStatusCounts(orderedCounts);
        }, (error) => {
            console.error("Erro ao buscar solicitações jurídicas:", error);
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'bar', // Gráfico de barras para variar
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Total de Solicitações',
                    data: Object.values(statusCounts),
                    backgroundColor: [
                        'rgba(255, 159, 64, 0.5)',
                        'rgba(54, 162, 235, 0.5)',
                        'rgba(75, 192, 192, 0.5)',
                        'rgba(153, 102, 255, 0.5)',
                    ],
                    borderColor: [
                        'rgba(255, 159, 64, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Solicitações por Status', font: { size: 16, weight: '600' } }
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
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
            tituloNotification: "Sua solicitação para o Atendimento Juridico teve movimentação.",
            descricaoNotification: "Abra agora mesmo o aplicativo da Câmara Municipal de Pacatuba para acompanhar.",
            userEmail: solicitacao.dadosUsuario.email,
            userId: solicitacao.userId
        });
    };

    const handleStatusChange = async (solicitacaoId, newStatus) => {
        const solicitacaoRef = ref(db, `atendimento-juridico/${solicitacaoId}`);
        await update(solicitacaoRef, { status: newStatus });
        await sendNotification({ ...selectedSolicitacao, id: solicitacaoId, status: newStatus });
        alert('Status atualizado com sucesso!');
        handleCloseModal();
    };

    const handleSendMessage = async (solicitacaoId, messageText) => {
        const messagesRef = ref(db, `atendimento-juridico/${solicitacaoId}/messages`);
        const newMessageRef = push(messagesRef);
        await set(newMessageRef, {
            text: messageText,
            sender: 'admin',
            timestamp: serverTimestamp(),
        });
        await sendNotification({ ...selectedSolicitacao, id: solicitacaoId });
        alert('Mensagem enviada com sucesso!');
    };

    const handleAdminFileUpload = async (solicitacaoId, file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const fileData = { name: file.name, type: file.type, data: reader.result, sender: 'admin', timestamp: serverTimestamp() };
            const solicitacaoRef = ref(db, `atendimento-juridico/${solicitacaoId}`);
            try {
                const snapshot = await get(solicitacaoRef);
                const solicitacaoAtual = snapshot.val();
                const arquivosAtuais = solicitacaoAtual.arquivos || [];
                const novosArquivos = [...arquivosAtuais, fileData];
                await update(solicitacaoRef, { arquivos: novosArquivos });
                alert("Arquivo enviado com sucesso!");
            } catch (error) {
                alert("Falha ao enviar o arquivo.");
            }
        };
    };

    const statusTabs = ['Todas', 'Aguardando Atendimento', 'Em Análise', 'Concluído'];

    if (!isAuthReady) {
        return <div className="loading-screen">Carregando autenticação...</div>;
    }

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Administração Jurídica</h1>
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
                                {loading ? <p>Carregando dados do gráfico...</p> : <canvas ref={chartRef}></canvas>}
                            </div>
                        </div>
                    </div>

                    <div className="data-card">
                        <div className="card-header"><h3>Últimas Solicitações ({currentTab})</h3></div>
                        {loading && <p>Carregando lista...</p>}
                        {!loading && filteredSolicitacoes.length === 0 && <p>Nenhuma solicitação encontrada com o status "{currentTab}".</p>}
                        <ul className="data-list">
                            {filteredSolicitacoes.slice(0, 5).map(item => (
                                <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}>
                                    <div className="item-main-info">
                                        <strong>{item.dadosAcontecimento?.assunto || 'Sem assunto'}</strong>
                                        <span>Solicitante: {item.dadosUsuario?.name || 'N/A'}</span>
                                    </div>
                                    <div className="item-status"><span className={`status-badge status-${item.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>{item.status || 'Pendente'}</span></div>
                                </li>
                            ))}
                        </ul>
                        {filteredSolicitacoes.length > 5 && <p style={{ marginTop: '15px', fontSize: '0.9rem', color: '#6b7280', textAlign: 'center' }}>e mais {filteredSolicitacoes.length - 5} solicitações...</p>}
                    </div>
                </div>

                <SolicitacaoJuridicoModal
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

export default AdminJuridicoDashboard;