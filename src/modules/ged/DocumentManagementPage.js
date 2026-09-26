import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc,
    updateDoc, where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
    LiaArchiveSolid, LiaDownloadSolid, LiaFileAltSolid, LiaFileUploadSolid,
    LiaPlusSolid, LiaSearchSolid, LiaTimesSolid, LiaHomeSolid,
    LiaClockSolid, LiaFolderOpenSolid, LiaHistorySolid, LiaFolderSolid,
    LiaListSolid, LiaThLargeSolid, LiaCloudUploadAltSolid,
} from 'react-icons/lia';
import { firestore, storage } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { canPerformAction } from '../../config/rolePermissions';
import {
    AdministrativeEmptyState, AdministrativeModuleLayout, PermissionGate,
} from '../administrative-core';
import './ged.css';

const CATEGORIES = [
    ['accounting', 'Documentos contábeis e comprovantes de receitas/despesas'],
    ['legislation', 'Leis, decretos, resoluções, portarias e proposições'],
    ['technical', 'Notas técnicas e informativas'],
    ['minutes', 'Atas de sessões, audiências e conferências'],
    ['votes_reports', 'Votos e relatórios'],
    ['procurement', 'Processos licitatórios'],
    ['contracts', 'Contratos e aditivos'],
    ['inventory', 'Fichas de controle de almoxarifado'],
    ['assets', 'Fichas de controle patrimonial'],
    ['fleet', 'Fichas de controle de veículos'],
    ['management_accounts', 'Contas de gestão (formato TCE/CE)'],
    ['fiscal_reports', 'Relatório de Gestão Fiscal (RGF)'],
    ['internal_rules', 'Regimento Interno'],
    ['organic_law', 'Lei Orgânica do Município'],
    ['human_resources', 'Fichas e documentos de recursos humanos'],
    ['other', 'Outros documentos institucionais'],
];
const CATEGORY_NAV_LABELS = {
    accounting: 'Contabilidade', legislation: 'Legislação', technical: 'Notas técnicas',
    minutes: 'Atas e sessões', votes_reports: 'Votos e relatórios',
    procurement: 'Licitações', contracts: 'Contratos e aditivos',
    inventory: 'Almoxarifado', assets: 'Patrimônio', fleet: 'Frota',
    management_accounts: 'Contas de gestão', fiscal_reports: 'Gestão fiscal (RGF)',
    internal_rules: 'Regimento Interno', organic_law: 'Lei Orgânica',
    human_resources: 'Recursos Humanos', other: 'Outros documentos',
};
const ACCESS_LEVELS = [['internal', 'Interno'], ['restricted', 'Restrito'], ['confidential', 'Sigiloso']];
const MAX_BYTES = 25 * 1024 * 1024;
const formatDate = value => value?.toDate ? value.toDate().toLocaleDateString('pt-BR') : value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const formatSize = size => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const safeFileName = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
const allowedFile = file => /^(application\/pdf|image\/(jpeg|png)|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.(ms-excel|ms-powerpoint)|text\/(csv|plain|xml)|application\/(xml|vnd\.ms-excel))$/.test(file.type);
const uploadErrorMessage = (error, context) => {
    const code = error?.code || 'unknown';
    console.error('[GED] Falha no envio do arquivo', {
        code,
        message: error?.message,
        serverResponse: error?.customData?.serverResponse,
        storagePath: context?.storagePath,
        moduleAdminEnabled: context?.moduleAdminEnabled,
        canManage: context?.canManage,
        role: context?.role,
    });
    if (code === 'storage/unauthorized') {
        const checks = [
            `perfil: ${context?.role || 'desconhecido'}`,
            `GED admin: ${context?.moduleAdminEnabled ? 'ativo' : 'inativo'}`,
            `permissão de gestão: ${context?.canManage ? 'sim' : 'não'}`,
        ].join(' · ');
        return `O Firebase Storage negou o upload (storage/unauthorized). ${checks}. Confira se as regras foram publicadas no bucket configurado para este portal. O papel IAM do agente do Storage já consta no projeto; se ele também aparece como “Firebase Rules Firestore Service Agent”, não é necessário adicioná-lo novamente. Veja o console do navegador para os detalhes técnicos.`;
    }
    return `${error?.message || 'Não foi possível enviar o arquivo.'} (${code})`;
};
const categoryName = id => CATEGORIES.find(([key]) => key === id)?.[1] || 'Outros documentos institucionais';
const ACCESS_LABELS = Object.fromEntries(ACCESS_LEVELS);
const blankForm = () => ({ title: '', category: 'other', description: '', documentDate: '', referenceNumber: '', department: '', accessLevel: 'internal', tags: '', file: null });

