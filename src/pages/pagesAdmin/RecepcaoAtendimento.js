import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, limit, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import {
    LiaCheckCircleSolid,
    LiaClipboardListSolid,
    LiaCogSolid,
    LiaPlusSolid,
    LiaPrintSolid,
    LiaSearchSolid,
    LiaUploadSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { auth, firestore } from '../../firebase';
import config from '../../config';
import { printProtocolReceipt } from '../../utils/printReport';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';

const receptionSectors = ['Balcão do Cidadão', 'Ouvidoria', 'Procuradoria da Mulher', 'PIEL'];
const documentTypeOptions = {
    'Balcão do Cidadão': [
        { value: 'cin', label: 'Carteira de Identidade Nacional (CIN)' },
    ],
    Ouvidoria: [
        { value: 'Reclamação', label: 'Reclamação' },
        { value: 'Sugestão', label: 'Sugestão' },
        { value: 'Denúncia', label: 'Denúncia' },
        { value: 'Elogio', label: 'Elogio' },
        { value: 'Crítica', label: 'Crítica' },
    ],
    'Procuradoria da Mulher': [
        { value: 'Aconselhamento Jurídico', label: 'Aconselhamento Jurídico' },
        { value: 'Apoio Psicológico', label: 'Apoio Psicológico' },
        { value: 'Denúncia de Violência', label: 'Denúncia de Violência' },
        { value: 'Solicitação de Medida Protetiva', label: 'Solicitação de Medida Protetiva' },
        { value: 'Outros', label: 'Outros' },
    ],
    PIEL: [
        { value: 'Regularização Eleitoral', label: 'Regularização Eleitoral' },
        { value: 'Título de Eleitor', label: 'Título de Eleitor' },
        { value: 'Transferência de Domicílio', label: 'Transferência de Domicílio' },
        { value: 'Consulta de Situação Eleitoral', label: 'Consulta de Situação Eleitoral' },
        { value: 'Outros', label: 'Outros' },
    ],
};
const flowSteps = [
    'Setor',
    'Atendimento',
    'Usuário',
    'Solicitação',
    'Anexos',
    'Impressão',
    'Início',
];

const todayKey = () => new Date().toISOString().slice(0, 10);

const normalizeDate = (value) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [day, month, year] = value.split('/');
        return `${year}-${month}-${day}`;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
};

const getAppointmentDate = (item) => item?.appointmentDate || item?.dadosSolicitacao?.appointmentDate || '';
const getAppointmentTime = (item) => item?.appointmentTime || item?.dadosSolicitacao?.appointmentTime || '';
const getCitizenName = (item) => item?.dadosBeneficiario?.name || item?.dadosUsuario?.name || 'Cidadão';

const getReceptionCollection = (sector) => {
    if (sector === 'Ouvidoria') return 'ouvidoria';
    if (sector === 'Procuradoria da Mulher') return 'procuradoria-mulher';
    if (sector === 'PIEL') return 'piel-atendimentos';
    return 'balcao-cidadao';
};

const getReceptionUploadPath = (sector, userId) => {
    if (sector === 'Ouvidoria') return `${config.cityCollection}/ouvidoria/${userId}/anexos`;
    if (sector === 'Procuradoria da Mulher') return `procuradoria-mulher/${userId}/anexos`;
    if (sector === 'PIEL') return `${config.cityCollection}/piel/${userId}/anexos`;
    return `${config.cityCollection}/balcao-cidadao/${userId}/anexos`;
};

