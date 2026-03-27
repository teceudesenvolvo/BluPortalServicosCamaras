import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, query, orderByChild, equalTo, update, push, set, serverTimestamp, get } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import {
    LiaTimesSolid, LiaUploadSolid, LiaBellSolid, LiaPaperPlane,
    LiaPaperclipSolid, LiaSearchSolid, LiaArrowLeftSolid, LiaFilterSolid, LiaDownloadSolid
} from "react-icons/lia";
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';

// Lightbox para visualizar arquivos inline
const FileViewerModal = ({ file, onClose }) => {
    if (!file) return null;
    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const fileUrl = file.url || file.data;
    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: '760px' }}>
                <div className="modal-header">
                    <h3 style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{file.name}</h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <a href={fileUrl} download={file.name} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <LiaDownloadSolid size={16} /> Download
                        </a>
                        <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                    </div>
                </div>
                <div className="modal-body" style={{ overflow: 'auto', maxHeight: '75vh', textAlign: 'center' }}>
                    {isImage && (
                        <img src={fileUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }} />
                    )}
                    {isPdf && (
                        <iframe src={fileUrl} title={file.name} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '8px' }} />
                    )}
                    {!isImage && !isPdf && (
                        <div style={{ padding: '40px' }}>
                            <p style={{ marginBottom: '16px', color: '#6b7280' }}>Visualização não disponível para este tipo de arquivo.</p>
                            <a href={fileUrl} download={file.name} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <LiaDownloadSolid size={18} /> Baixar arquivo
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ─── Modal de Detalhes ─── */
const SolicitacaoBalcaoModal = ({ solicitacao, onClose, onStatusChange, onSendMessage, onFileUpload, onNotifyUser }) => {
    const [newStatus, setNewStatus] = useState(solicitacao ? solicitacao.status || '' : '');
    const [message, setMessage] = useState('');
    const [consumerProfile, setConsumerProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [viewingFile, setViewingFile] = useState(null);

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
                const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
                try {
                    const snapshot = await get(userRef);
                    setConsumerProfile(snapshot.exists() ? snapshot.val() : solicitacao.dadosUsuario);
                } catch (error) {
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
    const handleNotifyUser = () => onNotifyUser(solicitacao);

    const handleMigrateFile = async (file, category, index) => {
        if (!file.data || !file.data.startsWith('data:')) return;
        try {
            const response = await fetch(file.data);
            const blob = await response.blob();
            const convertedFile = new File([blob], file.name, { type: file.type });
            
            const folderPath = `balcao-cidadao/migrated/${solicitacao.id}`;
            const uploadResult = await uploadFileToStorage(convertedFile, folderPath);
            
            const itemRef = ref(db, `${config.cityCollection}/balcao-cidadao/${solicitacao.id}/dadosSolicitacao/anexos/${category}/${index}`);
            
            await update(itemRef, {
                url: uploadResult.url,
                data: uploadResult.url 
            });
            
            file.url = uploadResult.url;
            file.data = uploadResult.url;
            alert("Arquivo migrado com sucesso!");
        } catch (error) {
            console.error("Erro ao migrar arquivo:", error);
            alert("Erro ao migrar arquivo.");
        }
    };

    const handleSendMessage = () => {
        if (message.trim() === '') return;
        onSendMessage(solicitacao.id, message);
        setMessage('');
    };

    return (
        <>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>Detalhes da Solicitação</h3>
                        <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                    </div>
                    <div className="modal-body">
                        <div className="data-card">
                            <div className="card-header"><h3>Dados do Solicitante</h3></div>
                            {loadingProfile ? <p>Carregando...</p> : (
                                <>
                                    <div className="detail-item"><strong>Nome:</strong> {consumerProfile?.name || 'N/A'}</div>
                                    <div className="detail-item"><strong>Email:</strong> {consumerProfile?.email || 'N/A'}</div>
                                    <div className="detail-item"><strong>Telefone:</strong> {consumerProfile?.telefone || 'N/A'}</div>
                                </>
                            )}
                        </div>

                        <div className="data-card" style={{ marginTop: '20px' }}>
                            <div className="card-header"><h3>Descrição da Solicitação</h3></div>
                            <div className="detail-item"><strong>Assunto:</strong> {solicitacao.dadosSolicitacao?.assunto || 'N/A'}</div>
                            {solicitacao.dadosSolicitacao?.assunto === 'Agendamento' ? (
                                <>
                                    <div className="detail-item"><strong>Data Agendada:</strong> {solicitacao.appointmentDate || solicitacao.dadosSolicitacao?.appointmentDate || 'N/A'}</div>
                                    <div className="detail-item"><strong>Horário Agendado:</strong> {solicitacao.appointmentTime || solicitacao.dadosSolicitacao?.appointmentTime || 'N/A'}</div>
                                    <div className="detail-item"><strong>Motivo:</strong></div>
                                    <p className="detail-description">{solicitacao.dadosSolicitacao?.descricao || 'Não especificado'}</p>
                                </>
                            ) : solicitacao.dadosSolicitacao?.assunto === 'Emissão de Documentos' ? (
                                <>
                                    <div className="detail-item"><strong>Tipo de Documento:</strong> {solicitacao.dadosSolicitacao?.tipoDocumento || 'N/A'}</div>
                                    {solicitacao.dadosSolicitacao.detalhes && Object.keys(solicitacao.dadosSolicitacao.detalhes).length > 0 && (
                                        <>
                                            <div className="detail-item" style={{ marginTop: '10px' }}><strong>Detalhes Preenchidos:</strong></div>
                                            {Object.entries(solicitacao.dadosSolicitacao.detalhes).map(([key, value]) => (
                                                <div key={key} className="detail-item" style={{ paddingLeft: '15px' }}><small><strong>{key}:</strong> {value}</small></div>
                                            ))}
                                        </>
                                    )}
                                    <div className="detail-item" style={{ marginTop: '10px' }}><strong>Documentos Anexados:</strong></div>
                                    {solicitacao.dadosSolicitacao.anexos && Object.entries(solicitacao.dadosSolicitacao.anexos).length > 0 ? (
                                        <ul className="file-list" style={{ marginTop: '5px', paddingLeft: '20px' }}>
                                            {Object.entries(solicitacao.dadosSolicitacao.anexos).map(([category, files]) => 
                                                files.map((file, index) => (
                                                    <li key={`${category}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                                        <button onClick={() => setViewingFile(file)} className="file-link" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                                                            <LiaPaperclipSolid /> {file.name}
                                                        </button>
                                                        {file.data?.startsWith('data:') && (
                                                            <button onClick={() => handleMigrateFile(file, category, index)} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                                                                <LiaUploadSolid /> Migrar para Storage
                                                            </button>
                                                        )}
                                                    </li>
                                                ))
                                            )}
                                        </ul>
                                    ) : (<p className="detail-description">Nenhum documento anexado.</p>)}
                                </>
                            ) : (
                                <p className="detail-description">{solicitacao.dadosSolicitacao?.descricao || 'N/A'}</p>
                            )}
                        </div>

                        <hr />
                        <h4>Gerenciamento</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Alterar Status</label>
                                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="form-input">
                                    <option value="Agendamento Liberado">Agendamento Liberado</option>
                                    <option value="Agendado">Agendado</option>
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
                            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." rows="3" className="form-input"></textarea>
                        </div>
                        <button onClick={handleSendMessage} className="btn-primary" style={{ width: '100%' }}>
                            <LiaPaperPlane /> Enviar Mensagem
                        </button>

                        <div className="form-actions" style={{ marginTop: '20px' }}>
                            <label className="btn-secondary"><LiaUploadSolid /> Enviar Arquivo<input type="file" hidden onChange={handleFileUpload} /></label>
                            <button onClick={handleNotifyUser} className="btn-submit"><LiaBellSolid /> Notificar Usuário</button>
                        </div>
                    </div>
                </div>
            </div>
            <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
        </>
    );
};

/* ─── Página principal de Agendamentos ─── */
const AdminBalcaoAgendamentos = () => {
    const navigate = useNavigate();

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [agendamentos, setAgendamentos] = useState([]);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Todas');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    // Leitura única com filtro server-side por status (economiza downloads)
    const fetchAgendamentos = useCallback(async () => {
        setLoading(true);
        try {
            const solicitacoesRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
            const q = query(solicitacoesRef, orderByChild('status'), equalTo('Agendado'));
            const snapshot = await get(q);
            const data = snapshot.val();
            const fetchedData = data
                ? Object.keys(data)
                    .map(key => ({ id: key, ...data[key] }))
                    .sort((a, b) => {
                        const dateA = a.appointmentDate || '9999-99-99';
                        const timeA = a.appointmentTime || '23:59';
                        const dateB = b.appointmentDate || '9999-99-99';
                        const timeB = b.appointmentTime || '23:59';
                        if (dateA === dateB) return timeA.localeCompare(timeB);
                        return dateA.localeCompare(dateB);
                    })
                : [];
            setAgendamentos(fetchedData);
        } catch (error) {
            console.error('Erro ao buscar agendamentos:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady) return;
        fetchAgendamentos();
    }, [isAuthReady, fetchAgendamentos]);

    /* ── Filtragem ── */
    const statusList = ['Todas', 'Aguardando Atendimento', 'Agendamento Liberado', 'Agendado', 'Em Análise', 'Concluído', 'Não Classificado'];

    const filteredAgendamentos = agendamentos.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
            (item.dadosUsuario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.id?.toLowerCase() || '').includes(searchLower);

        const matchesStatus = filterStatus === 'Todas' || item.status === filterStatus;

        let matchesDate = true;
        const appDateStr = item.appointmentDate; // Formato YYYY-MM-DD tipicamente

        if (filterDateFrom || filterDateTo) {
            if (appDateStr) {
                if (filterDateFrom && appDateStr < filterDateFrom) matchesDate = false;
                if (filterDateTo && appDateStr > filterDateTo) matchesDate = false;
            } else {
                matchesDate = false; // Se não tem data mas o filtro exige data
            }
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    const totalPages = Math.ceil(filteredAgendamentos.length / itemsPerPage);
    const paginatedItems = filteredAgendamentos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handlePageChange = (page) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleFilterChange = () => setCurrentPage(1);

    /* ── Ações do Modal ── */
    const sendNotification = async (solicitacao) => {
        if (!solicitacao.userId || solicitacao.userId === 'anonimo') return;
        const notificacoesRef = ref(db, 'notifications');
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            isRead: false,
            protocolo: solicitacao.id,
            targetUserId: solicitacao.userId,
            timestamp: serverTimestamp(),
            tituloNotification: "Seu agendamento foi atualizado.",
            descricaoNotification: "Verifique os detalhes no aplicativo da Câmara Municipal.",
            userEmail: solicitacao.dadosUsuario?.email,
            userId: solicitacao.userId
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = ref(db, `${config.cityCollection}/balcao-cidadao/${id}`);
        await update(itemRef, { status: newStatus });
        await sendNotification({ ...selectedSolicitacao, id, status: newStatus });
        alert('Status atualizado!');
        setSelectedSolicitacao(null);
        fetchAgendamentos(); // Atualiza a lista após mudança de status
    };

    const handleSendMessage = async (id, text) => {
        const messagesRef = ref(db, `${config.cityCollection}/balcao-cidadao/${id}/messages`);
        const newMessageRef = push(messagesRef);
        await set(newMessageRef, { text, sender: 'admin', timestamp: serverTimestamp() });
        await sendNotification({ ...selectedSolicitacao, id });
        alert('Mensagem enviada!');
    };

    const handleNotifyUser = async (solicitacao) => {
        const userData = solicitacao.dadosUsuario;
        if (!userData || !userData.id) return alert("Usuário não identificado.");
        const notificacoesRef = ref(db, 'notificacoes');
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            userId: userData.id,
            userEmail: userData.email,
            message: `Seu agendamento no Balcão do Cidadão para ${solicitacao.dadosSolicitacao?.appointmentDate} foi atualizado.`,
            timestamp: serverTimestamp(),
            read: false,
        });
        alert(`Usuário ${userData.email} notificado!`);
    };

    const handleAdminFileUpload = async (id, file) => {
        if (!file) return;
        try {
            const targetUserId = selectedSolicitacao?.userId || 'admin-upload';
            const folderPath = `${config.cityCollection}/balcao-cidadao/${targetUserId}/anexos`;
            const uploadResult = await uploadFileToStorage(file, folderPath);

            const fileData = { 
                name: file.name, 
                type: file.type, 
                url: uploadResult.url,
                data: uploadResult.url, // Fallback
                sender: 'admin', 
                timestamp: serverTimestamp() 
            };

            const itemRef = ref(db, `${config.cityCollection}/balcao-cidadao/${id}`);
            const snapshot = await get(itemRef);
            const currentData = snapshot.val();
            const currentFiles = currentData.arquivos || [];
            await update(itemRef, { arquivos: [...currentFiles, fileData] });
            alert("Arquivo enviado!");
        } catch (error) {
            console.error("Erro no upload admin:", error);
            alert("Erro ao enviar arquivo.");
        }
    };

    const clearFilters = () => {
        setSearchTerm('');
        setFilterStatus('Todas');
        setFilterDateFrom('');
        setFilterDateTo('');
        setCurrentPage(1);
    };

    const hasActiveFilters = searchTerm || filterStatus !== 'Todas' || filterDateFrom || filterDateTo;

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    // (Resumo de agendamentos)

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                {/* Header */}
                <header className="page-header-container">
                    <div className="header-title-section">
                        <button
                            onClick={() => navigate('/admin-balcao')}
                            className="btn-secondary"
                            style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                        >
                            <LiaArrowLeftSolid size={18} /> Voltar ao Dashboard
                        </button>
                        <h1>Agendamentos Realizados</h1>
                        <p>Balcão do Cidadão — {filteredAgendamentos.length} pessoa{filteredAgendamentos.length === 1 ? '' : 's'} com agendamento marcado.</p>
                        <button onClick={fetchAgendamentos} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                            ↻ Atualizar dados
                        </button>
                    </div>
                </header>

                {/* Barra de pesquisa e filtros */}
                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Campo de busca */}
                        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                            <LiaSearchSolid style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por nome ou protocolo..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); handleFilterChange(); }}
                                className="form-input"
                                style={{ paddingLeft: '42px', margin: 0 }}
                            />
                        </div>

                        {/* Botão toggle filtros */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={showFilters ? 'btn-primary' : 'btn-secondary'}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                        >
                            <LiaFilterSolid size={18} />
                            Filtros {hasActiveFilters && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', marginLeft: '2px' }}>!</span>}
                        </button>

                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                                Limpar filtros
                            </button>
                        )}
                    </div>

                    {/* Painel de filtros avançados */}
                    {showFilters && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Status</label>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => { setFilterStatus(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                >
                                    {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Agendado de (Data do evento)</label>
                                <input
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={(e) => { setFilterDateFrom(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Agendado até (Data do evento)</label>
                                <input
                                    type="date"
                                    value={filterDateTo}
                                    onChange={(e) => { setFilterDateTo(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Lista completa */}
                <div className="data-card">
                    <div className="card-header">
                        <h3>Lista de Agendamentos</h3>
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            Página {currentPage} de {totalPages || 1}
                        </span>
                    </div>

                    {loading && <p>Carregando agendamentos...</p>}

                    {!loading && filteredAgendamentos.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                            <p style={{ fontSize: '1.1rem' }}>Nenhum agendamento encontrado.</p>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="btn-secondary" style={{ marginTop: '12px' }}>
                                    Limpar filtros
                                </button>
                            )}
                        </div>
                    )}

                    <ul className="data-list">
                        {paginatedItems.map((item, index) => {
                            const dateStr = item.appointmentDate;
                            const timeStr = item.appointmentTime;
                            const isPast = dateStr && new Date(dateStr + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));

                            return (
                                <li
                                    key={item.id}
                                    className="data-list-item"
                                    onClick={() => setSelectedSolicitacao(item)}
                                    style={{ cursor: 'pointer', opacity: isPast ? 0.6 : 1 }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                                        <div style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            background: 'var(--primary-color, #2563eb)', color: '#fff',
                                            padding: '8px 12px', borderRadius: '8px', minWidth: '80px', textAlign: 'center'
                                        }}>
                                            <strong style={{ fontSize: '1.1rem', lineHeight: '1' }}>{dateStr?.split('-').reverse().join('/') || 'Sem data'}</strong>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '500', opacity: 0.9, marginTop: '4px' }}>{timeStr || '--:--'}</span>
                                        </div>

                                        <div className="item-main-info">
                                            <strong style={{ fontSize: '1.05rem' }}>{item.dadosUsuario?.name || 'Solicitante Desconhecido'}</strong>
                                            <span style={{ color: '#4b5563', fontSize: '0.9rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                Motivo: {item.dadosSolicitacao?.descricao || 'Não informado'}
                                            </span>
                                            {item.timestamp && (
                                                <span style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '4px' }}>
                                                    Realizado em {new Date(item.timestamp).toLocaleString('pt-BR')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge status-${item.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>
                                            {item.status || 'Pendente'}
                                        </span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Paginação */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="btn-secondary"
                                style={{ padding: '6px 14px', opacity: currentPage === 1 ? 0.4 : 1 }}
                            >
                                ‹ Anterior
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => handlePageChange(page)}
                                    className={currentPage === page ? 'btn-primary' : 'btn-secondary'}
                                    style={{ padding: '6px 12px', minWidth: '38px' }}
                                >
                                    {page}
                                </button>
                            ))}

                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="btn-secondary"
                                style={{ padding: '6px 14px', opacity: currentPage === totalPages ? 0.4 : 1 }}
                            >
                                Próxima ›
                            </button>
                        </div>
                    )}
                </div>

                {/* Modal */}
                <SolicitacaoBalcaoModal
                    solicitacao={selectedSolicitacao}
                    onClose={() => setSelectedSolicitacao(null)}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleAdminFileUpload}
                    onNotifyUser={handleNotifyUser}
                />
            </div>
        </div>
    );
};

export default AdminBalcaoAgendamentos;
