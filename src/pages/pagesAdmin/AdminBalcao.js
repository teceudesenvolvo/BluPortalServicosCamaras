import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, query, orderByKey, update, push, set, serverTimestamp, get } from 'firebase/database';
import Chart from 'chart.js/auto';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaTimesSolid, LiaUploadSolid, LiaBellSolid, LiaPaperPlane, LiaPaperclipSolid, LiaDownloadSolid } from "react-icons/lia";
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

// Modal for Availability Configuration
const AvailabilityModal = ({ onClose, onSave }) => {
    const [availability, setAvailability] = useState({
        monday: { enabled: false, times: '' },
        tuesday: { enabled: false, times: '' },
        wednesday: { enabled: false, times: '' },
        thursday: { enabled: false, times: '' },
        friday: { enabled: false, times: '' },
    });
    const [blockedDates, setBlockedDates] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const availabilityRef = ref(db, `${config.cityCollection}/balcao-config/availability`);
        const blockedDatesRef = ref(db, `${config.cityCollection}/balcao-config/blockedDates`);

        const fetchConfig = async () => {
            const [availSnap, blockedSnap] = await Promise.all([
                get(availabilityRef),
                get(blockedDatesRef)
            ]);

            if (availSnap.exists()) {
                const data = availSnap.val();
                setAvailability(prevAvailability => {
                    const newState = { ...prevAvailability };
                    for (const day in data) {
                        if (newState[day]) {
                            newState[day] = { enabled: true, times: data[day].join(', ') };
                        }
                    }
                    return newState;
                });
            }
            if (blockedSnap.exists()) {
                setBlockedDates(blockedSnap.val().join(', '));
            }
            setLoading(false);
        };
        fetchConfig();
    }, []);

    const handleDayToggle = (day) => {
        setAvailability(prev => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
    };

    const handleTimesChange = (day, times) => {
        setAvailability(prev => ({ ...prev, [day]: { ...prev[day], times: times } }));
    };

    const handleSaveClick = () => {
        const finalConfig = {};
        for (const day in availability) {
            if (availability[day].enabled && availability[day].times.trim()) {
                finalConfig[day] = availability[day].times.split(',').map(t => t.trim()).filter(Boolean);
            }
        }
        const blockedDatesConfig = blockedDates.split(',').map(d => d.trim()).filter(Boolean);
        onSave(finalConfig, blockedDatesConfig);
    };

    const daysOfWeek = { monday: 'Segunda-feira', tuesday: 'Terça-feira', wednesday: 'Quarta-feira', thursday: 'Quinta-feira', friday: 'Sexta-feira' };

    if (loading) return <div className="modal-overlay"><div className="modal-content"><p>Carregando...</p></div></div>;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Configurar Disponibilidade</h3><button type="button" onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button></div>
                <div className="modal-body">
                    <p>Marque os dias e informe os horários separados por vírgula (ex: 08:00, 09:00).</p>
                    {Object.keys(daysOfWeek).map(day => (
                        <div key={day} className="form-row" style={{ alignItems: 'center', marginBottom: '15px' }}><div style={{ flex: '0.5' }}><input type="checkbox" id={day} checked={availability[day].enabled} onChange={() => handleDayToggle(day)} /><label htmlFor={day} style={{ marginLeft: '10px' }}>{daysOfWeek[day]}</label></div><div className="form-group" style={{ flex: '1.5', marginBottom: 0 }}><input type="text" placeholder="Ex: 08:00, 09:00, 10:00" value={availability[day].times} onChange={(e) => handleTimesChange(day, e.target.value)} disabled={!availability[day].enabled} className="form-input" /></div></div>
                    ))}
                    <div className="form-group">
                        <label>Dias sem atendimento (feriados, pontos facultativos)</label>
                        <input type="text" placeholder="Ex: 25/12/2024, 01/01/2025" value={blockedDates} onChange={(e) => setBlockedDates(e.target.value)} className="form-input" />
                    </div>
                    <div className="form-actions"><button onClick={handleSaveClick} className="btn-primary">Salvar Configuração</button></div>
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
                const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
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
                data: uploadResult.url // Substituímos o base64 pela URL
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
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);
    const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);

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
        const solicitacoesRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
        const q = query(solicitacoesRef, orderByKey());
        
        try {
            const snapshot = await get(q);
            const data = snapshot.val();
            const fetchedData = data 
                ? Object.keys(data)
                    .map(key => ({ id: key, ...data[key] }))
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                : [];

            const counts = fetchedData.reduce((acc, item) => {
                const status = item.status || 'Não Classificado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Aguardando Atendimento', 'Agendamento Liberado', 'Agendado', 'Em Análise', 'Concluído', 'Não Classificado'];
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

    useEffect(() => {
        fetchData(); // Chama a função uma vez ao montar
    }, [fetchData]);

    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Total de Solicitações',
                    data: Object.values(statusCounts),
                    backgroundColor: [
                        'rgba(37, 99, 235, 0.7)',
                        'rgba(255, 192, 9, 0.7)',
                        'rgba(76, 175, 80, 0.7)',
                        'rgba(239, 68, 68, 0.7)',
                        'rgba(156, 163, 175, 0.7)',
                        'rgba(139, 92, 246, 0.7)',
                    ],
                    borderColor: [
                        '#2563eb',
                        '#ffc009',
                        '#4caf50',
                        '#ef4444',
                        '#9ca3af',
                        '#8b5cf6',
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2000,
                    easing: 'easeOutQuart'
                },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
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

        const notificacoesRef = ref(db, `${config.cityCollection}/notifications`);
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            isRead: false,
            protocolo: solicitacao.id,
            targetUserId: solicitacao.userId,
            timestamp: serverTimestamp(),
            tituloNotification: notificationTitle,
            descricaoNotification: notificationDescription,
            userEmail: solicitacao.dadosUsuario.email,
            userId: solicitacao.userId
        });

        const mailRef = ref(db, `${config.cityCollection}/mail`);
        const newMailRef = push(mailRef);
        await set(newMailRef, {
            to: solicitacao.dadosUsuario.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
            },
        });
    };

    const handleStatusChange = async (id, newStatus) => {
        const itemRef = ref(db, `${config.cityCollection}/balcao-cidadao/${id}`);
        let updateData = { status: newStatus };
        if (newStatus === 'Cancelado') {
            // Set deletion timestamp for 3 days from now
            updateData.deletionTimestamp = Date.now() + 3 * 24 * 60 * 60 * 1000;
        } else {
            updateData.deletionTimestamp = null; // Clear if status is changed from Cancelado
        }
        await update(itemRef, updateData);
        await sendNotification({ ...selectedSolicitacao, id, status: newStatus });
        alert('Status atualizado!');
        fetchData(); // Atualiza localmente após a alteração
        handleCloseModal();
    };

    const handleSaveAvailability = async (availabilityConfig, blockedDatesConfig) => {
        const availabilityRef = ref(db, `${config.cityCollection}/balcao-config/availability`);
        const blockedDatesRef = ref(db, `${config.cityCollection}/balcao-config/blockedDates`);
        try {
            await set(availabilityRef, availabilityConfig);
            await set(blockedDatesRef, blockedDatesConfig);
            alert('Disponibilidade salva com sucesso!');
            setIsAvailabilityModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar disponibilidade:", error);
            alert('Falha ao salvar a disponibilidade.');
        }
    };

    const handleSendMessage = async (id, text) => {
        const messagesRef = ref(db, `${config.cityCollection}/balcao-cidadao/${id}/messages`);
        const newMessageRef = push(messagesRef);
        await set(newMessageRef, { text, sender: 'admin', timestamp: serverTimestamp() });
        await sendNotification({ ...selectedSolicitacao, id });
        fetchData(); // Atualiza para mostrar a nova mensagem
        alert('Mensagem enviada!');
    };

    const handleNotifyUser = async (solicitacao) => {
        const userData = solicitacao.dadosUsuario;
        if (!userData || !userData.id) return alert("Usuário não identificado.");
        if (!userData.email) return alert("E-mail do usuário não encontrado.");

        const notificationTitle = "Notificação de Atualização";
        const notificationMessage = `Sua solicitação no Balcão do Cidadão sobre "${solicitacao.dadosSolicitacao.assunto}" foi atualizada.`;

        const notificacoesRef = ref(db, `${config.cityCollection}/notifications`);
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            userId: userData.id,
            userEmail: userData.email,
            message: notificationMessage,
            timestamp: serverTimestamp(),
            read: false,
        });

        const mailRef = ref(db, `${config.cityCollection}/mail`);
        const newMailRef = push(mailRef);
        await set(newMailRef, {
            to: userData.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationMessage}</p>`,
            },
        });
        alert(`Usuário ${userData.email} notificado!`);
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
                    <div className="card-header"><h3>Atividades Recentes</h3></div>
                    <div className="chart-container">
                        <div style={{ height: '450px', width: '100%' }}>
                            {loading ? <p>Carregando...</p> : <canvas ref={chartRef}></canvas>}
                        </div>
                    </div>
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