import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, doc, getDocs, query, orderBy, limit, getDoc, 
    updateDoc, setDoc, addDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import {
    LiaTimesSolid, LiaUploadSolid, LiaBellSolid, LiaPaperPlane,
    LiaPaperclipSolid, LiaDownloadSolid,
    LiaCogSolid, LiaCalendarCheckSolid, LiaClipboardListSolid,
    LiaClockSolid, LiaHourglassHalfSolid, LiaRedoAltSolid, LiaBullhornSolid,
    LiaPlusSolid, LiaUsersSolid
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

const getDefaultDailyAvailability = () => ({
    monday: { enabled: false, times: '' },
    tuesday: { enabled: false, times: '' },
    wednesday: { enabled: false, times: '' },
    thursday: { enabled: false, times: '' },
    friday: { enabled: false, times: '' },
});

const getCurrentMonthKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const formatConfigForForm = (data = {}) => {
    const formattedData = {};
    for (const day in data) {
        if (Array.isArray(data[day]) && data[day].length > 0) {
            formattedData[day] = { enabled: true, times: data[day].join(', ') };
        }
    }
    return { ...getDefaultDailyAvailability(), ...formattedData };
};

const FIXED_STATUSES = ['Aguardando Atendimento', 'Agendamento Liberado', 'Agendado', 'Em Análise', 'Documentação Reprovada', 'Documentação Reenviada', 'Concluído', 'Cancelado'];

const STATUS_COLORS = {
    'Aguardando Atendimento': '#f59e0b',
    'Agendamento Liberado': '#0ea5e9',
    Agendado: '#2563eb',
    'Em Análise': '#8b5cf6',
    'Documentação Reprovada': '#ef4444',
    'Documentação Reenviada': '#14b8a6',
    Concluído: '#22c55e',
    Cancelado: '#64748b',
};

const getSolicitationTime = (value) => {
    if (!value) return 0;
    if (value.toMillis) return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const formatChartDateKey = (time) => {
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatChartDateLabel = (dateKey) => {
    const [, month, day] = dateKey.split('-');
    return `${day}/${month}`;
};

const formatTodayLabel = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = today.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `Hoje ${day} de ${month}`;
};

const normalizeDateString = (value) => {
    if (!value) return '';
    if (value.toDate) return formatChartDateKey(value.toDate().getTime());
    if (value.toMillis) return formatChartDateKey(value.toMillis());
    if (value instanceof Date) return formatChartDateKey(value.getTime());

    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const brDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (brDateMatch) {
        const [, day, month, year] = brDateMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const time = new Date(text).getTime();
    return Number.isNaN(time) ? text : formatChartDateKey(time);
};

const InstantNotificationModal = ({ onClose, onSend }) => {
    const [title, setTitle] = useState('Aviso importante da Câmara Municipal');
    const [description, setDescription] = useState('');
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        if (!title.trim() || !description.trim()) {
            alert('Informe o título e a mensagem da notificação.');
            return;
        }

        if (!window.confirm('Enviar esta notificação instantânea para todos os usuários por 1 dia?')) {
            return;
        }

        setSending(true);
        try {
            const total = await onSend(title.trim(), description.trim());
            alert(`Notificação enviada para ${total} usuário${total === 1 ? '' : 's'}.`);
            onClose();
        } catch (error) {
            console.error('Erro ao enviar notificação instantânea:', error);
            alert('Erro ao enviar a notificação instantânea.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content admin-instant-notification-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3>Notificação instantânea</h3>
                        <p>Envio para todos os usuários com duração de 1 dia.</p>
                    </div>
                    <button type="button" onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Título</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="form-input"
                            maxLength={90}
                            placeholder="Ex: Aviso importante"
                        />
                    </div>
                    <div className="form-group">
                        <label>Mensagem</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="form-input"
                            rows="5"
                            maxLength={260}
                            placeholder="Digite a mensagem que aparecerá para os usuários..."
                        />
                    </div>
                    <div className="admin-instant-notification-note">
                        <LiaClockSolid size={20} />
                        <span>Essa notificação ficará válida por 24 horas após o envio.</span>
                    </div>
                    <button type="button" onClick={handleSend} className="btn-primary" disabled={sending}>
                        {sending ? 'Enviando...' : <><LiaBullhornSolid size={20} /> Enviar para todos</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Modal for Availability Configuration
const AvailabilityModal = ({ onClose, onSave }) => {
    const formatFormForFirestore = () => {
        const finalConfig = {};
        for (const day in currentMonthAvailability) {
            if (currentMonthAvailability[day].enabled && currentMonthAvailability[day].times.trim()) {
                finalConfig[day] = currentMonthAvailability[day].times.split(',').map(t => t.trim()).filter(Boolean);
            }
        }
        return finalConfig;
    };

    const [selectedMonth, setSelectedMonth] = useState('');
    const [currentMonthAvailability, setCurrentMonthAvailability] = useState(getDefaultDailyAvailability);
    const [loadingMonth, setLoadingMonth] = useState(false);
    const [blockedDates, setBlockedDates] = useState('');
    const [loading, setLoading] = useState(true);

    const getMonthOptions = () => {
        const options = [];
        const today = new Date();
        for (let i = 0; i < 12; i++) {
            const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const monthName = date.toLocaleString('pt-BR', { month: 'long' });
            options.push({ value: `${year}-${month}`, label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}` });
        }
        return options;
    };

    useEffect(() => {
        const fetchInitialConfig = async () => {
            setLoading(true);

            try {
                const blockedDatesRef = doc(firestore, 'balcao-config', 'blockedDates');
                const blockedSnap = await getDoc(blockedDatesRef);
                if (blockedSnap.exists()) {
                    const blockedData = blockedSnap.data();
                    setBlockedDates(blockedData.dates ? blockedData.dates.join(', ') : '');
                }
                setSelectedMonth(getCurrentMonthKey());
            } catch (error) {
                console.error('Erro ao buscar configuração inicial:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialConfig();
    }, []);

    useEffect(() => {
        if (!selectedMonth) return;

        const loadMonthlyAvailability = async () => {
            setLoadingMonth(true);
            try {
                const monthlyConfigRef = doc(firestore, 'balcao-monthly-configs', selectedMonth);
                const monthlySnap = await getDoc(monthlyConfigRef);

                if (monthlySnap.exists()) {
                    setCurrentMonthAvailability(formatConfigForForm(monthlySnap.data()));
                } else if (selectedMonth === getCurrentMonthKey()) {
                    const liveAvailabilityRef = doc(firestore, 'balcao-config', 'availability');
                    const liveAvailabilitySnap = await getDoc(liveAvailabilityRef);
                    setCurrentMonthAvailability(liveAvailabilitySnap.exists() ? formatConfigForForm(liveAvailabilitySnap.data()) : getDefaultDailyAvailability());
                } else {
                    setCurrentMonthAvailability(getDefaultDailyAvailability());
                }
            } catch (error) {
                console.error(`Erro ao carregar disponibilidade para ${selectedMonth}:`, error);
            } finally {
                setLoadingMonth(false);
            }
        };
        loadMonthlyAvailability();
    }, [selectedMonth]);

    const handleDayToggle = (day) => {
        setCurrentMonthAvailability(prev => ({
            ...prev,
            [day]: { ...prev[day], enabled: !prev[day].enabled }
        }));
    };

    const handleTimesChange = (day, times) => {
        setCurrentMonthAvailability(prev => ({
            ...prev,
            [day]: { ...prev[day], times: times }
        }));
    };

    const handleSaveMonthlyConfig = async () => {
        if (!selectedMonth) {
            alert('Por favor, selecione um mês para salvar a configuração.');
            return;
        }

        const finalConfig = formatFormForFirestore();
        const blockedDatesConfig = blockedDates.split(',').map(d => d.trim()).filter(Boolean);
        const isCurrentMonth = selectedMonth === getCurrentMonthKey();

        try {
            const monthlyConfigRef = doc(firestore, 'balcao-monthly-configs', selectedMonth);
            await setDoc(monthlyConfigRef, finalConfig);

            if (isCurrentMonth) {
                await onSave(finalConfig, blockedDatesConfig, {
                    closeModal: false,
                    successMessage: `Configuração de ${selectedMonth} salva e publicada para os usuários.`
                });
                return;
            }

            alert(`Configuração para ${selectedMonth} salva com sucesso! Como é um mês futuro, ela não altera os horários visíveis aos usuários agora.`);
        } catch (error) {
            console.error(`Erro ao salvar configuração para ${selectedMonth}:`, error);
            alert('Falha ao salvar a configuração mensal.');
        }
    };

    const handleApplyToLiveAvailability = async () => {
        if (!selectedMonth) {
            alert('Por favor, selecione um mês para aplicar a configuração.');
            return;
        }

        if (!window.confirm(`Tem certeza que deseja aplicar a configuração de ${selectedMonth} agora? Mesmo sendo um mês futuro, os usuários passarão a ver estes horários imediatamente.`)) {
            return;
        }

        const configToApply = formatFormForFirestore();
        const blockedDatesConfig = blockedDates.split(',').map(d => d.trim()).filter(Boolean);

        try {
            const monthlyConfigRef = doc(firestore, 'balcao-monthly-configs', selectedMonth);
            await setDoc(monthlyConfigRef, configToApply);
            await onSave(configToApply, blockedDatesConfig, {
                successMessage: `Configuração de ${selectedMonth} aplicada aos usuários.`
            });
        } catch (error) {
            console.error(`Erro ao aplicar configuração de ${selectedMonth} à disponibilidade ao vivo:`, error);
            alert('Falha ao aplicar a configuração à disponibilidade ao vivo.');
        }
    };

    const daysOfWeek = { monday: 'Segunda-feira', tuesday: 'Terça-feira', wednesday: 'Quarta-feira', thursday: 'Quinta-feira', friday: 'Sexta-feira' };
    const monthOptions = getMonthOptions();
    
    if (loading) return <div className="modal-overlay"><div className="modal-content"><p>Carregando...</p></div></div>;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Configurar Disponibilidade Mensal</h3>
                    <button type="button" onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label htmlFor="selectMonth">Selecionar Mês:</label>
                        <select
                            id="selectMonth"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="form-input"
                            disabled={loadingMonth}
                        >
                            {monthOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    {loadingMonth ? (
                        <p>Carregando horários para {selectedMonth}...</p>
                    ) : (
                        <>
                            <p>Marque os dias e informe os horários separados por vírgula (ex: 08:00, 09:00).</p>
                            <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                Salvar Mês guarda a configuração selecionada. Aplicar ao Vivo publica estes horários imediatamente para os usuários, mesmo se o mês selecionado for futuro.
                            </p>
                            {Object.keys(daysOfWeek).map(day => (
                                <div key={day} className="form-row" style={{ alignItems: 'center', marginBottom: '15px' }}>
                                    <div style={{ flex: '0.5' }}>
                                        <input
                                            type="checkbox"
                                            id={day}
                                            checked={currentMonthAvailability[day]?.enabled || false}
                                            onChange={() => handleDayToggle(day)}
                                        />
                                        <label htmlFor={day} style={{ marginLeft: '10px' }}>{daysOfWeek[day]}</label>
                                    </div>
                                    <div className="form-group" style={{ flex: '1.5', marginBottom: 0 }}>
                                        <input
                                            type="text"
                                            placeholder="Ex: 08:00, 09:00, 10:00"
                                            value={currentMonthAvailability[day]?.times || ''}
                                            onChange={(e) => handleTimesChange(day, e.target.value)}
                                            disabled={!currentMonthAvailability[day]?.enabled}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="form-group">
                                <label>Dias sem atendimento (feriados, pontos facultativos)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: 25/12/2024, 01/01/2025"
                                    value={blockedDates}
                                    onChange={(e) => setBlockedDates(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-actions" style={{ justifyContent: 'space-between' }}>
                                <button onClick={handleSaveMonthlyConfig} className="btn-secondary">Salvar Mês</button>
                                <button onClick={handleApplyToLiveAvailability} className="btn-primary">Aplicar ao Vivo</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// Modal Component
const SolicitacaoBalcaoModal = ({ solicitacao, onClose, onStatusChange, onSendMessage, onFileUpload, onNotifyUser }) => {
    const [newStatus, setNewStatus] = useState(solicitacao ? solicitacao.status || '' : '');
    const [message, setMessage] = useState('');
    const [consumerProfile, setConsumerProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [viewingFile, setViewingFile] = useState(null);

    useEffect(() => {
        if (solicitacao) {
            setNewStatus(solicitacao.status || '');
            
            // Otimização: Se já temos os dados básicos no objeto, não precisamos buscar no nó /users
            // a menos que precisemos de informações em tempo real que não foram salvas no ticket.
            if (solicitacao.dadosUsuario && solicitacao.userId === 'anonimo') {
                setConsumerProfile({ name: 'Anônimo' });
                setLoadingProfile(false);
                return;
            }

            const fetchConsumerProfile = async () => {
                const userId = solicitacao.userId;
                if (!userId) return;
                setLoadingProfile(true);
                const userRef = doc(firestore, 'users', userId);
                try {
                    const docSnap = await getDoc(userRef);
                    setConsumerProfile(docSnap.exists() ? docSnap.data() : solicitacao.dadosUsuario);
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
                    data: uploadResult.url // Substituímos o base64 pela URL
                }
            });
            
            // Atualização local para feedback imediato
            file.url = uploadResult.url;
            file.data = uploadResult.url;
            alert("Arquivo migrado para o Storage com sucesso!");
        } catch (error) {
            console.error("Erro ao migrar arquivo:", error);
            alert("Falha ao migrar arquivo.");
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

// Main Dashboard Component
const AdminBalcaoDashboard = () => {
    const navigate = useNavigate();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const statusChartRefs = useRef({});
    const statusChartInstances = useRef({});

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [statusCounts, setStatusCounts] = useState({});
    const [statusGrowthData, setStatusGrowthData] = useState({ labels: [], datasets: [] });
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);
    const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
    const [isInstantNotificationModalOpen, setIsInstantNotificationModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate]);

    // Memorizando a função de busca para evitar re-declarações e permitir chamadas manuais
    const fetchData = useCallback(async () => {
        if (!isAuthReady) return;
        
        setLoading(true);
        const solicitacoesRef = collection(firestore, 'balcao-cidadao');
        
        // Limitamos aos últimos 1000 para o gráfico não pesar a fatura de download
        const q = query(solicitacoesRef, orderBy('dataSolicitacao', 'desc'), limit(1000));
        
        try {
            const snapshot = await getDocs(q);
            const fetchedData = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                // Normalizar a data
                timestamp: getSolicitationTime(doc.data().dataSolicitacao)
            }));
            setSolicitacoes(fetchedData);

            const counts = fetchedData.reduce((acc, item) => {
                const status = item.status || 'Cancelado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const orderedCounts = {};
            FIXED_STATUSES.forEach(status => {
                orderedCounts[status] = counts[status] || 0;
            });
            setStatusCounts(orderedCounts);

            const dateKeys = [...new Set(
                fetchedData
                    .filter(item => item.timestamp)
                    .map(item => formatChartDateKey(item.timestamp))
            )].sort();

            const dailyCountsByStatus = FIXED_STATUSES.reduce((acc, status) => {
                acc[status] = {};
                return acc;
            }, {});

            fetchedData.forEach((item) => {
                if (!item.timestamp) return;
                const status = item.status || 'Cancelado';
                if (!dailyCountsByStatus[status]) dailyCountsByStatus[status] = {};
                const dateKey = formatChartDateKey(item.timestamp);
                dailyCountsByStatus[status][dateKey] = (dailyCountsByStatus[status][dateKey] || 0) + 1;
            });

            const datasets = FIXED_STATUSES.map((status) => {
                let cumulativeTotal = 0;
                return {
                    label: status,
                    data: dateKeys.map((dateKey) => {
                        cumulativeTotal += dailyCountsByStatus[status]?.[dateKey] || 0;
                        return cumulativeTotal;
                    }),
                    borderColor: STATUS_COLORS[status] || '#2563eb',
                    backgroundColor: `${STATUS_COLORS[status] || '#2563eb'}22`,
                    tension: 0.35,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                };
            }).filter(dataset => dataset.data.some(value => value > 0));

            setStatusGrowthData({
                labels: dateKeys.map(formatChartDateLabel),
                datasets,
            });
        } catch (error) {
            console.error('Erro ao buscar solicitações:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthReady]);

    useEffect(() => {
        fetchData(); // Chama a função uma vez ao montar
    }, [fetchData]);

    useEffect(() => {
        if (!chartRef.current || statusGrowthData.labels.length === 0) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: statusGrowthData.labels,
                datasets: statusGrowthData.datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2000,
                    easing: 'easeOutQuart'
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        ticks: { stepSize: 1, color: '#5f6f86' },
                        grid: { color: 'rgba(15, 23, 42, 0.08)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10, color: '#5f6f86' }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { usePointStyle: true, boxWidth: 8, padding: 16, color: '#334155' }
                    },
                    title: { display: true, text: 'Crescimento por Status e Data', color: '#10233f', font: { size: 16, weight: '600' } },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${context.parsed.y} solicitação${context.parsed.y === 1 ? '' : 'ões'}`
                        }
                    }
                }
            }
        });

        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [statusGrowthData]);

    useEffect(() => {
        Object.values(statusChartInstances.current).forEach(instance => instance?.destroy());
        statusChartInstances.current = {};

        if (statusGrowthData.labels.length === 0) return undefined;

        statusGrowthData.datasets.forEach((dataset) => {
            const canvas = statusChartRefs.current[dataset.label];
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            statusChartInstances.current[dataset.label] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: statusGrowthData.labels,
                    datasets: [{
                        ...dataset,
                        fill: true,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        borderWidth: 2.5,
                        backgroundColor: `${dataset.borderColor}18`,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 900, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.parsed.y} solicitação${context.parsed.y === 1 ? '' : 'ões'} acumulada${context.parsed.y === 1 ? '' : 's'}`
                            }
                        }
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false, beginAtZero: true }
                    },
                    elements: {
                        line: { tension: 0.4 }
                    }
                }
            });
        });

        return () => {
            Object.values(statusChartInstances.current).forEach(instance => instance?.destroy());
            statusChartInstances.current = {};
        };
    }, [statusGrowthData]);

    const handleCloseModal = () => setSelectedSolicitacao(null);

    const sendNotification = async (solicitacao) => {
        if (!solicitacao.userId || solicitacao.userId === "anonimo" || !solicitacao.dadosUsuario?.email) {
            console.log("Usuário anônimo ou sem e-mail, notificação não enviada.");
            return;
        }

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = "Sua solicitação para o Balcão do cidadão teve movimentação.";
        const notificationDescription = `Abra agora mesmo o aplicativo da Câmara Municipal de ${cityName} para acompanhar. Protocolo: ${solicitacao.id}.`;

        try {
            // Adicionar notificação no Firestore
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
        const itemRef = doc(firestore, 'balcao-cidadao', id);
        let updateData = { status: newStatus };
        if (newStatus === 'Concluído' || newStatus === 'Cancelado') {
            updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
        } else {
            updateData.deletionTimestamp = null; // Clear if status is changed from Cancelado
        }
        await updateDoc(itemRef, updateData);
        await sendNotification({ ...selectedSolicitacao, id, status: newStatus });
        alert('Status atualizado!');
        fetchData(); // Atualiza localmente após a alteração
        handleCloseModal();
    };

    const handleSaveAvailability = async (availabilityConfig, blockedDatesConfig, options = {}) => {
        const availabilityRef = doc(firestore, 'balcao-config', 'availability');
        const blockedDatesRef = doc(firestore, 'balcao-config', 'blockedDates');
        try {
            await setDoc(availabilityRef, availabilityConfig);
            await setDoc(blockedDatesRef, { dates: blockedDatesConfig });
            alert(options.successMessage || 'Disponibilidade salva com sucesso!');
            if (options.closeModal !== false) {
                setIsAvailabilityModalOpen(false);
            }
        } catch (error) {
            console.error("Erro ao salvar disponibilidade:", error);
            alert('Falha ao salvar a disponibilidade.');
        }
    };

    const handleSendInstantNotification = async (title, description) => {
        const usersSnapshot = await getDocs(collection(firestore, 'users'));
        const users = usersSnapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(user => user.email || user.uid || user.id);

        if (users.length === 0) {
            throw new Error('Nenhum usuário encontrado.');
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationsRef = collection(firestore, 'notifications');
        const chunkSize = 450;

        for (let i = 0; i < users.length; i += chunkSize) {
            const batch = writeBatch(firestore);
            users.slice(i, i + chunkSize).forEach((user) => {
                const targetUserId = user.uid || user.id;
                const notificationRef = doc(notificationsRef);
                batch.set(notificationRef, {
                    isRead: false,
                    instant: true,
                    durationHours: 24,
                    expiresAt,
                    targetAudience: 'all',
                    targetUserId,
                    timestamp: serverTimestamp(),
                    tituloNotification: title,
                    descricaoNotification: description,
                    userEmail: user.email || '',
                    userId: targetUserId,
                    protocolo: 'ADMIN-INSTANT',
                    cityName,
                });
            });
            await batch.commit();
        }

        return users.length;
    };

    const handleSendMessage = async (id, text) => {
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
            
            await sendNotification({ ...selectedSolicitacao, id });
            fetchData(); // Atualiza para mostrar a nova mensagem
            alert('Mensagem enviada!');
        }
    };

    const handleNotifyUser = async (solicitacao) => {
        const userData = solicitacao.dadosUsuario;
        if (!userData || !userData.id) return alert("Usuário não identificado.");
        if (!userData.email) return alert("E-mail do usuário não encontrado.");

        const notificationTitle = "Notificação de Atualização";
        const notificationMessage = `Sua solicitação no Balcão do Cidadão sobre "${solicitacao.dadosSolicitacao.assunto}" foi atualizada.`;

        try {
            // Adicionar notificação no Firestore
            const notificacoesRef = collection(firestore, 'notifications');
            await addDoc(notificacoesRef, {
                userId: userData.id,
                userEmail: userData.email,
                message: notificationMessage,
                timestamp: serverTimestamp(),
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
            const folderPath = `balcao-cidadao/admin-uploads/${id}`;
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

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    const newRequestsCount = statusCounts['Aguardando Atendimento'] || 0;
    const resentDocumentsCount = statusCounts['Documentação Reenviada'] || 0;
    const scheduledCount = statusCounts.Agendado || 0;
    const todayKey = formatChartDateKey(Date.now());
    const todayLabel = formatTodayLabel();
    const todayAppointmentsCount = solicitacoes.filter((item) => {
        const appointmentDate = item.appointmentDate || item.dadosSolicitacao?.appointmentDate || item.dadosSolicitacao?.dataAgendamento;
        return (item.status || '') === 'Agendado' && normalizeDateString(appointmentDate) === todayKey;
    }).length;
    const totalSolicitacoes = solicitacoes.length;
    const statusCharts = statusGrowthData.datasets.map((dataset) => {
        const total = dataset.data[dataset.data.length - 1] || 0;
        const first = dataset.data[0] || 0;
        const growth = Math.max(total - first, 0);
        const percentage = totalSolicitacoes ? Math.round((total / totalSolicitacoes) * 100) : 0;
        return { dataset, total, growth, percentage };
    });

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content admin-balcao-dashboard-content">
                <header className="page-header-container admin-balcao-page-header">
                    <div className="header-title-section">
                        <h1>Admin Balcão do Cidadão</h1>
                        <p>Visão geral das solicitações</p>
                    </div>
                    <div className="admin-balcao-header-actions">
                        <button onClick={fetchData} className="admin-action-button action-refresh admin-balcao-refresh-button" disabled={loading}>
                            <span className="admin-action-icon">↻</span><span className="admin-action-label">Atualizar dados</span>
                        </button>
                        <button type="button" onClick={() => navigate('/admin-balcao/solicitacoes')} className="admin-action-button action-new">
                            <LiaPlusSolid /><span className="admin-action-label">Nova Solicitação</span>
                        </button>
                        <button type="button" onClick={() => navigate('/recepcao')} className="admin-action-button action-reception">
                            <LiaUsersSolid /><span className="admin-action-label">Recepção</span>
                        </button>
                        <button type="button" onClick={() => navigate('/painel-atendimento')} className="admin-action-button action-queue">
                            <LiaClipboardListSolid /><span className="admin-action-label">Painel da Fila</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsInstantNotificationModalOpen(true)}
                            className="admin-header-notification-button"
                            aria-label="Enviar notificação instantânea"
                            title="Enviar notificação instantânea"
                        >
                            <LiaBullhornSolid size={23} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsAvailabilityModalOpen(true)}
                            className="admin-header-gear-button"
                            aria-label="Configurar horários"
                            title="Configurar horários"
                        >
                            <LiaCogSolid size={24} />
                        </button>
                    </div>
                </header>

                <div className="admin-balcao-action-cards">
                    <button type="button" onClick={() => navigate('/admin-balcao/agendamentos')} className="admin-balcao-action-card appointments">
                        <span className="admin-balcao-action-main">
                            <span className="admin-balcao-action-icon"><LiaCalendarCheckSolid size={30} /></span>
                            <span className="admin-balcao-action-copy">
                                <strong>Visualizar Agendamentos</strong>
                                <small>{scheduledCount} agendamento{scheduledCount === 1 ? '' : 's'} ativo{scheduledCount === 1 ? '' : 's'}</small>
                            </span>
                        </span>
                        <span className="admin-balcao-action-metrics">
                            <span className="admin-balcao-action-metric">
                                <LiaClockSolid size={21} />
                                <span>{todayLabel}</span>
                                <strong>{todayAppointmentsCount}</strong>
                            </span>
                        </span>
                    </button>
                    <button type="button" onClick={() => navigate('/admin-balcao/solicitacoes')} className="admin-balcao-action-card requests">
                        <span className="admin-balcao-action-main">
                            <span className="admin-balcao-action-icon"><LiaClipboardListSolid size={30} /></span>
                            <span className="admin-balcao-action-copy">
                                <strong>Visualizar Solicitações</strong>
                                <small>{newRequestsCount} {newRequestsCount === 1 ? 'nova solicitação' : 'novas solicitações'}</small>
                            </span>
                        </span>
                        <span className="admin-balcao-action-metrics">
                            <span className="admin-balcao-action-metric">
                                <LiaHourglassHalfSolid size={21} />
                                <span>Aguardando Atendimento</span>
                                <strong>{newRequestsCount}</strong>
                            </span>
                            <span className="admin-balcao-action-metric">
                                <LiaRedoAltSolid size={21} />
                                <span>Documentação Reenviada</span>
                                <strong>{resentDocumentsCount}</strong>
                            </span>
                        </span>
                    </button>
                </div>

                <div className="data-card admin-balcao-chart-card">
                    <div className="card-header admin-balcao-card-header">
                        <div>
                            <h3>Evolução dos Atendimentos</h3>
                            <span>Crescimento acumulado por status nos últimos registros carregados</span>
                        </div>
                    </div>
                    <div className="chart-container">
                        <div className="admin-balcao-main-chart">
                            {loading ? <p>Carregando...</p> : <canvas ref={chartRef}></canvas>}
                        </div>
                    </div>
                </div>

                {!loading && statusCharts.length > 0 && (
                    <div className="admin-balcao-status-grid">
                        {statusCharts.map(({ dataset, total, growth, percentage }) => (
                            <article
                                key={dataset.label}
                                className="admin-balcao-status-card"
                                style={{ '--status-color': dataset.borderColor }}
                            >
                                <div className="admin-balcao-status-top">
                                    <div>
                                        <span className="admin-balcao-status-label">{dataset.label}</span>
                                        <strong className="admin-balcao-status-total">{total}</strong>
                                    </div>
                                    <span className="admin-balcao-status-percent">{percentage}%</span>
                                </div>
                                <div className="admin-balcao-status-meta">
                                    <span>+{growth} no período</span>
                                    <span>{statusGrowthData.labels.length} dia{statusGrowthData.labels.length === 1 ? '' : 's'} analisado{statusGrowthData.labels.length === 1 ? '' : 's'}</span>
                                </div>
                                <div className="admin-balcao-mini-chart">
                                    <canvas
                                        ref={(node) => {
                                            if (node) statusChartRefs.current[dataset.label] = node;
                                        }}
                                    />
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                <SolicitacaoBalcaoModal
                    solicitacao={selectedSolicitacao}
                    onClose={handleCloseModal}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleAdminFileUpload}
                    onNotifyUser={handleNotifyUser}
                />

                {isAvailabilityModalOpen && <AvailabilityModal
                    onClose={() => setIsAvailabilityModalOpen(false)}
                    onSave={handleSaveAvailability}
                />}
                {isInstantNotificationModalOpen && (
                    <InstantNotificationModal
                        onClose={() => setIsInstantNotificationModalOpen(false)}
                        onSend={handleSendInstantNotification}
                    />
                )}
            </div>
        </div>
    );
};

export default AdminBalcaoDashboard;