function DocumentRow({ item, canManage, viewMode = 'list', onVersion, onArchive, onDragStart }) {
    return <article
        className={`ged-document-row${viewMode === 'grid' ? ' is-grid' : ''}`}
        draggable={canManage}
        onDragStart={event => onDragStart?.(event, item)}
    >
        <span className="ged-document-icon"><LiaFileAltSolid /></span>
        <div className="ged-document-main">
            <div><strong>{item.title}</strong><span className={`ged-access ged-access--${item.accessLevel || 'internal'}`}>{ACCESS_LABELS[item.accessLevel] || 'Interno'}</span></div>
            <p>{categoryName(item.category)}{item.referenceNumber ? ` · ${item.referenceNumber}` : ''}{item.department ? ` · ${item.department}` : ''}</p>
            <small>{item.fileName} · {formatSize(item.fileSize || 0)} · v{item.currentVersion || 1} · Atualizado {formatDate(item.updatedAt)}</small>
            {item.description && <small>{item.description}</small>}
            {item.tags?.length > 0 && <div className="ged-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
            {item.versions?.length > 1 && <details className="ged-version-history"><summary>Histórico de versões ({item.versions.length})</summary>{item.versions.map(version => <a key={version.version} href={version.downloadUrl} target="_blank" rel="noreferrer">v{version.version} · {version.fileName} · {formatDate(version.uploadedAt)}</a>)}</details>}
        </div>
        <div className="ged-document-actions">
            <a href={item.downloadUrl} target="_blank" rel="noreferrer" className="secondary-button"><LiaDownloadSolid /> Abrir</a>
            {canManage && <><button className="secondary-button" onClick={() => onVersion(item)}>Nova versão</button>{item.status !== 'archived' && <button className="ged-icon-action" title="Arquivar documento" aria-label={`Arquivar ${item.title}`} onClick={() => onArchive(item)}><LiaArchiveSolid /></button>}</>}
        </div>
    </article>;
}

function FolderCard({ folder, itemCount, onOpen, onDrop, onDocumentDrop }) {
    return <article
        className="ged-folder-card"
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
            event.preventDefault();
            event.stopPropagation();
            const documentId = event.dataTransfer.getData('application/x-ged-document');
            if (documentId) onDocumentDrop(documentId, folder);
            else if (event.dataTransfer.files?.length) onDrop(event.dataTransfer.files, folder);
        }}
    >
        <button type="button" className="ged-folder-open" onClick={() => onOpen(folder)}>
            <LiaFolderSolid />
            <span><strong>{folder.name}</strong><small>{itemCount} documento(s)</small></span>
        </button>
        <span className="ged-folder-drop-hint">Solte arquivos ou documentos aqui</span>
    </article>;
}

