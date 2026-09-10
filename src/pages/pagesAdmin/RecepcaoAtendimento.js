import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
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
import { buildReceptionWelcomeEmail, isValidOptionalEmail } from '../../utils/receptionWelcomeEmail';
import { openQueuePanelWindow } from '../../utils/openQueuePanelWindow';
import { useSystemControl } from '../../contexts/SystemControlContext';

const RECEPTION_MODULES = {
    'Balcão do Cidadão': 'balcao',
    'Assessoria ao Microempreendedor': 'microempreendedor',
    PROCON: 'procon',
    Ouvidoria: 'ouvidoria',
    'Procuradoria da Mulher': 'procuradoria',
    PIEL: 'piel',
};

const receptionSectors = ['Balcão do Cidadão', 'Assessoria ao Microempreendedor', 'PROCON', 'Ouvidoria', 'Procuradoria da Mulher', 'PIEL'];
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
    PROCON: [
        { value: 'Orientação ao consumidor', label: 'Orientação ao consumidor' },
        { value: 'Registro de reclamação', label: 'Registro de reclamação' },
        { value: 'Consulta de processo', label: 'Consulta de processo' },
        { value: 'Negociação com fornecedor', label: 'Negociação com fornecedor' },
        { value: 'Outros', label: 'Outros' },
    ],
    'Assessoria ao Microempreendedor': [
        { value: 'Orientação para abertura de um novo negócio (MEI)', label: 'Orientação para abertura de um novo negócio (MEI)' },
        { value: 'Dicas e orientações para melhorar seu negócio', label: 'Dicas e orientações para melhorar seu negócio' },
        { value: 'Ajuda para organização de finanças', label: 'Ajuda para organização de finanças' },
        { value: 'Informações sobre impostos e obrigações', label: 'Informações sobre impostos e obrigações' },
    ],
};
const flowSteps = [
    'Setor',
    'Atendimento',
    'Usuário',
    'Solicitação',
    'Anexos',
    'Protocolo e fila',
    'Início',
];

const todayKey = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const queuePrefixes = {
    'Balcão do Cidadão': 'B',
    'Assessoria ao Microempreendedor': 'M',
    Ouvidoria: 'O',
    'Procuradoria da Mulher': 'P',
    PIEL: 'E',
    PROCON: 'C',
};

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
const getBeneficiaryData = (item = {}) => item.dadosBeneficiario
    || item.beneficiario
    || item.beneficiary
    || item.dadosSolicitacao?.beneficiario
    || null;
