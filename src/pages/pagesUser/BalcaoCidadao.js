import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { firestore } from '../../firebase';
import { 
    collection, query, where, doc, getDoc, 
    updateDoc, setDoc, serverTimestamp, orderBy, onSnapshot 
} from 'firebase/firestore';
import Sidebar from '../../components/Sidebar';
import config from '../../config';
import { uploadFileToStorage, deleteFileFromStorage } from '../../utils/firebaseStorageUtils';

// Ícones
import { LiaPlusSolid, LiaTimesSolid, LiaPaperPlane, LiaEditSolid, LiaPaperclipSolid, LiaUploadSolid } from "react-icons/lia";

// Componente para Agendamento
const AgendamentoSection = ({ solicitacaoId, onScheduled }) => {
    const [formData, setFormData] = useState({ appointmentDate: '', appointmentTime: '' });
    const [availability, setAvailability] = useState(null);
    const [bookedSlots, setBookedSlots] = useState({});
    const [blockedDates, setBlockedDates] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            const availabilityRef = doc(firestore, 'balcao-config', 'availability');
            const bookedSlotsRef = doc(firestore, 'balcao-config', 'bookedSlots');
            const blockedDatesRef = doc(firestore, 'balcao-config', 'blockedDates');
            
            try {
                const [availSnap, bookedSnap, blockedSnap] = await Promise.all([
                    getDoc(availabilityRef), getDoc(bookedSlotsRef), getDoc(blockedDatesRef)
                ]);
                if (availSnap.exists()) setAvailability(availSnap.data());
                if (bookedSnap.exists()) setBookedSlots(bookedSnap.data());
                
                let manualBlocked = [];
                if (blockedSnap.exists()) manualBlocked = blockedSnap.data().dates || [];

                // Integração com BrasilAPI para bloquear feriados nacionais
                const currentYear = new Date().getFullYear();
                const years = [currentYear, currentYear + 1];
                let holidays = [];

                await Promise.all(years.map(async (year) => {
                    try {
                        const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
                        if (res.ok) {
                            const data = await res.json();
                            const formatted = data.map(h => {
                                const [y, m, d] = h.date.split('-');
                                return `${d}/${m}/${y}`;
                            });
                            holidays = [...holidays, ...formatted];
                            
                            // Adicionando feriados municipais de Paraipaba (Lei 741/2018)
                            holidays.push(`05/02/${year}`); // Emancipação Política
                            holidays.push(`01/11/${year}`); // Dia da Padroeira
                            holidays.push(`19/03/${year}`); // São José - Padroeiro dos Trabalhadores (considerado ponto facultativo)
                        }
                    } catch (error) {
                        console.error(`Erro ao buscar feriados para ${year}:`, error);
                    }
                }));

                // Combina bloqueios manuais com feriados (removendo duplicatas)
                const allBlockedDates = [...new Set([...manualBlocked, ...holidays])];
                setBlockedDates(allBlockedDates);

            } catch (err) {
                setError('Erro ao carregar horários.');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleDateChange = (e) => {
        const date = e.target.value;
        setFormData({ appointmentDate: date, appointmentTime: '' });

        // Converter a data do input (AAAA-MM-DD) para o formato brasileiro (DD/MM/AAAA) para verificação
        let dateBR = date;
        if (date) {
            const [year, month, day] = date.split('-');
            dateBR = `${day}/${month}/${year}`;
        }

        // Verifica se a data formatada (BR) está na lista de datas bloqueadas
        if (!availability || !date || blockedDates.includes(dateBR)) {
            setAvailableTimes([]);
            if (blockedDates.includes(dateBR)) setError('Este dia não está disponível para agendamento.');
            else setError('');
            return;
        }
        setError('');

        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
        const allSlotsForDay = availability[dayOfWeek] || [];
        const alreadyBookedSlots = bookedSlots[date] || [];
        const freeSlots = allSlotsForDay.filter(slot => !alreadyBookedSlots.includes(slot));
        setAvailableTimes(freeSlots);
    };

    const handleSchedule = () => {
        if (!formData.appointmentDate || !formData.appointmentTime) {
            setError('Por favor, selecione data e hora.');
            return;
        }
        onScheduled(solicitacaoId, formData.appointmentDate, formData.appointmentTime);
    };

    if (loading) return <p>Carregando opções de agendamento...</p>;

    return (
        <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginTop: '20px' }}>
            <h4>Realizar Agendamento</h4>
            <div className="form-row">
                <div className="form-group">
                    <label>Data</label>
                    <input type="date" value={formData.appointmentDate} onChange={handleDateChange} className="form-input" />
                </div>
                <div className="form-group">
                    <label>Horário</label>
                    <select value={formData.appointmentTime} onChange={(e) => setFormData(prev => ({ ...prev, appointmentTime: e.target.value }))} className="form-input" disabled={!formData.appointmentDate || availableTimes.length === 0}>
                        <option value="">Selecione</option>
                        {availableTimes.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                </div>
            </div>
            {error && <p className="error-message-inline">{error}</p>}
            <button onClick={handleSchedule} className="btn-primary" style={{ width: '100%' }}>Confirmar Agendamento</button>
        </div>
    );
};

