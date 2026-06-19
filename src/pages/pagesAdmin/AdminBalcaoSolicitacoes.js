import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, doc, getDocs, query, orderBy, limit, startAfter, 
    updateDoc, addDoc, where, getDoc, deleteDoc, serverTimestamp, runTransaction, setDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import AdminQuickReplies from '../../components/AdminQuickReplies';
import {
    LiaTimesSolid, LiaUploadSolid, LiaBellSolid, LiaPaperPlane,
    LiaPaperclipSolid, LiaSearchSolid, LiaArrowLeftSolid, LiaFilterSolid, LiaDownloadSolid, LiaPrintSolid, LiaPlusSolid
} from "react-icons/lia";
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { buildReadMessagesUpdate, countUnreadAdminMessages } from '../../utils/adminMessages';
import { printProtocolReceipt, printTableReport } from '../../utils/printReport';

const getMessageTimestamp = (timestamp) => {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (timestamp instanceof Date) return timestamp.getTime();
    const time = new Date(timestamp).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const formatChatTime = (timestamp) => {
    const time = getMessageTimestamp(timestamp);
    if (!time) return '';
    return new Date(time).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getOrderedMessages = (messages = {}) => Object.entries(messages)
    .map(([id, msg]) => ({ id, ...msg }))
    .sort((a, b) => getMessageTimestamp(a.timestamp) - getMessageTimestamp(b.timestamp));

const getTodayDateInputValue = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toBrazilianDate = (date) => {
    if (!date) return '';
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
};

const AdminAppointmentSection = ({ solicitacao, onCreateAppointment }) => {
    const [formData, setFormData] = useState({
        appointmentDate: solicitacao?.appointmentDate || '',
        appointmentTime: solicitacao?.appointmentTime || '',
    });
    const [availability, setAvailability] = useState(null);
    const [bookedSlots, setBookedSlots] = useState({});
    const [blockedDates, setBlockedDates] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const todayDate = getTodayDateInputValue();

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            try {
                const [availSnap, bookedSnap, blockedSnap] = await Promise.all([
                    getDoc(doc(firestore, 'balcao-config', 'availability')),
                    getDoc(doc(firestore, 'balcao-config', 'bookedSlots')),
                    getDoc(doc(firestore, 'balcao-config', 'blockedDates')),
                ]);

                const availabilityData = availSnap.exists() ? availSnap.data() : null;
                const bookedData = bookedSnap.exists() ? bookedSnap.data() : {};
                const blockedData = blockedSnap.exists() ? blockedSnap.data().dates || [] : [];

                setAvailability(availabilityData);
                setBookedSlots(bookedData);
                setBlockedDates(blockedData);
            } catch (err) {
                console.error('Erro ao carregar horários:', err);
                setError('Erro ao carregar horários disponíveis.');
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    const updateTimesForDate = (date) => {
        if (!date) {
            setAvailableTimes([]);
            setError('');
            return;
        }

        if (date < todayDate) {
            setAvailableTimes([]);
            setError('Não é possível agendar para uma data anterior a hoje.');
            return;
        }

        const dateBR = toBrazilianDate(date);
        if (!availability || blockedDates.includes(dateBR)) {
            setAvailableTimes([]);
            setError(blockedDates.includes(dateBR) ? 'Este dia está bloqueado para agendamentos.' : 'Nenhuma grade de horários configurada.');
            return;
        }

        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
        const slots = availability[dayOfWeek] || [];
        const booked = bookedSlots[date] || [];
        const freeSlots = slots.filter(slot => !booked.includes(slot) || slot === solicitacao?.appointmentTime);

        setAvailableTimes(freeSlots);
        setError(freeSlots.length === 0 ? 'Não há horários livres para esta data.' : '');
    };

    useEffect(() => {
        if (!loading && formData.appointmentDate) {
            updateTimesForDate(formData.appointmentDate);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    const handleDateChange = (event) => {
        const date = event.target.value;
        setFormData({ appointmentDate: date, appointmentTime: '' });
        updateTimesForDate(date);
    };

    const handleSubmit = async () => {
        if (!formData.appointmentDate || !formData.appointmentTime) {
            setError('Selecione data e horário para criar o agendamento.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            await onCreateAppointment(solicitacao, formData.appointmentDate, formData.appointmentTime);
        } catch (err) {
            setError(err.message || 'Erro ao criar agendamento.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p>Carregando horários disponíveis...</p>;

    return (
        <div className="data-card admin-appointment-card">
            <div className="card-header"><h3>Criar Agendamento</h3></div>
            <p className="detail-description">Escolha um horário disponível para esta solicitação. Ao confirmar, o comprovante será aberto para impressão.</p>

            <div className="form-row status-management-row">
                <div className="form-group">
                    <label>Data</label>
                    <input
                        type="date"
                        value={formData.appointmentDate}
                        min={todayDate}
                        onChange={handleDateChange}
                        className="form-input"
                    />
                </div>
                <div className="form-group">
                    <label>Horário</label>
                    <select
                        value={formData.appointmentTime}
                        onChange={(event) => setFormData(prev => ({ ...prev, appointmentTime: event.target.value }))}
                        className="form-input"
                        disabled={!formData.appointmentDate || availableTimes.length === 0}
                    >
                        <option value="">Selecione</option>
                        {availableTimes.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                </div>
            </div>

            {error && <p className="error-message-inline">{error}</p>}

            <button onClick={handleSubmit} className="btn-primary btn-save-status" disabled={saving}>
                {saving ? 'Criando...' : 'Criar Agendamento e Imprimir'}
            </button>
        </div>
    );
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

const AdminCreateSolicitacaoModal = ({ onClose, onCreate }) => {
    const [form, setForm] = useState({
        assunto: 'Emissão de Documentos',
        tipoDocumento: '',
        descricao: '',
        solicitanteNome: '',
        solicitanteCpf: '',
        solicitanteTelefone: '',
        solicitanteEmail: '',
        beneficiarioNome: '',
        beneficiarioCpf: '',
        beneficiarioTelefone: '',
        parentesco: 'Próprio solicitante',
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.solicitanteNome.trim()) return alert('Informe o nome do solicitante.');
        if (!form.tipoDocumento.trim()) return alert('Informe o tipo de documento.');

        setSaving(true);
        try {
            await onCreate(form);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Nova Solicitação Presencial</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <form className="modal-body" onSubmit={handleSubmit}>
                    <div className="data-card">
                        <div className="card-header"><h3>Atendimento</h3></div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Assunto</label>
                                <select name="assunto" value={form.assunto} onChange={handleChange} className="form-input">
                                    <option value="Emissão de Documentos">Emissão de Documentos</option>
                                    <option value="Entrega de Documentos">Entrega de Documentos</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Tipo de Documento</label>
                                <input name="tipoDocumento" value={form.tipoDocumento} onChange={handleChange} className="form-input" placeholder="Ex: CIN, CPF, RG..." />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Observações</label>
                            <textarea name="descricao" value={form.descricao} onChange={handleChange} className="form-input" rows="3" placeholder="Detalhes do atendimento presencial" />
                        </div>
                    </div>

                    <div className="data-card" style={{ marginTop: 16 }}>
                        <div className="card-header"><h3>Solicitante</h3></div>
                        <div className="form-row">
                            <div className="form-group"><label>Nome</label><input name="solicitanteNome" value={form.solicitanteNome} onChange={handleChange} className="form-input" /></div>
                            <div className="form-group"><label>CPF</label><input name="solicitanteCpf" value={form.solicitanteCpf} onChange={handleChange} className="form-input" /></div>
                        </div>
                        <div className="form-row">
                            <div className="form-group"><label>Telefone</label><input name="solicitanteTelefone" value={form.solicitanteTelefone} onChange={handleChange} className="form-input" /></div>
                            <div className="form-group"><label>Email</label><input name="solicitanteEmail" value={form.solicitanteEmail} onChange={handleChange} className="form-input" /></div>
                        </div>
                    </div>

                    <div className="data-card" style={{ marginTop: 16 }}>
                        <div className="card-header"><h3>Beneficiário</h3></div>
                        <div className="form-row">
                            <div className="form-group"><label>Nome</label><input name="beneficiarioNome" value={form.beneficiarioNome} onChange={handleChange} className="form-input" placeholder="Em branco usa o solicitante" /></div>
                            <div className="form-group"><label>CPF</label><input name="beneficiarioCpf" value={form.beneficiarioCpf} onChange={handleChange} className="form-input" /></div>
                        </div>
                        <div className="form-row">
                            <div className="form-group"><label>Telefone</label><input name="beneficiarioTelefone" value={form.beneficiarioTelefone} onChange={handleChange} className="form-input" /></div>
                            <div className="form-group"><label>Parentesco</label><input name="parentesco" value={form.parentesco} onChange={handleChange} className="form-input" /></div>
                        </div>
                    </div>

                    <div className="form-actions" style={{ marginTop: 18 }}>
                        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                        <button type="submit" className="btn-primary btn-save-status" disabled={saving}>
                            {saving ? 'Criando...' : 'Criar Solicitação'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ─── Modal de Detalhes (mesmo componente do AdminBalcao) ─── */
const SolicitacaoBalcaoModal = ({ solicitacao, onClose, onStatusChange, onSendMessage, onFileUpload, onNotifyUser, onCreateAppointment, userProfilesCache, setUserProfilesCache }) => {
    const [newStatus, setNewStatus] = useState(solicitacao ? solicitacao.status || '' : '');
    const [message, setMessage] = useState('');
    const [consumerProfile, setConsumerProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [viewingFile, setViewingFile] = useState(null);
    const [activeTab, setActiveTab] = useState('dados');

    useEffect(() => {
        if (solicitacao) {
            setNewStatus(solicitacao.status || '');
            setActiveTab('dados');
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

    const requestFiles = Object.entries(solicitacao.dadosSolicitacao?.anexos || {}).flatMap(([category, files]) =>
        (Array.isArray(files) ? files : []).map((file, index) => ({ file, category, index, source: 'request' }))
    );
    const adminFiles = (Array.isArray(solicitacao.arquivos) ? solicitacao.arquivos : []).map((file, index) => ({
        file,
        category: 'Arquivos enviados pela administração',
        index,
        source: 'admin'
    }));
    const allFiles = [...requestFiles, ...adminFiles];

    const renderFilesSection = () => (
        <div className="data-card admin-files-card">
            <div className="card-header"><h3>Arquivos da Solicitação</h3></div>
            {allFiles.length > 0 ? (
                <ul className="file-list admin-files-list">
                    {allFiles.map(({ file, category, index, source }) => (
                        <li key={`${source}-${category}-${index}`}>
                            <div>
                                <button onClick={() => setViewingFile(file)} className="file-link">
                                    <LiaPaperclipSolid /> {file.name || `Arquivo ${index + 1}`}
                                </button>
                                <small>{category}</small>
                            </div>
                            {source === 'request' && file.data?.startsWith('data:') && (
                                <button onClick={() => handleMigrateFile(file, category, index)} className="btn-secondary btn-compact">
                                    <LiaUploadSolid /> Migrar
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="detail-description">Nenhum arquivo anexado.</p>
            )}
            <div className="form-actions admin-files-actions">
                <label className="btn-secondary"><LiaUploadSolid /> Enviar Arquivo<input type="file" hidden onChange={handleFileUpload} /></label>
            </div>
        </div>
    );

    return (
        <>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Solicitação</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="admin-modal-tabs">
                    <button className={activeTab === 'dados' ? 'active' : ''} onClick={() => setActiveTab('dados')}>Dados</button>
                    <button className={activeTab === 'situacao' ? 'active' : ''} onClick={() => setActiveTab('situacao')}>Situação</button>
                    <button className={activeTab === 'agendamento' ? 'active' : ''} onClick={() => setActiveTab('agendamento')}>Agendamento</button>
                    <button className={activeTab === 'arquivos' ? 'active' : ''} onClick={() => setActiveTab('arquivos')}>Arquivos</button>
                    <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>Chat</button>
                </div>
                <div className="modal-body">
                    {activeTab === 'dados' && (
                    <>
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
                            </>
                        ) : (
                            <p className="detail-description">{solicitacao.dadosSolicitacao?.descricao || 'N/A'}</p>
                        )}
                    </div>
                    </>
                    )}

                    {activeTab === 'arquivos' && renderFilesSection()}

                    {activeTab === 'agendamento' && (
                        <AdminAppointmentSection solicitacao={solicitacao} onCreateAppointment={onCreateAppointment} />
                    )}

                    {activeTab === 'situacao' && (
                    <>
                    <hr />
                    <h4>Gerenciamento</h4>
                    <div className="form-row status-management-row">
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
                                <option value="Documento sendo preparado">Documento sendo preparado</option>
                                <option value="Documento Pronto">Documento Pronto</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </div>
                        <button onClick={handleStatusSave} className="btn-primary btn-save-status">Salvar Status</button>
                    </div>

                    <div className="form-actions" style={{ marginTop: '20px' }}>
                        <button onClick={handleNotifyUser} className="btn-submit"><LiaBellSolid /> Notificar Usuário</button>
                    </div>
                    </>
                    )}

                    {activeTab === 'chat' && (
                    <>
                    <div className="modal-chat-shell">
                        <div className="modal-chat-header">
                            <div>
                                <h4>Chat da Solicitação</h4>
                                <span>Protocolo {solicitacao.id}</span>
                            </div>
                        </div>
                        <div className="message-history whatsapp-history">
                            {getOrderedMessages(solicitacao.messages).length > 0 ? (
                                getOrderedMessages(solicitacao.messages).map((msg) => (
                                    <div key={msg.id} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
                                        <p>{msg.deletedByAdmin ? 'Mensagem apagada' : msg.text}</p>
                                        <small>{formatChatTime(msg.timestamp)}</small>
                                    </div>
                                ))
                            ) : (
                                <p className="chat-empty-state">Nenhuma mensagem trocada.</p>
                            )}
                        </div>
                        <AdminQuickReplies onPick={(text) => setMessage(text)} />
                        <div className="modal-chat-composer">
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="Digite uma mensagem"
                                rows="1"
                            />
                            <button onClick={handleSendMessage} disabled={!message.trim()} title="Enviar mensagem">
                                <LiaPaperPlane />
                            </button>
                        </div>
                    </div>
                    </>
                    )}
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
    const [showCreateModal, setShowCreateModal] = useState(false);

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

    const handlePrintFilteredResults = () => {
        printTableReport({
            title: 'Relatório de Solicitações do Balcão',
            subtitle: `Resultados do filtro atual. Status: ${filterStatus}. Assunto: ${filterAssunto}. Beneficiário: ${filterBeneficiario || 'Todos'}.`,
            columns: [
                { label: '#', width: '4%', render: (_, index) => index + 1 },
                { label: 'Protocolo', width: '12%', render: (item) => item.id },
                { label: 'Solicitante', width: '16%', render: (item) => item.dadosUsuario?.name || 'N/A' },
                { label: 'Beneficiário', width: '16%', render: (item) => item.dadosBeneficiario?.name || item.dadosUsuario?.name || 'N/A' },
                { label: 'Assunto', width: '14%', render: (item) => item.dadosSolicitacao?.assunto || 'Sem assunto' },
                { label: 'Status', width: '13%', render: (item) => item.status || 'Pendente' },
                { label: 'Data', width: '12%', render: (item) => item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : 'N/A' },
                { label: 'Observações', width: '13%', render: () => '' },
            ],
            rows: filteredSolicitacoes,
        });
    };

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
            if (newStatus === 'Documento Pronto') {
                updateData['dadosSolicitacao.assunto'] = 'Entrega de Documentos';
                updateData['dadosSolicitacao.entregaDeDocumentos'] = true;
                updateData.status = 'Agendamento Liberado';
            }
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

    const handleCreateAppointment = async (solicitacao, date, time) => {
        if (!solicitacao?.id) throw new Error('Solicitação não encontrada.');
        if (date < getTodayDateInputValue()) throw new Error('Não é possível agendar para uma data anterior a hoje.');

        const solicitacaoRef = doc(firestore, 'balcao-cidadao', solicitacao.id);
        const bookedSlotRef = doc(firestore, 'balcao-config', 'bookedSlots');

        await runTransaction(firestore, async (transaction) => {
            const bookedSnap = await transaction.get(bookedSlotRef);
            const currentBookings = bookedSnap.exists() ? (bookedSnap.data()[date] || []) : [];

            const previousDate = solicitacao.appointmentDate || solicitacao.dadosSolicitacao?.appointmentDate;
            const previousTime = solicitacao.appointmentTime || solicitacao.dadosSolicitacao?.appointmentTime;
            const nextBookings = currentBookings.filter(slot => !(previousDate === date && previousTime === slot));

            if (nextBookings.includes(time)) {
                throw new Error('Este horário acabou de ser ocupado. Escolha outro horário.');
            }

            transaction.update(solicitacaoRef, {
                status: 'Agendado',
                appointmentDate: date,
                appointmentTime: time,
                ultimaAtualizacao: new Date(),
                deletionTimestamp: null,
            });

            transaction.set(bookedSlotRef, {
                [date]: [...nextBookings, time],
            }, { merge: true });
        });

        printProtocolReceipt({
            title: 'Comprovante de Agendamento do Balcão',
            protocol: solicitacao.id,
            status: 'Agendado',
            createdAt: new Date(),
            requester: {
                Nome: solicitacao.dadosUsuario?.name,
                Email: solicitacao.dadosUsuario?.email,
                CPF: solicitacao.dadosUsuario?.cpf,
                Telefone: solicitacao.dadosUsuario?.phone || solicitacao.dadosUsuario?.telefone,
            },
            beneficiary: {
                Nome: solicitacao.dadosBeneficiario?.name || solicitacao.dadosUsuario?.name,
                CPF: solicitacao.dadosBeneficiario?.cpf || solicitacao.dadosUsuario?.cpf,
                Telefone: solicitacao.dadosBeneficiario?.phone || solicitacao.dadosUsuario?.phone || solicitacao.dadosUsuario?.telefone,
                Parentesco: solicitacao.dadosBeneficiario?.parentesco || 'Próprio solicitante',
            },
            details: {
                Assunto: solicitacao.dadosSolicitacao?.assunto,
                'Tipo de Documento': solicitacao.dadosSolicitacao?.tipoDocumento,
                'Data Agendada': toBrazilianDate(date),
                'Horário Agendado': time,
                Descrição: solicitacao.dadosSolicitacao?.descricao,
                Detalhes: solicitacao.dadosSolicitacao?.detalhes,
            },
        });

        await sendNotification(
            { ...solicitacao, status: 'Agendado', appointmentDate: date, appointmentTime: time },
            { title: 'Agendamento criado pela Câmara', body: `Seu atendimento foi agendado para ${toBrazilianDate(date)} às ${time}. Protocolo: ${solicitacao.id}.` }
        );

        alert('Agendamento criado com sucesso!');
        setSelectedSolicitacao(null);
        fetchSolicitacoes();
    };

    const handleCreateSolicitacao = async (form) => {
        const docRef = doc(collection(firestore, 'balcao-cidadao'));
        const beneficiaryName = form.beneficiarioNome.trim() || form.solicitanteNome.trim();
        const beneficiaryCpf = form.beneficiarioCpf.trim() || form.solicitanteCpf.trim();
        const beneficiaryPhone = form.beneficiarioTelefone.trim() || form.solicitanteTelefone.trim();

        const payload = {
            dadosSolicitacao: {
                assunto: form.assunto,
                tipoDocumento: form.tipoDocumento,
                descricao: form.descricao,
                detalhes: {
                    origem: 'Atendimento presencial',
                    criadoPor: auth.currentUser?.email || 'Admin',
                },
            },
            dadosUsuario: {
                identificacao: 'Presencial',
                id: 'presencial',
                name: form.solicitanteNome,
                cpf: form.solicitanteCpf,
                telefone: form.solicitanteTelefone,
                phone: form.solicitanteTelefone,
                email: form.solicitanteEmail,
            },
            dadosBeneficiario: {
                id: beneficiaryName === form.solicitanteNome ? 'proprio' : 'outro',
                name: beneficiaryName,
                cpf: beneficiaryCpf,
                phone: beneficiaryPhone,
                parentesco: form.parentesco,
            },
            userId: 'presencial',
            status: 'Aguardando Atendimento',
            deletionTimestamp: null,
            dataSolicitacao: new Date(),
            ultimaAtualizacao: new Date(),
            origem: 'admin-presencial',
        };

        await setDoc(docRef, payload);

        printProtocolReceipt({
            title: 'Comprovante de Solicitação Presencial',
            protocol: docRef.id,
            status: payload.status,
            createdAt: payload.dataSolicitacao,
            requester: {
                Nome: payload.dadosUsuario.name,
                CPF: payload.dadosUsuario.cpf,
                Telefone: payload.dadosUsuario.telefone,
                Email: payload.dadosUsuario.email,
            },
            beneficiary: {
                Nome: payload.dadosBeneficiario.name,
                CPF: payload.dadosBeneficiario.cpf,
                Telefone: payload.dadosBeneficiario.phone,
                Parentesco: payload.dadosBeneficiario.parentesco,
            },
            details: {
                Assunto: payload.dadosSolicitacao.assunto,
                'Tipo de Documento': payload.dadosSolicitacao.tipoDocumento,
                Observações: payload.dadosSolicitacao.descricao,
            },
        });

        setShowCreateModal(false);
        alert('Solicitação criada com sucesso!');
        fetchSolicitacoes();
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
                    </div>
                    <div className="admin-balcao-header-actions">
                        <button onClick={handleResetPagination} className="admin-action-button action-refresh" disabled={loading}>
                            <span className="admin-action-icon">↻</span><span className="admin-action-label">Atualizar dados</span>
                        </button>
                        <button onClick={() => setShowCreateModal(true)} className="admin-action-button action-new">
                            <LiaPlusSolid /><span className="admin-action-label">Nova Solicitação</span>
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

                        {hasActiveFilters && (
                            <button
                                onClick={handlePrintFilteredResults}
                                className="btn-print-pdf"
                                disabled={loading}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                            >
                                <LiaPrintSolid size={18} />
                                Imprimir/PDF
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
                        {paginatedFilteredSolicitacoes.map((item, index) => {
                            const unreadCount = countUnreadAdminMessages(item.messages);

                            return (
                            <li
                                key={item.id}
                                className="data-list-item"
                                onClick={() => handleOpenSolicitacao(item)}
                                style={{ cursor: 'pointer', position: 'relative' }}
                            >
                                {unreadCount > 0 && (
                                    <span className="admin-card-unread-badge">
                                        {unreadCount}
                                    </span>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                    <span style={{
                                        minWidth: '32px', height: '32px', borderRadius: '50%',
                                        background: 'var(--primary-color, #fff)', color: '#fff !important',
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
                            );
                        })}
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
                    onCreateAppointment={handleCreateAppointment}
                    userProfilesCache={userProfilesCache}
                    setUserProfilesCache={setUserProfilesCache}
                />

                {showCreateModal && (
                    <AdminCreateSolicitacaoModal
                        onClose={() => setShowCreateModal(false)}
                        onCreate={handleCreateSolicitacao}
                    />
                )}
            </div>
        </div>
    );
};

export default AdminBalcaoSolicitacoes;
