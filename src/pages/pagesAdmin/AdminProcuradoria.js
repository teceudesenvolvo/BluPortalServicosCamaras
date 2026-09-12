import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, query, getDocs, getDoc, 
    doc, updateDoc, addDoc, serverTimestamp, limit
} from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import QueueManagerModal from '../../components/QueueManagerModal';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { LiaTimesSolid, LiaUploadSolid, LiaPaperPlane, LiaSearchSolid, LiaUsersCogSolid, LiaCogSolid } from "react-icons/lia";
import { SectorAvailabilityModal } from '../../components/SectorScheduling';
import ServiceOperationsNav from '../../components/ServiceOperationsNav';

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
                try {
                    const userRef = doc(firestore, 'users', userId);
                    const snapshot = await getDoc(userRef);
                    setConsumerProfile(snapshot.exists() ? snapshot.data() : solicitacao.dadosUsuario);
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
                                <div className="detail-item"><strong>Telefone:</strong> {consumerProfile?.telefone || 'N/A'}</div>
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
                                <option value="Agendamento Liberado">Agendamento Liberado</option>
                                <option value="Agendado">Agendado</option>
                                <option value="Encaminhada">Encaminhada</option>
                                <option value="Concluída">Concluída</option>
                                <option value="Cancelada">Cancelada</option>
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
    const [searchTerm, setSearchTerm] = useState('');
    const [showQueueManager, setShowQueueManager] = useState(false);
    const [showAvailability, setShowAvailability] = useState(false);
    const [operationView, setOperationView] = useState('dashboard');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate]);

    // Leitura única com limite (economiza downloads)
    const fetchSolicitacoes = useCallback(async () => {
        setLoading(true);
        try {
            const solicitacoesRef = collection(firestore, 'procuradoria-mulher');
            const q = query(solicitacoesRef, limit(50));
            const snapshot = await getDocs(q);
            
            const fetchedData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
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
        } catch (error) {
            console.error('Erro ao buscar solicitações:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady) return;
        fetchSolicitacoes();
    }, [isAuthReady, fetchSolicitacoes]);

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

    const filteredSolicitacoes = solicitacoes.filter(item => {
        const matchesTab = currentTab === 'Todas' || item.status === currentTab;
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
            (item.dadosSolicitacao?.assunto?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosUsuario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.id?.toLowerCase() || '').includes(searchLower);
        return matchesTab && matchesSearch;
    });

    const handleOpenModal = (solicitacao) => setSelectedSolicitacao(solicitacao);
    const handleCloseModal = () => setSelectedSolicitacao(null);

    const sendNotification = async (solicitacao, customMessage) => {
        if (!solicitacao.userId || solicitacao.userId === 'anonimo' || !solicitacao.dadosUsuario?.email) {
            console.log("Usuário anônimo ou sem e-mail, notificação não enviada.");
            return;
        }

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = customMessage?.title || `Sua solicitação para a Procuradoria da Mulher foi atualizada.`;
        const notificationDescription = customMessage?.body || `Abra o aplicativo da Câmara Municipal de ${cityName} para acompanhar os detalhes. Protocolo: ${solicitacao.id}.`;

        // 1. Salva a notificação no app
        const notificacoesRef = collection(firestore, 'notifications');
        await addDoc(notificacoesRef, {
            isRead: false,
            protocolo: solicitacao.id,
            targetUserId: solicitacao.userId,
            timestamp: serverTimestamp(),
            tituloNotification: notificationTitle,
            descricaoNotification: notificationDescription,
            userEmail: solicitacao.dadosUsuario.email,
            userId: solicitacao.userId
        });

        // 2. Adiciona a um nó 'mail' para ser processado por um serviço de e-mail
        const mailRef = collection(firestore, 'mail');
        await addDoc(mailRef, {
            to: solicitacao.dadosUsuario.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
            },
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = doc(firestore, 'procuradoria-mulher', id);
        let updateData = { status: newStatus };
        if (newStatus === 'Concluída' || newStatus === 'Cancelada') {
            updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
        } else {
            updateData.deletionTimestamp = null;
        }
        await updateDoc(itemRef, updateData);
        await sendNotification(
            { ...selectedSolicitacao, id, status: newStatus },
            { title: "Atualização de Status - Procuradoria", body: `O status do seu atendimento foi alterado para: ${newStatus}.` }
        );
        alert('Status atualizado!');
        handleCloseModal();
        fetchSolicitacoes(); // Atualiza a lista
    };

    const handleSendMessage = async (id, text) => {
        const itemRef = doc(firestore, 'procuradoria-mulher', id);
        const newMessageId = Date.now().toString();
        const newMessage = { text, sender: 'admin', timestamp: new Date().toISOString() };
        
        await updateDoc(itemRef, { [`messages.${newMessageId}`]: newMessage });
        await sendNotification(
            { ...selectedSolicitacao, id },
            { title: "Nova Mensagem - Procuradoria", body: `Você recebeu uma nova mensagem da equipe de atendimento: "${text}"` }
        );
        alert('Mensagem enviada!');
    };

    const handleAdminFileUpload = async (id, file) => {
        if (!file) return;
        try {
            const folderPath = `procuradoria-mulher/admin-uploads/${id}`;
            const uploadResult = await uploadFileToStorage(file, folderPath);
            
            const fileData = { 
                name: file.name, 
                type: file.type, 
                url: uploadResult.url,
                data: uploadResult.url, // Fallback para compatibilidade
                sender: 'admin', 
                timestamp: serverTimestamp() 
            };

            const itemRef = doc(firestore, 'procuradoria-mulher', id);
            const snapshot = await getDoc(itemRef);
            const currentData = snapshot.data();
            const currentFiles = currentData.arquivos || [];
            await updateDoc(itemRef, { arquivos: [...currentFiles, fileData] });
            alert("Arquivo enviado!");
        } catch (error) {
            console.error("Erro no upload admin:", error);
            alert("Erro ao enviar arquivo.");
        }
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
                        <button onClick={fetchSolicitacoes} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                            ↻ Atualizar dados
                        </button>
                    </div>
                    <div className="admin-balcao-header-actions">
                        <button onClick={() => setShowQueueManager(true)} className="admin-action-button action-queue" title="Organizar fila da Procuradoria">
                            <LiaUsersCogSolid /><span className="admin-action-label">Gerenciar fila</span>
                        </button>
                        <button type="button" onClick={() => setShowAvailability(true)} className="admin-header-gear-button" aria-label="Configurar horários" title="Configurar horários"><LiaCogSolid size={24} /></button>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{auth.currentUser?.email || 'Admin'}</p>
                            <p className="user-type-display">Administrador</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>
                {showQueueManager && <QueueManagerModal lockedService="Procuradoria da Mulher" onClose={() => setShowQueueManager(false)} />}
                {showAvailability && <SectorAvailabilityModal configCollection="procuradoria-config" sectorLabel="Procuradoria da Mulher" onClose={() => setShowAvailability(false)} />}

                <ServiceOperationsNav active={operationView} onChange={setOperationView} serviceName="Procuradoria da Mulher" />

                {operationView === 'dashboard' && <section className="data-card service-dashboard-chart">
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
                </section>}

                {operationView === 'requests' && <section className="data-card service-operations-panel"><div className="card-header"><div><h2>Solicitações e acolhimentos</h2><p>Abra o registro para acolher, encaminhar, responder ou registrar documentos.</p></div></div><ul className="data-list">{filteredSolicitacoes.map(item => <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}><div className="item-main-info"><strong>{item.dadosSolicitacao?.assunto || 'Atendimento reservado'}</strong><span>{item.protocolo || item.id} · {item.dadosSolicitacao?.tipoAtendimento || 'Acolhimento'}</span></div><div className="item-status"><span className={`status-badge status-${item.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>{item.status || 'Pendente'}</span></div></li>)}</ul>{!filteredSolicitacoes.length && <p>Nenhum atendimento encontrado.</p>}</section>}
                {operationView === 'appointments' && <section className="data-card service-operations-panel"><div className="card-header"><div><h2>Agendamentos protegidos</h2><p>Controle os horários de acolhimento e confirme somente atendimentos autorizados.</p></div><button className="btn-primary" onClick={() => setShowAvailability(true)}>Configurar horários</button></div><ul className="data-list">{solicitacoes.filter(item => ['Agendamento Liberado', 'Agendado'].includes(item.status)).map(item => <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}><div className="item-main-info"><strong>{item.dadosSolicitacao?.assunto || 'Atendimento reservado'}</strong><span>{item.appointmentDate || 'Data pendente'} {item.appointmentTime || ''}</span></div><div className="item-status"><span className="status-badge status-in-progress">{item.status}</span></div></li>)}</ul></section>}
                {operationView === 'queue' && <section className="data-card service-operations-panel"><div className="card-header"><div><h2>Fila e guichês</h2><p>Atendimentos sensíveis devem ser chamados de forma discreta e por equipe autorizada.</p></div><button className="btn-primary" onClick={() => setShowQueueManager(true)}>Abrir fila protegida</button></div></section>}
                {operationView === 'reports' && <section className="data-card service-operations-panel"><div className="card-header"><div><h2>Indicadores protegidos</h2><p>Use somente dados agregados; não exponha a identidade de solicitantes em relatórios.</p></div></div><div className="ouv-summary">{Object.entries(statusCounts).filter(([, total]) => total > 0).map(([status, total]) => <article key={status}><span>{status}</span><strong>{total}</strong></article>)}</div></section>}
                {operationView === 'settings' && <section className="data-card service-operations-panel"><div className="card-header"><div><h2>Configurações</h2><p>Publique horários e organize o fluxo de acolhimento.</p></div></div><div className="form-actions"><button className="btn-primary" onClick={() => setShowAvailability(true)}>Horários de atendimento</button><button className="btn-secondary" onClick={() => setShowQueueManager(true)}>Guichês e fila</button></div></section>}

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
