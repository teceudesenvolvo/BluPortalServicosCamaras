import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
    LiaCalendarAltSolid,
    LiaClockSolid,
    LiaFileContractSolid,
    LiaFileInvoiceSolid,
    LiaFileUploadSolid,
    LiaMoneyBillWaveSolid,
    LiaPlusSolid,
    LiaTimesSolid,
    LiaUploadSolid,
} from 'react-icons/lia';
import { firestore, storage } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import './SupplierPortal.css';

const TABS = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'documents', label: 'Documentos' },
    { id: 'charges', label: 'Cobranças' },
    { id: 'requests', label: 'Solicitações' },
    { id: 'occurrences', label: 'Ocorrências' },
    { id: 'contracts', label: 'Contratos e aditivos' },
    { id: 'pending', label: 'Pendências' },
];
const DOCUMENT_TYPES = [
    ['tax_clearance', 'Certidão negativa'],
    ['balance_sheet', 'Balanço patrimonial'],
    ['articles', 'Contrato social'],
    ['regularity', 'Comprovante de regularidade'],
    ['insurance', 'Apólice/garantia'],
    ['other', 'Outro documento'],
];
const CERTIFICATE_TYPES = [
    ['federal', 'Certidão conjunta federal (RFB/PGFN)'],
    ['state', 'Certidão negativa estadual'],
    ['municipal', 'Certidão negativa municipal'],
    ['fgts', 'Certificado de Regularidade do FGTS (CRF)'],
    ['labor', 'Certidão Negativa de Débitos Trabalhistas (CNDT)'],
    ['bankruptcy', 'Certidão de falência e recuperação judicial'],
    ['other', 'Outra certidão negativa'],
];
const CONTRACT_DOCUMENT_TYPES = [
    ['contract', 'Contrato assinado'],
    ['addendum', 'Aditivo contratual'],
    ['apostille', 'Apostilamento'],
    ['term', 'Termo ou anexo'],
    ['other', 'Outro documento contratual'],
];
const REQUEST_LABELS = {
    service_order: 'Ordem de serviço',
    purchase_order: 'Ordem de compra',
    commitment: 'Empenho',
    other: 'Solicitação',
};
const money = value => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
});
const asDate = value => {
    if (value?.toDate) return value.toDate();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    return value ? new Date(value) : null;
};
const dateLabel = value => {
    const date = asDate(value);
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('pt-BR') : '—';
};
const timestamp = value => asDate(value)?.getTime() || 0;
const fileSize = size => size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;

function Metric({ icon: Icon, label, value, detail }) {
    return <article className="supplier-metric">
        <span className="supplier-metric-icon"><Icon /></span>
        <div><strong>{value}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>
    </article>;
}

function Empty({ title, detail, action }) {
    return <div className="supplier-empty"><span><LiaFileContractSolid /></span>
        <strong>{title}</strong><p>{detail}</p>{action}</div>;
}

