import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LiaChartPieSolid, LiaClipboardCheckSolid, LiaExclamationTriangleSolid, LiaFileContractSolid, LiaPlusSolid, LiaSearchSolid, LiaTasksSolid, LiaTimesSolid, LiaUserCheckSolid } from 'react-icons/lia';
import { firestore, storage } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { AdministrativeCommandService, AdministrativeDataTable, AdministrativeEmptyState, AdministrativeModuleLayout, PermissionGate } from '../administrative-core';
import './contracts.css';

const NAVIGATION = [
    { label: 'CONTRATOS', items: [
        { label: 'Visão geral', path: '/admin/contratos', end: true, icon: LiaChartPieSolid },
        { label: 'Todos os contratos', path: '/admin/contratos/lista', icon: LiaFileContractSolid },
        { label: 'Meus contratos', path: '/admin/contratos/meus', icon: LiaUserCheckSolid },
        { label: 'Novo contrato', path: '/admin/contratos/novo', icon: LiaPlusSolid },
    ] },
    { label: 'RELACIONAMENTO', items: [
        { label: 'Documentos das empresas', path: '/admin/contratos/fornecedores', icon: LiaFileContractSolid },
    ] },
    { label: 'EXECUÇÃO', items: [
        { label: 'Fiscalizações', path: '/admin/contratos/fiscalizacoes', icon: LiaClipboardCheckSolid },
        { label: 'Ocorrências', path: '/admin/contratos/ocorrencias', icon: LiaExclamationTriangleSolid },
        { label: 'Obrigações', path: '/admin/contratos/obrigacoes', icon: LiaTasksSolid },
    ] },
];

const STATUS = { active: 'Ativo', suspended: 'Suspenso', closed: 'Encerrado' };
const SUPPLIER_CERTIFICATE_LABELS = {
    federal: 'Certidão conjunta federal (RFB/PGFN)',
    state: 'Certidão negativa estadual',
    municipal: 'Certidão negativa municipal',
    fgts: 'Certificado de Regularidade do FGTS (CRF)',
    labor: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
    bankruptcy: 'Certidão de falência e recuperação judicial',
    other: 'Outra certidão negativa',
};
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toDate = value => value?.toDate?.() || (value ? new Date(value) : null);
const dateLabel = value => { const date = toDate(value); return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : '—'; };

function useContracts() {
    const [state, setState] = useState({ loading: true, rows: [], error: '' });
    useEffect(() => onSnapshot(query(collection(firestore, 'contracts'), orderBy('createdAt', 'desc')), snapshot => {
        setState({ loading: false, rows: snapshot.docs.map(item => ({ id: item.id, ...item.data() })), error: '' });
    }, error => setState({ loading: false, rows: [], error: error.message })), []);
    return state;
}

function useStaff() {
    const [staff, setStaff] = useState([]);
    useEffect(() => onSnapshot(collection(firestore, 'users'), snapshot => setStaff(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.tipo !== 'Cidadão')), () => setStaff([])), []);
    return staff;
}

const StatusBadge = ({ value }) => <span className={`contract-status contract-status--${value || 'active'}`}>{STATUS[value] || value}</span>;
const Loading = () => <div className="administrative-loading" aria-live="polite"><span />Carregando contratos...</div>;
const ErrorState = ({ message }) => <div className="administrative-error" role="alert">Não foi possível carregar os dados. {message}</div>;

function Dashboard({ contracts }) {
    const navigate = useNavigate();
    const now = new Date();
    const inSixtyDays = new Date(now.getTime() + 60 * 86400000);
    const active = contracts.filter(item => item.status === 'active');
    const expiring = active.filter(item => { const end = toDate(item.endsAt); return end && end >= now && end <= inSixtyDays; });
    const totals = contracts.reduce((result, item) => ({ contracted: result.contracted + Number(item.currentValue || 0), executed: result.executed + Number(item.executedValue || 0), occurrences: result.occurrences + Number(item.openOccurrenceCount || 0) }), { contracted: 0, executed: 0, occurrences: 0 });
    return <>
        <section className="contract-metrics">
            <article><strong>{active.length}</strong><span>Contratos ativos</span></article>
            <article><strong>{expiring.length}</strong><span>Próximos do vencimento</span></article>
            <article><strong>{totals.occurrences}</strong><span>Ocorrências abertas</span></article>
            <article><strong>{money(totals.contracted)}</strong><span>Valor contratado</span></article>
            <article><strong>{money(totals.executed)}</strong><span>Valor executado</span></article>
            <article><strong>{money(totals.contracted - totals.executed)}</strong><span>Saldo contratual</span></article>
        </section>
        <section className="data-card administrative-section-card">
            <div className="administrative-section-heading"><div><h2>Contratos recentes</h2><p>Acompanhe vigência, fornecedor e execução.</p></div><button className="administrative-link-button" onClick={() => navigate('/admin/contratos/lista')}>Ver todos</button></div>
            <ContractsTable rows={contracts.slice(0, 8)} />
        </section>
        <div className="contract-dashboard-grid">
            <section className="data-card administrative-section-card"><h2>Vencimentos próximos</h2>{expiring.length ? expiring.slice(0, 6).map(item => <button className="contract-alert-row" key={item.id} onClick={() => navigate(`/admin/contratos/${item.id}`)}><span>{item.identifier}</span><strong>{dateLabel(item.endsAt)}</strong></button>) : <p className="administrative-muted">Nenhum contrato vence nos próximos 60 dias.</p>}</section>
            <section className="data-card administrative-section-card"><h2>Distribuição por situação</h2>{Object.entries(STATUS).map(([key, label]) => <div className="contract-distribution" key={key}><span>{label}</span><strong>{contracts.filter(item => item.status === key).length}</strong></div>)}</section>
        </div>
    </>;
}

