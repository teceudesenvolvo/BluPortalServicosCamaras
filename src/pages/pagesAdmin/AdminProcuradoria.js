import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, query, getDocs, getDoc, 
    doc, updateDoc, addDoc, serverTimestamp 
} from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { LiaTimesSolid, LiaUploadSolid, LiaPaperPlane, LiaSearchSolid } from "react-icons/lia";

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
            const q = query(solicitacoesRef);
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
                        <div style={{ marginBottom: '15px', position: 'relative' }}>
                            <LiaSearchSolid style={{ position: 'absolute', left: '10px', top: '10px', color: '#888' }} size={20} />
                            <input 
                                type="text" 
                                placeholder="Buscar por assunto, nome ou protocolo..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="form-input"
                                style={{ paddingLeft: '40px' }}
                            />
                        </div>
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