const SupplierPortal = () => {
    const { currentUser } = useAuth();
    const [profile, setProfile] = useState(null);
    const [contracts, setContracts] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [legacySubmissions, setLegacySubmissions] = useState([]);
    const [charges, setCharges] = useState([]);
    const [requests, setRequests] = useState([]);
    const [contractDocuments, setContractDocuments] = useState([]);
    const [signatureReturns, setSignatureReturns] = useState([]);
    const [occurrences, setOccurrences] = useState([]);
    const [tab, setTab] = useState('overview');
    const [docFilter, setDocFilter] = useState('all');
    const [chargeModal, setChargeModal] = useState(false);
    const [documentForm, setDocumentForm] = useState({
        type: 'tax_clearance', certificateType: '', issuedAt: '', validUntil: '', file: null,
    });
    const [chargeForm, setChargeForm] = useState({ contractId: '', reference: '', competence: '', amount: '', description: '', file: null });
    const [signedFileForm, setSignedFileForm] = useState({ requestKey: '', file: null });
    const [feedback, setFeedback] = useState({ error: '', success: '', busy: false });
    const supplierName = profile?.tradeName || profile?.legalName || profile?.nome || currentUser?.displayName || 'Empresa contratada';

    useEffect(() => {
        if (!currentUser) return undefined;
        let active = true;
        getDoc(doc(firestore, 'users', currentUser.uid)).then(snapshot => {
            if (active) setProfile(snapshot.exists() ? snapshot.data() : null);
        }).catch(error => setFeedback({ error: error.message, success: '', busy: false }));
        return () => { active = false; };
    }, [currentUser]);

    useEffect(() => {
        if (!contracts.length) {
            setContractDocuments([]);
            setOccurrences([]);
            return undefined;
        }
        const documentSubscriptions = [];
        const occurrenceSubscriptions = [];
        contracts.forEach(contract => {
            const contractReference = doc(firestore, 'contracts', contract.id);
            documentSubscriptions.push(onSnapshot(collection(contractReference, 'documents'), snapshot => {
                const rows = snapshot.docs.map(item => ({
                    id: item.id, contractId: contract.id,
                    contractNumber: contract.identifier || contract.contractNumber,
                    ...item.data(),
                }));
                setContractDocuments(current => [
                    ...current.filter(item => item.contractId !== contract.id), ...rows,
                ]);
            }, error => setFeedback({ error: `Falha ao carregar documentos do contrato: ${error.message}`, success: '', busy: false })));
            occurrenceSubscriptions.push(onSnapshot(query(
                collection(contractReference, 'occurrences'),
                where('supplierVisible', '==', true),
            ), snapshot => {
                const rows = snapshot.docs.map(item => ({
                    id: item.id, contractId: contract.id,
                    contractNumber: contract.identifier || contract.contractNumber,
                    ...item.data(),
                }));
                setOccurrences(current => [
                    ...current.filter(item => item.contractId !== contract.id), ...rows,
                ]);
            }, error => setFeedback({ error: `Falha ao carregar ocorrências: ${error.message}`, success: '', busy: false })));
        });
        return () => [...documentSubscriptions, ...occurrenceSubscriptions]
            .forEach(unsubscribe => unsubscribe());
    }, [contracts]);

    const signatureDocuments = contractDocuments.filter(item => item.requiresSupplierSignature);
    const signatureRequestKey = signatureDocuments
        .map(item => `${item.contractId}:${item.id}`).sort().join('|');
    useEffect(() => {
        if (!signatureDocuments.length) {
            setSignatureReturns([]);
            return undefined;
        }
        const subscriptions = signatureDocuments.map(signatureDocument => onSnapshot(
            collection(doc(firestore, 'contracts', signatureDocument.contractId,
                'documents', signatureDocument.id), 'supplierReturns'),
            snapshot => {
                const rows = snapshot.docs.map(item => ({
                    id: item.id, returnKey: `${signatureDocument.contractId}:${signatureDocument.id}`,
                    parentDocumentId: signatureDocument.id,
                    contractId: signatureDocument.contractId,
                    contractNumber: signatureDocument.contractNumber,
                    documentTypeLabel: signatureDocument.documentTypeLabel,
                    sourceDocumentName: signatureDocument.name || signatureDocument.fileName || 'Documento para assinatura',
                    ...item.data(),
                }));
                setSignatureReturns(current => [
                    ...current.filter(item => item.returnKey !== `${signatureDocument.contractId}:${signatureDocument.id}`),
                    ...rows,
                ]);
            }, error => setFeedback({ error: `Falha ao carregar vias assinadas: ${error.message}`, success: '', busy: false }),
        ));
        return () => subscriptions.forEach(unsubscribe => unsubscribe());
    }, [signatureRequestKey]);

    useEffect(() => {
        if (!profile?.cnpj) return undefined;
        return onSnapshot(query(collection(firestore, 'contracts'),
            where('supplierDocument', '==', profile.cnpj)), snapshot => {
            setContracts(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        }, error => setFeedback({ error: error.message, success: '', busy: false }));
    }, [profile?.cnpj]);

    useEffect(() => {
        if (!currentUser) return undefined;
        const subscriptions = [
            ['supplierDocuments', setDocuments],
            ['supplierSubmissions', setLegacySubmissions],
            ['supplierCharges', setCharges],
            ['supplierRequests', setRequests],
        ].map(([name, setter]) => onSnapshot(
            query(collection(firestore, name), where('supplierId', '==', currentUser.uid)),
            snapshot => setter(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
            error => setFeedback({ error: `Falha ao carregar ${name}: ${error.message}`, success: '', busy: false }),
        ));
        return () => subscriptions.forEach(unsubscribe => unsubscribe());
    }, [currentUser]);

    const activeContracts = useMemo(() => contracts.filter(item => item.status === 'active'), [contracts]);
    const pendingCharges = charges.filter(item => ['received', 'under_review', 'pending'].includes(item.status));
    const chargedTotal = charges.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const visibleDocuments = documents.filter(item => {
        if (item.type === 'contract_document') return false;
        if (docFilter === 'all') return true;
        const days = item.validUntil ? (asDate(item.validUntil).getTime() - Date.now()) / 86400000 : null;
        if (docFilter === 'expired') return days !== null && days < 0;
        if (docFilter === 'expiring') return days !== null && days >= 0 && days <= 30;
        return days === null || days > 30;
    });
    const sortedCharges = [...charges, ...legacySubmissions.filter(item => item.type === 'invoice')]
        .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
    const companyDocuments = documents.filter(item => item.type !== 'contract_document');
    const signatureRequests = contractDocuments.filter(item => item.requiresSupplierSignature
        && item.supplierUploadAllowed
        && ['awaiting_supplier', 'resubmission_requested'].includes(item.signatureStatus));
    const pendingItems = [
        ...companyDocuments.filter(item => ['rejected', 'expired', 'action_required'].includes(item.status)
            || (item.validUntil && asDate(item.validUntil).getTime() - Date.now() <= 30 * 86400000))
            .map(item => ({ ...item, pendingKind: 'documents', pendingTitle: item.fileName || 'Documento da empresa', pendingDescription: item.statusLabel || 'Documento vencido ou próximo do vencimento' })),
        ...charges.filter(item => ['rejected', 'returned', 'action_required'].includes(item.status))
            .map(item => ({ ...item, pendingKind: 'charges', pendingTitle: item.reference || 'Cobrança devolvida', pendingDescription: item.statusLabel || item.description || 'Verifique as observações da Câmara' })),
        ...requests.filter(item => ['action_required', 'awaiting_supplier', 'pending'].includes(item.status))
            .map(item => ({ ...item, pendingKind: 'requests', pendingTitle: item.identifier || item.title || 'Solicitação', pendingDescription: item.statusLabel || item.description || 'A Câmara aguarda uma providência' })),
        ...occurrences.filter(item => ['open', 'communicated', 'in_regularization'].includes(item.status))
            .map(item => ({ ...item, pendingKind: 'occurrences', pendingTitle: item.title || item.contractNumber || 'Ocorrência de fiscalização', pendingDescription: item.statusLabel || item.description || 'Ocorrência aguardando regularização' })),
    ];

    const storeUpload = async (file, folder) => {
        const safeName = file.name.replace(/[^\w.-]/g, '_');
        const path = `fornecedores/${currentUser.uid}/${folder}/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file, { contentType: file.type });
        return { fileUrl: await getDownloadURL(storageRef), storagePath: path };
    };

    const submitDocument = async event => {
        event.preventDefault();
        if (!documentForm.file) return;
        if (documentForm.type === 'tax_clearance'
            && (!documentForm.certificateType || !documentForm.issuedAt || !documentForm.validUntil)) {
            setFeedback({ error: 'Informe o tipo, a data de emissão e o vencimento da certidão.', success: '', busy: false });
            return;
        }
        setFeedback({ error: '', success: '', busy: true });
        try {
            const uploaded = await storeUpload(documentForm.file, 'documentos');
            await addDoc(collection(firestore, 'supplierDocuments'), {
                supplierId: currentUser.uid, supplierName, supplierCnpj: profile?.cnpj || '',
                type: documentForm.type,
                certificateType: documentForm.type === 'tax_clearance' ? documentForm.certificateType : null,
                issuedAt: documentForm.issuedAt || null,
                validUntil: documentForm.validUntil || null,
                fileName: documentForm.file.name, fileSize: documentForm.file.size,
                contentType: documentForm.file.type, ...uploaded,
                status: 'received', createdAt: serverTimestamp(),
            });
            setDocumentForm({ type: 'tax_clearance', certificateType: '', issuedAt: '', validUntil: '', file: null });
            setFeedback({ error: '', success: 'Documento enviado para análise da Câmara.', busy: false });
        } catch (error) {
            setFeedback({ error: error.message || 'Não foi possível enviar o documento.', success: '', busy: false });
        }
    };

    const submitCharge = async event => {
        event.preventDefault();
        setFeedback({ error: '', success: '', busy: true });
        try {
            const uploaded = chargeForm.file ? await storeUpload(chargeForm.file, 'cobrancas') : {};
            await addDoc(collection(firestore, 'supplierCharges'), {
                supplierId: currentUser.uid, supplierName, supplierCnpj: profile?.cnpj || '',
                contractId: chargeForm.contractId,
                contractNumber: contracts.find(item => item.id === chargeForm.contractId)?.identifier
                    || contracts.find(item => item.id === chargeForm.contractId)?.contractNumber || '',
                reference: chargeForm.reference.trim(), competence: chargeForm.competence,
                amount: Number(chargeForm.amount), description: chargeForm.description.trim(),
                fileName: chargeForm.file?.name || '', fileSize: chargeForm.file?.size || 0,
                contentType: chargeForm.file?.type || '', ...uploaded,
                status: 'received', createdAt: serverTimestamp(),
            });
            setChargeModal(false);
            setChargeForm({ contractId: '', reference: '', competence: '', amount: '', description: '', file: null });
            setFeedback({ error: '', success: 'Cobrança enviada para análise.', busy: false });
        } catch (error) {
            setFeedback({ error: error.message || 'Não foi possível enviar a cobrança.', success: '', busy: false });
        }
    };

    const submitSignedDocument = async event => {
        event.preventDefault();
        const [contractId, documentId] = signedFileForm.requestKey.split(':');
        const sourceDocument = contractDocuments.find(item => item.contractId === contractId && item.id === documentId);
        if (!signedFileForm.file || !sourceDocument) return;
        setFeedback({ error: '', success: '', busy: true });
        try {
            const uploaded = await storeUpload(signedFileForm.file, 'assinaturas');
            await addDoc(collection(doc(firestore, 'contracts', contractId,
                'documents', documentId), 'supplierReturns'), {
                supplierId: currentUser.uid,
                supplierName,
                supplierCnpj: profile?.cnpj || '',
                sourceDocumentId: documentId,
                sourceDocumentName: sourceDocument.name || sourceDocument.fileName || '',
                sourceDocumentType: sourceDocument.documentType || 'contract',
                contractNumber: sourceDocument.contractNumber || '',
                fileName: signedFileForm.file.name,
                fileSize: signedFileForm.file.size,
                contentType: signedFileForm.file.type,
                ...uploaded,
                status: 'submitted',
                uploadedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            });
            setSignedFileForm({ requestKey: '', file: null });
            setFeedback({ error: '', success: 'Via assinada enviada à Câmara para conferência.', busy: false });
        } catch (error) {
            setFeedback({ error: error.message || 'Não foi possível enviar a via assinada.', success: '', busy: false });
        }
    };

    const openCharges = () => { setTab('charges'); setChargeModal(true); };
    return <div className="dashboard-layout supplier-portal-layout">
        <Sidebar />
        <main className="dashboard-content supplier-portal-content">
            <header className="supplier-hero">
                <div><span>ÁREA DA EMPRESA CONTRATADA</span><h1>Portal do fornecedor</h1>
                    <p>Acompanhe contratos, documentos, cobranças e solicitações vinculados ao CNPJ.</p></div>
                <div className="supplier-company-chip"><span>{supplierName}</span><small>CNPJ {profile?.cnpj || 'não informado'}</small></div>
            </header>
            <nav className="supplier-tabs" aria-label="Seções do portal">
                {TABS.map(item => <button type="button" key={item.id} className={tab === item.id ? 'active' : ''}
                    aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}
            </nav>
            {(feedback.error || feedback.success) && <div className={`supplier-feedback ${feedback.error ? 'is-error' : 'is-success'}`} role="status">
                {feedback.error || feedback.success}<button type="button" onClick={() => setFeedback({ error: '', success: '', busy: false })} aria-label="Fechar">×</button></div>}

            {tab === 'overview' && <div className="supplier-page-content">
                <section className="supplier-metrics">
                    <Metric icon={LiaFileContractSolid} label="Contratos ativos" value={activeContracts.length} detail={`${contracts.length} vinculados ao CNPJ`} />
                    <Metric icon={LiaMoneyBillWaveSolid} label="Total faturado" value={money(chargedTotal)} detail={`${charges.length} cobranças enviadas`} />
                    <Metric icon={LiaClockSolid} label="Cobranças em análise" value={pendingCharges.length} detail="Aguardando retorno da Câmara" />
                    <Metric icon={LiaCalendarAltSolid} label="Solicitações abertas" value={requests.filter(item => !['completed', 'closed', 'cancelled'].includes(item.status)).length} detail="Ordens, empenhos e compras" />
                </section>
                {pendingItems.length > 0 && <button className="supplier-pending-banner" onClick={() => setTab('pending')}><LiaClockSolid /><span><strong>{pendingItems.length} pendência(s) que precisam da sua atenção</strong><small>Confira documentos, cobranças, solicitações e ocorrências em aberto.</small></span><b>Ver pendências</b></button>}
                <div className="supplier-overview-grid">
                    <section className="supplier-panel"><div className="supplier-panel-heading"><div><h2>Contratos vinculados</h2><p>Execução e valores relacionados ao seu CNPJ.</p></div></div>
                        {contracts.length ? <div className="supplier-contract-list">{contracts.map(item => <article className="supplier-contract-row" key={item.id}>
                            <span className="supplier-row-icon"><LiaFileContractSolid /></span><div className="supplier-row-main"><strong>{item.identifier || item.contractNumber || 'Contrato'}</strong><span>{item.object}</span><small>{item.status || 'Situação não informada'} · Vigência até {dateLabel(item.endsAt)}</small></div>
                            <div className="supplier-contract-values"><small>Valor</small><strong>{money(item.currentValue || item.initialValue)}</strong></div>
                        </article>)}</div> : <Empty title="Nenhum contrato vinculado" detail="Quando um contrato for associado ao CNPJ cadastrado, ele aparecerá nesta área." />}
                    </section>
                    <section className="supplier-panel"><div className="supplier-panel-heading"><div><h2>Acesso rápido</h2><p>Gerencie sua relação com a Câmara.</p></div></div>
                        <div className="supplier-quick-actions"><button onClick={openCharges}><LiaPlusSolid /><span><strong>Enviar cobrança</strong><small>Nota fiscal ou medição</small></span></button><button onClick={() => setTab('documents')}><LiaFileUploadSolid /><span><strong>Atualizar documentos</strong><small>Certidões e documentos da empresa</small></span></button><button onClick={() => setTab('requests')}><LiaCalendarAltSolid /><span><strong>Ver solicitações</strong><small>Ordens, empenhos e compras</small></span></button></div>
                    </section>
                </div>
                <section className="supplier-panel"><div className="supplier-panel-heading"><div><h2>Atividade financeira recente</h2><p>Últimas cobranças encaminhadas.</p></div><button className="supplier-text-button" onClick={() => setTab('charges')}>Ver cobranças</button></div>
                    {sortedCharges.length ? <ChargeList rows={sortedCharges.slice(0, 5)} /> : <Empty title="Nenhuma cobrança enviada" detail="As notas fiscais e cobranças enviadas à Câmara aparecerão aqui." action={<button className="supplier-primary-button" onClick={openCharges}><LiaPlusSolid /> Nova cobrança</button>} />}
                </section>
                <section className="supplier-panel"><div className="supplier-panel-heading"><div><h2>Solicitações recentes</h2><p>Ordens de serviço, empenhos e ordens de compra da Câmara.</p></div><button className="supplier-text-button" onClick={() => setTab('requests')}>Ver solicitações</button></div>
                    {requests.length ? <div className="supplier-request-list">{[...requests].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)).slice(0, 4).map(item => <article className="supplier-request-row" key={item.id}><span className="supplier-row-icon"><LiaFileContractSolid /></span><div className="supplier-row-main"><strong>{item.identifier || item.requestNumber || REQUEST_LABELS[item.type] || 'Solicitação'}</strong><span>{item.title || item.description || item.object || REQUEST_LABELS[item.type]}</span><small>{item.contractNumber ? `Contrato ${item.contractNumber} · ` : ''}{dateLabel(item.createdAt)}</small></div><span className="supplier-status supplier-status--open">{item.statusLabel || item.status || 'Nova'}</span></article>)}</div> : <Empty title="Nenhuma solicitação recebida" detail="As ordens enviadas à sua empresa aparecerão aqui." />}
                </section>
            </div>}

            {tab === 'documents' && <div className="supplier-page-content">
                <section className="supplier-panel"><div className="supplier-panel-heading"><div><h2>Documentos da empresa</h2><p>Envie certidões, balanço, contrato social e outros documentos. A Câmara poderá analisar e solicitar atualização.</p></div></div>
                    <form className="supplier-inline-form supplier-document-form" onSubmit={submitDocument}>
                        <label>Tipo de documento<select value={documentForm.type} onChange={event => setDocumentForm(current => ({ ...current, type: event.target.value, certificateType: event.target.value === 'tax_clearance' ? current.certificateType : '' }))}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        {documentForm.type === 'tax_clearance' && <>
                            <label>Tipo de certidão negativa<select required value={documentForm.certificateType} onChange={event => setDocumentForm(current => ({ ...current, certificateType: event.target.value }))}><option value="">Selecione a certidão</option>{CERTIFICATE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label>Data de emissão<input required type="date" value={documentForm.issuedAt} onChange={event => setDocumentForm(current => ({ ...current, issuedAt: event.target.value }))} /></label>
                            <label>Data de vencimento<input required type="date" min={documentForm.issuedAt || undefined} value={documentForm.validUntil} onChange={event => setDocumentForm(current => ({ ...current, validUntil: event.target.value }))} /></label>
                        </>}
                        {documentForm.type !== 'tax_clearance' && <label>Data de vencimento<input type="date" value={documentForm.validUntil} onChange={event => setDocumentForm(current => ({ ...current, validUntil: event.target.value }))} /></label>}
                        <label className="supplier-file-field"><span>Arquivo (PDF, JPG ou PNG)</span><input type="file" required accept=".pdf,.jpg,.jpeg,.png" onChange={event => setDocumentForm(current => ({ ...current, file: event.target.files?.[0] || null }))} /></label>
                        <button className="supplier-primary-button" disabled={feedback.busy}><LiaUploadSolid />{feedback.busy ? 'Enviando...' : 'Enviar documento'}</button>
                    </form>
                </section>
                <section className="supplier-panel"><div className="supplier-panel-heading supplier-heading-wrap"><div><h2>Documentos enviados</h2><p>{companyDocuments.length} documento(s) cadastrados.</p></div><div className="supplier-filter-pills" aria-label="Filtrar documentos">{[['all', 'Todos'], ['valid', 'Válidos'], ['expiring', 'Próximos a vencer'], ['expired', 'Vencidos']].map(([id, label]) => <button key={id} className={docFilter === id ? 'active' : ''} onClick={() => setDocFilter(id)}>{label}</button>)}</div></div>
                    {visibleDocuments.length ? <div className="supplier-document-list">{visibleDocuments.map(item => <DocumentRow item={item} key={item.id} />)}</div> : <Empty title="Nenhum documento nesta categoria" detail="Envie seus documentos para mantê-los disponíveis para a fiscalização." />}
                </section>
            </div>}

            {tab === 'charges' && <section className="supplier-panel supplier-page-content"><div className="supplier-panel-heading supplier-heading-wrap"><div><h2>Histórico de cobranças</h2><p>Acompanhe notas fiscais, medições e documentos enviados para pagamento.</p></div><button className="supplier-primary-button" onClick={() => setChargeModal(true)}><LiaPlusSolid /> Nova cobrança</button></div>
                {sortedCharges.length ? <ChargeList rows={sortedCharges} /> : <Empty title="Nenhuma cobrança enviada" detail="Envie uma cobrança para iniciar o acompanhamento financeiro com a Câmara." action={<button className="supplier-primary-button" onClick={() => setChargeModal(true)}><LiaPlusSolid /> Enviar cobrança</button>} />}
            </section>}

            {tab === 'requests' && <section className="supplier-panel supplier-page-content"><div className="supplier-panel-heading"><div><h2>Solicitações recebidas</h2><p>Ordens de serviço, empenhos e ordens de compra direcionadas à sua empresa.</p></div></div>
                {requests.length ? <div className="supplier-request-list">{[...requests].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)).map(item => <article className="supplier-request-row" key={item.id}><span className="supplier-row-icon"><LiaFileContractSolid /></span><div className="supplier-row-main"><strong>{item.identifier || item.requestNumber || REQUEST_LABELS[item.type] || 'Solicitação'}</strong><span>{item.title || item.description || item.object || REQUEST_LABELS[item.type]}</span><small>{item.contractNumber ? `Contrato ${item.contractNumber} · ` : ''}Recebido em {dateLabel(item.createdAt)}</small></div><div className="supplier-request-meta">{item.amount != null && <strong>{money(item.amount)}</strong>}<span className={`supplier-status supplier-status--${item.status || 'open'}`}>{item.statusLabel || item.status || 'Nova'}</span></div>{item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer">Abrir documento</a>}</article>)}</div> : <Empty title="Nenhuma solicitação recebida" detail="Ordens de serviço, empenhos e ordens de compra emitidas para sua empresa aparecerão aqui." />}
            </section>}

            {tab === 'occurrences' && <section className="supplier-panel supplier-page-content"><div className="supplier-panel-heading"><div><h2>Ocorrências e pendências</h2><p>Acompanhe apontamentos da fiscalização compartilhados com sua empresa e itens que precisam de providência.</p></div><span className="supplier-status supplier-status--pending">{pendingItems.length} pendência(s)</span></div>
                {occurrences.length ? <div className="supplier-occurrence-list">{[...occurrences].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)).map(item => <article className="supplier-occurrence-row" key={item.id}><span className="supplier-occurrence-mark"><LiaClockSolid /></span><div className="supplier-row-main"><strong>{item.title || item.type || 'Ocorrência de fiscalização'} · {item.contractNumber}</strong><span>{item.description || 'A fiscalização registrou uma ocorrência neste contrato.'}</span><small>{item.deadlineAt ? `Prazo para regularização: ${dateLabel(item.deadlineAt)} · ` : ''}Registrada em {dateLabel(item.createdAt)}{item.createdByName ? ` por ${item.createdByName}` : ''}</small></div><span className={`supplier-status supplier-status--${item.status === 'resolved' || item.status === 'closed' ? 'approved' : 'pending'}`}>{item.statusLabel || (item.status === 'resolved' ? 'Resolvida' : item.status === 'in_regularization' ? 'Em regularização' : 'Aberta')}</span></article>)}</div> : <Empty title="Nenhuma ocorrência compartilhada" detail="Ocorrências de fiscalização disponibilizadas para sua empresa aparecerão aqui." />}
                {pendingItems.length > 0 && <p className="supplier-pending-note">As ocorrências abertas e demais itens devolvidos ou aguardando ação estão sinalizados para facilitar o acompanhamento.</p>}
            </section>}

            {tab === 'contracts' && <div className="supplier-page-content">
                <section className="supplier-panel"><div className="supplier-panel-heading"><div><h2>Contratos e aditivos</h2><p>A Câmara disponibiliza a via oficial para assinatura. Baixe, assine e devolva o mesmo documento por aqui.</p></div></div>
                    {feedback.error && <p className="supplier-feedback supplier-feedback--error">{feedback.error}</p>}
                    {feedback.success && <p className="supplier-feedback supplier-feedback--success">{feedback.success}</p>}
                    {signatureRequests.length > 0 && <form className="supplier-inline-form supplier-contract-upload-form" onSubmit={submitSignedDocument}>
                        <label>Documento encaminhado para assinatura<select required value={signedFileForm.requestKey} onChange={event => setSignedFileForm(current => ({ ...current, requestKey: event.target.value }))}><option value="">Selecione o contrato ou aditivo</option>{signatureRequests.map(item => <option key={`${item.contractId}:${item.id}`} value={`${item.contractId}:${item.id}`}>{item.contractNumber} · {item.documentTypeLabel || 'Documento'} · {item.name || item.fileName}</option>)}</select></label>
                        {signedFileForm.requestKey && (() => { const [contractId, documentId] = signedFileForm.requestKey.split(':'); const item = signatureRequests.find(row => row.contractId === contractId && row.id === documentId); return item?.url ? <a className="supplier-signature-download" href={item.url} target="_blank" rel="noreferrer" download>Baixar via enviada pela Câmara</a> : null; })()}
                        <label className="supplier-file-field"><span>Via assinada pela empresa (PDF)</span><input type="file" required accept=".pdf,application/pdf" onChange={event => setSignedFileForm(current => ({ ...current, file: event.target.files?.[0] || null }))} /></label>
                        <button className="supplier-primary-button" disabled={feedback.busy || !signedFileForm.requestKey}><LiaUploadSolid />{feedback.busy ? 'Enviando...' : 'Enviar via assinada'}</button>
                    </form>}
                    {contractDocuments.length ? <div className="supplier-signature-documents">{contractDocuments.map(item => {
                        const returns = signatureReturns.filter(row => row.contractId === item.contractId && row.parentDocumentId === item.id).sort((a, b) => timestamp(b.uploadedAt || b.createdAt) - timestamp(a.uploadedAt || a.createdAt));
                        const latest = returns[0];
                        const status = !item.requiresSupplierSignature ? 'Disponível para consulta' : item.signatureStatus === 'signed' ? 'Assinatura confirmada pela Câmara' : latest?.status === 'submitted' ? 'Via assinada enviada · Aguardando conferência' : latest?.status === 'resubmission_requested' || item.signatureStatus === 'resubmission_requested' ? 'Reenvio solicitado pela Câmara' : 'Aguardando assinatura da empresa';
                        return <article className="supplier-signature-document" key={`${item.contractId}:${item.id}`}><div className="supplier-row-main"><strong>{item.documentTypeLabel || item.documentType || 'Documento contratual'} · {item.contractNumber}</strong><span>{item.name || item.fileName}</span><small>{item.description || 'Documento disponibilizado pela Câmara'} · {dateLabel(item.createdAt)}</small></div><span className={`supplier-status supplier-status--${item.signatureStatus === 'signed' ? 'approved' : latest?.status === 'submitted' ? 'pending' : 'open'}`}>{status}</span>{item.url && <a href={item.url} target="_blank" rel="noreferrer" download>Baixar via da Câmara</a>}{latest?.fileUrl && <div className="supplier-signature-return"><strong>Via devolvida: {latest.fileName}</strong><small>Enviada em {dateLabel(latest.uploadedAt || latest.createdAt)}{latest.status === 'accepted' ? ' · Assinatura confirmada' : latest.status === 'resubmission_requested' ? ' · Reenvio solicitado' : ' · Em conferência pela Câmara'}</small><a href={latest.fileUrl} target="_blank" rel="noreferrer">Abrir via enviada</a></div>}</article>;
                    })}</div> : <Empty title="Nenhum contrato ou aditivo disponibilizado" detail="Quando a Câmara encaminhar um contrato ou aditivo para assinatura, ele aparecerá aqui para baixar e devolver assinado." />}
                    {!signatureRequests.length && contractDocuments.length > 0 && <p className="supplier-signature-info">Nenhum documento aguarda sua assinatura no momento. O envio de vias assinadas só é liberado para documentos encaminhados pela Gestão de Contratos.</p>}
                </section>
            </div>}

            {tab === 'pending' && <section className="supplier-panel supplier-page-content"><div className="supplier-panel-heading"><div><h2>Pendências que precisam da sua atenção</h2><p>Documentos, cobranças, solicitações e ocorrências que aguardam uma ação da empresa.</p></div><span className="supplier-status supplier-status--pending">{pendingItems.length} pendência(s)</span></div>
                {pendingItems.length ? <div className="supplier-pending-list">{pendingItems.map(item => <button type="button" className="supplier-pending-row" key={`${item.pendingKind}-${item.id}`} onClick={() => setTab(item.pendingKind)}><span className="supplier-occurrence-mark"><LiaClockSolid /></span><span className="supplier-row-main"><strong>{item.pendingTitle}</strong><span>{item.pendingDescription}</span><small>{item.contractNumber ? `Contrato ${item.contractNumber} · ` : ''}{dateLabel(item.createdAt)}</small></span><b>{TABS.find(section => section.id === item.pendingKind)?.label} →</b></button>)}</div> : <Empty title="Você não tem pendências" detail="Quando a Câmara solicitar uma providência, ela aparecerá aqui." />}
            </section>}
        </main>
        {chargeModal && createPortal(<div className="supplier-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setChargeModal(false)}>
            <section className="supplier-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-charge-title"><header><div><span>RELACIONAMENTO FINANCEIRO</span><h2 id="supplier-charge-title">Enviar nova cobrança</h2><p>Envie a nota fiscal ou documento de medição para análise.</p></div><button type="button" aria-label="Fechar" onClick={() => setChargeModal(false)}><LiaTimesSolid /></button></header>
                <form className="supplier-form-grid" onSubmit={submitCharge}>
                    <label className="full">Contrato<select required value={chargeForm.contractId} onChange={event => setChargeForm(current => ({ ...current, contractId: event.target.value }))}><option value="">Selecione o contrato</option>{contracts.map(item => <option key={item.id} value={item.id}>{item.identifier || item.contractNumber} — {item.object}</option>)}</select></label>
                    <label>Nota fiscal / referência<input required value={chargeForm.reference} onChange={event => setChargeForm(current => ({ ...current, reference: event.target.value }))} placeholder="NF 000123" /></label>
                    <label>Competência<input type="month" value={chargeForm.competence} onChange={event => setChargeForm(current => ({ ...current, competence: event.target.value }))} /></label>
                    <label>Valor da cobrança<input required type="number" min="0.01" step="0.01" value={chargeForm.amount} onChange={event => setChargeForm(current => ({ ...current, amount: event.target.value }))} placeholder="0,00" /></label>
                    <label className="full">Descrição<textarea required rows="3" value={chargeForm.description} onChange={event => setChargeForm(current => ({ ...current, description: event.target.value }))} placeholder="Informe o serviço ou período faturado" /></label>
                    <label className="supplier-file-field full"><span>Nota fiscal e documentos de apoio (PDF, XML, JPG ou PNG)</span><input type="file" required accept=".pdf,.xml,.jpg,.jpeg,.png" onChange={event => setChargeForm(current => ({ ...current, file: event.target.files?.[0] || null }))} /></label>
                    {feedback.error && <p className="supplier-modal-error full">{feedback.error}</p>}
                    <div className="supplier-modal-actions full"><button type="button" className="supplier-secondary-button" onClick={() => setChargeModal(false)}>Cancelar</button><button className="supplier-primary-button" disabled={feedback.busy}>{feedback.busy ? 'Enviando...' : 'Enviar para análise'}</button></div>
                </form>
            </section>
        </div>, document.body)}
    </div>;
};

function ChargeList({ rows }) {
    return <div className="supplier-charge-list">{rows.map(item => <article className="supplier-charge-row" key={item.id}>
        <span className="supplier-row-icon"><LiaFileInvoiceSolid /></span><div className="supplier-row-main"><strong>{item.reference || item.fileName || 'Cobrança'}</strong><span>{item.contractNumber || 'Contrato associado'}{item.competence ? ` · ${item.competence}` : ''}</span><small>{item.description || 'Documento enviado para análise'} · {dateLabel(item.createdAt)}</small></div>
        <strong className="supplier-charge-amount">{money(item.amount)}</strong><span className={`supplier-status supplier-status--${item.status || 'received'}`}>{item.statusLabel || (item.status === 'approved' ? 'Aprovada' : item.status === 'rejected' ? 'Devolvida' : 'Em análise')}</span>
        {item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer">Abrir anexo</a>}
    </article>)}</div>;
}

function DocumentRow({ item }) {
    const days = item.validUntil ? Math.ceil((asDate(item.validUntil).getTime() - Date.now()) / 86400000) : null;
    const state = days === null ? 'Sem vencimento' : days < 0 ? 'Vencido' : days <= 30 ? 'Próximo a vencer' : 'Válido';
    const type = item.type === 'tax_clearance'
        ? CERTIFICATE_TYPES.find(([value]) => value === item.certificateType)?.[1] || 'Certidão negativa'
        : DOCUMENT_TYPES.find(([value]) => value === item.type)?.[1] || item.type || 'Documento';
    return <article className="supplier-document-row"><span className="supplier-row-icon"><LiaFileUploadSolid /></span><div className="supplier-row-main"><strong>{type}</strong><span>{item.fileName}</span><small>{item.fileSize ? fileSize(item.fileSize) : ''}{item.issuedAt ? ` · Emitido em ${dateLabel(item.issuedAt)}` : ''}{item.validUntil ? ` · Vence em ${dateLabel(item.validUntil)}` : ''} · Enviado em {dateLabel(item.createdAt)}</small></div><span className={`supplier-status supplier-status--${state === 'Válido' ? 'approved' : state === 'Vencido' ? 'rejected' : state === 'Próximo a vencer' ? 'pending' : 'open'}`}>{state}</span>{item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer">Visualizar</a>}
    </article>;
}

export default SupplierPortal;