function ContractsTable({ rows }) {
    const navigate = useNavigate();
    return <AdministrativeDataTable rows={rows} columns={[
        { key: 'identifier', label: 'Identificação', render: row => <button className="administrative-text-action" onClick={() => navigate(`/admin/contratos/${row.id}`)}>{row.identifier}</button> },
        { key: 'contractNumber', label: 'Contrato' }, { key: 'supplierName', label: 'Fornecedor' },
        { key: 'object', label: 'Objeto' }, { key: 'endsAt', label: 'Vigência', render: row => dateLabel(row.endsAt) },
        { key: 'currentValue', label: 'Valor', render: row => money(row.currentValue) },
        { key: 'status', label: 'Situação', render: row => <StatusBadge value={row.status} /> },
    ]} empty={<AdministrativeEmptyState icon={LiaFileContractSolid} title="Nenhum contrato cadastrado" description="Cadastre o primeiro contrato para iniciar o acompanhamento da execução." action={<PermissionGate permission="contratos.criar"><button className="primary-button" onClick={() => navigate('/admin/contratos/novo')}>Cadastrar contrato</button></PermissionGate>} />} />;
}

function ContractList({ contracts, mine = false }) {
    const { currentUser } = useAuth();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const rows = useMemo(() => contracts.filter(item => (!mine || [item.managerId, item.inspectorId, item.substituteInspectorId].includes(currentUser?.uid)) && (!status || item.status === status) && [item.identifier, item.contractNumber, item.supplierName, item.object].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))), [contracts, currentUser?.uid, mine, search, status]);
    return <section className="data-card administrative-section-card">
        <div className="administrative-section-heading"><div><h2>{mine ? 'Meus contratos' : 'Todos os contratos'}</h2><p>{rows.length} registro(s) encontrado(s).</p></div></div>
        <div className="administrative-filters"><label><span>Buscar</span><div className="input-with-icon"><LiaSearchSolid /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Número, fornecedor ou objeto" /></div></label><label><span>Situação</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todas</option>{Object.entries(STATUS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
        <ContractsTable rows={rows} />
    </section>;
}

