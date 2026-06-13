import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, doc, getDocs, query, orderBy, limit, startAfter, 
    updateDoc, addDoc, where, getDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import {
    LiaTimesSolid, LiaUploadSolid, LiaBellSolid, LiaPaperPlane,
    LiaPaperclipSolid, LiaSearchSolid, LiaArrowLeftSolid, LiaFilterSolid, LiaDownloadSolid
} from "react-icons/lia";
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { buildReadMessagesUpdate, countUnreadAdminMessages } from '../../utils/adminMessages';

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

/* ─── Modal de Detalhes (mesmo componente do AdminBalcao) ─── */
const SolicitacaoBalcaoModal = ({ solicitacao, onClose, onStatusChange, onSendMessage, onFileUpload, onNotifyUser, userProfilesCache, setUserProfilesCache }) => {
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

                // Verificar cache primeiro
                if (userProfilesCache[userId]) {
                    setConsumerProfile(userProfilesCache[userId]);
                    setLoadingProfile(false);
                    return;
                }

                setLoadingProfile(true);
                const userRef = doc(firestore, 'users', userId);
                try {
                    const docSnap = await getDoc(userRef);
                    const profile = docSnap.exists() ? docSnap.data() : solicitacao.dadosUsuario;
                    setConsumerProfile(profile);
                    // Atualizar cache
                    setUserProfilesCache(prev => ({ ...prev, [userId]: profile }));
                } catch (error) {
                    setConsumerProfile(solicitacao.dadosUsuario);
                } finally {
                    setLoadingProfile(false);
                }
            };
            fetchConsumerProfile();
        }
    }, [solicitacao, userProfilesCache, setUserProfilesCache]);

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
            
            const itemRef = doc(firestore, 'balcao-cidadao', solicitacao.id);
            
            await updateDoc(itemRef, {
                [`dadosSolicitacao.anexos.${category}.${index}`]: {
                    url: uploadResult.url,
                    data: uploadResult.url 
                }
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

                    {solicitacao.dadosBeneficiario && solicitacao.dadosBeneficiario.id === 'outro' && (
                        <div className="data-card" style={{ marginTop: '20px' }}>
                            <div className="card-header"><h3>Dados do Beneficiário</h3></div>
                            <div className="detail-item"><strong>Nome:</strong> {solicitacao.dadosBeneficiario.name || 'N/A'}</div>
                            <div className="detail-item"><strong>CPF:</strong> {solicitacao.dadosBeneficiario.cpf || 'N/A'}</div>
                            <div className="detail-item"><strong>Telefone:</strong> {solicitacao.dadosBeneficiario.phone || 'N/A'}</div>
                            <div className="detail-item"><strong>Parentesco:</strong> {solicitacao.dadosBeneficiario.parentesco || 'N/A'}</div>
                        </div>
                    )}

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
                                <option value="Documentação Reprovada">Documentação Reprovada</option>
                                <option value="Documentação Reenviada">Documentação Reenviada</option>
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
                        <button onClick={handleNotifyUser} className="btn-submit"><LiaBellSolid /> Notificar Usuário</button>
                    </div>
                </div>
            </div>
        </div>
        <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </>
    );
};

