import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection, query, where, getDocs, doc, updateDoc,
    getDoc, addDoc, serverTimestamp, limit
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

const normalizeAppointmentDate = (dateValue) => {
    if (!dateValue) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;

    const brDateMatch = dateValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brDateMatch) {
        const [, day, month, year] = brDateMatch;
        return `${year}-${month}-${day}`;
    }

    return dateValue;
};

const formatAppointmentDate = (dateValue) => {
    const normalizedDate = normalizeAppointmentDate(dateValue);
    if (!normalizedDate) return 'Sem data';
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        return normalizedDate.split('-').reverse().join('/');
    }
    return dateValue;
};

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
                const userRef = doc(firestore, 'users', userId);
                try {
                    const snapshot = await getDoc(userRef);
                    setConsumerProfile(snapshot.exists() ? snapshot.data() : solicitacao.dadosUsuario);
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

            const itemRef = doc(firestore, 'balcao-cidadao', solicitacao.id);

            await updateDoc(itemRef, {
                [`dadosSolicitacao.anexos.${category}.${index}.url`]: uploadResult.url,
                [`dadosSolicitacao.anexos.${category}.${index}.data`]: uploadResult.url
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

/* ─── Página principal de Agendamentos ─── */
const AdminBalcaoAgendamentos = () => {
    const navigate = useNavigate();

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [agendamentos, setAgendamentos] = useState([]);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);
    const [selectedItems, setSelectedItems] = useState([]);
    const [bulkStatus, setBulkStatus] = useState('');

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAssunto, setFilterAssunto] = useState('Todos');
    const [filterBeneficiario, setFilterBeneficiario] = useState('');
    const [filterParentesco, setFilterParentesco] = useState('Todos');
    const [filterEmail, setFilterEmail] = useState('');
    const [filterTelefone, setFilterTelefone] = useState('');
    const [filterTipoDocumento, setFilterTipoDocumento] = useState('');
    const [filterEstadoCivil, setFilterEstadoCivil] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Paginação Local
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const hasActiveFilters = !!(searchTerm || filterAssunto !== 'Todos' || filterDateFrom || filterDateTo || filterBeneficiario || filterParentesco !== 'Todos' || filterEmail || filterTelefone || filterTipoDocumento || filterEstadoCivil);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchAgendamentos = useCallback(async () => {
        setLoading(true);
        try {
            const solicitacoesRef = collection(firestore, 'balcao-cidadao');
            let q;

            // Buscamos apenas os agendamentos confirmados
            q = query(solicitacoesRef, where('status', '==', 'Agendado'), limit(1000));

            const snapshot = await getDocs(q);
            const fetchedData = !snapshot.empty
                ? snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        const appointmentDate = data.appointmentDate || data.dadosSolicitacao?.appointmentDate;
                        return {
                            id: doc.id,
                            ...data,
                            // Extraímos a data e hora de agendamento aqui para que o .filter abaixo funcione
                            appointmentDate,
                            appointmentDateNormalized: normalizeAppointmentDate(appointmentDate),
                            appointmentTime: data.appointmentTime || data.dadosSolicitacao?.appointmentTime
                        };
                    })
                    .sort((a, b) => {
                        // Ordenação local (JS) para garantir que os mais recentes apareçam primeiro
                        const dateTimeA = `${a.appointmentDateNormalized || '0000-00-00'}T${a.appointmentTime || '00:00'}`;
                        const dateTimeB = `${b.appointmentDateNormalized || '0000-00-00'}T${b.appointmentTime || '00:00'}`;
                        return dateTimeB.localeCompare(dateTimeA);
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
        setCurrentPage(1);
        fetchAgendamentos();
    }, [isAuthReady, fetchAgendamentos]);

    /* ── Filtragem ── */
    const filteredAgendamentos = agendamentos.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
            (item.dadosSolicitacao?.assunto?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosUsuario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosBeneficiario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.id?.toLowerCase() || '').includes(searchLower);

        // Adicionando filtros locais para consistência
        const matchesAssunto = filterAssunto === 'Todos' || (item.dadosSolicitacao?.assunto || item.assunto) === filterAssunto;

        // Filtro por Beneficiário
        const beneficiarioName = (item.dadosBeneficiario?.id === 'outro' ? item.dadosBeneficiario?.name : item.dadosUsuario?.name) || '';
        const matchesBeneficiario = !filterBeneficiario || beneficiarioName.toLowerCase().includes(filterBeneficiario.toLowerCase());

        // Filtro por Parentesco
        const parentesco = item.dadosBeneficiario?.parentesco || '';
        const matchesParentesco = filterParentesco === 'Todos' ||
            (filterParentesco === 'Próprio Solicitante'
                ? (!item.dadosBeneficiario || item.dadosBeneficiario?.id !== 'outro')
                : parentesco.toLowerCase() === filterParentesco.toLowerCase());

        // Filtro por E-mail
        const email = (item.dadosUsuario?.email || '').toLowerCase();
        const matchesEmail = !filterEmail || email.includes(filterEmail.toLowerCase());

        // Filtro por Telefone
        const allTelefones = `${item.dadosUsuario?.telefone || ''} ${item.dadosUsuario?.phone || ''} ${item.dadosBeneficiario?.phone || ''}`.replace(/\D/g, '');
        const searchTelefone = filterTelefone.replace(/\D/g, '');
        const matchesTelefone = !filterTelefone || allTelefones.includes(searchTelefone);

        // Filtro por Tipo de Documento
        const tipoDoc = item.dadosSolicitacao?.tipoDocumento || '';
        const matchesTipoDoc = !filterTipoDocumento || tipoDoc.toLowerCase().includes(filterTipoDocumento.toLowerCase());

        // Filtro por Estado Civil
        const detalhes = item.dadosSolicitacao?.detalhes || {};
        const estadoCivilKeys = Object.keys(detalhes).filter(k => k.toLowerCase().includes('estado civil') || k.toLowerCase().includes('estadocivil'));
        const estadoCivilVal = estadoCivilKeys.length > 0 ? detalhes[estadoCivilKeys[0]] : '';
        const matchesEstadoCivil = !filterEstadoCivil || (estadoCivilVal && estadoCivilVal.toLowerCase().includes(filterEstadoCivil.toLowerCase()));

        // Filtro por Data Agendada
        let matchesDate = true;
        if (filterDateFrom || filterDateTo) {
            const dateStr = item.appointmentDateNormalized;
            if (dateStr) {
                if (filterDateFrom && dateStr < filterDateFrom) matchesDate = false;
                if (filterDateTo && dateStr > filterDateTo) matchesDate = false;
            } else {
                matchesDate = false;
            }
        }

        return matchesSearch && matchesAssunto && matchesDate && matchesBeneficiario && matchesParentesco && matchesEmail && matchesTelefone && matchesTipoDoc && matchesEstadoCivil;
    });

    const totalPages = Math.ceil(filteredAgendamentos.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredAgendamentos.slice(startIndex, startIndex + itemsPerPage);

    const handleNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
    };

    const handlePrevPage = () => {
        if (currentPage > 1) setCurrentPage(prev => prev - 1);
    };

    const handleResetPagination = () => {
        setCurrentPage(1);
    };

    const handleFilterChange = () => { setCurrentPage(1); };

    /* ── Ações do Modal ── */
    const sendNotification = async (solicitacao) => {
        if (!solicitacao.userId || solicitacao.userId === "anonimo" || !solicitacao.dadosUsuario?.email) {
            console.log("Usuário anônimo ou sem e-mail, notificação não enviada.");
            return;
        }

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = "Seu agendamento foi atualizado.";
        const notificationDescription = `Verifique os detalhes no aplicativo da Câmara Municipal de ${cityName}. Protocolo: ${solicitacao.id}.`;

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

        const mailRef = collection(firestore, 'mail');
        await addDoc(mailRef, {
            to: solicitacao.dadosUsuario.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
            },
            timestamp: serverTimestamp()
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = doc(firestore, 'balcao-cidadao', id);
        let updateData = { status: newStatus };
        if (newStatus === 'Concluído' || newStatus === 'Cancelado') {
            updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000; // Agenda para 5 dias
        } else {
            updateData.deletionTimestamp = null; // Cancela exclusão se voltar a ativo
        }

        await updateDoc(itemRef, updateData);
        await sendNotification({ ...selectedSolicitacao, id, status: newStatus });
        alert('Status atualizado!');
        setSelectedSolicitacao(null);
        fetchAgendamentos(); // Atualiza a lista após mudança de status
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const newSelections = paginatedItems.map(item => item.id).filter(id => !selectedItems.includes(id));
            setSelectedItems([...selectedItems, ...newSelections]);
        } else {
            const idsToRemove = paginatedItems.map(item => item.id);
            setSelectedItems(selectedItems.filter(id => !idsToRemove.includes(id)));
        }
    };

    const handleSelectItem = (id) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(selectedItems.filter(itemId => itemId !== id));
        } else {
            setSelectedItems([...selectedItems, id]);
        }
    };

    const handleBulkStatusChange = async () => {
        if (selectedItems.length === 0) {
            alert('Selecione pelo menos um agendamento.');
            return;
        }
        if (!bulkStatus) {
            alert('Selecione um status para aplicar.');
            return;
        }
        if (!window.confirm(`Tem certeza que deseja alterar o status de ${selectedItems.length} agendamento(s) para "${bulkStatus}"?`)) {
            return;
        }

        setLoading(true);
        try {
            await Promise.all(selectedItems.map(async (id) => {
                const itemRef = doc(firestore, 'balcao-cidadao', id);
                let updateData = { status: bulkStatus };
                if (bulkStatus === 'Concluído' || bulkStatus === 'Cancelado') {
                    updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
                } else {
                    updateData.deletionTimestamp = null;
                }

                await updateDoc(itemRef, updateData);

                const item = agendamentos.find(a => a.id === id);
                if (item) {
                    await sendNotification({ ...item, status: bulkStatus });
                }
            }));

            alert('Status atualizado com sucesso!');
            setSelectedItems([]);
            setBulkStatus('');
            fetchAgendamentos();
        } catch (error) {
            console.error('Erro na atualização em massa:', error);
            alert('Erro ao atualizar status.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (id, text) => {
        const itemRef = doc(firestore, 'balcao-cidadao', id);
        const newMessageId = Date.now().toString();
        const newMessage = { text, sender: 'admin', timestamp: new Date().toISOString() };

        await updateDoc(itemRef, { [`messages.${newMessageId}`]: newMessage });

        await sendNotification({ ...selectedSolicitacao, id });
        alert('Mensagem enviada!');
    };

    const handleNotifyUser = async (solicitacao) => {
        const userData = solicitacao.dadosUsuario;
        if (!userData || !userData.id) return alert("Usuário não identificado.");
        if (!userData.email) return alert("E-mail do usuário não encontrado.");

        const notificationTitle = "Notificação de Atualização";
        const notificationMessage = `Seu agendamento no Balcão do Cidadão para ${solicitacao.dadosSolicitacao?.appointmentDate} foi atualizada.`;

        const notificacoesRef = collection(firestore, 'notifications');
        await addDoc(notificacoesRef, {
            userId: userData.id,
            userEmail: userData.email,
            message: notificationMessage,
            timestamp: serverTimestamp(),
            read: false,
            protocolo: solicitacao.id
        });

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

            const itemRef = doc(firestore, 'balcao-cidadao', id);
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
        setFilterAssunto('Todos');
        setFilterBeneficiario('');
        setFilterParentesco('Todos');
        setFilterEmail('');
        setFilterTelefone('');
        setFilterTipoDocumento('');
        setFilterEstadoCivil('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setCurrentPage(1);
        setSelectedItems([]);
    };

    const assuntosList = ['Todos', 'Informações Gerais', 'Emissão de Documentos', 'Agendamento', 'Outros'];
    const parentescoList = ['Todos', 'Próprio Solicitante', 'Cônjuge', 'Filho(a)', 'Pai', 'Mãe', 'Irmão(ã)', 'Avô(ó)', 'Tio(a)', 'Sobrinho(a)', 'Outro'];

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
                                <label>Assunto</label>
                                <select
                                    value={filterAssunto}
                                    onChange={(e) => { setFilterAssunto(e.target.value); handleFilterChange(); }}
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
                                    onChange={(e) => { setFilterBeneficiario(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Parentesco</label>
                                <select
                                    value={filterParentesco}
                                    onChange={(e) => { setFilterParentesco(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                >
                                    {parentescoList.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>E-mail</label>
                                <input
                                    type="email"
                                    placeholder="E-mail do solicitante"
                                    value={filterEmail}
                                    onChange={(e) => { setFilterEmail(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Telefone</label>
                                <input
                                    type="text"
                                    placeholder="Telefone"
                                    value={filterTelefone}
                                    onChange={(e) => { setFilterTelefone(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Tipo de Documento</label>
                                <input
                                    type="text"
                                    placeholder="Ex: RG, CNH..."
                                    value={filterTipoDocumento}
                                    onChange={(e) => { setFilterTipoDocumento(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Estado Civil</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Solteiro(a)..."
                                    value={filterEstadoCivil}
                                    onChange={(e) => { setFilterEstadoCivil(e.target.value); handleFilterChange(); }}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
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
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3>Lista de Agendamentos</h3>
                            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                Página {currentPage} {hasActiveFilters && '(Resultados filtrados)'}
                            </span>
                        </div>
                        {selectedItems.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f3f4f6', padding: '8px 12px', borderRadius: '8px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{selectedItems.length} selecionado(s)</span>
                                <select 
                                    value={bulkStatus} 
                                    onChange={(e) => setBulkStatus(e.target.value)} 
                                    className="form-input" 
                                    style={{ margin: 0, minWidth: '180px', padding: '6px 10px', height: 'auto' }}
                                >
                                    <option value="">Alterar status para...</option>
                                    <option value="Agendamento Liberado">Agendamento Liberado</option>
                                    <option value="Agendado">Agendado</option>
                                    <option value="Aguardando Atendimento">Aguardando Atendimento</option>
                                    <option value="Em Análise">Em Análise</option>
                                    <option value="Concluído">Concluído</option>
                                    <option value="Documentação Reprovada">Documentação Reprovada</option>
                                    <option value="Documentação Reenviada">Documentação Reenviada</option>
                                    <option value="Cancelado">Cancelado</option>
                                </select>
                                <button onClick={handleBulkStatusChange} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                                    Aplicar
                                </button>
                            </div>
                        )}
                    </div>

                    {!loading && paginatedItems.length > 0 && (
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input 
                                type="checkbox" 
                                checked={paginatedItems.length > 0 && paginatedItems.every(item => selectedItems.includes(item.id))}
                                onChange={handleSelectAll}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', color: '#4b5563', fontWeight: '500' }}>Selecionar todos desta página</span>
                        </div>
                    )}

                    {loading && <p style={{ padding: '16px' }}>Carregando agendamentos...</p>}

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
                            const normalizedDateStr = item.appointmentDateNormalized;
                            const timeStr = item.appointmentTime;
                            const isPast = normalizedDateStr && new Date(normalizedDateStr + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));

                            return (
                                <li
                                    key={item.id}
                                    className="data-list-item"
                                    onClick={() => setSelectedSolicitacao(item)}
                                    style={{ cursor: 'pointer', opacity: isPast ? 0.6 : 1, display: 'flex', alignItems: 'center' }}
                                >
                                    <div style={{ marginRight: '16px' }} onClick={(e) => e.stopPropagation()}>
                                        <input 
                                            type="checkbox"
                                            checked={selectedItems.includes(item.id)}
                                            onChange={() => handleSelectItem(item.id)}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                                        <div style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            background: 'var(--primary-color, #2563eb)', color: '#fff',
                                            padding: '8px 12px', borderRadius: '8px', minWidth: '80px', textAlign: 'center'
                                        }}>
                                            <strong style={{ fontSize: '1.1rem', lineHeight: '1' }}>{formatAppointmentDate(dateStr)}</strong>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '500', opacity: 0.9, marginTop: '4px' }}>{timeStr || '--:--'}</span>
                                        </div>

                                        <div className="item-main-info">
                                            <strong style={{ fontSize: '1.05rem' }}>{item.dadosUsuario?.name || 'Solicitante Desconhecido'}</strong>
                                            {item.dadosBeneficiario?.id === 'outro' && (
                                                <span style={{ fontSize: '0.8rem', color: '#ef4444', fontStyle: 'italic', marginBottom: '4px', display: 'block' }}>Beneficiário: {item.dadosBeneficiario.name}</span>
                                            )}
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
                    {!loading && filteredAgendamentos.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
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

                            <span style={{ fontSize: '0.9rem', color: '#4b5563', margin: '0 8px' }}>
                                Página {currentPage} de {totalPages}
                            </span>

                            <button
                                onClick={handleNextPage}
                                disabled={currentPage >= totalPages}
                                className="btn-primary"
                                style={{ padding: '6px 20px', opacity: currentPage >= totalPages ? 0.4 : 1 }}
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
                />
            </div>
        </div>
    );
};

export default AdminBalcaoAgendamentos;