const getBeneficiaryName = (item) => String(getBeneficiaryData(item)?.name || getBeneficiaryData(item)?.nome || '').trim();
const getRequesterName = (item) => String(item?.dadosUsuario?.name || item?.dadosUsuario?.nome || item?.solicitante?.name || '').trim();
const getCitizenName = (item) => getBeneficiaryName(item) || getRequesterName(item) || 'Cidadão';
const getCitizenCpf = (item) => getBeneficiaryData(item)?.cpf || item?.dadosUsuario?.cpf || '';
const getCitizenPhone = (item) => getBeneficiaryData(item)?.phone || getBeneficiaryData(item)?.telefone || item?.dadosUsuario?.phone || item?.dadosUsuario?.telefone || '';
const getAppointmentSubject = (item) => item?.dadosSolicitacao?.assunto || item?.dadosAssessoria?.tipo || item?.dadosManifestacao?.assunto || item?.dadosAtendimento?.tipoAtendimento || 'Atendimento';
const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const getAppointmentTimestamp = (item) => {
    const normalizedDate = normalizeDate(getAppointmentDate(item));
    const time = String(getAppointmentTime(item) || '').match(/^(\d{1,2}):(\d{2})/);
    if (!normalizedDate || !time) return null;
    const parsed = new Date(`${normalizedDate}T${String(time[1]).padStart(2, '0')}:${time[2]}:00-03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const appointmentIsLateToday = (item) => {
    const appointmentTime = getAppointmentTimestamp(item);
    return Boolean(appointmentTime && normalizeDate(getAppointmentDate(item)) === todayKey() && appointmentTime < new Date());
};
const getAppointmentSortKey = (item) => {
    const normalizedDate = normalizeDate(getAppointmentDate(item));
    const time = String(getAppointmentTime(item) || '23:59').slice(0, 5);
    if (!normalizedDate) return Number.POSITIVE_INFINITY;
    const parsed = new Date(`${normalizedDate}T${time}:00-03:00`).getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const appointmentCollections = [
    { name: 'balcao-cidadao', sector: 'Balcão do Cidadão' },
    { name: 'assessoria-microempreendedor', sector: 'Assessoria ao Microempreendedor' },
    { name: 'ouvidoria', sector: 'Ouvidoria' },
    { name: 'procuradoria-mulher', sector: 'Procuradoria da Mulher' },
    { name: 'piel-atendimentos', sector: 'PIEL' },
    { name: 'procon-agendamentos', sector: 'PROCON' },
];

const getReceptionCollection = (sector) => {
    if (sector === 'Assessoria ao Microempreendedor') return 'assessoria-microempreendedor';
    if (sector === 'Ouvidoria') return 'ouvidoria';
    if (sector === 'Procuradoria da Mulher') return 'procuradoria-mulher';
    if (sector === 'PIEL') return 'piel-atendimentos';
    if (sector === 'PROCON') return 'procon-atendimentos';
    return 'balcao-cidadao';
};

const getReceptionUploadPath = (sector, userId) => {
    if (sector === 'Assessoria ao Microempreendedor') return `${config.cityCollection}/microempreendedor/${userId}/anexos`;
    if (sector === 'Ouvidoria') return `${config.cityCollection}/ouvidoria/${userId}/anexos`;
    if (sector === 'Procuradoria da Mulher') return `procuradoria-mulher/${userId}/anexos`;
    if (sector === 'PIEL') return `${config.cityCollection}/piel/${userId}/anexos`;
    if (sector === 'PROCON') return `${config.cityCollection}/procon/${userId}/anexos`;
    return `${config.cityCollection}/balcao-cidadao/${userId}/anexos`;
};

const createQueueTicket = async ({ protocolo, nome, cpf, assunto, appointmentDate, appointmentTime, setor, collectionName, beneficiarioNome, solicitanteNome, userId, userEmail, requestRef, requestUpdates }) => {
    const dateKey = todayKey();
    const prefix = queuePrefixes[setor] || 'B';
    const counterRef = doc(firestore, 'atendimento-fila-meta', `${dateKey}-${prefix}`);
    const queueRef = doc(collection(firestore, 'atendimento-fila'));

    return runTransaction(firestore, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const next = (counterSnap.exists() ? counterSnap.data().ultimoNumero || 0 : 0) + 1;
        const password = `${prefix}${String(next).padStart(3, '0')}`;

        transaction.set(counterRef, { ultimoNumero: next, data: dateKey, setor, prefixo: prefix }, { merge: true });
        transaction.set(queueRef, {
            senha: password,
            protocolo,
            nome,
            beneficiarioNome: beneficiarioNome || nome,
            solicitanteNome: solicitanteNome || '',
            cpf: cpf || '',
            userId: userId || '',
            userEmail: userEmail || '',
            assunto,
            appointmentDate,
            appointmentTime,
            agendamentoOrdenacaoEm: appointmentDate && appointmentTime
                ? new Date(`${normalizeDate(appointmentDate)}T${String(appointmentTime).slice(0, 5)}:00-03:00`)
                : null,
            collectionName: collectionName || getReceptionCollection(setor),
            setor: setor || 'Balcão do Cidadão',
            prioridade: false,
            status: 'Aguardando',
            criadoEm: new Date(),
            ordemFilaEm: new Date(),
            chamadoEm: null,
            criadoPor: auth.currentUser?.email || 'Recepção',
        });
        if (requestRef && requestUpdates) {
            transaction.update(requestRef, { ...requestUpdates, senhaAtendimento: password });
        }

        return password;
    });
};

const createWalkInQueueTicket = async ({ protocolo, nome, cpf, assunto, setor, collectionName, userId, userEmail, beneficiarioNome, solicitanteNome, requestRef, requestUpdates }) => {
    const dateKey = todayKey();
    const prefix = queuePrefixes[setor] || 'B';
    const counterRef = doc(firestore, 'atendimento-fila-meta', `${dateKey}-${prefix}`);
    const walkInRef = doc(firestore, 'atendimento-fila-meta', `${dateKey}-encaixes-recepcao`);
    const queueRef = doc(collection(firestore, 'atendimento-fila'));

    return runTransaction(firestore, async (transaction) => {
        const [counterSnap, walkInSnap] = await Promise.all([
            transaction.get(counterRef),
            transaction.get(walkInRef),
        ]);
        const currentWalkIns = walkInSnap.exists() ? Number(walkInSnap.data().total || 0) : 0;
        if (currentWalkIns >= 20) {
            const error = new Error('O limite de 20 encaixes sem agendamento para hoje foi atingido.');
            error.code = 'reception/walk-in-limit';
            throw error;
        }

        const next = (counterSnap.exists() ? counterSnap.data().ultimoNumero || 0 : 0) + 1;
        const nextWalkIn = currentWalkIns + 1;
        const password = `${prefix}${String(next).padStart(3, '0')}`;
        const now = new Date();

        transaction.set(counterRef, { ultimoNumero: next, data: dateKey, setor, prefixo: prefix }, { merge: true });
        transaction.set(walkInRef, {
            total: nextWalkIn,
            limite: 20,
            data: dateKey,
            atualizadoEm: now,
        }, { merge: true });
        transaction.set(queueRef, {
            senha: password,
            protocolo,
            nome,
            beneficiarioNome: beneficiarioNome || nome,
            solicitanteNome: solicitanteNome || '',
            cpf: cpf || '',
            assunto,
            appointmentDate: null,
            appointmentTime: null,
            agendamentoOrdenacaoEm: null,
            collectionName: collectionName || getReceptionCollection(setor),
            setor: setor || 'Balcão do Cidadão',
            userId: userId || 'recepcao',
            userEmail: userEmail || '',
            userEmailNormalizado: normalizeEmail(userEmail),
            prioridade: false,
            status: 'Aguardando',
            tipoEntrada: 'Encaixe',
            semAgendamento: true,
            encaixeNumeroDia: nextWalkIn,
            criadoEm: now,
            ordemFilaEm: now,
            chamadoEm: null,
            criadoPor: auth.currentUser?.email || 'Recepção',
        });
        if (requestRef && requestUpdates) {
            transaction.update(requestRef, { ...requestUpdates, senhaAtendimento: password });
        }

        return { password, walkInNumber: nextWalkIn };
    });
};

const RecepcaoAtendimento = () => {
    const { settings } = useSystemControl();
    const availableSectors = useMemo(() => receptionSectors.filter(sector => (
        settings.modules?.[RECEPTION_MODULES[sector]]?.admin !== false
    )), [settings.modules]);
    const availableAppointmentCollections = useMemo(() => appointmentCollections.filter(item => (
        availableSectors.includes(item.sector)
    )), [availableSectors]);
    const [flowStep, setFlowStep] = useState(0);
    const [attendanceType, setAttendanceType] = useState('');
    const [selectedSector, setSelectedSector] = useState('');
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [appointmentSearch, setAppointmentSearch] = useState('');
    const [appointmentResults, setAppointmentResults] = useState([]);
    const [todayAppointments, setTodayAppointments] = useState([]);
    const [appointment, setAppointment] = useState(null);
    const [queuePassword, setQueuePassword] = useState('');
    const [createdProtocol, setCreatedProtocol] = useState('');
    const [createdRequestCollection, setCreatedRequestCollection] = useState('');
    const [walkInDecision, setWalkInDecision] = useState('');
    const [walkInNumber, setWalkInNumber] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uiOptionsOpen, setUiOptionsOpen] = useState(false);
    const [showHeader, setShowHeader] = useState(true);
    const [showSideMenu, setShowSideMenu] = useState(true);
    const [welcomeEmailStatus, setWelcomeEmailStatus] = useState('');

    useEffect(() => {
        if (selectedSector && !availableSectors.includes(selectedSector)) {
            setSelectedSector('');
            setFlowStep(0);
        }
    }, [availableSectors, selectedSector]);
    const [requestForm, setRequestForm] = useState({
        assunto: '',
        tipoDocumento: '',
        nome: '',
        cpf: '',
        telefone: '',
        email: '',
        descricao: '',
    });

    const appointmentIsToday = useMemo(() => {
        if (!appointment) return false;
        return normalizeDate(getAppointmentDate(appointment)) === todayKey();
    }, [appointment]);
    const appointmentLateToday = useMemo(() => appointmentIsLateToday(appointment), [appointment]);

    const isCreateFlow = attendanceType === 'create';
    const isConfirmFlow = attendanceType === 'confirm';

    useEffect(() => {
        if (flowStep === 2 && isConfirmFlow && selectedSector) {
            handleLoadTodayAppointments();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flowStep, isConfirmFlow, selectedSector]);

    const resetFlow = () => {
        setFlowStep(0);
        setAttendanceType('');
        setSelectedSector('');
        setAttachedFiles([]);
        setAppointmentSearch('');
        setAppointmentResults([]);
        setTodayAppointments([]);
        setAppointment(null);
        setQueuePassword('');
        setCreatedProtocol('');
        setCreatedRequestCollection('');
        setWalkInDecision('');
        setWalkInNumber(null);
        setWelcomeEmailStatus('');
        setRequestForm({ assunto: '', tipoDocumento: '', nome: '', cpf: '', telefone: '', email: '', descricao: '' });
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
        if (flowStep === 2 && isCreateFlow) return !!requestForm.nome.trim() && isValidOptionalEmail(requestForm.email);
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
            const snapshots = await Promise.all(availableAppointmentCollections.map(async (item) => {
                const snapshot = await getDocs(query(
                    collection(firestore, item.name),
                    where('status', '==', 'Agendado'),
                    limit(500)
                ));
                return snapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    collectionName: item.name,
                    setorAtendimento: item.sector,
                    ...docSnap.data(),
                }));
            }));

            const results = snapshots.flat()
                .filter((item) => {
                    const values = [
                        item.id,
                        item.setorAtendimento,
                        item.dadosUsuario?.name,
                        item.dadosUsuario?.email,
                        item.dadosUsuario?.cpf,
                        item.dadosUsuario?.telefone,
                        item.dadosUsuario?.phone,
                        item.dadosBeneficiario?.name,
                        item.dadosBeneficiario?.cpf,
                        item.dadosBeneficiario?.phone,
                        item.dadosAssessoria?.tipo,
                        item.dadosAssessoria?.nomeNegocio,
                        item.dadosManifestacao?.assunto,
                        item.dadosAtendimento?.tipoAtendimento,
                        getAppointmentDate(item),
                        getAppointmentTime(item),
                    ].filter(Boolean).join(' ').toLowerCase();

                    return values.includes(term);
                })
                .sort((a, b) => getAppointmentSortKey(a) - getAppointmentSortKey(b) || getCitizenName(a).localeCompare(getCitizenName(b)));

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

    const handleLoadTodayAppointments = async () => {
        if (!selectedSector) {
            alert('Selecione o setor antes de listar os agendamentos.');
            return;
        }

        setLoading(true);
        setAppointment(null);
        setAppointmentResults([]);
        setQueuePassword('');

        try {
            const selectedCollection = availableAppointmentCollections.find((item) => item.sector === selectedSector);
            if (!selectedCollection) {
                setTodayAppointments([]);
                return;
            }

            const snapshot = await getDocs(query(
                collection(firestore, selectedCollection.name),
                where('status', '==', 'Agendado'),
                limit(500)
            ));

            const results = snapshot.docs
                .map((docSnap) => ({
                    id: docSnap.id,
                    collectionName: selectedCollection.name,
                    setorAtendimento: selectedCollection.sector,
                    ...docSnap.data(),
                }))
                .filter((item) => normalizeDate(getAppointmentDate(item)) === todayKey())
                .sort((a, b) => getAppointmentSortKey(a) - getAppointmentSortKey(b) || getCitizenName(a).localeCompare(getCitizenName(b)));

            setTodayAppointments(results);
            if (results.length === 1) {
                setAppointment(results[0]);
            }
        } catch (error) {
            console.error('Erro ao listar agendamentos do dia:', error);
            alert('Erro ao listar os agendamentos do dia.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async (shouldPrint = true) => {
        if (!requestForm.nome.trim() || !requestForm.tipoDocumento.trim()) {
            alert('Informe os dados obrigatórios antes de imprimir.');
            return;
        }

        if (!isValidOptionalEmail(requestForm.email)) {
            alert('Informe um e-mail válido ou deixe o campo em branco.');
            return;
        }
        setLoading(true);
        try {
            const collectionName = getReceptionCollection(selectedSector);
            const docRef = doc(collection(firestore, collectionName));
            const uploadedFiles = [];
            const receptionUserId = auth.currentUser?.uid || 'recepcao';
            const normalizedCitizenEmail = normalizeEmail(requestForm.email);

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
                email: requestForm.email.trim(),
                emailNormalizado: normalizedCitizenEmail,
                parentesco: 'Atendimento presencial',
            };

            const commonFields = {
                dadosUsuario: baseUserData,
                userId: 'recepcao',
                origem: 'recepcao',
                emailVinculoUsuario: requestForm.email.trim(),
                emailVinculoUsuarioNormalizado: normalizedCitizenEmail,
                aguardandoVinculoUsuario: Boolean(normalizedCitizenEmail),
                setorAtendimento: selectedSector,
                ultimaAtualizacao: new Date(),
            };

            let payload;
            if (selectedSector === 'PROCON') {
                payload = {
                    ...commonFields,
                    userDataAtTimeOfComplaint: {
                        userId: 'recepcao',
                        name: requestForm.nome,
                        email: requestForm.email.trim(),
                        phone: requestForm.telefone,
                        cpf: requestForm.cpf,
                    },
                    dadosBeneficiario: beneficiaryData,
                    protocolo: docRef.id,
                    assuntoDenuncia: requestForm.assunto || requestForm.tipoDocumento,
                    tipoReclamacao: requestForm.tipoDocumento,
                    descricao: requestForm.descricao,
                    arquivos: uploadedFiles,
                    status: 'Recebida',
                    situacao: 'Em Análise',
                    createdAt: new Date(),
                };
            } else if (selectedSector === 'Assessoria ao Microempreendedor') {
                payload = {
                    ...commonFields,
                    dadosAssessoria: {
                        tipo: requestForm.tipoDocumento,
                        nomeNegocio: requestForm.assunto || '',
                        cnpj: '',
                        contatoPreferencial: 'Presencial',
                        descricao: requestForm.descricao,
                        anexos: uploadedFiles.length ? { documentos_recepcao: uploadedFiles } : {},
                    },
                    dadosBeneficiario: beneficiaryData,
                    status: 'Recebida',
                    dataSolicitacao: new Date(),
                    messages: {},
                };
            } else if (selectedSector === 'Ouvidoria') {
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
            if (selectedSector === 'PROCON') {
                const consumerKey = requestForm.cpf.replace(/\D/g, '') || docRef.id;
                await setDoc(doc(firestore, 'procon-consumidores', consumerKey), {
                    nome: requestForm.nome,
                    cpf: requestForm.cpf,
                    telefone: requestForm.telefone,
                    email: requestForm.email.trim(),
                    emailNormalizado: normalizedCitizenEmail,
                    origem: 'recepcao',
                    ultimoAtendimentoId: docRef.id,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            if (requestForm.email.trim()) {
                try {
                    await setDoc(doc(firestore, 'mail', `reception-welcome-${docRef.id}`), {
                        to: requestForm.email.trim(),
                        emailOnly: true,
                        templateType: 'reception-welcome-app-download',
                        protocolo: docRef.id,
                        timestamp: serverTimestamp(),
                        message: buildReceptionWelcomeEmail(requestForm.nome, config.cityCollection),
                    });
                    setWelcomeEmailStatus('Boas-vindas com o link do aplicativo encaminhadas para envio por e-mail.');
                } catch (emailError) {
                    console.error('Erro ao encaminhar boas-vindas:', emailError);
                    setWelcomeEmailStatus('Atendimento salvo. Não foi possível encaminhar o e-mail de boas-vindas.');
                }
            }
            setCreatedProtocol(docRef.id);
            setCreatedRequestCollection(collectionName);
            setWalkInDecision('');
            setWalkInNumber(null);
            if (shouldPrint) printProtocolReceipt({
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

    const handleWalkInChoice = async (joinQueue) => {
        if (!createdProtocol || loading || walkInDecision) return;
        if (!joinQueue) {
            setWalkInDecision('request-only');
            return;
        }

        setLoading(true);
        try {
            const result = await createWalkInQueueTicket({
                protocolo: createdProtocol,
                nome: requestForm.nome,
                cpf: requestForm.cpf,
                assunto: requestForm.assunto || requestForm.tipoDocumento,
                setor: selectedSector,
                collectionName: createdRequestCollection || getReceptionCollection(selectedSector),
                userEmail: requestForm.email.trim(),
            });
            await updateDoc(doc(firestore, createdRequestCollection || getReceptionCollection(selectedSector), createdProtocol), {
                statusFila: 'Aguardando Atendimento Presencial',
                senhaAtendimento: result.password,
                tipoEntradaFila: 'Encaixe',
                entradaFilaEm: new Date(),
                ultimaAtualizacao: new Date(),
            });
            setQueuePassword(result.password);
            setWalkInNumber(result.walkInNumber);
            setWalkInDecision('queued');
        } catch (error) {
            console.error('Erro ao encaixar atendimento na fila:', error);
            if (error.code === 'reception/walk-in-limit') {
                setWalkInDecision('limit-reached');
                alert('A solicitação foi criada, mas o limite diário de 20 encaixes sem agendamento já foi atingido.');
            } else {
                alert('A solicitação foi criada, mas não foi possível realizar o encaixe na fila. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmArrival = async (shouldPrint = true) => {
        if (!appointment || !appointmentIsToday) {
            alert('Selecione um agendamento válido para hoje.');
            return;
        }

        if (appointmentLateToday && !window.confirm('Este agendamento está em atraso. Deseja encaixar este cidadão na fila de hoje?')) {
            return;
        }

        setLoading(true);
        try {
            const collectionName = appointment.collectionName || getReceptionCollection(appointment.setorAtendimento || selectedSector);
            const requestRef = doc(firestore, collectionName, appointment.id);
            const requestUpdates = {
                status: 'Agendado',
                statusFila: 'Aguardando Atendimento Presencial',
                tipoEntradaFila: appointmentLateToday ? 'Encaixe' : 'Agendamento',
                confirmadoComAtraso: appointmentLateToday,
                chegadaRecepcaoEm: new Date(),
                ultimaAtualizacao: new Date(),
            };
            const queueResult = appointmentLateToday
                ? await createWalkInQueueTicket({
                    protocolo: appointment.id,
                    nome: getCitizenName(appointment),
                    beneficiarioNome: getBeneficiaryName(appointment),
                    solicitanteNome: getRequesterName(appointment),
                    cpf: getCitizenCpf(appointment),
                    userId: appointment.userId || appointment.dadosUsuario?.uid || appointment.dadosUsuario?.id || '',
                    userEmail: appointment.dadosUsuario?.email || appointment.email || '',
                    assunto: getAppointmentSubject(appointment),
                    setor: appointment.setorAtendimento || selectedSector,
                    collectionName,
                    requestRef,
                    requestUpdates,
                })
                : await createQueueTicket({
                protocolo: appointment.id,
                nome: getCitizenName(appointment),
                beneficiarioNome: getBeneficiaryName(appointment),
                solicitanteNome: getRequesterName(appointment),
                cpf: getCitizenCpf(appointment),
                userId: appointment.userId || appointment.dadosUsuario?.uid || appointment.dadosUsuario?.id || '',
                userEmail: appointment.dadosUsuario?.email || appointment.email || '',
                assunto: getAppointmentSubject(appointment),
                appointmentDate: getAppointmentDate(appointment),
                appointmentTime: getAppointmentTime(appointment),
                setor: appointment.setorAtendimento || selectedSector,
                collectionName,
                requestRef,
                requestUpdates,
            });
            const senha = typeof queueResult === 'string' ? queueResult : queueResult.password;

            setQueuePassword(senha);
            if (shouldPrint) printProtocolReceipt({
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
                    CPF: getCitizenCpf(appointment),
                    Telefone: getCitizenPhone(appointment),
                },
                details: {
                    Senha: senha,
                    Entrada: appointmentLateToday ? 'Encaixe por atraso no agendamento' : 'Agendamento confirmado',
                    Assunto: getAppointmentSubject(appointment),
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
                        {availableSectors.map(sector => (
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
                                <small>{sector === 'Balcão do Cidadão' ? 'Documentos e solicitações' : sector === 'Assessoria ao Microempreendedor' ? 'MEI, finanças e impostos' : sector === 'Ouvidoria' ? 'Manifestação cidadã' : sector === 'PIEL' ? 'Atendimento eleitoral' : 'Acolhimento e orientação'}</small>
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
                        <button onClick={handleLoadTodayAppointments} className="btn-secondary" disabled={loading}>
                            <LiaClipboardListSolid /> Listar do dia
                        </button>
                    </div>

                    {todayAppointments.length > 0 && (
                        <div className="appointment-result-list">
                            {todayAppointments.map(result => (
                                <button type="button" key={`today-${result.id}`} className={appointment?.id === result.id ? 'active' : ''} onClick={() => setAppointment(result)}>
                                    <strong>{getBeneficiaryName(result) ? `Beneficiário: ${getBeneficiaryName(result)}` : `Solicitante: ${getCitizenName(result)}`}</strong>
                                    <span>{getBeneficiaryName(result) && getRequesterName(result) && getRequesterName(result) !== getBeneficiaryName(result) ? `Solicitante: ${getRequesterName(result)} • ` : ''}{result.setorAtendimento} • {result.id} • {getAppointmentDate(result)} • {getAppointmentTime(result) || 'Sem horário'}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {appointmentResults.length > 1 && (
                        <div className="appointment-result-list">
                            {appointmentResults.map(result => (
                                <button type="button" key={result.id} className={appointment?.id === result.id ? 'active' : ''} onClick={() => setAppointment(result)}>
                                    <strong>{getBeneficiaryName(result) ? `Beneficiário: ${getBeneficiaryName(result)}` : `Solicitante: ${getCitizenName(result)}`}</strong>
                                    <span>{getBeneficiaryName(result) && getRequesterName(result) && getRequesterName(result) !== getBeneficiaryName(result) ? `Solicitante: ${getRequesterName(result)} • ` : ''}{result.setorAtendimento} • {result.id} • {getAppointmentDate(result) || 'Sem data'} • {getAppointmentTime(result) || 'Sem horário'}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {!todayAppointments.length && !appointmentResults.length && (
                        <p className="detail-description">Use a busca ou toque em `Listar do dia` para carregar todos os agendamentos de hoje deste setor.</p>
                    )}

                    {appointment && (
                        <div className="selected-appointment-card">
                            <div>
                                <strong>{getBeneficiaryName(appointment) ? `Beneficiário: ${getBeneficiaryName(appointment)}` : `Solicitante: ${getCitizenName(appointment)}`}</strong>
                                <span>Protocolo: {appointment.id}</span>
                            </div>
                            {getBeneficiaryName(appointment) && getRequesterName(appointment) !== getBeneficiaryName(appointment) && <p>Solicitante: {getRequesterName(appointment) || 'Não informado'}</p>}
                            <p>Setor: {appointment.setorAtendimento || selectedSector}</p>
                            <p>Status: {appointment.status || 'Sem status'}</p>
                            <p>Data: {getAppointmentDate(appointment) || 'Não informado'}</p>
                            <p>Horário: {getAppointmentTime(appointment) || 'Não informado'}</p>
                            {appointmentLateToday && (
                                <div className="appointment-warning">Este agendamento está em atraso. Ao continuar, a recepção poderá encaixar o cidadão na fila de hoje.</div>
                            )}
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
                    <div className="form-group">
                        <label htmlFor="reception-email">E-mail (opcional)</label>
                        <input id="reception-email" type="email" name="email" autoComplete="email" value={requestForm.email} onChange={handleRequestChange} className="form-input" aria-describedby="reception-email-help" aria-invalid={!isValidOptionalEmail(requestForm.email)} />
                        <small id="reception-email-help" style={{ display: 'block', marginTop: 8 }}>Ao informar o e-mail, o cidadão receberá boas-vindas e o link para baixar o aplicativo da Câmara.</small>
                        {!isValidOptionalEmail(requestForm.email) && <p role="alert">Informe um e-mail válido ou deixe o campo em branco.</p>}
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
                    <p><strong>Setor:</strong> {appointment?.setorAtendimento || selectedSector}</p>
                    <p><strong>Cidadão:</strong> {getCitizenName(appointment)}</p>
                    <p><strong>Protocolo:</strong> {appointment?.id}</p>
                    <p><strong>Data:</strong> {getAppointmentDate(appointment)}</p>
                    <p><strong>Horário:</strong> {getAppointmentTime(appointment)}</p>
                    {appointmentLateToday && <p><strong>Entrada:</strong> Encaixe por atraso no agendamento</p>}
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
                            <p>Protocolo gerado com sucesso. A impressão é opcional.</p>
                            {isCreateFlow && welcomeEmailStatus && <p role="status">{welcomeEmailStatus}</p>}
                            {isCreateFlow && !walkInDecision && (
                                <div className="reception-walk-in-choice">
                                    <div>
                                        <strong>Deseja encaixar este cidadão na fila de hoje?</strong>
                                        <span>São permitidos até 20 atendimentos sem agendamento por dia.</span>
                                    </div>
                                    <div className="reception-walk-in-actions">
                                        <button type="button" className="btn-primary btn-save-status" onClick={() => handleWalkInChoice(true)} disabled={loading}>
                                            <LiaCheckCircleSolid /> {loading ? 'Encaixando...' : 'Encaixar na fila'}
                                        </button>
                                        <button type="button" className="btn-secondary" onClick={() => handleWalkInChoice(false)} disabled={loading}>
                                            Somente criar solicitação
                                        </button>
                                    </div>
                                </div>
                            )}
                            {isCreateFlow && walkInDecision === 'queued' && (
                                <div className="reception-walk-in-result success" role="status">
                                    <LiaCheckCircleSolid />
                                    <div><strong>Encaixe confirmado</strong><span>Senha {queuePassword} · Encaixe {walkInNumber} de 20 do dia</span></div>
                                </div>
                            )}
                            {isCreateFlow && walkInDecision === 'request-only' && (
                                <div className="reception-walk-in-result neutral" role="status">
                                    <LiaClipboardListSolid />
                                    <div><strong>Solicitação criada sem entrada na fila</strong><span>O protocolo permanece disponível para acompanhamento.</span></div>
                                </div>
                            )}
                            {isCreateFlow && walkInDecision === 'limit-reached' && (
                                <div className="reception-walk-in-result warning" role="status">
                                    <LiaClipboardListSolid />
                                    <div><strong>Limite diário atingido</strong><span>A solicitação foi criada, mas não entrou na fila de hoje.</span></div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <p>Revise as informações. Você pode gerar o protocolo sem imprimir.</p>
                            <div className="reception-print-actions">
                                <button
                                    type="button"
                                    className="btn-primary btn-save-status"
                                    onClick={() => isCreateFlow ? handleCreateRequest(true) : handleConfirmArrival(true)}
                                    disabled={loading}
                                >
                                    <LiaPrintSolid /> {loading ? 'Gerando...' : 'Gerar e Imprimir'}
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary reception-skip-print"
                                    onClick={() => isCreateFlow ? handleCreateRequest(false) : handleConfirmArrival(false)}
                                    disabled={loading}
                                >
                                    {loading ? 'Gerando...' : 'Pular impressão'}
                                </button>
                            </div>
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
                            <button onClick={openQueuePanelWindow} className="admin-action-button action-queue">
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

                    {flowStep === 5 && ((isCreateFlow && createdProtocol && walkInDecision) || (isConfirmFlow && queuePassword)) && (
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