function SupplierDocuments() {
    const { currentUser } = useAuth();
    const [collections, setCollections] = useState({ supplierDocuments: [], supplierSubmissions: [], supplierCharges: [], supplierRequests: [] });
    const [tab, setTab] = useState('documents');
    const [contracts, setContracts] = useState([]);
    const staff = useStaff();
    const [requestModal, setRequestModal] = useState(false);
    const [requestForm, setRequestForm] = useState({ supplierId: '', contractId: '', type: 'service_order', identifier: '', title: '', description: '', amount: '', file: null });
    const [requestState, setRequestState] = useState({ saving: false, error: '', success: '' });
    useEffect(() => {
        const sources = ['supplierDocuments', 'supplierSubmissions', 'supplierCharges', 'supplierRequests'];
        const unsubscribers = sources.map(name => onSnapshot(collection(firestore, name), snapshot => {
            setCollections(current => ({ ...current, [name]: snapshot.docs.map(item => ({ id: item.id, ...item.data() })) }));
        }, () => setCollections(current => ({ ...current, [name]: [] }))));
        return () => unsubscribers.forEach(unsubscribe => unsubscribe());
    }, []);
    useEffect(() => onSnapshot(collection(firestore, 'contracts'), snapshot => {
        setContracts(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, () => setContracts([])), []);
    const companies = staff.filter(item => ['Empresa', 'Fornecedor'].includes(item.tipo) && item.cnpj);
    const selectedCompany = companies.find(item => item.id === requestForm.supplierId);
    const companyContracts = contracts.filter(item => item.supplierDocument === selectedCompany?.cnpj);
    const updateRequest = (key, value) => setRequestForm(current => ({ ...current, [key]: value }));
    const createSupplierRequest = async event => {
        event.preventDefault();
        setRequestState({ saving: true, error: '', success: '' });
        try {
            const contract = contracts.find(item => item.id === requestForm.contractId);
            const company = companies.find(item => item.id === requestForm.supplierId);
            let fileData = {};
            if (requestForm.file) {
                const safeName = requestForm.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `fornecedores/${company.id}/solicitacoes/${Date.now()}-${safeName}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, requestForm.file, { contentType: requestForm.file.type });
                fileData = { fileUrl: await getDownloadURL(storageRef), fileName: requestForm.file.name, storagePath, fileSize: requestForm.file.size };
            }
            await addDoc(collection(firestore, 'supplierRequests'), {
                supplierId: company.id,
                supplierName: company.tradeName || company.legalName || company.nome || company.name || '',
                supplierCnpj: company.cnpj,
                contractId: contract?.id || '',
                contractNumber: contract?.identifier || contract?.contractNumber || '',
                type: requestForm.type,
                identifier: requestForm.identifier.trim(),
                title: requestForm.title.trim(),
                description: requestForm.description.trim(),
                amount: requestForm.amount ? Number(requestForm.amount) : null,
                ...fileData,
                status: 'new',
                statusLabel: 'Nova',
                createdAt: serverTimestamp(),
                createdBy: currentUser?.uid || '',
            });
            setRequestState({ saving: false, error: '', success: 'Solicitação enviada ao fornecedor.' });
            setRequestModal(false);
            setRequestForm({ supplierId: '', contractId: '', type: 'service_order', identifier: '', title: '', description: '', amount: '', file: null });
        } catch (error) {
            setRequestState({ saving: false, error: error.message || 'Não foi possível enviar a solicitação.', success: '' });
        }
    };
    const rows = tab === 'documents'
        ? [...collections.supplierDocuments, ...collections.supplierSubmissions.filter(item => item.type !== 'invoice')]
        : tab === 'charges'
            ? [...collections.supplierCharges, ...collections.supplierSubmissions.filter(item => item.type === 'invoice')]
            : collections.supplierRequests;
    const sortedRows = [...rows].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const tabs = [
        ['documents', 'Documentos', collections.supplierDocuments.length + collections.supplierSubmissions.filter(item => item.type !== 'invoice').length],
        ['charges', 'Cobranças', collections.supplierCharges.length + collections.supplierSubmissions.filter(item => item.type === 'invoice').length],
        ['requests', 'Solicitações', collections.supplierRequests.length],
    ];
    return <section className="data-card administrative-section-card">
        <div className="administrative-section-heading"><div><h2>Relacionamento com empresas</h2><p>Documentos, cobranças e solicitações recebidos dos fornecedores.</p></div>{tab === 'requests' && <PermissionGate permission="contratos.editar"><button className="primary-button" onClick={() => setRequestModal(true)}><LiaPlusSolid /> Nova solicitação</button></PermissionGate>}</div>
        {requestState.success && <p className="supplier-admin-success">{requestState.success}</p>}
        {requestState.error && <p className="supplier-admin-error">{requestState.error}</p>}
        <div className="supplier-admin-tabs">{tabs.map(([id, label, count]) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label} <span>{count}</span></button>)}</div>
        {sortedRows.length ? sortedRows.map(row => <article className="contract-alert-row" key={`${tab}-${row.id}`}>
            <div><strong>{row.reference || row.identifier || row.requestNumber || row.fileName || SUPPLIER_CERTIFICATE_LABELS[row.certificateType] || row.type || 'Solicitação'}</strong><span>{row.supplierName || row.supplierCnpj || 'Fornecedor'} · {row.description || row.title || row.object || row.competence || (row.issuedAt || row.validUntil ? `Emitida ${row.issuedAt || '—'} · Vence ${row.validUntil || '—'}` : 'Sem descrição')}</span><small>{row.statusLabel || row.status || 'Recebido'}{row.amount != null ? ` · ${money(row.amount)}` : ''}</small></div>
            {row.fileUrl && <a href={row.fileUrl} target="_blank" rel="noreferrer">Abrir arquivo</a>}
        </article>) : <p className="administrative-muted">Nenhum registro recebido nesta categoria.</p>}
        {requestModal && <div className="supplier-request-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setRequestModal(false)}><form className="supplier-request-modal" onSubmit={createSupplierRequest}>
            <header><div><h2>Enviar solicitação ao fornecedor</h2><p>Cadastre uma ordem de serviço, empenho ou ordem de compra.</p></div><button type="button" aria-label="Fechar" onClick={() => setRequestModal(false)}><LiaTimesSolid /></button></header>
            <div className="supplier-request-form-grid">
                <label className="full"><span>Fornecedor *</span><select required value={requestForm.supplierId} onChange={event => { updateRequest('supplierId', event.target.value); updateRequest('contractId', ''); }}><option value="">Selecione a empresa</option>{companies.map(company => <option key={company.id} value={company.id}>{company.tradeName || company.legalName || company.nome || company.name} — {company.cnpj}</option>)}</select></label>
                <label><span>Tipo *</span><select required value={requestForm.type} onChange={event => updateRequest('type', event.target.value)}><option value="service_order">Ordem de serviço</option><option value="commitment">Empenho</option><option value="purchase_order">Ordem de compra</option><option value="other">Outra solicitação</option></select></label>
                <label><span>Número / identificação</span><input value={requestForm.identifier} onChange={event => updateRequest('identifier', event.target.value)} placeholder="OS 012/2026" /></label>
                <label className="full"><span>Contrato relacionado</span><select value={requestForm.contractId} onChange={event => updateRequest('contractId', event.target.value)}><option value="">Sem contrato vinculado</option>{companyContracts.map(contract => <option key={contract.id} value={contract.id}>{contract.identifier || contract.contractNumber} — {contract.object}</option>)}</select></label>
                <label className="full"><span>Título *</span><input required value={requestForm.title} onChange={event => updateRequest('title', event.target.value)} /></label>
                <label><span>Valor</span><input type="number" min="0" step="0.01" value={requestForm.amount} onChange={event => updateRequest('amount', event.target.value)} /></label>
                <label className="full"><span>Descrição e instruções *</span><textarea required rows="4" value={requestForm.description} onChange={event => updateRequest('description', event.target.value)} /></label>
                <label className="full"><span>Documento da ordem ou empenho (PDF, imagem)</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => updateRequest('file', event.target.files?.[0] || null)} /></label>
            </div>
            <footer><button type="button" className="secondary-button" onClick={() => setRequestModal(false)}>Cancelar</button><button className="primary-button" disabled={requestState.saving}>{requestState.saving ? 'Enviando...' : 'Enviar ao fornecedor'}</button></footer>
        </form></div>}
    </section>;
}

const csvLine = line => {
    const values = []; let value = ''; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') quoted = !quoted;
        else if ((char === ',' || char === ';') && !quoted) { values.push(value.trim()); value = ''; }
        else value += char;
    }
    values.push(value.trim()); return values;
};

function ContractImport({ onDone }) {
    const [state, setState] = useState({ busy: false, message: '', error: '' });
    const importFile = async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        setState({ busy: true, message: '', error: '' });
        try {
            const text = await file.text();
            let contracts;
            if (file.name.toLowerCase().endsWith('.json')) contracts = JSON.parse(text);
            else {
                const lines = text.split(/\r?\n/).filter(Boolean);
                if (lines.length < 2) throw new Error('CSV sem registros.');
                const headers = csvLine(lines[0]).map(header => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
                contracts = lines.slice(1).map(line => Object.fromEntries(csvLine(line).map((value, index) => [headers[index], value]))).map(item => ({
                    contractNumber: item.contractnumber || item.numero || '', administrativeProcess: item.administrativeprocess || item.processo || '', object: item.object || item.objeto || '', supplierName: item.suppliername || item.fornecedor || '', supplierDocument: item.supplierdocument || item.cnpj || '', supplierRepresentative: item.supplierrepresentative || item.representante || '', initialValue: item.initialvalue || item.valor || '0', signatureDate: item.signaturedate || item.assinatura || '', startsAt: item.startsat || item.inicio || '', endsAt: item.endsat || item.fim || '', resourceSource: item.resourcesource || item.fonte || '', commitmentData: item.commitmentdata || item.empenho || '', procurementOrigin: item.procurementorigin || item.modalidade || '', notes: item.notes || item.observacoes || '',
                }));
            }
            if (!Array.isArray(contracts)) throw new Error('JSON deve conter uma lista de contratos.');
            const result = await AdministrativeCommandService.run('contratos', 'import', { contracts });
            setState({ busy: false, message: `${result.count} contrato(s) importado(s).`, error: '' }); onDone();
        } catch (error) { setState({ busy: false, message: '', error: error.message || 'Não foi possível importar o arquivo.' }); }
    };
    return <div className="contract-import"><label className="secondary-button"><input type="file" accept=".json,.csv,application/json,text/csv" onChange={importFile} disabled={state.busy} hidden />{state.busy ? 'Importando...' : 'Importar JSON/CSV'}</label>{(state.message || state.error) && <small className={state.error ? 'import-error' : 'import-success'}>{state.message || state.error}</small>}</div>;
}

const EMPTY_FORM = { contractNumber: '', administrativeProcess: '', object: '', supplierName: '', supplierDocument: '', supplierRepresentative: '', initialValue: '', signatureDate: '', startsAt: '', endsAt: '', managerId: '', managerName: '', inspectorId: '', inspectorName: '', substituteInspectorId: '', substituteInspectorName: '', resourceSource: '', commitmentData: '', procurementOrigin: '', notes: '' };
function ContractForm() {
    const navigate = useNavigate();
    const staff = useStaff();
    const [form, setForm] = useState(EMPTY_FORM);
    const [files, setFiles] = useState([]);
    const [state, setState] = useState({ saving: false, error: '' });
    const field = key => ({ value: form[key], onChange: event => setForm(current => ({ ...current, [key]: event.target.value })) });
    const staffField = (idKey, nameKey) => ({ value: form[idKey], onChange: event => { const selected = staff.find(item => item.id === event.target.value); setForm(current => ({ ...current, [idKey]: event.target.value, [nameKey]: selected?.nome || selected?.name || selected?.email || '' })); } });
    const staffOptions = <><option value="">Selecione</option>{staff.map(item => <option value={item.id} key={item.id}>{item.nome || item.name || item.email} — {item.tipo}</option>)}</>;
    const submit = async event => {
        event.preventDefault(); setState({ saving: true, error: '' });
        try {
            const result = await AdministrativeCommandService.run('contratos', 'create', form);
            for (const file of files) {
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const path = `contracts/${result.id}/documents/${Date.now()}-${safeName}`;
                const target = ref(storage, path);
                await uploadBytes(target, file, { contentType: file.type });
                await AdministrativeCommandService.run('contratos', 'addDocument', {
                    contractId: result.id, name: file.name, storagePath: path,
                    url: await getDownloadURL(target), mimeType: file.type,
                    size: file.size, version: 1,
                });
            }
            navigate(`/admin/contratos/${result.id}`);
        }
        catch (error) { setState({ saving: false, error: error.message || 'Não foi possível cadastrar o contrato.' }); }
    };
    return <form className="data-card administrative-form" onSubmit={submit}>
        <div className="administrative-section-heading"><div><h2>Novo contrato</h2><p>Cadastre os dados essenciais para iniciar a fiscalização.</p></div></div>
        {state.error && <ErrorState message={state.error} />}
        <fieldset><legend>Identificação</legend><div className="administrative-form-grid"><label><span>Número do contrato *</span><input required {...field('contractNumber')} /></label><label><span>Processo administrativo</span><input {...field('administrativeProcess')} /></label><label className="full"><span>Objeto *</span><textarea required rows="4" {...field('object')} /></label></div></fieldset>
        <fieldset><legend>Fornecedor</legend><div className="administrative-form-grid"><label><span>Nome/Razão social *</span><input required {...field('supplierName')} /></label><label><span>CPF/CNPJ</span><input {...field('supplierDocument')} /></label><label><span>Representante</span><input {...field('supplierRepresentative')} /></label></div></fieldset>
        <fieldset><legend>Valores e vigência</legend><div className="administrative-form-grid"><label><span>Valor inicial *</span><input required min="0" step="0.01" type="number" {...field('initialValue')} /></label><label><span>Assinatura</span><input type="date" {...field('signatureDate')} /></label><label><span>Início da vigência *</span><input required type="date" {...field('startsAt')} /></label><label><span>Fim da vigência *</span><input required type="date" {...field('endsAt')} /></label></div></fieldset>
        <fieldset><legend>Responsáveis</legend><div className="administrative-form-grid"><label><span>Gestor</span><select {...staffField('managerId', 'managerName')}>{staffOptions}</select></label><label><span>Fiscal titular</span><select {...staffField('inspectorId', 'inspectorName')}>{staffOptions}</select></label><label><span>Fiscal substituto</span><select {...staffField('substituteInspectorId', 'substituteInspectorName')}>{staffOptions}</select></label></div></fieldset>
        <fieldset><legend>Dados administrativos</legend><div className="administrative-form-grid"><label><span>Fonte de recursos</span><input {...field('resourceSource')} /></label><label><span>Empenho</span><input {...field('commitmentData')} /></label><label><span>Modalidade/origem</span><input {...field('procurementOrigin')} /></label><label className="full"><span>Observações</span><textarea rows="3" {...field('notes')} /></label></div></fieldset>
        <fieldset><legend>Documentos do contrato</legend><div className="administrative-form-grid"><label className="full"><span>Contrato, termos, certidões e demais anexos</span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={event => setFiles(Array.from(event.target.files || []))} /><small>{files.length ? `${files.length} arquivo(s) selecionado(s).` : 'PDF, imagens ou documentos editáveis.'}</small></label></div></fieldset>
        <div className="administrative-form-actions"><button type="button" className="secondary-button" onClick={() => navigate('/admin/contratos/lista')}>Cancelar</button><button className="primary-button" disabled={state.saving}>{state.saving ? 'Salvando...' : 'Cadastrar contrato'}</button></div>
    </form>;
}

function ContractDetail({ contractId }) {
    const [contract, setContract] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
    const [contractDocuments, setContractDocuments] = useState([]);
    const documentIdsKey = contractDocuments.map(item => item.id).join('|');
    const [supplierReturns, setSupplierReturns] = useState([]);
    const [documentForm, setDocumentForm] = useState({ documentType: 'contract', description: '', sendForSignature: true, file: null });
    const [documentState, setDocumentState] = useState({ saving: false, message: '', error: '' });
    const [activity, setActivity] = useState({ type: 'inspection', description: '', measuredValue: '', supplierVisible: true, saving: false, message: '' });
    useEffect(() => onSnapshot(doc(firestore, 'contracts', contractId), snapshot => { setContract(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null); setLoading(false); }, err => { setError(err.message); setLoading(false); }), [contractId]);
    useEffect(() => onSnapshot(collection(firestore, 'contracts', contractId, 'documents'), snapshot => {
        setContractDocuments(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, err => setDocumentState({ saving: false, message: '', error: err.message })), [contractId]);
    useEffect(() => {
        const subscriptions = contractDocuments.map(documentRow => onSnapshot(
            collection(doc(firestore, 'contracts', contractId, 'documents', documentRow.id), 'supplierReturns'),
            snapshot => setSupplierReturns(current => [
                ...current.filter(item => item.documentId !== documentRow.id),
                ...snapshot.docs.map(item => ({ id: item.id, documentId: documentRow.id, ...item.data() })),
            ]),
            err => setDocumentState({ saving: false, message: '', error: err.message }),
        ));
        return () => subscriptions.forEach(unsubscribe => unsubscribe());
    }, [documentIdsKey, contractId]);
    if (loading) return <Loading />; if (error) return <ErrorState message={error} />; if (!contract) return <AdministrativeEmptyState icon={LiaFileContractSolid} title="Contrato não encontrado" description="O registro solicitado não existe ou não está disponível para seu perfil." />;
    const actionMap = { inspection: 'addInspection', occurrence: 'addOccurrence', measurement: 'addMeasurement', obligation: 'addObligation' };
    const submit = async event => { event.preventDefault(); setActivity(current => ({ ...current, saving: true, message: '' })); try { await AdministrativeCommandService.run('contratos', actionMap[activity.type], { contractId, description: activity.description, measuredValue: activity.measuredValue }); setActivity(current => ({ ...current, description: '', measuredValue: '', saving: false, message: 'Registro incluído com sucesso.' })); } catch (err) { setActivity(current => ({ ...current, saving: false, message: err.message })); } };
    const uploadContractDocument = async event => {
        event.preventDefault();
        if (!documentForm.file) return;
        setDocumentState({ saving: true, message: '', error: '' });
        try {
            const safeName = documentForm.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `contracts/${contractId}/documents/${Date.now()}-${safeName}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, documentForm.file, { contentType: documentForm.file.type });
            const documentTypeLabel = { contract: 'Contrato', addendum: 'Aditivo', apostille: 'Apostilamento', annex: 'Termo ou anexo', other: 'Outro documento' }[documentForm.documentType];
            await AdministrativeCommandService.run('contratos', 'addDocument', {
                contractId, name: documentForm.file.name, fileName: documentForm.file.name,
                storagePath, url: await getDownloadURL(storageRef), mimeType: documentForm.file.type,
                size: documentForm.file.size, version: 1, documentType: documentForm.documentType,
                documentTypeLabel, description: documentForm.description.trim(),
                requiresSupplierSignature: documentForm.sendForSignature,
                supplierUploadAllowed: documentForm.sendForSignature,
                signatureStatus: documentForm.sendForSignature ? 'awaiting_supplier' : 'not_required',
            });
            setDocumentForm({ documentType: 'contract', description: '', sendForSignature: true, file: null });
            setDocumentState({ saving: false, message: documentForm.sendForSignature ? 'Documento enviado ao portal da empresa para assinatura.' : 'Documento anexado ao contrato.', error: '' });
        } catch (err) {
            setDocumentState({ saving: false, message: '', error: err.message || 'Não foi possível anexar o documento.' });
        }
    };
    const reviewSupplierReturn = async (returnRow, decision) => {
        setDocumentState({ saving: true, message: '', error: '' });
        try {
            await AdministrativeCommandService.run('contratos', 'reviewSupplierSignature', {
                contractId, documentId: returnRow.documentId, returnId: returnRow.id, decision,
                note: decision === 'accept' ? 'Assinatura recebida e conferida.' : 'Solicitamos o reenvio da via assinada.',
            });
            setDocumentState({ saving: false, message: decision === 'accept' ? 'Assinatura confirmada.' : 'Reenvio solicitado à empresa.', error: '' });
        } catch (err) {
            setDocumentState({ saving: false, message: '', error: err.message || 'Não foi possível atualizar a assinatura.' });
        }
    };
    const progress = contract.currentValue ? Math.min(100, (Number(contract.executedValue || 0) / Number(contract.currentValue)) * 100) : 0;
    return <>
        <section className="data-card contract-detail-header"><div><span>{contract.identifier}</span><h2>Contrato {contract.contractNumber}</h2><p>{contract.object}</p></div><StatusBadge value={contract.status} /></section>
        <section className="contract-detail-grid">{[['Fornecedor', contract.supplierName], ['Vigência', `${dateLabel(contract.startsAt)} a ${dateLabel(contract.endsAt)}`], ['Gestor', contract.managerName || 'Não definido'], ['Fiscal titular', contract.inspectorName || 'Não definido'], ['Valor atualizado', money(contract.currentValue)], ['Valor executado', money(contract.executedValue)]].map(([label, value]) => <article className="data-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
        <section className="data-card administrative-section-card"><div className="administrative-section-heading"><div><h2>Execução financeira</h2><p>{progress.toFixed(1)}% do valor atualizado.</p></div><strong>{money(Number(contract.currentValue || 0) - Number(contract.executedValue || 0))} de saldo</strong></div><div className="contract-progress"><span style={{ width: `${progress}%` }} /></div></section>
        <section className="data-card administrative-section-card"><div className="administrative-section-heading"><div><h2>Documentos e assinaturas</h2><p>Anexe contratos e aditivos e envie a via correspondente ao fornecedor para assinatura.</p></div></div>
            {documentState.error && <ErrorState message={documentState.error} />}{documentState.message && <p className="supplier-admin-success">{documentState.message}</p>}
            <PermissionGate permission="contratos.editar"><form className="contract-document-form" onSubmit={uploadContractDocument}>
                <label><span>Tipo de documento</span><select value={documentForm.documentType} onChange={event => setDocumentForm(current => ({ ...current, documentType: event.target.value }))}><option value="contract">Contrato</option><option value="addendum">Aditivo contratual</option><option value="apostille">Apostilamento</option><option value="annex">Termo ou anexo</option><option value="other">Outro documento</option></select></label>
                <label><span>Arquivo PDF</span><input required type="file" accept=".pdf,application/pdf" onChange={event => setDocumentForm(current => ({ ...current, file: event.target.files?.[0] || null }))} /></label>
                <label className="contract-document-description"><span>Descrição</span><input value={documentForm.description} onChange={event => setDocumentForm(current => ({ ...current, description: event.target.value }))} placeholder="Ex.: contrato para assinatura, 1º aditivo" /></label>
                <label className="contract-send-signature"><input type="checkbox" checked={documentForm.sendForSignature} onChange={event => setDocumentForm(current => ({ ...current, sendForSignature: event.target.checked }))} /><span>Disponibilizar para a empresa baixar, assinar e devolver</span></label>
                <button className="primary-button" disabled={documentState.saving}>{documentState.saving ? 'Enviando...' : documentForm.sendForSignature ? 'Enviar para assinatura' : 'Anexar documento'}</button>
            </form></PermissionGate>
            <div className="contract-managed-documents">{contractDocuments.length ? contractDocuments.map(documentRow => {
                const returns = supplierReturns.filter(item => item.documentId === documentRow.id).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                const latestReturn = returns[0];
                return <article className="contract-managed-document" key={documentRow.id}><div><strong>{documentRow.documentTypeLabel || documentRow.documentType || 'Documento contratual'} · {documentRow.name || documentRow.fileName}</strong><span>{documentRow.description || 'Sem descrição'}</span><small>{documentRow.requiresSupplierSignature ? `Assinatura: ${documentRow.signatureStatus === 'signed' ? 'confirmada pela Câmara' : latestReturn ? 'via assinada recebida' : 'aguardando empresa'}` : 'Documento disponível para consulta'}</small></div>{documentRow.url && <a href={documentRow.url} target="_blank" rel="noreferrer">Abrir via enviada</a>}
                    {returns.map(returnRow => <div className="contract-supplier-return" key={returnRow.id}><span><strong>Via assinada pela empresa</strong><small>{returnRow.fileName} · {dateLabel(returnRow.uploadedAt || returnRow.createdAt)} · {returnRow.status === 'accepted' ? 'Aceita' : returnRow.status === 'resubmission_requested' ? 'Reenvio solicitado' : 'Aguardando conferência'}</small></span><a href={returnRow.fileUrl} target="_blank" rel="noreferrer">Baixar via assinada</a>{returnRow.id === latestReturn?.id && returnRow.status !== 'accepted' && documentRow.requiresSupplierSignature && <PermissionGate permission="contratos.editar"><div className="contract-return-actions"><button type="button" className="secondary-button" onClick={() => reviewSupplierReturn(returnRow, 'request_resubmission')} disabled={documentState.saving}>Solicitar reenvio</button><button type="button" className="primary-button" onClick={() => reviewSupplierReturn(returnRow, 'accept')} disabled={documentState.saving}>Confirmar assinatura</button></div></PermissionGate>}</div>)}
                </article>;
            }) : <p className="administrative-muted">Nenhum documento anexado a este contrato.</p>}</div>
        </section>
        <section className="data-card administrative-section-card"><h2>Registrar atividade</h2><form className="contract-activity-form" onSubmit={submit}><label><span>Tipo</span><select value={activity.type} onChange={event => setActivity(current => ({ ...current, type: event.target.value }))}><option value="inspection">Fiscalização</option><option value="occurrence">Ocorrência</option><option value="measurement">Medição</option><option value="obligation">Obrigação</option></select></label>{activity.type === 'measurement' && <label><span>Valor medido</span><input required type="number" min="0" step="0.01" value={activity.measuredValue} onChange={event => setActivity(current => ({ ...current, measuredValue: event.target.value }))} /></label>}<label className="full"><span>Descrição *</span><textarea required rows="4" value={activity.description} onChange={event => setActivity(current => ({ ...current, description: event.target.value }))} /></label>{activity.type === 'occurrence' && <label className="contract-supplier-visibility full"><input type="checkbox" checked={activity.supplierVisible} onChange={event => setActivity(current => ({ ...current, supplierVisible: event.target.checked }))} /><span>Compartilhar esta ocorrência com o fornecedor vinculado</span></label>}<div className="full administrative-form-actions">{activity.message && <span>{activity.message}</span>}<button className="primary-button" disabled={activity.saving}>{activity.saving ? 'Registrando...' : 'Registrar atividade'}</button></div></form></section>
    </>;
}

export default function ContractsModulePage() {
    const location = useLocation(); const navigate = useNavigate(); const { contractId } = useParams(); const { loading, rows, error } = useContracts();
    const page = contractId ? 'detail' : location.pathname.endsWith('/novo') ? 'new' : location.pathname.endsWith('/meus') ? 'mine' : location.pathname.endsWith('/fornecedores') ? 'supplier-documents' : location.pathname.endsWith('/lista') ? 'list' : ['fiscalizacoes', 'ocorrencias', 'obrigacoes'].some(segment => location.pathname.endsWith(`/${segment}`)) ? 'list' : 'dashboard';
    const titles = { dashboard: ['Fiscalização de Contratos', 'Acompanhe vigência, execução, ocorrências e obrigações contratuais.'], list: ['Contratos', 'Consulte e gerencie os contratos cadastrados.'], mine: ['Meus contratos', 'Contratos sob sua gestão ou fiscalização.'], new: ['Cadastrar contrato', 'Registre o contrato e defina sua equipe de fiscalização.'], detail: ['Central do contrato', 'Fiscalização e acompanhamento da execução contratual.'], 'supplier-documents': ['Documentos das empresas', 'Analise notas fiscais, certidões, relatórios e outros documentos enviados pelos fornecedores.'] };
    return <AdministrativeModuleLayout title={titles[page][0]} description={titles[page][1]} navigation={NAVIGATION} actions={page !== 'new' && <><PermissionGate permission="contratos.criar"><ContractImport onDone={() => {}} /><button className="primary-button" onClick={() => navigate('/admin/contratos/novo')}><LiaPlusSolid /> Novo contrato</button></PermissionGate></>}>
        {loading && page !== 'new' ? <Loading /> : error ? <ErrorState message={error} /> : page === 'dashboard' ? <Dashboard contracts={rows} /> : page === 'new' ? <ContractForm /> : page === 'detail' ? <ContractDetail contractId={contractId} /> : page === 'supplier-documents' ? <SupplierDocuments /> : <ContractList contracts={rows} mine={page === 'mine'} />}
    </AdministrativeModuleLayout>;
}
