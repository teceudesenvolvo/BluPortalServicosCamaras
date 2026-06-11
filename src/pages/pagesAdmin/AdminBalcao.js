import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    collection, doc, getDocs, query, orderBy, limit, getDoc, 
    updateDoc, setDoc, addDoc, serverTimestamp
} from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import {
    LiaTimesSolid, LiaUploadSolid, LiaBellSolid, LiaPaperPlane,
    LiaPaperclipSolid, LiaDownloadSolid, LiaSearchSolid, LiaFilterSolid
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

    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [statusCounts, setStatusCounts] = useState({});
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);
    const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterBeneficiario, setFilterBeneficiario] = useState('');
    const [filterStatus, setFilterStatus] = useState('Todos');
    const [filterAssunto, setFilterAssunto] = useState('Todos');
    const [showFilters, setShowFilters] = useState(false);

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
                timestamp: doc.data().dataSolicitacao?.toMillis 
                    ? doc.data().dataSolicitacao.toMillis() 
                    : new Date(doc.data().dataSolicitacao).getTime()
            }));
            setSolicitacoes(fetchedData);

            const counts = fetchedData.reduce((acc, item) => {
                const status = item.status || 'Cancelado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Aguardando Atendimento', 'Agendamento Liberado', 'Agendado', 'Em Análise', 'Concluído', 'Cancelado'];
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
    }, [isAuthReady]);

    const hasActiveFilters = !!(searchTerm || filterBeneficiario || filterStatus !== 'Todos' || filterAssunto !== 'Todos');
    const statusList = ['Todos', 'Aguardando Atendimento', 'Agendamento Liberado', 'Agendado', 'Em Análise', 'Documentação Reprovada', 'Documentação Reenviada', 'Concluído', 'Cancelado'];
    const assuntosList = ['Todos', 'Informações Gerais', 'Emissão de Documentos', 'Agendamento', 'Outros'];

    const filteredSolicitacoes = solicitacoes.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
            !searchTerm ||
            (item.dadosSolicitacao?.assunto?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosUsuario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosBeneficiario?.name?.toLowerCase() || '').includes(searchLower) ||
            (item.dadosBeneficiario?.cpf?.toLowerCase() || '').includes(searchLower) ||
            (item.id?.toLowerCase() || '').includes(searchLower);

        const beneficiarioText = `${item.dadosBeneficiario?.name || ''} ${item.dadosUsuario?.name || ''}`.toLowerCase();
        const matchesBeneficiario = !filterBeneficiario || beneficiarioText.includes(filterBeneficiario.toLowerCase());
        const matchesStatus = filterStatus === 'Todos' || item.status === filterStatus;
        const matchesAssunto = filterAssunto === 'Todos' || item.dadosSolicitacao?.assunto === filterAssunto;

        return matchesSearch && matchesBeneficiario && matchesStatus && matchesAssunto;
    });

    const clearFilters = () => {
        setSearchTerm('');
        setFilterBeneficiario('');
        setFilterStatus('Todos');
        setFilterAssunto('Todos');
    };

    useEffect(() => {
        fetchData(); // Chama a função uma vez ao montar
    }, [fetchData]);

    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Total de Solicitações',
                    data: Object.values(statusCounts),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#1d4ed8',
                    borderWidth: 3
                }]
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
                        ticks: { stepSize: 1 },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Solicitações por Status', font: { size: 16, weight: '600' } }
                }
            }
        });

        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [statusCounts]);

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

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Admin Balcão do Cidadão</h1>
                        <p>Visão geral das solicitações</p>
                        <button onClick={fetchData} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.8rem' }}>
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

                <div className="page-actions-bar">
                    <button onClick={() => setIsAvailabilityModalOpen(true)} className="btn-secondary">Configurar Horários</button>
                    <button onClick={() => navigate('/admin-balcao/agendamentos')} className="btn-secondary" style={{background: "#ffc009", borderColor: "#ffc009", textAlign: "center"}}>Visualizar Agendamentos</button>
                    <button onClick={() => navigate('/admin-balcao/solicitacoes')} className="btn-primary" >Visualizar Solicitações</button>
                </div>

                <div className="data-card" style={{ width: '95%' }}>
                    <div className="card-header"><h3>Atendimentos</h3></div>
                    <div className="chart-container">
                        <div style={{ height: '450px', width: '100%' }}>
                            {loading ? <p>Carregando...</p> : <canvas ref={chartRef}></canvas>}
                        </div>
                    </div>
                </div>

                <div className="data-card" style={{ width: '95%', marginTop: '24px' }}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                            <h3>Busca de Solicitações</h3>
                            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                {filteredSolicitacoes.length} resultado{filteredSolicitacoes.length === 1 ? '' : 's'} nos últimos registros carregados
                            </span>
                        </div>
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                                Limpar filtros
                            </button>
                        )}
                    </div>

                    <div style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                            <LiaSearchSolid style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por solicitante, beneficiário, CPF ou protocolo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="form-input"
                                style={{ paddingLeft: '42px', margin: 0 }}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={showFilters ? 'btn-primary' : 'btn-secondary'}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                        >
                            <LiaFilterSolid size={18} />
                            Filtros
                        </button>
                    </div>

                    {showFilters && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '0 16px 16px' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Beneficiário</label>
                                <input
                                    type="text"
                                    placeholder="Nome do beneficiário"
                                    value={filterBeneficiario}
                                    onChange={(e) => setFilterBeneficiario(e.target.value)}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Status</label>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                >
                                    {statusList.map(status => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Assunto</label>
                                <select
                                    value={filterAssunto}
                                    onChange={(e) => setFilterAssunto(e.target.value)}
                                    className="form-input"
                                    style={{ margin: 0 }}
                                >
                                    {assuntosList.map(assunto => <option key={assunto} value={assunto}>{assunto}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {!loading && filteredSolicitacoes.length === 0 && (
                        <p style={{ padding: '16px', color: '#6b7280' }}>Nenhuma solicitação encontrada.</p>
                    )}

                    <ul className="data-list">
                        {filteredSolicitacoes.slice(0, 20).map(item => {
                            const beneficiario = item.dadosBeneficiario?.name || item.dadosUsuario?.name || 'Beneficiário não informado';
                            return (
                                <li
                                    key={item.id}
                                    className="data-list-item"
                                    onClick={() => setSelectedSolicitacao(item)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="item-main-info">
                                        <strong>{beneficiario}</strong>
                                        {item.dadosUsuario?.name && item.dadosUsuario.name !== beneficiario && (
                                            <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>
                                                Solicitante: {item.dadosUsuario.name}
                                            </span>
                                        )}
                                        <span style={{ color: '#4b5563', fontSize: '0.9rem', display: 'block' }}>
                                            {item.dadosSolicitacao?.assunto || 'Sem assunto'} · Protocolo: {item.id}
                                        </span>
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
                </div>

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
            </div>
        </div>
    );
};

export default AdminBalcaoDashboard;