/* ─── Página principal ─── */
const AdminBalcaoSolicitacoes = () => {
    const navigate = useNavigate();

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [firstKey, setFirstKey] = useState(null); // Chave do primeiro item da página atual
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Todas');
    const [filterAssunto, setFilterAssunto] = useState('Todos');
    const [filterBeneficiario, setFilterBeneficiario] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Paginação e Filtros
    const [currentPage, setCurrentPage] = useState(1);
    const [cursors, setCursors] = useState([null]); // Histórico de cursores para navegação
    const itemsPerPage = 15; 
    const [isLastPage, setIsLastPage] = useState(false);
    const hasActiveFilters = !!(searchTerm || filterStatus !== 'Todas' || filterAssunto !== 'Todos' || filterBeneficiario || filterDateFrom || filterDateTo);

    // Cache para perfis de usuários
    const [userProfilesCache, setUserProfilesCache] = useState({});

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchSolicitacoes = useCallback(async (cursor = null, filtering = false) => {
        setLoading(true);
        try {
            const solicitacoesRef = collection(firestore, 'balcao-cidadao');
            
            // Para evitar erros de índice composto no Firestore ao combinar filtros e ordenação,
            let q = query(solicitacoesRef);

            if (!filtering) { // Only apply orderBy, startAfter, and limit for standard pagination
                q = query(q, orderBy('dataSolicitacao', 'desc'));
            }

            // Aplicar filtros diretamente na query do Firestore para consultar em todo o banco
            if (filterStatus !== 'Todas') {
                q = query(q, where('status', '==', filterStatus));
            }
            if (filterAssunto !== 'Todos') {
                q = query(q, where('dadosSolicitacao.assunto', '==', filterAssunto));
            }

            if (!filtering) { // Apply pagination only if no filters are active
                if (cursor) {
                    q = query(q, startAfter(cursor));
                }
                q = query(q, limit(itemsPerPage));
            }
            

            const snapshot = await getDocs(q);
            const fetchedData = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                timestamp: doc.data().dataSolicitacao?.toMillis 
                    ? doc.data().dataSolicitacao.toMillis() 
                    : (doc.data().dataSolicitacao instanceof Date 
                        ? doc.data().dataSolicitacao.getTime() 
                        : new Date(doc.data().dataSolicitacao).getTime())
            })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Ordenação local garantida

            setSolicitacoes(fetchedData);
            setFirstKey(snapshot.docs[snapshot.docs.length - 1] || null); // Keep track of last doc for next page
            setIsLastPage(filtering || snapshot.docs.length < itemsPerPage); // If filtering, assume it's the "last page" for pagination controls
        } catch (error) {
            console.error('Erro ao buscar solicitações:', error);
        } finally {
            setLoading(false); 
        }
    }, [itemsPerPage, filterStatus, filterAssunto]);

    useEffect(() => {
        if (!isAuthReady) return;
        
        setCurrentPage(1);
        setCursors([null]);
        fetchSolicitacoes(null, hasActiveFilters);

        // Limpeza automática de solicitações antigas (com deletionTimestamp expirado)
        const cleanupOldSolicitacoes = async () => {
            try {
                const solicitacoesRef = collection(firestore, 'balcao-cidadao');
                const now = Date.now();
                const q = query(solicitacoesRef, where('deletionTimestamp', '<=', now), where('deletionTimestamp', '!=', null));
                const snapshot = await getDocs(q);
                
                if (!snapshot.empty) {
                    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                    await Promise.all(deletePromises);
                    console.log(`Limpeza automática: ${snapshot.docs.length} solicitações removidas.`);
                }
            } catch (error) {
                console.error('Erro na limpeza automática:', error);
            }
        };
        cleanupOldSolicitacoes(); // Run cleanup once on mount
    }, [isAuthReady, filterStatus, filterAssunto, filterDateFrom, filterDateTo, searchTerm, hasActiveFilters, fetchSolicitacoes]);

    const handleNextPage = () => {
        const nextCursor = firstKey;
        setCursors(prev => [...prev, nextCursor]);
        fetchSolicitacoes(nextCursor);
        setCurrentPage(prev => prev + 1);
    };

    const handlePrevPage = () => {
        if (currentPage <= 1) return;
        const newHistory = cursors.slice(0, -1);
        const targetCursor = newHistory[newHistory.length - 1];
        fetchSolicitacoes(targetCursor); // Fetch the page after the target cursor
        setCursors(newHistory);
        setCurrentPage(prev => prev - 1);
    };

    const handleResetPagination = () => {
        setCurrentPage(1);
        setCursors([null]);
        setSearchTerm('');
        setFilterStatus('Todas');
        setFilterAssunto('Todos');
        setFilterBeneficiario('');
        fetchSolicitacoes(null);
    };

    /* ── Filtragem ── */
    const assuntosList = ['Todos', 'Informações Gerais', 'Emissão de Documentos', 'Agendamento', 'Outros'];
    const statusList = ['Todas', 'Aguardando Atendimento', 'Agendamento Liberado', 'Agendado', 'Em Análise', 'Documentação Reprovada', 'Documentação Reenviada', 'Concluído', 'Não Classificado'];

    const filteredSolicitacoes = solicitacoes.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        
        // Filtro de Busca
        const matchesSearch =
            (item.dadosSolicitacao?.assunto?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosUsuario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosBeneficiario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosBeneficiario?.cpf?.toLowerCase() || '').includes(searchLower) ||
            (item.id?.toLowerCase() || '').includes(searchLower);

        // Filtros de Status e Assunto (Garante funcionamento mesmo sem índice no Firestore)
        const matchesStatus = filterStatus === 'Todas' || item.status === filterStatus;
        const matchesAssunto = filterAssunto === 'Todos' || item.dadosSolicitacao?.assunto === filterAssunto;
        const beneficiarioText = `${item.dadosBeneficiario?.name || ''} ${item.dadosUsuario?.name || ''}`;
        const matchesBeneficiario = !filterBeneficiario || beneficiarioText.toLowerCase().includes(filterBeneficiario.toLowerCase());

        // Filtro de Data Local (para evitar erros de índice composto no Firestore)
        const itemTime = item.timestamp;
        const matchesDateFrom = !filterDateFrom || itemTime >= new Date(filterDateFrom + "T00:00:00").getTime();
        const matchesDateTo = !filterDateTo || itemTime <= new Date(filterDateTo + "T23:59:59").getTime();

        return matchesSearch && matchesStatus && matchesAssunto && matchesBeneficiario && matchesDateFrom && matchesDateTo;
    });

    const paginatedFilteredSolicitacoes = filteredSolicitacoes;

    const handleOpenSolicitacao = async (item) => {
        setSelectedSolicitacao(item);

        const updates = buildReadMessagesUpdate(item.messages);
        if (Object.keys(updates).length === 0) return;

        try {
            await updateDoc(doc(firestore, 'balcao-cidadao', item.id), updates);
            setSolicitacoes(prev => prev.map(solicitacao => (
                solicitacao.id === item.id
                    ? {
                        ...solicitacao,
                        messages: Object.entries(solicitacao.messages || {}).reduce((acc, [id, message]) => {
                            acc[id] = message.sender !== 'admin' ? { ...message, readByAdmin: true } : message;
                            return acc;
                        }, {}),
                    }
                    : solicitacao
            )));
        } catch (error) {
            console.error('Erro ao marcar mensagens como lidas:', error);
        }
    };
    const sendNotification = async (solicitacao, customMessage) => {
        if (!solicitacao.userId || solicitacao.userId === "anonimo" || !solicitacao.dadosUsuario?.email) {
            console.log("Usuário anônimo ou sem e-mail, notificação não enviada.");
            return;
        }

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = customMessage?.title || "Sua solicitação para o Balcão do cidadão teve movimentação.";
        const notificationDescription = customMessage?.body || `Abra agora mesmo o aplicativo da Câmara Municipal de ${cityName} para acompanhar. Protocolo: ${solicitacao.id}.`;

        try {
            // Adicionar notificação no Firestore
            const notificacoesRef = collection(firestore, 'notifications');
            await addDoc(notificacoesRef, {
                isRead: false,
                protocolo: solicitacao.id,
                targetUserId: solicitacao.userId,
                timestamp: new Date(),
                tituloNotification: notificationTitle,
                descricaoNotification: notificationDescription,
                userEmail: solicitacao.dadosUsuario.email,
                userId: solicitacao.userId
            });

            // Adicionar email no Firestore
            const mailRef = collection(firestore, 'mail');
            await addDoc(mailRef, {
                to: solicitacao.dadosUsuario.email,
                message: {
                    subject: notificationTitle,
                    html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
                },
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            const itemRef = doc(firestore, 'balcao-cidadao', id);
            let updateData = { status: newStatus };
            if (newStatus === 'Concluído' || newStatus === 'Cancelado') {
                updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
            } else {
                updateData.deletionTimestamp = null; // Clear if status is changed from Cancelado
            }
            await updateDoc(itemRef, updateData);
            await sendNotification(
                { ...selectedSolicitacao, id, status: newStatus },
                { title: "Status de Solicitação Atualizado", body: `O status da sua solicitação (Protocolo: ${id}) foi alterado para: ${newStatus}.` }
            );
            alert('Status atualizado!');
            setSelectedSolicitacao(null);
            fetchSolicitacoes(); // Atualiza a lista
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            alert('Erro ao atualizar status.');
        }
    };

    const handleSendMessage = async (id, text) => {
        try {
            const itemRef = doc(firestore, 'balcao-cidadao', id);
            const docSnap = await getDoc(itemRef);
            
            if (docSnap.exists()) {
                const currentData = docSnap.data();
                const currentMessages = currentData.messages || {};
                
                // Gerar novo ID para a mensagem
                const newMessageId = Date.now().toString();
                const newMessage = { text, sender: 'admin', timestamp: new Date() };
                
                const updatedMessages = {
                    ...currentMessages,
                    [newMessageId]: newMessage
                };
                
                await updateDoc(itemRef, { messages: updatedMessages });
                
                await sendNotification(
                    { ...selectedSolicitacao, id },
                    { title: "Nova Mensagem da Câmara", body: `Você recebeu uma nova resposta administrativa sobre sua solicitação (Protocolo: ${id}): "${text}"` }
                );
                alert('Mensagem enviada!');
            }
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            alert('Erro ao enviar mensagem.');
        }
    };

    const handleNotifyUser = async (solicitacao) => {
        const userData = solicitacao.dadosUsuario;
        if (!userData || !userData.id) return alert("Usuário não identificado.");
        if (!userData.email) return alert("E-mail do usuário não encontrado.");

        const notificationTitle = "Notificação de Atualização";
        const notificationMessage = `Sua solicitação no Balcão do Cidadão sobre "${solicitacao.dadosSolicitacao?.assunto}" foi atualizada.`;

        try {
            // Adicionar notificação no Firestore
            const notificacoesRef = collection(firestore, 'notifications');
            await addDoc(notificacoesRef, {
                userId: userData.id,
                userEmail: userData.email,
                message: notificationMessage,
                timestamp: new Date(),
                read: false,
                protocolo: solicitacao.id
            });

            // Adicionar email no Firestore
            const mailRef = collection(firestore, 'mail');
            await addDoc(mailRef, {
                to: userData.email,
                message: {
                    subject: notificationTitle,
                    html: `<p>${notificationMessage}</p>`,
                },
                timestamp: serverTimestamp()
            });
            
            alert(`Usuário ${userData.email} notificado!`);
        } catch (error) {
            console.error('Erro ao notificar usuário:', error);
            alert('Erro ao notificar usuário.');
        }
    };

    const handleAdminFileUpload = async (id, file) => {
        if (!file) return;
        try {
            // Caminho corrigido: camaraID/balcao-cidadao/uid/anexos
            const targetUserId = selectedSolicitacao?.userId || 'admin-upload';
            const folderPath = `${config.cityCollection}/balcao-cidadao/${targetUserId}/anexos`;
            const uploadResult = await uploadFileToStorage(file, folderPath);
            
            const fileData = { 
                name: file.name, 
                type: file.type, 
                url: uploadResult.url,
                data: uploadResult.url, // Fallback
                sender: 'admin', 
                timestamp: new Date() 
            };

            const itemRef = doc(firestore, 'balcao-cidadao', id);
            const docSnap = await getDoc(itemRef);
            
            if (docSnap.exists()) {
                const currentData = docSnap.data();
                const currentFiles = currentData.arquivos || [];
                await updateDoc(itemRef, { arquivos: [...currentFiles, fileData] });
                alert("Arquivo enviado!");
            }
        } catch (error) {
            console.error("Erro no upload admin:", error);
            alert("Erro ao enviar arquivo.");
        }
    };

    const clearFilters = () => {
        setSearchTerm('');
        setFilterStatus('Todas');
        setFilterAssunto('Todos');
        setFilterBeneficiario('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setCurrentPage(1);
    };

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

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
                        <h1>Solicitações Recentes</h1>
                        <p>Balcão do Cidadão — {filteredSolicitacoes.length} solicitaç{filteredSolicitacoes.length === 1 ? 'ão' : 'ões'} encontrada{filteredSolicitacoes.length === 1 ? '' : 's'}</p>
                        <button onClick={handleResetPagination} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
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

                {/* Barra de pesquisa e filtros */}
                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Campo de busca */}
                        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                            <LiaSearchSolid style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por assunto, solicitante, beneficiário, CPF ou protocolo..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); }}
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
                                    value={filterStatus} // This will trigger useEffect to refetch
                                    onChange={(e) => { setFilterStatus(e.target.value); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                >
                                    {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Assunto</label>
                                <select
                                    value={filterAssunto} // This will trigger useEffect to refetch
                                    onChange={(e) => { setFilterAssunto(e.target.value); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                >
                                    {assuntosList.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Beneficiário</label>
                                <input
                                    type="text"
                                    placeholder="Nome do beneficiário"
                                    value={filterBeneficiario}
                                    onChange={(e) => { setFilterBeneficiario(e.target.value); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Data de (início)</label>
                                <input
                                    type="date" // This will trigger useEffect to refetch
                                    value={filterDateFrom}
                                    onChange={(e) => { setFilterDateFrom(e.target.value); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Data até (fim)</label>
                                <input
                                    type="date" // This will trigger useEffect to refetch
                                    value={filterDateTo}
                                    onChange={(e) => { setFilterDateTo(e.target.value); }}
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
                        <h3>Solicitações ({filteredSolicitacoes.length})</h3>
                    </div>

                    {loading && <p>Carregando...</p>}

                    {!loading && paginatedFilteredSolicitacoes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                            <p style={{ fontSize: '1.1rem' }}>Nenhuma solicitação encontrada.</p>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="btn-secondary" style={{ marginTop: '12px' }}>
                                    Limpar filtros e ver todas
                                </button>
                            )}
                        </div>
                    )}

                    <ul className="data-list">
                        {paginatedFilteredSolicitacoes.map((item, index) => (
                            <li
                                key={item.id}
                                className="data-list-item"
                                onClick={() => handleOpenSolicitacao(item)}
                                style={{ cursor: 'pointer', position: 'relative' }}
                            >
                                {countUnreadAdminMessages(item.messages) > 0 && (
                                    <span className="admin-card-unread-badge">
                                        {countUnreadAdminMessages(item.messages)}
                                    </span>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                    <span style={{
                                        minWidth: '32px', height: '32px', borderRadius: '50%',
                                        background: 'var(--primary-color, #2563eb)', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.8rem', fontWeight: '600', flexShrink: 0
                                    }}>
                                        {((currentPage - 1) * itemsPerPage + index + 1)}
                                    </span>
                                    <div className="item-main-info">
                                        <strong>{item.dadosSolicitacao?.assunto || 'Sem assunto'}</strong>
                                        <span>Solicitante: {item.dadosUsuario?.name || 'N/A'}</span>
                                        {item.dadosBeneficiario?.id === 'outro' && (
                                            <span style={{ fontSize: '0.8rem', color: '#ef4444', fontStyle: 'italic' }}>Beneficiário: {item.dadosBeneficiario.name}</span>
                                        )}
                                        {item.timestamp && (
                                            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                                                {new Date(item.timestamp).toLocaleString('pt-BR')}
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
                        ))}
                    </ul>

                    {/* Paginação Unificada (Server-side via Firestore) */}
                    {!loading && solicitacoes.length > 0 && !hasActiveFilters && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleResetPagination}
                                disabled={currentPage === 1}
                                className="btn-secondary"
                                style={{ padding: '6px 14px', opacity: currentPage === 1 ? 0.4 : 1 }}
                            >
                                ⇤ Primeira Página
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

                {/* Modal */}
                <SolicitacaoBalcaoModal
                    solicitacao={selectedSolicitacao}
                    onClose={() => setSelectedSolicitacao(null)}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleAdminFileUpload}
                    onNotifyUser={handleNotifyUser}
                    userProfilesCache={userProfilesCache}
                    setUserProfilesCache={setUserProfilesCache}
                />
            </div>
        </div>
    );
};

export default AdminBalcaoSolicitacoes;
