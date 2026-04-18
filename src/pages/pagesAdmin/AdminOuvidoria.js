import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, query, where, getDocs, doc, updateDoc, 
    getDoc, addDoc, serverTimestamp, limit, startAfter, orderBy 
} from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { LiaTimesSolid, LiaUploadSolid, LiaPaperPlane, LiaSearchSolid, LiaFilterSolid, LiaArrowLeftSolid } from "react-icons/lia";

// Modal Component
const ManifestacaoModal = ({ manifestacao, onClose, onStatusChange, onSendMessage, onFileUpload }) => {
    const [newStatus, setNewStatus] = useState(manifestacao ? manifestacao.status || '' : '');
    const [message, setMessage] = useState('');
    const [consumerProfile, setConsumerProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    useEffect(() => {
        if (manifestacao) {
            setNewStatus(manifestacao.status || '');
            const fetchConsumerProfile = async () => {
                const userId = manifestacao.userId;
                if (!userId || userId === 'anonimo') {
                    setConsumerProfile({ name: 'Anônimo' });
                    setLoadingProfile(false);
                    return;
                }
                setLoadingProfile(true);
                const userRef = doc(firestore, 'users', userId);
                try {
                    const snapshot = await getDoc(userRef);
                    setConsumerProfile(snapshot.exists() ? snapshot.data() : manifestacao.dadosUsuario);
                } catch (error) {
                    console.error("Erro ao buscar perfil:", error);
                    setConsumerProfile(manifestacao.dadosUsuario);
                } finally {
                    setLoadingProfile(false);
                }
            };
            fetchConsumerProfile();
        }
    }, [manifestacao]);

    if (!manifestacao) return null;

    const handleStatusSave = () => onStatusChange(manifestacao.id, newStatus);
    const handleFileUpload = (e) => onFileUpload(manifestacao.id, e.target.files[0]);
    const handleSendMessage = () => {
        if (message.trim() === '') return;
        onSendMessage(manifestacao.id, message);
        setMessage('');
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); // Adiciona timezone para evitar problemas de fuso
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Manifestação</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="data-card">
                        <div className="card-header"><h3>Dados do Manifestante</h3></div>
                        {loadingProfile ? <p>Carregando...</p> : (
                            <>
                                <div className="detail-item"><strong>Identificação:</strong> {manifestacao.dadosManifestacao?.identificacao || 'N/A'}</div>
                                <div className="detail-item"><strong>Nome:</strong> {consumerProfile?.name || 'Anônimo'}</div>
                                <div className="detail-item"><strong>Email:</strong> {consumerProfile?.email || 'N/A'}</div>
                            </>
                        )}
                    </div>

                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Detalhes da Manifestação</h3></div>
                        <div className="detail-item"><strong>Tipo:</strong> {manifestacao.dadosManifestacao?.tipoManifestacao || 'N/A'}</div>
                        <div className="detail-item"><strong>Assunto:</strong> {manifestacao.dadosManifestacao?.assunto || 'N/A'}</div>
                        <div className="detail-item"><strong>Data do Fato:</strong> {formatDate(manifestacao.dadosManifestacao?.dataFato)}</div>
                        <div className="detail-item"><strong>Local do Fato:</strong> {manifestacao.dadosManifestacao?.localFato || 'N/A'}</div>
                        <div className="detail-item"><strong>Envolvidos:</strong> {manifestacao.dadosManifestacao?.envolvidos || 'N/A'}</div>
                        <p className="detail-description">{manifestacao.dadosManifestacao?.descricao || 'N/A'}</p>
                    </div>

                    <hr />
                    <h4>Gerenciamento</h4>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Alterar Status</label>
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="form-input">
                                <option value="Recebida">Recebida</option>
                                <option value="Em Análise">Em Análise</option>
                                <option value="Respondida">Respondida</option>
                                <option value="Encaminhada">Encaminhada</option>
                                <option value="Cancelada">Cancelada</option>
                            </select>
                        </div>
                        <button onClick={handleStatusSave} className="btn-primary" style={{ alignSelf: 'flex-end', height: '45px' }}>Salvar Status</button>
                    </div>

                    <hr />
                    <h4>Mensagens</h4>
                    <div className="message-history">
                        {manifestacao.messages && Object.values(manifestacao.messages).map((msg, index) => (
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
const AdminOuvidoriaDashboard = () => {
    const navigate = useNavigate();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [manifestacoes, setManifestacoes] = useState([]);
    const [statusCounts, setStatusCounts] = useState({});
    const [selectedManifestacao, setSelectedManifestacao] = useState(null);

    // Filtros e Busca
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Todas');
    const [filterTipo, setFilterTipo] = useState('Todos');
    const [showFilters, setShowFilters] = useState(false);

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [cursors, setCursors] = useState([null]);
    const [lastDoc, setLastDoc] = useState(null);
    const [isLastPage, setIsLastPage] = useState(false);
    const itemsPerPage = 15;
    const maxItemsWithFilters = 500;

    const hasActiveFilters = !!(searchTerm || filterStatus !== 'Todas' || filterTipo !== 'Todos');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchManifestacoes = useCallback(async (cursor = null, filtering = false) => {
        setLoading(true);
        try {
            const ref = collection(firestore, 'ouvidoria');
            let q = query(ref);

            if (!filtering) {
                q = query(q, orderBy('dataManifestacao', 'desc'));
            }

            if (filterStatus !== 'Todas') {
                q = query(q, where('status', '==', filterStatus));
            }

            if (filterTipo !== 'Todos') {
                q = query(q, where('dadosManifestacao.tipoManifestacao', '==', filterTipo));
            }

            if (cursor) {
                q = query(q, startAfter(cursor));
            }

            q = query(q, limit(filtering ? maxItemsWithFilters : itemsPerPage));

            const snapshot = await getDocs(q);
            const fetchedData = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    timestamp: data.dataManifestacao?.toMillis ? data.dataManifestacao.toMillis() : (data.dataManifestacao || 0)
                };
            }).sort((a, b) => b.timestamp - a.timestamp);

            setManifestacoes(fetchedData);

            const counts = fetchedData.reduce((acc, item) => {
                const status = item.status || 'Não Classificado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Recebida', 'Em Análise', 'Respondida', 'Encaminhada', 'Não Classificado'];
            const orderedCounts = {};
            fixedStatuses.forEach(status => {
                orderedCounts[status] = counts[status] || 0;
            });
            setStatusCounts(orderedCounts);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setIsLastPage(filtering ? true : snapshot.docs.length < itemsPerPage);
        } catch (error) {
            console.error('Erro ao buscar manifestações:', error);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterTipo, itemsPerPage]);

    useEffect(() => {
        if (!isAuthReady) return;
        setCurrentPage(1);
        setCursors([null]);
        fetchManifestacoes(null, hasActiveFilters);
    }, [isAuthReady, filterStatus, filterTipo, searchTerm, hasActiveFilters, fetchManifestacoes]);

    const handleNextPage = () => {
        if (!lastDoc || isLastPage) return;
        setCursors(prev => [...prev, lastDoc]);
        fetchManifestacoes(lastDoc);
        setCurrentPage(prev => prev + 1);
    };

    const handlePrevPage = () => {
        if (currentPage <= 1) return;
        const newHistory = cursors.slice(0, -1);
        const targetCursor = newHistory[newHistory.length - 1];
        fetchManifestacoes(targetCursor);
        setCursors(newHistory);
        setCurrentPage(prev => prev - 1);
    };

    const handleResetPagination = () => {
        setCurrentPage(1);
        setCursors([null]);
        fetchManifestacoes(null);
    };

    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Total de Manifestações',
                    data: Object.values(statusCounts),
                    backgroundColor: ['#FFC107', '#2196F3', '#4CAF50', '#FF9800', '#9E9E9E'],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Manifestações por Status', font: { size: 16, weight: '600' } }
                }
            }
        });

        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [statusCounts]);

    const filteredManifestacoes = manifestacoes.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
            (item.dadosManifestacao?.assunto?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosUsuario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.id?.toLowerCase() || '').includes(searchLower);
        
        const matchesStatus = filterStatus === 'Todas' || item.status === filterStatus;
        const matchesTipo = filterTipo === 'Todos' || item.dadosManifestacao?.tipoManifestacao === filterTipo;

        return matchesSearch && matchesStatus && matchesTipo;
    });

    const handleOpenModal = (manifestacao) => setSelectedManifestacao(manifestacao);
    const handleCloseModal = () => setSelectedManifestacao(null);

    const sendNotification = async (manifestacao) => {
        if (!manifestacao.userId || manifestacao.userId === 'anonimo' || !manifestacao.dadosUsuario?.email) {
            console.log("Usuário anônimo ou sem e-mail, notificação não enviada.");
            return;
        }

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = `Sua manifestação na Ouvidoria foi atualizada.`;
        const notificationDescription = `Abra o aplicativo da Câmara Municipal de ${cityName} para acompanhar os detalhes. Protocolo: ${manifestacao.id}.`;

        // 1. Salva a notificação no Firestore
        const notificacoesRef = collection(firestore, 'notifications');
        await addDoc(notificacoesRef, {
            isRead: false,
            protocolo: manifestacao.id,
            targetUserId: manifestacao.userId,
            timestamp: serverTimestamp(),
            tituloNotification: notificationTitle,
            descricaoNotification: notificationDescription,
            userEmail: manifestacao.dadosUsuario.email,
            userId: manifestacao.userId
        });

        // 2. Adiciona à coleção 'mail'
        const mailRef = collection(firestore, 'mail');
        await addDoc(mailRef, {
            to: manifestacao.dadosUsuario.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
            },
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = doc(firestore, 'ouvidoria', id);
        let updateData = { status: newStatus };
        if (newStatus === 'Respondida' || newStatus === 'Cancelada') {
            updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
        } else {
            updateData.deletionTimestamp = null;
        }
        await updateDoc(itemRef, updateData);
        await sendNotification({ ...selectedManifestacao, id, status: newStatus });
        alert('Status atualizado!');
        handleCloseModal();
        fetchManifestacoes(null, hasActiveFilters);
    };

    const handleSendMessage = async (id, text) => {
        const itemRef = doc(firestore, 'ouvidoria', id);
        const newMessageId = Date.now().toString();
        const newMessage = { text, sender: 'admin', timestamp: new Date().toISOString() };
        await updateDoc(itemRef, { [`messages.${newMessageId}`]: newMessage });
        await sendNotification({ ...selectedManifestacao, id });
        alert('Mensagem enviada!');
    };

    const handleAdminFileUpload = async (id, file) => {
        if (!file) return;
        try {
            const folderPath = `ouvidoria/admin-uploads/${id}`;
            const uploadResult = await uploadFileToStorage(file, folderPath);
            
            const fileData = { 
                name: file.name, 
                type: file.type, 
                url: uploadResult.url,
                data: uploadResult.url, 
                sender: 'admin', 
                timestamp: serverTimestamp() 
            };

            const itemRef = doc(firestore, 'ouvidoria', id);
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

    const clearFilters = () => {
        setSearchTerm('');
        setFilterStatus('Todas');
        setFilterTipo('Todos');
        setCurrentPage(1);
    };

    const statusTabs = ['Todas', 'Recebida', 'Em Análise', 'Respondida', 'Encaminhada'];
    const tiposList = ['Todos', 'Reclamação', 'Sugestão', 'Denúncia', 'Elogio', 'Crítica'];

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <button onClick={() => navigate('/admin-balcao')} className="btn-secondary" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                            <LiaArrowLeftSolid size={18} /> Voltar ao Dashboard
                        </button>
                        <h1>Admin Ouvidoria</h1>
                        <p>Gerencie as manifestações do cidadão ({filteredManifestacoes.length} registros)</p>
                        <button onClick={() => fetchManifestacoes(null, hasActiveFilters)} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                            ↻ Atualizar lista
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

                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                            <LiaSearchSolid style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por assunto, manifestante ou protocolo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="form-input"
                                style={{ paddingLeft: '42px', margin: 0 }}
                            />
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={showFilters ? 'btn-primary' : 'btn-secondary'}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <LiaFilterSolid size={18} />
                            Filtros {hasActiveFilters && <span className="filter-badge">!</span>}
                        </button>

                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="btn-secondary">
                                Limpar
                            </button>
                        )}
                    </div>

                    {showFilters && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Status</label>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="form-input"
                                >
                                    {statusTabs.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Tipo</label>
                                <select
                                    value={filterTipo}
                                    onChange={(e) => setFilterTipo(e.target.value)}
                                    className="form-input"
                                >
                                    {tiposList.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                <div className="data-sections-grid">
                    <div className="data-card">
                        <div className="card-header"><h3>Atividades Recentes</h3></div>
                        <div className="chart-container">
                            <div style={{ height: '350px', width: '100%' }}>
                                {loading ? <p>Carregando...</p> : <canvas ref={chartRef}></canvas>}
                            </div>
                        </div>
                    </div>

                    <div className="data-card">
                        <div className="card-header"><h3>Lista de Manifestações ({filterStatus})</h3></div>
                        {loading && <p>Carregando...</p>}
                        {!loading && filteredManifestacoes.length === 0 && <p style={{ padding: '20px' }}>Nenhuma manifestação encontrada com o status "{filterStatus}".</p>}
                        <ul className="data-list">
                            {filteredManifestacoes.map(item => (
                                <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}>
                                    <div className="item-main-info">
                                        <strong>{item.dadosManifestacao?.assunto || 'Sem assunto'}</strong>
                                        <span>Manifestante: {item.dadosUsuario?.name || 'Anônimo'}</span>
                                    </div>
                                    <div className="item-status"><span className={`status-badge status-${item.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>{item.status || 'Pendente'}</span></div>
                                </li>
                            ))}
                        </ul>

                        {/* Paginação */}
                        {!loading && manifestacoes.length > 0 && !hasActiveFilters && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', paddingBottom: '20px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleResetPagination}
                                    disabled={currentPage === 1}
                                    className="btn-secondary"
                                    style={{ padding: '6px 14px', opacity: currentPage === 1 ? 0.4 : 1 }}
                                >
                                    ⇤ Início
                                </button>
                                
                                <button
                                    onClick={handlePrevPage}
                                    disabled={currentPage === 1}
                                    className="btn-secondary"
                                    style={{ padding: '6px 14px', opacity: currentPage === 1 ? 0.4 : 1 }}
                                >
                                    Anterior
                                </button>

                                <button
                                    onClick={handleNextPage}
                                    disabled={isLastPage}
                                    className="btn-primary"
                                    style={{ padding: '6px 20px', opacity: isLastPage ? 0.4 : 1 }}
                                >
                                    Próxima Página ➔
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <ManifestacaoModal
                    manifestacao={selectedManifestacao}
                    onClose={handleCloseModal}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleAdminFileUpload}
                />
            </div>
        </div>
    );
};

export default AdminOuvidoriaDashboard;