// Mapeamento de nomes técnicos dos campos para labels amigáveis
const FIELD_LABELS = {
    cin_certidao: "Certidão de Nascimento/Casamento",
    cin_responsavel: "Documento do Responsável",
    cpf_identidade: "Documento de Identidade (RG/CNH)",
    cpf_estado_civil: "Comprovante de Estado Civil",
    cpf_selfie: "Selfie com Documento",
    cpf_residencia: "Comprovante de Residência",
    arquivos_adicionais: "Arquivos Adicionais"
};

// Componente Modal para exibir detalhes
const SolicitacaoModal = ({ solicitacao, onClose, onSendMessage, onScheduleSubmit, onUploadFiles }) => {
    const [message, setMessage] = useState('');
    const [uploading, setUploading] = useState(false);

    if (!solicitacao) return null;

    const { dadosSolicitacao, dadosBeneficiario, status, dataSolicitacao, messages, appointmentDate, appointmentTime } = solicitacao;

    const handleSend = () => {
        if (message.trim()) {
            onSendMessage(solicitacao.id, message);
            setMessage('');
        }
    };

    const handleFileUpdate = async (e, fieldKey) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setUploading(true);
        try {
            await onUploadFiles(solicitacao.id, files, fieldKey);
            alert("Arquivo atualizado com sucesso!");
        } catch (error) {
            alert("Erro ao atualizar arquivo. Tente novamente.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Solicitação</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="detail-item"><strong>Status:</strong> <span className={`status-badge ${getStatusClass(status)}`}>{status}</span></div>
                    <div className="detail-item"><strong>Data da Solicitação:</strong> {new Date(dataSolicitacao).toLocaleDateString('pt-BR')}</div>
                    {status === 'Agendado' && (
                        <>
                            <div className="detail-item"><strong>Data Agendada:</strong> {appointmentDate}</div>
                            <div className="detail-item"><strong>Horário Agendado:</strong> {appointmentTime}</div>
                        </>
                    )}
                    {dadosBeneficiario && (
                        <>
                            <hr />
                            <h4>Dados do Beneficiário</h4>
                            <div className="detail-item"><strong>Nome:</strong> {dadosBeneficiario.name || 'N/A'}</div>
                            <div className="detail-item"><strong>CPF:</strong> {dadosBeneficiario.cpf || 'N/A'}</div>
                            <div className="detail-item"><strong>Parentesco:</strong> {dadosBeneficiario.parentesco || 'N/A'}</div>
                        </>
                    )}
                    <hr />
                    <h4>Detalhes</h4>
                    <div className="detail-item"><strong>Assunto:</strong> {dadosSolicitacao?.assunto || 'N/A'}</div> 
                    {dadosSolicitacao?.assunto === 'Agendamento' ? (
                        <>
                            <div className="detail-item"><strong>Data Agendada:</strong> {dadosSolicitacao?.appointmentDate || 'N/A'}</div>
                            <div className="detail-item"><strong>Horário Agendado:</strong> {dadosSolicitacao?.appointmentTime || 'N/A'}</div>
                            <div className="detail-item"><strong>Motivo:</strong></div>
                            <p className="detail-description">{dadosSolicitacao?.descricao || 'Não especificado'}</p>
                        </>
                    ) : (
                        <>
                            <div className="detail-item"><strong>Descrição:</strong></div>
                            <p className="detail-description">{dadosSolicitacao?.descricao || 'N/A'}</p>
                        </>
                    )}

                    {status === 'Agendamento Liberado' && (
                        <AgendamentoSection solicitacaoId={solicitacao.id} onScheduled={onScheduleSubmit} />
                    )}

                    <hr />
                    <h4>Documentação e Anexos</h4>
                    <div className="attachments-list" style={{ marginBottom: '15px' }}>
                        {dadosSolicitacao?.anexos && Object.keys(dadosSolicitacao.anexos).length > 0 ? (
                            Object.entries(dadosSolicitacao.anexos).map(([field, files]) => (
                                <div key={field} style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                    <strong style={{ fontSize: '0.85rem', color: '#4b5563', display: 'block', marginBottom: '5px' }}>
                                        {FIELD_LABELS[field] || field}:
                                    </strong>
                                    {Array.isArray(files) && files.map((file, idx) => (
                                        <div key={`${field}-${idx}`} className="attachment-item" style={{ marginBottom: '5px' }}>
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="file-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}>
                                                <LiaPaperclipSolid /> {file.name}
                                            </a>
                                        </div>
                                    ))}
                                    <div style={{ marginTop: '8px' }}>
                                        <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '0.75rem', borderRadius: '4px' }}>
                                            <LiaUploadSolid size={14} />
                                            {uploading ? 'Enviando...' : 'Substituir Arquivo'}
                                            <input type="file" multiple={field === 'arquivos_adicionais'} onChange={(e) => handleFileUpdate(e, field)} hidden disabled={uploading} />
                                        </label>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p style={{ color: '#666', fontSize: '0.9rem' }}>Nenhum arquivo anexado.</p>
                        )}
                    </div>

                    {(!dadosSolicitacao?.anexos || !dadosSolicitacao.anexos.arquivos_adicionais) && (
                        <div className="upload-section" style={{ marginTop: '10px' }}>
                            <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '0.9rem' }}>
                                <LiaUploadSolid size={18} />
                                {uploading ? 'Enviando...' : 'Anexar Outros Arquivos'}
                                <input type="file" multiple onChange={(e) => handleFileUpdate(e, 'arquivos_adicionais')} hidden disabled={uploading} />
                            </label>
                        </div>
                    )}

                    <hr />
                    <h4>Mensagens</h4>
                    <div className="message-history">
                        {messages && Object.values(messages).length > 0 ? (
                            Object.values(messages).map((msg, index) => (
                                <div key={index} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
                                    <p>{msg.text}</p>
                                    <small>{new Date(msg.timestamp).toLocaleString('pt-BR')}</small>
                                </div>
                            ))
                        ) : (<p>Nenhuma mensagem trocada.</p>)}
                    </div>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." rows="3" className="form-input"></textarea>
                    </div>
                    <button onClick={handleSend} className="btn-submit" style={{ width: '100%' }}>
                        <LiaPaperPlane /> Enviar Mensagem
                    </button>
                </div>
            </div>
        </div>
    );
};