const createQueueTicket = async ({ protocolo, nome, assunto, appointmentDate, appointmentTime }) => {
    const dateKey = todayKey();
    const counterRef = doc(firestore, 'atendimento-fila-meta', dateKey);
    const queueRef = doc(collection(firestore, 'atendimento-fila'));

    return runTransaction(firestore, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const next = (counterSnap.exists() ? counterSnap.data().ultimoNumero || 0 : 0) + 1;
        const password = `B${String(next).padStart(3, '0')}`;

        transaction.set(counterRef, { ultimoNumero: next, data: dateKey }, { merge: true });
        transaction.set(queueRef, {
            senha: password,
            protocolo,
            nome,
            assunto,
            appointmentDate,
            appointmentTime,
            status: 'Aguardando',
            criadoEm: new Date(),
            chamadoEm: null,
            criadoPor: auth.currentUser?.email || 'Recepção',
        });

        return password;
    });
};

const RecepcaoAtendimento = () => {
    const navigate = useNavigate();
    const [flowStep, setFlowStep] = useState(0);
    const [attendanceType, setAttendanceType] = useState('');
    const [selectedSector, setSelectedSector] = useState('');
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [appointmentSearch, setAppointmentSearch] = useState('');
    const [appointmentResults, setAppointmentResults] = useState([]);
    const [appointment, setAppointment] = useState(null);
    const [queuePassword, setQueuePassword] = useState('');
    const [createdProtocol, setCreatedProtocol] = useState('');
    const [loading, setLoading] = useState(false);
    const [uiOptionsOpen, setUiOptionsOpen] = useState(false);
    const [showHeader, setShowHeader] = useState(true);
    const [showSideMenu, setShowSideMenu] = useState(true);
    const [requestForm, setRequestForm] = useState({
        assunto: '',
        tipoDocumento: '',
        nome: '',
        cpf: '',
        telefone: '',
        descricao: '',
    });

    const appointmentIsToday = useMemo(() => {
        if (!appointment) return false;
        return normalizeDate(getAppointmentDate(appointment)) === todayKey();
    }, [appointment]);

    const isCreateFlow = attendanceType === 'create';
    const isConfirmFlow = attendanceType === 'confirm';

    const resetFlow = () => {
        setFlowStep(0);
        setAttendanceType('');
        setSelectedSector('');
        setAttachedFiles([]);
        setAppointmentSearch('');
        setAppointmentResults([]);
        setAppointment(null);
        setQueuePassword('');
        setCreatedProtocol('');
        setRequestForm({ assunto: '', tipoDocumento: '', nome: '', cpf: '', telefone: '', descricao: '' });
    };

    const handleRequestChange = (event) => {
        const { name, value } = event.target;
        setRequestForm(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        setAttachedFiles(prev => [...prev, ...files]);
        event.target.value = '';
    };

    const removeAttachedFile = (indexToRemove) => {
        setAttachedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const canGoNext = () => {
        if (flowStep === 0) return !!selectedSector;
        if (flowStep === 1) return !!attendanceType;
        if (flowStep === 2 && isCreateFlow) return !!requestForm.nome.trim();
        if (flowStep === 2 && isConfirmFlow) return !!appointment && appointmentIsToday;
        if (flowStep === 3 && isCreateFlow) return !!requestForm.tipoDocumento.trim();
        if (flowStep === 3 && isConfirmFlow) return true;
        return true;
    };

    const handleNext = () => {
        if (!canGoNext()) {
            if (flowStep === 0) alert('Selecione o setor de atendimento.');
            if (flowStep === 1) alert('Selecione se deseja confirmar agendamento ou criar atendimento.');
            if (flowStep === 2 && isCreateFlow) alert('Informe os dados do usuário.');
            if (flowStep === 2 && isConfirmFlow) alert('Selecione um agendamento válido para hoje.');
            if (flowStep === 3 && isCreateFlow) alert('Informe os dados da solicitação.');
            return;
        }
        setFlowStep(prev => Math.min(prev + 1, flowSteps.length - 1));
    };

    const handleBack = () => {
        setFlowStep(prev => Math.max(prev - 1, 0));
    };

    const handleFindAppointment = async () => {
        const term = appointmentSearch.trim().toLowerCase();
        if (!term) {
            alert('Informe CPF, e-mail, nome, telefone ou protocolo.');
            return;
        }

        setLoading(true);
        setQueuePassword('');
        setAppointment(null);
        setAppointmentResults([]);

        try {
            const snapshot = await getDocs(query(
                collection(firestore, 'balcao-cidadao'),
                where('status', '==', 'Agendado'),
                limit(500)
            ));

            const results = snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
                .filter((item) => {
                    const values = [
                        item.id,
                        item.dadosUsuario?.name,
                        item.dadosUsuario?.email,
                        item.dadosUsuario?.cpf,
                        item.dadosUsuario?.telefone,
                        item.dadosUsuario?.phone,
                        item.dadosBeneficiario?.name,
                        item.dadosBeneficiario?.cpf,
                        item.dadosBeneficiario?.phone,
                        getAppointmentDate(item),
                        getAppointmentTime(item),
                    ].filter(Boolean).join(' ').toLowerCase();

                    return values.includes(term);
                });

            if (!results.length) {
                alert('Nenhum agendamento encontrado com esses dados.');
                return;
            }

            setAppointmentResults(results);
            if (results.length === 1) setAppointment(results[0]);
        } catch (error) {
            console.error('Erro ao buscar agendamentos:', error);
            alert('Erro ao buscar agendamentos.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async () => {
        if (!requestForm.nome.trim() || !requestForm.tipoDocumento.trim()) {
            alert('Informe os dados obrigatórios antes de imprimir.');
            return;
        }

        setLoading(true);
        try {
            const collectionName = getReceptionCollection(selectedSector);
            const docRef = doc(collection(firestore, collectionName));
            const uploadedFiles = [];
            const receptionUserId = auth.currentUser?.uid || 'recepcao';

            for (const file of attachedFiles) {
                const folderPath = getReceptionUploadPath(selectedSector, receptionUserId);
                const uploadResult = await uploadFileToStorage(file, folderPath);
                uploadedFiles.push({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    url: uploadResult.url,
                    uploadedAt: new Date(),
                    source: 'recepcao',
                });
            }

            const baseUserData = {
                identificacao: 'Recepção',
                id: 'recepcao',
                uid: receptionUserId,
                name: 'Recepção',
                email: auth.currentUser?.email || '',
            };

            const beneficiaryData = {
                id: 'recepcao-beneficiario',
                name: requestForm.nome,
                cpf: requestForm.cpf,
                phone: requestForm.telefone,
                parentesco: 'Atendimento presencial',
            };

            const commonFields = {
                dadosUsuario: baseUserData,
                userId: 'recepcao',
                origem: 'recepcao',
                setorAtendimento: selectedSector,
                ultimaAtualizacao: new Date(),
            };

            let payload;
            if (selectedSector === 'Ouvidoria') {
                payload = {
                    ...commonFields,
                    dadosManifestacao: {
                        tipoManifestacao: requestForm.tipoDocumento,
                        identificacao: 'identificado',
                        assunto: requestForm.assunto || requestForm.tipoDocumento,
                        descricao: requestForm.descricao,
                        anexos: uploadedFiles,
                        beneficiario: beneficiaryData,
                    },
                    status: 'Recebida',
                    dataManifestacao: new Date(),
                };
            } else if (selectedSector === 'Procuradoria da Mulher') {
                payload = {
                    ...commonFields,
                    dadosSolicitacao: {
                        tipoAtendimento: requestForm.tipoDocumento,
                        assunto: requestForm.assunto || requestForm.tipoDocumento,
                        descricao: requestForm.descricao,
                        anexos: uploadedFiles,
                        beneficiario: beneficiaryData,
                    },
                    status: 'Recebida',
                    dataSolicitacao: new Date(),
                };
            } else if (selectedSector === 'PIEL') {
                payload = {
                    ...commonFields,
                    dadosAtendimento: {
                        tipoAtendimento: requestForm.tipoDocumento,
                        assunto: requestForm.assunto || requestForm.tipoDocumento,
                        descricao: requestForm.descricao,
                        anexos: uploadedFiles,
                    },
                    dadosBeneficiario: beneficiaryData,
                    status: 'Recebida',
                    dataAtendimento: new Date(),
                };
            } else {
                payload = {
                    ...commonFields,
                    dadosSolicitacao: {
                        assunto: requestForm.assunto || 'Emissão de Documentos',
                        tipoDocumento: requestForm.tipoDocumento,
                        descricao: requestForm.descricao,
                        detalhes: { origem: 'Recepção', setor: selectedSector },
                        anexos: uploadedFiles.length ? { documentos_recepcao: uploadedFiles } : {},
                    },
                    dadosBeneficiario: beneficiaryData,
                    status: 'Aguardando Atendimento',
                    dataSolicitacao: new Date(),
                    deletionTimestamp: null,
                };
            }

            await setDoc(docRef, payload);
            setCreatedProtocol(docRef.id);
            printProtocolReceipt({
                title: 'Comprovante de Atendimento da Recepção',
                protocol: docRef.id,
                status: payload.status,
                createdAt: payload.dataSolicitacao || payload.dataManifestacao || payload.dataAtendimento || new Date(),
                requester: {
                    Usuário: 'Recepção',
                    Setor: selectedSector,
                },
                beneficiary: {
                    Nome: requestForm.nome,
                    CPF: requestForm.cpf,
                    Telefone: requestForm.telefone,
                },
                details: {
                    Assunto: requestForm.assunto || requestForm.tipoDocumento,
                    'Tipo de Documento': requestForm.tipoDocumento,
                    Observações: requestForm.descricao,
                    Anexos: `${uploadedFiles.length} arquivo(s)`,
                },
            });
            setFlowStep(5);
        } catch (error) {
            console.error('Erro ao criar solicitação pela recepção:', error);
            alert('Erro ao criar atendimento.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmArrival = async () => {
        if (!appointment || !appointmentIsToday) {
            alert('Selecione um agendamento válido para hoje.');
            return;
        }

        setLoading(true);
        try {
            const senha = await createQueueTicket({
                protocolo: appointment.id,
                nome: getCitizenName(appointment),
                assunto: appointment.dadosSolicitacao?.assunto || 'Atendimento',
                appointmentDate: getAppointmentDate(appointment),
                appointmentTime: getAppointmentTime(appointment),
            });

            await updateDoc(doc(firestore, 'balcao-cidadao', appointment.id), {
                statusFila: 'Aguardando Atendimento Presencial',
                senhaAtendimento: senha,
                chegadaRecepcaoEm: new Date(),
                ultimaAtualizacao: new Date(),
            });

            setQueuePassword(senha);
            printProtocolReceipt({
                title: 'Senha de Atendimento Presencial',
                protocol: appointment.id,
                status: `Senha ${senha}`,
                createdAt: new Date(),
                requester: {
                    Usuário: 'Recepção',
                    Setor: selectedSector,
                },
                beneficiary: {
                    Nome: getCitizenName(appointment),
                    CPF: appointment.dadosBeneficiario?.cpf || appointment.dadosUsuario?.cpf,
                    Telefone: appointment.dadosBeneficiario?.phone || appointment.dadosUsuario?.phone || appointment.dadosUsuario?.telefone,
                },
                details: {
                    Senha: senha,
                    Assunto: appointment.dadosSolicitacao?.assunto,
                    'Data Agendada': getAppointmentDate(appointment),
                    'Horário Agendado': getAppointmentTime(appointment),
                },
            });
            setFlowStep(5);
        } catch (error) {
            console.error('Erro ao confirmar chegada:', error);
            alert('Erro ao gerar senha de atendimento.');
        } finally {
            setLoading(false);
        }
    };

    const renderSettingsButton = () => (
        <div className="reception-floating-settings">
            <button
                type="button"
                className="admin-action-button action-refresh reception-settings-button"
                onClick={() => setUiOptionsOpen(prev => !prev)}
                title="Configurar tela"
            >
                <LiaCogSolid />
            </button>
            {uiOptionsOpen && (
                <div className="reception-settings-popover">
                    <strong>Exibição do totem</strong>
                    <label>
                        <input type="checkbox" checked={showHeader} onChange={(e) => setShowHeader(e.target.checked)} />
                        Exibir header
                    </label>
                    <label>
                        <input type="checkbox" checked={showSideMenu} onChange={(e) => setShowSideMenu(e.target.checked)} />
                        Exibir side menu
                    </label>
                </div>
            )}
        </div>
    );

    const renderStepContent = () => {
        if (flowStep === 0) {
            return (
                <div className="reception-sector-panel reception-flow-panel">
                    <span>1 Passo</span>
                    <strong>Selecione o setor da Câmara</strong>
                    <div className="reception-sector-grid">
                        {receptionSectors.map(sector => (
                            <button
                                type="button"
                                key={sector}
                                className={selectedSector === sector ? 'active' : ''}
                                onClick={() => {
                                    setSelectedSector(sector);
                                    setRequestForm(prev => ({ ...prev, tipoDocumento: '', assunto: '' }));
                                }}
                            >
                                <span>{sector}</span>
                                <small>{sector === 'Balcão do Cidadão' ? 'Documentos e solicitações' : sector === 'Ouvidoria' ? 'Manifestação cidadã' : sector === 'PIEL' ? 'Atendimento eleitoral' : 'Acolhimento e orientação'}</small>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        if (flowStep === 1) {
            return (
                <div className="reception-kiosk-actions reception-flow-actions">
                    <button type="button" className={`reception-kiosk-button confirm ${isConfirmFlow ? 'selected' : ''}`} onClick={() => setAttendanceType('confirm')}>
                        <LiaCheckCircleSolid />
                        <strong>Confirmar Agendamento</strong>
                        <span>Buscar o agendamento do dia e gerar senha para a fila.</span>
                    </button>
                    <button type="button" className={`reception-kiosk-button create ${isCreateFlow ? 'selected' : ''}`} onClick={() => setAttendanceType('create')}>
                        <LiaPlusSolid />
                        <strong>Criar Atendimento</strong>
                        <span>Registrar um novo atendimento presencial e imprimir o protocolo.</span>
                    </button>
                </div>
            );
        }

        if (flowStep === 2 && isConfirmFlow) {
            return (
                <div className="reception-step-card">
                    <h4>Buscar dados do agendamento</h4>
                    <div className="reception-search-row">
                        <div className="form-group">
                            <label>CPF, e-mail, nome, telefone ou protocolo</label>
                            <input
                                value={appointmentSearch}
                                onChange={(event) => setAppointmentSearch(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleFindAppointment();
                                }}
                                className="form-input"
                                placeholder="Digite os dados do cidadão"
                            />
                        </div>
                        <button onClick={handleFindAppointment} className="btn-secondary" disabled={loading}>
                            <LiaSearchSolid /> Buscar
                        </button>
                    </div>

                    {appointmentResults.length > 1 && (
                        <div className="appointment-result-list">
                            {appointmentResults.map(result => (
                                <button type="button" key={result.id} className={appointment?.id === result.id ? 'active' : ''} onClick={() => setAppointment(result)}>
                                    <strong>{getCitizenName(result)}</strong>
                                    <span>{result.id} • {getAppointmentDate(result) || 'Sem data'} • {getAppointmentTime(result) || 'Sem horário'}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {appointment && (
                        <div className="selected-appointment-card">
                            <div>
                                <strong>{getCitizenName(appointment)}</strong>
                                <span>Protocolo: {appointment.id}</span>
                            </div>
                            <p>Status: {appointment.status || 'Sem status'}</p>
                            <p>Data: {getAppointmentDate(appointment) || 'Não informado'}</p>
                            <p>Horário: {getAppointmentTime(appointment) || 'Não informado'}</p>
                            {!appointmentIsToday && (
                                <div className="appointment-warning">Este agendamento não é para hoje. A confirmação presencial está bloqueada.</div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (flowStep === 2 && isCreateFlow) {
            return (
                <div className="reception-step-card">
                    <h4>Enviar Dados do Usuário</h4>
                    <p className="detail-description">Esses dados serão salvos como beneficiário do usuário recepção.</p>
                    <div className="form-group">
                        <label>Nome</label>
                        <input name="nome" value={requestForm.nome} onChange={handleRequestChange} className="form-input" />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>CPF</label>
                            <input name="cpf" value={requestForm.cpf} onChange={handleRequestChange} className="form-input" />
                        </div>
                        <div className="form-group">
                            <label>Telefone</label>
                            <input name="telefone" value={requestForm.telefone} onChange={handleRequestChange} className="form-input" />
                        </div>
                    </div>
                </div>
            );
        }

        if (flowStep === 3 && isCreateFlow) {
            return (
                <div className="reception-step-card">
                    <h4>Enviar Dados da Solicitação</h4>
                    {selectedSector === 'Balcão do Cidadão' && (
                        <div className="form-group">
                            <label>Assunto</label>
                            <select name="assunto" value={requestForm.assunto || 'Emissão de Documentos'} onChange={handleRequestChange} className="form-input">
                                <option value="Emissão de Documentos">Emissão de Documentos</option>
                                <option value="Entrega de Documentos">Entrega de Documentos</option>
                                <option value="Informações Gerais">Informações Gerais</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                    )}
                    <div className="form-group">
                        <label>{selectedSector === 'Balcão do Cidadão' ? 'Tipo de Documento' : selectedSector === 'Ouvidoria' ? 'Tipo de Manifestação' : 'Tipo de Atendimento'}</label>
                        <select name="tipoDocumento" value={requestForm.tipoDocumento} onChange={handleRequestChange} className="form-input">
                            <option value="">Selecione</option>
                            {(documentTypeOptions[selectedSector] || documentTypeOptions['Balcão do Cidadão']).map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Observações</label>
                        <textarea name="descricao" value={requestForm.descricao} onChange={handleRequestChange} className="form-input" rows="3" />
                    </div>
                </div>
            );
        }

        if (flowStep === 3 && isConfirmFlow) {
            return (
                <div className="reception-step-card reception-review-card">
                    <h4>Dados da Solicitação</h4>
                    <p><strong>Setor:</strong> {selectedSector}</p>
                    <p><strong>Cidadão:</strong> {getCitizenName(appointment)}</p>
                    <p><strong>Protocolo:</strong> {appointment?.id}</p>
                    <p><strong>Data:</strong> {getAppointmentDate(appointment)}</p>
                    <p><strong>Horário:</strong> {getAppointmentTime(appointment)}</p>
                </div>
            );
        }

        if (flowStep === 4) {
            return (
                <div className="reception-step-card">
                    <h4>{isCreateFlow ? 'Enviar Anexos' : 'Anexos'}</h4>
                    {isCreateFlow ? (
                        <>
                            <p className="detail-description">Use a câmera do dispositivo ou selecione arquivos já salvos.</p>
                            <div className="reception-file-actions">
                                <label className="btn-secondary">
                                    <LiaUploadSolid /> Abrir câmera
                                    <input type="file" accept="image/*" capture="environment" hidden onChange={handleFileChange} />
                                </label>
                                <label className="btn-secondary">
                                    <LiaUploadSolid /> Anexar arquivos
                                    <input type="file" accept="image/*,.pdf" multiple hidden onChange={handleFileChange} />
                                </label>
                            </div>
                            {attachedFiles.length > 0 ? (
                                <ul className="reception-file-list">
                                    {attachedFiles.map((file, index) => (
                                        <li key={`${file.name}-${index}`}>
                                            <span>{file.name}</span>
                                            <button type="button" onClick={() => removeAttachedFile(index)}>Remover</button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="detail-description">Nenhum documento registrado ainda.</p>
                            )}
                        </>
                    ) : (
                        <p className="detail-description">Na confirmação de agendamento não é necessário enviar anexos.</p>
                    )}
                </div>
            );
        }

        if (flowStep === 5) {
            const alreadyPrinted = isCreateFlow ? !!createdProtocol : !!queuePassword;
            return (
                <div className="reception-step-card reception-review-card">
                    <h4>Impressão de Protocolo</h4>
                    {alreadyPrinted ? (
                        <>
                            <p><strong>{isCreateFlow ? 'Protocolo:' : 'Senha:'}</strong> {isCreateFlow ? createdProtocol : queuePassword}</p>
                            <p><strong>Setor:</strong> {selectedSector}</p>
                            <p>O comprovante foi aberto para impressão.</p>
                        </>
                    ) : (
                        <>
                            <p>Revise as informações e clique para gerar a impressão.</p>
                            <button
                                type="button"
                                className="btn-primary btn-save-status"
                                onClick={isCreateFlow ? handleCreateRequest : handleConfirmArrival}
                                disabled={loading}
                            >
                                <LiaPrintSolid /> {loading ? 'Gerando...' : 'Imprimir Protocolo'}
                            </button>
                        </>
                    )}
                </div>
            );
        }

        return (
            <div className="reception-step-card reception-review-card">
                <h4>Voltar para o início</h4>
                <p>Atendimento finalizado. Inicie um novo atendimento quando desejar.</p>
                <button type="button" className="btn-primary" onClick={resetFlow}>
                    Novo atendimento
                </button>
            </div>
        );
    };

    return (
        <div className={`dashboard-layout reception-layout ${!showSideMenu ? 'reception-menu-hidden' : ''}`}>
            {showSideMenu && <AdminSidebar />}
            <div className="dashboard-content" style={{ padding: '40px' }}>
                {showHeader && (
                    <header className="page-header-container">
                        <div className="header-title-section">
                            <h1>Recepção</h1>
                            <p>Fluxo presencial em passos para confirmação e criação de atendimentos.</p>
                        </div>
                        <div className="admin-balcao-header-actions">
                            <button onClick={() => navigate('/painel-atendimento')} className="admin-action-button action-queue">
                                <LiaClipboardListSolid />
                                <span className="admin-action-label">Ver Painel da Fila</span>
                            </button>
                        </div>
                    </header>
                )}

                {renderSettingsButton()}

                <section className="reception-flow-shell">
                    <div className="reception-stepper reception-main-stepper">
                        {flowSteps.map((step, index) => (
                            <button
                                type="button"
                                key={step}
                                className={index === flowStep ? 'active' : index < flowStep ? 'done' : ''}
                                onClick={() => index < flowStep && setFlowStep(index)}
                            >
                                <span>{index + 1}</span>
                                {step}
                            </button>
                        ))}
                    </div>

                    {renderStepContent()}

                    {flowStep < 5 && (
                        <div className="reception-step-actions">
                            <button type="button" className="btn-secondary" onClick={handleBack} disabled={flowStep === 0 || loading}>
                                Voltar
                            </button>
                            <button type="button" className="btn-primary" onClick={handleNext} disabled={loading}>
                                Próximo
                            </button>
                        </div>
                    )}

                    {flowStep === 5 && (createdProtocol || queuePassword) && (
                        <div className="reception-step-actions">
                            <button type="button" className="btn-primary" onClick={() => setFlowStep(6)}>
                                Continuar
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default RecepcaoAtendimento;