export default function DocumentManagementPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser, role } = useAuth();
    const { settings } = useSystemControl();
    const [documents, setDocuments] = useState([]);
    const [folders, setFolders] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [status, setStatus] = useState('active');
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(blankForm);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [versionTarget, setVersionTarget] = useState(null);
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('ged-view-mode') || 'list');
    const [folderModal, setFolderModal] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const canManage = canPerformAction(settings, role, currentUser?.email, 'ged.gerenciar');
    const route = location.pathname.replace(/^\/admin\/ged\/?/, '');
    const isDashboard = !route;
    const isAudit = route === 'auditoria';
    const isRecent = route === 'recentes';
    const isArchived = route === 'arquivados';
    const routeParts = route.split('/');
    const selectedCategory = routeParts[0] === 'categoria' ? routeParts[1] : null;
    const selectedFolderId = selectedCategory && routeParts[2] === 'pasta' ? routeParts[3] : '';
    const categoryPath = selectedCategory ? `/admin/ged/categoria/${selectedCategory}` : '';

    useEffect(() => onSnapshot(collection(firestore, 'gedFolders'), snapshot => {
        setFolders(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, err => setError(err.message || 'Não foi possível carregar as pastas do GED.')), []);

    useEffect(() => {
        const source = collection(firestore, 'gedDocuments');
        const documentsQuery = canPerformAction(settings, role, currentUser?.email, 'ged.gerenciar')
            ? query(source) : query(source, where('accessLevel', '==', 'internal'));
        return onSnapshot(documentsQuery, snapshot => {
        setDocuments(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0)));
        setLoading(false);
        setError('');
    }, err => {
        setLoading(false);
        setError(err.message || 'Não foi possível carregar o arquivo digital.');
        });
    }, [role, settings, currentUser?.email]);

    useEffect(() => {
        if (!canManage) { setAuditLogs([]); return undefined; }
        return onSnapshot(collection(firestore, 'gedAuditLogs'), snapshot => {
            setAuditLogs(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        }, err => setError(err.message || 'Não foi possível carregar a auditoria do GED.'));
    }, [canManage]);

    const filtered = useMemo(() => documents.filter(item => {
        const text = [item.title, item.description, item.referenceNumber, item.department, ...(item.tags || [])].join(' ').toLowerCase();
        const effectiveStatus = isArchived ? 'archived' : isRecent || selectedCategory ? 'active' : status;
        const recentlyUpdated = (item.updatedAt?.toMillis?.() || 0) >= Date.now() - 30 * 24 * 60 * 60 * 1000;
        return (effectiveStatus === 'all' || item.status === effectiveStatus)
            && (selectedCategory ? item.category === selectedCategory : category === 'all' || item.category === category)
            && (!selectedCategory || (item.folderId || '') === selectedFolderId)
            && (!isRecent || recentlyUpdated)
            && (!search || text.includes(search.toLowerCase()));
    }), [documents, search, category, status, isArchived, isRecent, selectedCategory, selectedFolderId]);
    const visibleFolders = useMemo(() => folders.filter(folder => folder.status === 'active'
        && folder.category === selectedCategory
        && (folder.parentId || '') === selectedFolderId), [folders, selectedCategory, selectedFolderId]);
    const folderTrail = useMemo(() => {
        const trail = [];
        let currentId = selectedFolderId;
        const visited = new Set();
        const foldersById = new Map(folders.map(folder => [folder.id, folder]));
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const folder = foldersById.get(currentId);
            if (!folder) break;
            trail.unshift(folder);
            currentId = folder.parentId || '';
        }
        return trail;
    }, [folders, selectedFolderId]);
    const metrics = useMemo(() => ({
        total: documents.filter(item => item.status !== 'archived').length,
        categories: new Set(documents.filter(item => item.status !== 'archived').map(item => item.category)).size,
        archived: documents.filter(item => item.status === 'archived').length,
    }), [documents]);

    const saveAudit = (documentId, action, details) => addDoc(collection(firestore, 'gedAuditLogs'), {
        documentId, action, details, userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'Usuário',
        createdAt: serverTimestamp(),
    });

    const openFolder = folder => navigate(`${categoryPath}/pasta/${folder.id}`);

    const createFolder = async event => {
        event.preventDefault();
        const name = folderName.trim();
        if (!name || !selectedCategory || !canManage) return;
        setBusy(true);
        try {
            const folderRef = await addDoc(collection(firestore, 'gedFolders'), {
                name,
                category: selectedCategory,
                parentId: selectedFolderId || '',
                status: 'active',
                createdBy: currentUser.uid,
                createdByName: currentUser.displayName || currentUser.email || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            await saveAudit(folderRef.id, 'FOLDER_CREATED', `Pasta criada: ${name}`);
            setFolderName('');
            setFolderModal(false);
            setFeedback(`Pasta “${name}” criada.`);
        } catch (err) {
            setFeedback(err.message || 'Não foi possível criar a pasta.');
        } finally {
            setBusy(false);
        }
    };

    const uploadDroppedFiles = async (files, targetFolder = null) => {
        const uploadable = Array.from(files || []);
        if (!uploadable.length || !canManage) return;
        setBusy(true);
        setFeedback('');
        let uploaded = 0;
        try {
            for (const file of uploadable) {
                if (file.size > MAX_BYTES || !allowedFile(file)) continue;
                const documentRef = doc(collection(firestore, 'gedDocuments'));
                const storagePath = `administrativo/ged/${documentRef.id}/1-${Date.now()}-${safeFileName(file.name)}`;
                const storageRef = ref(storage, storagePath);
                const accessLevel = 'internal';
                const destinationCategory = targetFolder?.category || selectedCategory || (category === 'all' ? 'other' : category);
                const folderId = targetFolder?.id || selectedFolderId || '';
                await uploadBytes(storageRef, file, {
                    contentType: file.type,
                    customMetadata: { gedAccessLevel: accessLevel, gedUploaderUid: currentUser.uid },
                });
                const downloadUrl = await getDownloadURL(storageRef);
                const title = file.name.replace(/\.[^.]+$/, '');
                await setDoc(documentRef, {
                    title,
                    category: destinationCategory,
                    folderId,
                    description: '',
                    documentDate: '',
                    referenceNumber: '',
                    department: '',
                    accessLevel,
                    tags: [],
                    status: 'active',
                    currentVersion: 1,
                    versions: [{ version: 1, fileName: file.name, mimeType: file.type, fileSize: file.size, storagePath, downloadUrl, uploadedBy: currentUser.uid, uploadedAt: new Date().toISOString() }],
                    fileName: file.name,
                    mimeType: file.type,
                    fileSize: file.size,
                    storagePath,
                    downloadUrl,
                    createdBy: currentUser.uid,
                    createdByName: currentUser.displayName || currentUser.email || '',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                await saveAudit(documentRef.id, 'DOCUMENT_CREATED', `Documento enviado por arrastar e soltar: ${file.name}`);
                uploaded += 1;
            }
            setFeedback(uploaded
                ? `${uploaded} arquivo(s) adicionado(s) ao GED.`
                : 'Nenhum arquivo válido. Envie PDF, imagem, documento Office, CSV ou XML de até 25 MB.');
        } catch (err) {
            setFeedback(uploadErrorMessage(err, {
                role, canManage,
                moduleAdminEnabled: settings.modules?.ged?.admin === true,
            }));
        } finally {
            setBusy(false);
            setDragActive(false);
        }
    };

    const moveDocument = async (documentId, targetFolder = null) => {
        if (!canManage) return;
        const item = documents.find(document => document.id === documentId);
        if (!item) return;
        const destinationCategory = targetFolder?.category || selectedCategory || item.category;
        const folderId = targetFolder?.id || selectedFolderId || '';
        if (item.category === destinationCategory && (item.folderId || '') === folderId) return;
        try {
            await updateDoc(doc(firestore, 'gedDocuments', documentId), {
                category: destinationCategory,
                folderId,
                updatedAt: serverTimestamp(),
            });
            await saveAudit(documentId, 'DOCUMENT_MOVED', `Documento movido para ${targetFolder?.name || categoryName(destinationCategory)}.`);
            setFeedback(`“${item.title}” movido com sucesso.`);
        } catch (err) {
            setFeedback(err.message || 'Não foi possível mover o documento.');
        }
    };

    const handleWorkspaceDrop = event => {
        event.preventDefault();
        setDragActive(false);
        const documentId = event.dataTransfer.getData('application/x-ged-document');
        if (documentId) moveDocument(documentId);
        else if (event.dataTransfer.files?.length) uploadDroppedFiles(event.dataTransfer.files);
    };

    const setExplorerView = mode => {
        setViewMode(mode);
        localStorage.setItem('ged-view-mode', mode);
    };

    const openNewDocument = () => {
        setForm({
            ...blankForm(),
            category: selectedCategory || 'other',
            accessLevel: selectedCategory === 'human_resources' ? 'confidential' : 'internal',
        });
        setFeedback('');
        setModal(true);
    };

    const uploadNewDocument = async event => {
        event.preventDefault();
        const file = form.file;
        if (!file || !form.title.trim()) return;
        if (file.size > MAX_BYTES) { setFeedback('O arquivo deve ter no máximo 25 MB.'); return; }
        if (!allowedFile(file)) { setFeedback('Formato não permitido. Envie PDF, imagens, documentos Office, CSV ou XML.'); return; }
        setBusy(true); setFeedback('');
        let storagePath = '';
        try {
            const documentRef = doc(collection(firestore, 'gedDocuments'));
            storagePath = `administrativo/ged/${documentRef.id}/1-${Date.now()}-${safeFileName(file.name)}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file, {
                contentType: file.type,
                customMetadata: {
                    gedAccessLevel: form.accessLevel,
                    gedUploaderUid: currentUser.uid,
                },
            });
            const downloadUrl = await getDownloadURL(storageRef);
            const tags = form.tags.split(',').map(tag => tag.trim()).filter(Boolean);
            await setDoc(documentRef, {
                title: form.title.trim(), category: form.category, description: form.description.trim(),
                folderId: selectedCategory && form.category === selectedCategory ? selectedFolderId || '' : '',
                documentDate: form.documentDate, referenceNumber: form.referenceNumber.trim(),
                department: form.department.trim(), accessLevel: form.accessLevel, tags,
                status: 'active', currentVersion: 1,
                versions: [{ version: 1, fileName: file.name, mimeType: file.type, fileSize: file.size, storagePath, downloadUrl, uploadedBy: currentUser.uid, uploadedAt: new Date().toISOString() }],
                fileName: file.name, mimeType: file.type, fileSize: file.size, storagePath, downloadUrl,
                createdBy: currentUser.uid, createdByName: currentUser.displayName || currentUser.email || '',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
            await saveAudit(documentRef.id, 'DOCUMENT_CREATED', `Documento criado: ${form.title.trim()}`);
            setForm(blankForm()); setModal(false); setFeedback('Documento adicionado ao GED.');
        } catch (err) {
            setFeedback(uploadErrorMessage(err, {
                storagePath,
                role,
                canManage,
                moduleAdminEnabled: settings.modules?.ged?.admin === true,
            }));
        }
        finally { setBusy(false); }
    };

    const addVersion = async event => {
        event.preventDefault();
        const file = event.currentTarget.elements.versionFile.files?.[0];
        if (!file || !versionTarget) return;
        if (file.size > MAX_BYTES || !allowedFile(file)) { setFeedback('Verifique o tamanho (máx. 25 MB) e o formato do arquivo.'); return; }
        setBusy(true); setFeedback('');
        let storagePath = '';
        try {
            const previousVersion = Number(versionTarget.currentVersion || 1);
            const nextVersion = previousVersion + 1;
            storagePath = `administrativo/ged/${versionTarget.id}/${nextVersion}-${Date.now()}-${safeFileName(file.name)}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file, {
                contentType: file.type,
                customMetadata: {
                    gedAccessLevel: versionTarget.accessLevel || 'internal',
                    gedUploaderUid: currentUser.uid,
                },
            });
            const downloadUrl = await getDownloadURL(storageRef);
            const version = { version: nextVersion, fileName: file.name, mimeType: file.type, fileSize: file.size, storagePath, downloadUrl, uploadedBy: currentUser.uid, uploadedAt: new Date().toISOString() };
            await updateDoc(doc(firestore, 'gedDocuments', versionTarget.id), {
                currentVersion: nextVersion, fileName: file.name, mimeType: file.type,
                fileSize: file.size, storagePath, downloadUrl,
                versions: [...(versionTarget.versions || []), version], updatedAt: serverTimestamp(),
            });
            await saveAudit(versionTarget.id, 'DOCUMENT_VERSION_ADDED', `Versão ${nextVersion} adicionada: ${file.name}`);
            setVersionTarget(null); setFeedback(`Versão ${nextVersion} registrada.`);
        } catch (err) {
            setFeedback(uploadErrorMessage(err, {
                storagePath,
                role,
                canManage,
                moduleAdminEnabled: settings.modules?.ged?.admin === true,
            }));
        }
        finally { setBusy(false); }
    };

    const archive = async item => {
        if (!window.confirm(`Arquivar “${item.title}”? O arquivo e seu histórico serão preservados.`)) return;
        try {
            await updateDoc(doc(firestore, 'gedDocuments', item.id), { status: 'archived', archivedAt: serverTimestamp(), archivedBy: currentUser.uid, updatedAt: serverTimestamp() });
            await saveAudit(item.id, 'DOCUMENT_ARCHIVED', `Documento arquivado: ${item.title}`);
            setFeedback('Documento arquivado.');
        } catch (err) { setFeedback(err.message || 'Não foi possível arquivar o documento.'); }
    };

    const navigation = [
        { label: 'ARQUIVO', items: [
            { label: 'Visão geral', path: '/admin/ged', end: true, icon: LiaHomeSolid },
            { label: 'Todos os documentos', path: '/admin/ged/documentos', icon: LiaFileAltSolid },
            { label: 'Recentes', path: '/admin/ged/recentes', icon: LiaClockSolid },
            { label: 'Arquivados', path: '/admin/ged/arquivados', icon: LiaArchiveSolid },
        ] },
        { label: 'CATEGORIAS', items: CATEGORIES.map(([id, label]) => ({
            label: CATEGORY_NAV_LABELS[id] || label,
            path: `/admin/ged/categoria/${id}`,
            icon: LiaFolderOpenSolid,
        })) },
        ...(canManage ? [{ label: 'CONTROLE', items: [{ label: 'Auditoria', path: '/admin/ged/auditoria', icon: LiaHistorySolid }] }] : []),
    ];
    const documentView = !isDashboard && !isAudit;
    const pageTitle = isDashboard ? 'Visão geral do arquivo' : isAudit ? 'Auditoria do GED' : isRecent ? 'Documentos recentes' : isArchived ? 'Documentos arquivados' : selectedCategory ? categoryName(selectedCategory) : 'Todos os documentos';
    const pageDescription = isDashboard ? 'Acompanhe o acervo institucional e acesse rapidamente os documentos.' : isAudit ? 'Histórico de operações realizadas no arquivo institucional.' : 'Pesquise por título, número, setor ou palavra-chave.';
    const recentDocuments = documents.filter(item => item.status === 'active').slice(0, 6);
    return <AdministrativeModuleLayout className="ged-module-page" title="Gestão Eletrônica de Documentos" eyebrow="ARQUIVO INSTITUCIONAL" description="Centralize, classifique e preserve os documentos da Câmara com histórico de versões e auditoria." navigation={navigation} actions={<PermissionGate permission="ged.gerenciar"><button className="primary-button" onClick={openNewDocument}><LiaPlusSolid /> Novo documento</button></PermissionGate>}>
        {feedback && <p className="ged-feedback" role="status">{feedback}</p>}
        {error && <div className="administrative-error" role="alert">{error}</div>}
        {isDashboard && <>
            <section className="ged-summary"><article><strong>{metrics.total}</strong><span>Documentos ativos</span></article><article><strong>{metrics.categories}</strong><span>Categorias utilizadas</span></article><article><strong>{metrics.archived}</strong><span>Arquivados</span></article></section>
            <section className="data-card administrative-section-card ged-browser">
                <div className="administrative-section-heading"><div><h2>Adicionados recentemente</h2><p>Últimos documentos atualizados no acervo.</p></div></div>
                {loading ? <div className="administrative-loading"><span />Carregando documentos...</div> : recentDocuments.length ? <div className="ged-document-list">{recentDocuments.map(item => <DocumentRow key={item.id} item={item} canManage={canManage} onVersion={setVersionTarget} onArchive={archive} />)}</div> : <AdministrativeEmptyState icon={LiaFileAltSolid} title="O arquivo digital está vazio" description="Cadastre documentos oficiais para iniciar o acervo institucional." action={canManage && <button className="primary-button" onClick={openNewDocument}><LiaPlusSolid /> Adicionar primeiro documento</button>} />}
            </section>
        </>}
        {documentView && <section className="data-card administrative-section-card ged-browser">
            <div className="administrative-section-heading ged-explorer-heading"><div><h2>{pageTitle}</h2><p>{pageDescription}</p></div><div className="ged-explorer-tools">{selectedCategory && canManage && !isArchived && <button type="button" className="secondary-button" onClick={() => setFolderModal(true)}><LiaFolderSolid /> Nova pasta</button>}<div className="ged-view-toggle" role="group" aria-label="Modo de visualização"><button type="button" className={viewMode === 'list' ? 'active' : ''} aria-pressed={viewMode === 'list'} onClick={() => setExplorerView('list')}><LiaListSolid /> Lista</button><button type="button" className={viewMode === 'grid' ? 'active' : ''} aria-pressed={viewMode === 'grid'} onClick={() => setExplorerView('grid')}><LiaThLargeSolid /> Grade</button></div></div></div>
            {selectedCategory && <nav className="ged-breadcrumbs" aria-label="Caminho da pasta"><button type="button" onClick={() => navigate(categoryPath)}>{CATEGORY_NAV_LABELS[selectedCategory] || categoryName(selectedCategory)}</button>{folderTrail.map((folder, index) => <React.Fragment key={folder.id}><span>/</span><button type="button" aria-current={index === folderTrail.length - 1 ? 'page' : undefined} onClick={() => navigate(index === folderTrail.length - 1 ? `${categoryPath}/pasta/${folder.id}` : `${categoryPath}/pasta/${folder.id}`)}>{folder.name}</button></React.Fragment>)}</nav>}
            <div className="ged-filters"><label><span>Buscar documentos</span><div className="input-with-icon"><LiaSearchSolid /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Título, assunto, número ou palavra-chave" /></div></label><label><span>Categoria</span><select value={selectedCategory || category} onChange={event => setCategory(event.target.value)} disabled={Boolean(selectedCategory)}><option value="all">Todas as categorias</option>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>Situação</span><select value={isArchived ? 'archived' : isRecent || selectedCategory ? 'active' : status} onChange={event => setStatus(event.target.value)} disabled={isArchived || isRecent || Boolean(selectedCategory)}><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option></select></label></div>
            {loading ? <div className="administrative-loading"><span />Carregando documentos...</div> : <div className={`ged-drop-workspace${dragActive ? ' is-dragging' : ''}`} onDragEnter={event => { if (canManage && event.dataTransfer.types.includes('Files')) setDragActive(true); }} onDragOver={event => { if (canManage) event.preventDefault(); }} onDragLeave={event => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={handleWorkspaceDrop}>
                {selectedCategory && visibleFolders.length > 0 && <div className="ged-folder-grid">{visibleFolders.map(folder => <FolderCard key={folder.id} folder={folder} itemCount={documents.filter(item => item.folderId === folder.id && item.status !== 'archived').length} onOpen={openFolder} onDrop={uploadDroppedFiles} onDocumentDrop={moveDocument} />)}</div>}
                {filtered.length ? <div className={`ged-document-list${viewMode === 'grid' ? ' is-grid' : ''}`}>{filtered.map(item => <DocumentRow key={item.id} item={item} canManage={canManage} viewMode={viewMode} onVersion={setVersionTarget} onArchive={archive} onDragStart={(event, dragged) => { event.dataTransfer.setData('application/x-ged-document', dragged.id); event.dataTransfer.effectAllowed = 'move'; }} />)}</div> : visibleFolders.length ? <p className="ged-folder-empty">Esta pasta está vazia. Arraste documentos para cá ou crie um documento.</p> : <AdministrativeEmptyState icon={LiaFileAltSolid} title={documents.length ? 'Nenhum documento corresponde aos filtros' : 'O arquivo digital está vazio'} description={documents.length ? 'Ajuste os filtros ou a busca para encontrar documentos.' : 'Cadastre documentos oficiais para iniciar o arquivo institucional.'} action={canManage && <button className="primary-button" onClick={openNewDocument}><LiaPlusSolid /> Adicionar primeiro documento</button>} />}
                {dragActive && <div className="ged-drop-overlay"><LiaCloudUploadAltSolid /><strong>Solte para adicionar ao GED</strong><span>Os arquivos serão incluídos nesta pasta.</span></div>}
            </div>}
        </section>}
        {isAudit && <section className="data-card administrative-section-card ged-browser"><div className="administrative-section-heading"><div><h2>{pageTitle}</h2><p>{pageDescription}</p></div><span className="ged-audit-count">{auditLogs.length} evento(s)</span></div><div className="ged-audit-list">{auditLogs.length ? auditLogs.map(item => <article key={item.id}><span>{formatDate(item.createdAt)}</span><div><strong>{item.details}</strong><small>{item.userName} · {item.action}</small></div></article>) : <AdministrativeEmptyState icon={LiaHistorySolid} title="Nenhuma atividade registrada" description="A criação, o versionamento e o arquivamento de documentos serão listados aqui." />}</div></section>}
        {modal && <div className="ged-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !busy && setModal(false)}><form className="ged-modal" onSubmit={uploadNewDocument}><header><div><span>ARQUIVO INSTITUCIONAL</span><h2>Novo documento</h2><p>Classifique e adicione um arquivo ao GED.</p></div><button type="button" className="ged-close" aria-label="Fechar" onClick={() => setModal(false)}><LiaTimesSolid /></button></header><div className="ged-form-grid"><label className="full"><span>Título *</span><input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Ata da 12ª sessão ordinária" /></label><label><span>Categoria *</span><select value={form.category} onChange={event => setForm({ ...form, category: event.target.value, accessLevel: event.target.value === 'human_resources' ? 'confidential' : form.accessLevel === 'confidential' && form.category === 'human_resources' ? 'internal' : form.accessLevel })}>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>Nível de acesso *</span><select value={form.accessLevel} onChange={event => setForm({ ...form, accessLevel: event.target.value })}>{ACCESS_LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>{form.category === 'human_resources' && <small>Documentos de pessoal são sigilosos e ficam restritos aos gestores GED.</small>}</label><label><span>Data do documento</span><input type="date" value={form.documentDate} onChange={event => setForm({ ...form, documentDate: event.target.value })} /></label><label><span>Número / referência</span><input value={form.referenceNumber} onChange={event => setForm({ ...form, referenceNumber: event.target.value })} placeholder="Ex.: Portaria 014/2026" /></label><label><span>Setor responsável</span><input value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} /></label><label><span>Palavras-chave</span><input value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} placeholder="Separadas por vírgula" /></label><label className="full"><span>Descrição</span><textarea rows="3" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label><label className="ged-file-drop full"><LiaFileUploadSolid /><span>Selecionar arquivo</span><small>PDF, imagens, Word, Excel, PowerPoint, CSV ou XML · Máximo de 25 MB</small><input required type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.xml,.txt" onChange={event => setForm({ ...form, file: event.target.files?.[0] || null })} />{form.file && <b>{form.file.name} · {formatSize(form.file.size)}</b>}</label></div>{feedback && <p className="ged-form-feedback">{feedback}</p>}<footer><button type="button" className="secondary-button" onClick={() => setModal(false)} disabled={busy}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Enviando...' : 'Salvar no GED'}</button></footer></form></div>}
        {folderModal && <div className="ged-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !busy && setFolderModal(false)}><form className="ged-modal ged-folder-modal" onSubmit={createFolder}><header><div><span>{CATEGORY_NAV_LABELS[selectedCategory] || categoryName(selectedCategory)}</span><h2>Nova pasta</h2><p>A pasta será criada dentro da categoria atual.</p></div><button type="button" className="ged-close" aria-label="Fechar" onClick={() => setFolderModal(false)}><LiaTimesSolid /></button></header><label className="ged-folder-name"><span>Nome da pasta</span><input autoFocus required maxLength={100} value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Ex.: Exercício 2026" /></label><footer><button type="button" className="secondary-button" onClick={() => setFolderModal(false)} disabled={busy}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Criando...' : 'Criar pasta'}</button></footer></form></div>}
        {versionTarget && <div className="ged-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !busy && setVersionTarget(null)}><form className="ged-modal ged-version-modal" onSubmit={addVersion}><header><div><span>{versionTarget.title}</span><h2>Adicionar nova versão</h2><p>A versão atual é preservada no histórico.</p></div><button type="button" className="ged-close" aria-label="Fechar" onClick={() => setVersionTarget(null)}><LiaTimesSolid /></button></header><label className="ged-file-drop"><LiaFileUploadSolid /><span>Escolha a nova versão do arquivo</span><small>PDF, imagem ou documento Office · Máximo de 25 MB</small><input required name="versionFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.xml,.txt" /></label><footer><button type="button" className="secondary-button" onClick={() => setVersionTarget(null)} disabled={busy}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Enviando...' : 'Salvar versão'}</button></footer></form></div>}
    </AdministrativeModuleLayout>;
}