const getStatusClass = (status) => {
    switch (status) {
        case 'Aguardando Atendimento': return 'status-pending';
        case 'Agendamento Liberado': return 'status-in-progress';
        case 'Em Análise': return 'status-in-progress';
        case 'Agendado': return 'status-in-progress';
        case 'Concluído': return 'status-completed';
        case 'Documentação Reprovada': return 'status-danger';
        case 'Documentação Reenviada': return 'status-in-progress';
        default: return '';
    }
};

const BalcaoCidadao = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingProfile] = useState(true);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    useEffect(() => {
        const fetchSolicitacoes = () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            setLoading(true);
            const solicitacoesRef = collection(firestore, 'balcao-cidadao');
            const q = query(solicitacoesRef, where('userId', '==', currentUser.uid), orderBy('dataSolicitacao', 'desc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const solicitacoesList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    dataSolicitacao: doc.data().dataSolicitacao?.toMillis ? doc.data().dataSolicitacao.toMillis() : doc.data().dataSolicitacao
                }));
                setSolicitacoes(solicitacoesList);
                setLoading(false);
            }, (err) => {
                console.error("Erro no stream de solicitações:", err);
                setError("Falha ao carregar dados.");
                setLoading(false);
            });

            return unsubscribe;
        };
        
        const unsubscribe = fetchSolicitacoes();
        return () => unsubscribe && unsubscribe();
    }, [currentUser, navigate]);

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) {
            setLoadingProfile(false);
            return;
        }

        const userId = currentUser.uid;
        const userRef = doc(firestore, 'users', userId);
        try {
            const snapshot = await getDoc(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.data();
                setLoggedInUserData({
                    nome: userData.name || currentUser.email,
                    tipo: userData.tipo || 'Cidadão',
                });
            } else {
                setLoggedInUserData({ nome: currentUser.displayName || 'Usuário', tipo: 'Cidadão' });
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        } finally {
            setLoadingProfile(false);
        }
    }, [currentUser]);

    useEffect(() => { fetchUserProfile(); }, [fetchUserProfile]);

    const handleNavigation = (path) => navigate(path);
    const handleOpenModal = (solicitacao) => setSelectedSolicitacao(solicitacao);

    const handleSendMessage = async (solicitacaoId, text) => {
        if (!currentUser) return;
        const docRef = doc(firestore, 'balcao-cidadao', solicitacaoId);
        const msgId = Date.now().toString();
        
        try {
            await updateDoc(docRef, {
                [`messages.${msgId}`]: {
                    text, sender: 'user', timestamp: new Date().toISOString(), userId: currentUser.uid
                }
            });
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            setError("Falha ao enviar mensagem.");
        }
    };

    const handleUploadFiles = async (solicitacaoId, files, fieldKey = 'arquivos_adicionais') => {
        if (!currentUser) return;
        
        try {
            const solicitacaoRef = doc(firestore, 'balcao-cidadao', solicitacaoId);
            const snapshot = await getDoc(solicitacaoRef);
            const currentData = snapshot.data();
            const currentAnexos = currentData.dadosSolicitacao?.anexos || {};

            // Se estivermos atualizando um campo específico (não os adicionais), removemos os arquivos antigos do Storage
            if (fieldKey !== 'arquivos_adicionais' && currentAnexos[fieldKey]) {
                const oldFiles = currentAnexos[fieldKey];
                if (Array.isArray(oldFiles)) {
                    for (const f of oldFiles) {
                        await deleteFileFromStorage(f.url);
                    }
                }
            }

            const uploadedFiles = [];
            const folderPath = `${config.cityCollection}/balcao-cidadao/${currentUser.uid}/anexos`;
            
            for (const file of files) {
                const result = await uploadFileToStorage(file, folderPath);
                uploadedFiles.push({
                    name: file.name,
                    type: file.type,
                    url: result.url
                });
            }

            let updatedFieldFiles = uploadedFiles;
            // Se for a lista de arquivos adicionais, anexamos. Caso contrário, substituímos.
            if (fieldKey === 'arquivos_adicionais') {
                updatedFieldFiles = [...(currentAnexos.arquivos_adicionais || []), ...uploadedFiles];
            }

            await updateDoc(solicitacaoRef, { 
                [`dadosSolicitacao.anexos.${fieldKey}`]: updatedFieldFiles, 
                ultimaAtualizacao: serverTimestamp(),
                status: 'Documentação Reenviada',
                deletionTimestamp: null
            });
        } catch (error) {
            console.error("Erro ao processar upload de arquivos:", error);
            throw error;
        }
    };

    const handleScheduleSubmit = async (solicitacaoId, date, time) => {
        const solicitacaoRef = doc(firestore, 'balcao-cidadao', solicitacaoId);
        const bookedSlotRef = doc(firestore, 'balcao-config', 'bookedSlots');

        try {
            const snapshot = await getDoc(bookedSlotRef);
            const currentBookings = snapshot.exists() ? (snapshot.data()[date] || []) : [];
            
            if (currentBookings.includes(time)) {
                alert('Este horário foi agendado por outra pessoa. Por favor, escolha outro.');
                return;
            }

            await updateDoc(solicitacaoRef, { status: 'Agendado', appointmentDate: date, appointmentTime: time });
            await setDoc(bookedSlotRef, { [date]: [...currentBookings, time] }, { merge: true });

            alert('Agendamento confirmado com sucesso!');
            setSelectedSolicitacao(null); // Fecha o modal
        } catch (error) {
            console.error("Erro ao confirmar agendamento:", error);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Paraipaba</h1>
                        <p>Balcão do Cidadão - Minhas Solicitações</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <div className="page-actions-bar">
                    <button className="btn-send-solicita" onClick={() => navigate('/balcao/novo')}>
                        <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                        Nova Solicitação
                    </button>
                </div>

                <div className="data-list-container">
                    {loading && <p>Carregando solicitações...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && solicitacoes.length === 0 && !error && (
                        <p>Você ainda não possui nenhuma solicitação no Balcão do Cidadão.</p>
                    )}
                    {!loading && solicitacoes.length > 0 && (
                        <ul className="data-list">
                            {solicitacoes.map(solicitacao => (
                                <li key={solicitacao.id} className="data-list-item" onClick={() => handleOpenModal(solicitacao)}>
                                    <div className="item-main-info">
                                        <strong>Assunto: {solicitacao.dadosSolicitacao?.assunto || 'Não especificado'}</strong>
                                        {solicitacao.dadosBeneficiario?.id === 'outro' && (
                                            <span style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>Beneficiário: {solicitacao.dadosBeneficiario.name}</span>
                                        )}
                                        <span>Data: {new Date(solicitacao.dataSolicitacao).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <div className="item-status">
                                            <span className={`status-badge ${getStatusClass(solicitacao.status)}`}>
                                                {solicitacao.status}
                                            </span>
                                        </div>
                                        {['Aguardando Atendimento', 'Em Análise'].includes(solicitacao.status) && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); navigate(`/balcao/novo/${solicitacao.id}`); }}
                                                className="btn-icon"
                                                title="Editar solicitação"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                                            >
                                                <LiaEditSolid size={22} color="var(--primary-color, #2563eb)" />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <SolicitacaoModal
                    solicitacao={selectedSolicitacao}
                    onClose={() => setSelectedSolicitacao(null)}
                    onSendMessage={handleSendMessage}
                    onScheduleSubmit={handleScheduleSubmit}
                    onUploadFiles={handleUploadFiles}
                />
            </div>
        </div>
    );
};

export default BalcaoCidadao;