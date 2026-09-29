import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from "../../services/firebaseApi.js";
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import {
    LiaArchiveSolid, LiaBalanceScaleSolid, LiaCalendarCheckSolid,
    LiaChartBarSolid, LiaClipboardCheckSolid, LiaFileDownloadSolid,
    LiaFilePdfSolid, LiaFileSolid, LiaHistorySolid, LiaPlusSolid,
    LiaShieldAltSolid, LiaTableSolid, LiaTasksSolid, LiaTimesSolid, LiaUsersSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from "../../services/firebaseApi.js";
import { useSystemControl } from '../../contexts/SystemControlContext';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { canAccessModule } from '../../config/rolePermissions';
import { buildProcurementApiUrl } from '../../config/systemModules';
import { AdministrativeCommandService } from '../../modules/administrative-core';
import '../../modules/administrative-core/administrative-core.css';
import './AdministrativeReports.css';

pdfMake.vfs = pdfFonts?.pdfMake?.vfs || pdfFonts;

const AREAS = [
    { id: 'dashboard', label: 'Dashboard da Presidência', icon: LiaChartBarSolid },
    { id: 'checklists', label: 'Checklists mensais', icon: LiaCalendarCheckSolid },
    { id: 'contratos', label: 'Acompanhamento de contratos', icon: LiaClipboardCheckSolid, module: 'contratos' },
    { id: 'licitacoes', label: 'Licitações', icon: LiaBalanceScaleSolid, external: 'procurement' },
    { id: 'patrimonio', label: 'Patrimônio', icon: LiaArchiveSolid, module: 'patrimonio' },
    { id: 'almoxarifado', label: 'Almoxarifado', icon: LiaArchiveSolid, module: 'almoxarifado' },
    { id: 'diarias', label: 'Diárias' },
    { id: 'folha', label: 'Folha' },
    { id: 'limites', label: 'Limites legais', icon: LiaBalanceScaleSolid, recordType: 'limit' },
    { id: 'recomendacoes', label: 'Recomendações', icon: LiaShieldAltSolid, recordType: 'recommendation' },
    { id: 'providencias', label: 'Plano de providências', icon: LiaTasksSolid, recordType: 'actionPlan' },
    { id: 'achados', label: 'Achados de auditoria', icon: LiaClipboardCheckSolid, recordType: 'finding' },
    { id: 'responsaveis', label: 'Responsáveis e prazos', icon: LiaUsersSolid, records: true },
    { id: 'evidencias', label: 'Evidências e documentos', icon: LiaFileSolid, recordType: 'evidence' },
    { id: 'relatorios', label: 'Relatórios automáticos', icon: LiaFileDownloadSolid },
    { id: 'auditoria', label: 'Trilha de auditoria', icon: LiaHistorySolid },
    { id: 'riscos', label: 'Matriz de riscos', icon: LiaShieldAltSolid, recordType: 'risk' },
];

const REPORTS = {
    licitacoes: { label: 'Licitações PNCP', external: 'procurement', columns: [['id', 'Identificação PNCP'], ['number', 'Número'], ['object', 'Objeto'], ['value', 'Valor estimado'], ['status', 'Situação'], ['startDate', 'Abertura']] },
    contratos: { label: 'Contratos', collection: 'contracts', columns: [['identifier', 'Identificação'], ['contractNumber', 'Contrato'], ['supplierName', 'Fornecedor'], ['object', 'Objeto'], ['currentValue', 'Valor atualizado'], ['status', 'Situação']], module: 'contratos' },
    almoxarifado: { label: 'Estoque', collection: 'inventoryProducts', columns: [['code', 'Código'], ['description', 'Produto'], ['category', 'Categoria'], ['currentStock', 'Estoque'], ['minimumStock', 'Mínimo'], ['averageValue', 'Valor médio']], module: 'almoxarifado' },
    patrimonio: { label: 'Patrimônio', collection: 'assets', columns: [['tombNumber', 'Tombamento'], ['description', 'Bem'], ['category', 'Categoria'], ['departmentName', 'Setor'], ['responsibleName', 'Responsável'], ['status', 'Situação']], module: 'patrimonio' },
    manutencao: { label: 'Ordens de serviço', collection: 'maintenanceWorkOrders', columns: [['identifier', 'OS'], ['subject', 'Serviço'], ['assetDescription', 'Patrimônio'], ['technicianName', 'Técnico'], ['status', 'Situação'], ['actualCost', 'Custo']], module: 'manutencao' },
    frotas: { label: 'Veículos', collection: 'fleetVehicles', columns: [['plate', 'Placa'], ['description', 'Veículo'], ['departmentName', 'Setor'], ['currentMileage', 'Quilometragem'], ['insuranceExpiresAt', 'Seguro'], ['status', 'Situação']], module: 'frotas' },
};
const dateLabel = value => value?.toDate?.()?.toLocaleDateString('pt-BR') || (value ? new Date(value).toLocaleDateString('pt-BR') : '—');
const formatValue = value => value?.toDate?.().toLocaleDateString('pt-BR') || (value === null || value === undefined || value === '' ? '—' : String(value));
const csvValue = value => `"${formatValue(value).replace(/"/g, '""')}"`;
const readPath = (value, path) => String(path || '').split('.').filter(Boolean)
    .reduce((current, key) => current == null ? undefined : current[key], value);
const appendQuery = (url, params) => {
    const queryString = new URLSearchParams(params).toString();
    return `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
};
const emptyForm = { title: '', description: '', area: '', responsibleName: '', dueAt: '', status: 'open', severity: 'medium', reference: '', evidenceUrl: '' };
const RECORD_LABELS = { checklist: 'Checklist mensal', recommendation: 'Recomendação', actionPlan: 'Providência', finding: 'Achado de auditoria', risk: 'Risco', evidence: 'Evidência', limit: 'Limite legal' };
const PROCUREMENT_MODALITIES = [
    { id: 8, label: 'Dispensa de Licitação' },
    { id: 9, label: 'Inexigibilidade' },
    { id: 6, label: 'Pregão Eletrônico' },
    { id: 4, label: 'Concorrência Eletrônica' },
    { id: 2, label: 'Diálogo Competitivo' },
    { id: 3, label: 'Concurso' },
];

export default function AdministrativeReports() {
    const { settings } = useSystemControl();
    const { role, currentUser } = useAuth();
    const [areaId, setAreaId] = useState('dashboard');
    const [records, setRecords] = useState([]);
    const [auditRows, setAuditRows] = useState([]);
    const [reportId, setReportId] = useState('contratos');
    const [procurementYear, setProcurementYear] = useState(new Date().getFullYear());
    const [procurementModality, setProcurementModality] = useState(8);
    const [rows, setRows] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);

    const allowed = useMemo(() => (id) => canAccessModule(
        settings, role, currentUser?.email, id, 'admin',
    ), [currentUser?.email, role, settings]);
    const isManager = ['Admin', 'Administrador'].includes(role);
    const activeReports = useMemo(() => Object.entries(REPORTS)
        .filter(([, item]) => !item.module || allowed(item.module)), [allowed]);
    const selected = REPORTS[reportId] || REPORTS.contratos;
    const activeArea = AREAS.find(item => item.id === areaId) || AREAS[0];

    const loadRecords = async () => {
        try {
            const snapshot = await getDocs(collection(firestore, 'internalControlRecords'));
            setRecords(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                .filter(item => item.status !== 'archived'));
        } catch (error) {
            setMessage(error.message || 'Não foi possível carregar os registros de controle.');
        }
    };
    const loadAudit = async () => {
        try {
            const snapshot = await getDocs(query(
                collection(firestore, 'administrativeAuditLogs'),
                where('moduleId', '==', 'relatorios'),
            ));
            setAuditRows(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        } catch (error) {
            setAuditRows([]);
            setMessage(error.message || 'Não foi possível carregar a trilha de auditoria.');
        }
    };
    useEffect(() => { loadRecords(); }, []);
    useEffect(() => {
        if (activeReports.length && !activeReports.some(([id]) => id === reportId)) setReportId(activeReports[0][0]);
    }, [activeReports, reportId]);
    useEffect(() => { if (areaId === 'auditoria') loadAudit(); }, [areaId]);

    const loadReport = async () => {
        setLoading(true); setMessage('');
        try {
            if (selected.external === 'procurement') {
                const config = settings.integrations?.procurementApi || {};
                if (!config.enabled) throw new Error('Ative e configure a API PNCP em Controle do Sistema > Endpoints e APIs.');
                const apiUrl = buildProcurementApiUrl(config);
                const params = {
                    dataInicial: `${procurementYear}0101`,
                    dataFinal: `${procurementYear}1231`,
                    pagina: 1,
                    tamanhoPagina: 20,
                    codigoModalidadeContratacao: procurementModality,
                };
                const response = await fetch(appendQuery(apiUrl, params));
                if (!response.ok) {
                    const bodyText = await response.text().catch(() => '');
                    let detail = bodyText;
                    try {
                        const bodyJson = JSON.parse(bodyText);
                        detail = bodyJson.message || bodyJson.error || bodyJson.detail || bodyText;
                    } catch (_) {
                        detail = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    }
                    throw new Error(`A API PNCP respondeu HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}.`);
                }
                const body = await response.json();
                const responseData = readPath(body, config.responsePath);
                const list = Array.isArray(responseData) ? responseData :
                    (Array.isArray(body?.data) ? body.data :
                        (Array.isArray(body?.items) ? body.items :
                            (Array.isArray(body?.content) ? body.content : [])));
                if (!Array.isArray(list)) throw new Error('A resposta PNCP não contém uma lista. Revise o caminho da resposta configurado.');
                setRows(list.map(item => Object.fromEntries(Object.entries(config.fields || {}).map(([key, path]) => [key, readPath(item, path)]))));
                const modalityName = PROCUREMENT_MODALITIES.find(item => item.id === procurementModality)?.label;
                setMessage(`${list.length} contratação(ões) do órgão carregada(s) em ${procurementYear} · ${modalityName}.`);
            } else {
                const snapshot = await getDocs(query(collection(firestore, selected.collection)));
                setRows(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
                setMessage(`${snapshot.size} registro(s) carregado(s).`);
            }
        } catch (error) {
            setRows([]);
            setMessage(`Sem acesso ou fonte indisponível: ${error.message || selected.collection}`);
        } finally { setLoading(false); }
    };
    const registerExport = format => AdministrativeCommandService.run(
        'relatorios', 'registerExport', { reportName: selected.label, format, rowCount: rows.length },
    );
    const exportCsv = async () => {
        if (!rows.length) return setMessage('Carregue os dados antes de exportar.');
        try {
            await registerExport('csv');
            const content = [selected.columns.map(([, label]) => csvValue(label)).join(','), ...rows.map(row => selected.columns.map(([key]) => csvValue(row[key])).join(','))].join('\n');
            const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${reportId}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
        } catch (error) { setMessage(error.message || 'Não foi possível exportar CSV.'); }
    };
    const exportPdf = async () => {
        if (!rows.length) return setMessage('Carregue os dados antes de exportar.');
        try {
            await registerExport('pdf');
            const institution = settings.tenant?.name || settings.tenant?.portalTitle || 'Câmara Municipal';
            const footer = [settings.tenant?.address, settings.tenant?.phone, settings.tenant?.email].filter(Boolean).join(' · ');
            pdfMake.createPdf({ pageOrientation: 'landscape', pageMargins: [34, 58, 34, 48], header: { margin: [34, 18, 34, 0], text: institution.toUpperCase(), alignment: 'center', bold: true, color: '#075a9e' }, footer: { margin: [34, 0, 34, 18], text: footer || institution, alignment: 'center', fontSize: 8, color: '#607891' }, content: [{ text: `CONTROLE INTERNO — ${selected.label.toUpperCase()}`, bold: true, fontSize: 15, margin: [0, 0, 0, 14] }, { text: `Emitido em ${new Date().toLocaleString('pt-BR')} · ${rows.length} registro(s)`, color: '#607891', margin: [0, 0, 0, 12] }, { table: { headerRows: 1, widths: selected.columns.map(() => '*'), body: [selected.columns.map(([, label]) => ({ text: label, bold: true, fillColor: '#e8f2f9' })), ...rows.map(row => selected.columns.map(([key]) => formatValue(row[key])))] }, layout: 'lightHorizontalLines' }] }).download(`controle-interno-${reportId}-${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) { setMessage(error.message || 'Não foi possível gerar PDF.'); }
    };
    const saveRecord = async event => {
        event.preventDefault(); setSaving(true); setMessage('');
        try {
            await AdministrativeCommandService.run('relatorios', 'saveRecord', {
                id: editing?.id,
                type: activeArea.recordType || 'checklist',
                data: { ...form, period: form.period || new Date().toISOString().slice(0, 7) },
            });
            setShowForm(false); setEditing(null); setForm(emptyForm); await loadRecords();
            setMessage('Registro salvo e incluído na trilha de auditoria.');
        } catch (error) { setMessage(error.message || 'Não foi possível salvar.'); }
        finally { setSaving(false); }
    };
    const archiveRecord = async item => {
        try {
            await AdministrativeCommandService.run('relatorios', 'saveRecord', { id: item.id, type: item.type, data: item, archive: true });
            await loadRecords(); setMessage('Registro arquivado e auditado.');
        } catch (error) { setMessage(error.message || 'Não foi possível arquivar.'); }
    };
    const openEdit = item => { setEditing(item); setForm({ ...emptyForm, ...item }); setShowForm(true); };
    const displayedRecords = records.filter(item => activeArea.records || item.type === activeArea.recordType || (areaId === 'checklists' && item.type === 'checklist'));
    const overdue = records.filter(item => item.dueAt && new Date(item.dueAt) < new Date() && item.status !== 'done');
    const openItems = records.filter(item => item.status !== 'done');

    const renderRecords = () => <>
        <div className="ic-section-heading"><div><h2>{activeArea.label}</h2><p>Registros persistidos com responsável, prazo e histórico de alterações.</p></div>{isManager && <button className="primary-button" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(value => !value); }}><LiaPlusSolid /> Novo registro</button>}</div>
        {showForm && <div className="ic-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowForm(false); }}><form className="ic-record-form ic-record-modal" role="dialog" aria-modal="true" aria-labelledby="ic-record-modal-title" onSubmit={saveRecord} onMouseDown={event => event.stopPropagation()}>
            <header className="ic-modal-header"><div><span>CONTROLE INTERNO</span><h2 id="ic-record-modal-title">{editing ? 'Editar registro' : `Novo registro · ${activeArea.label}`}</h2></div><button type="button" aria-label="Fechar" onClick={() => setShowForm(false)}><LiaTimesSolid /></button></header>
            <label>Título<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
            <label>Área / módulo<input value={form.area} onChange={event => setForm({ ...form, area: event.target.value })} placeholder="Contratos, licitações, patrimônio..." /></label>
            {(areaId === 'checklists') && <label>Mês de referência<input type="month" value={form.period || new Date().toISOString().slice(0, 7)} onChange={event => setForm({ ...form, period: event.target.value })} /></label>}
            {(areaId === 'riscos') && <label>Criticidade<select value={form.severity} onChange={event => setForm({ ...form, severity: event.target.value })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label>}
            {(areaId === 'riscos') && <><label>Probabilidade<select value={form.probability || 'medium'} onChange={event => setForm({ ...form, probability: event.target.value })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label><label>Impacto<select value={form.impact || 'medium'} onChange={event => setForm({ ...form, impact: event.target.value })}><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option></select></label></>}
            <label>Responsável<input value={form.responsibleName} onChange={event => setForm({ ...form, responsibleName: event.target.value })} /></label>
            <label>Prazo<input type="date" value={form.dueAt} onChange={event => setForm({ ...form, dueAt: event.target.value })} /></label>
            <label>Situação<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="open">Aberto</option><option value="in_progress">Em andamento</option><option value="done">Concluído</option></select></label>
            {(areaId === 'evidencias') && <label>Link ou referência do documento<input value={form.evidenceUrl} onChange={event => setForm({ ...form, evidenceUrl: event.target.value })} placeholder="URL segura ou ID no GED" /></label>}
            {(areaId === 'limites') && <><label>Índice apurado<input value={form.value || ''} onChange={event => setForm({ ...form, value: event.target.value })} /></label><label>Limite legal aplicável<input value={form.legalLimit || ''} onChange={event => setForm({ ...form, legalLimit: event.target.value })} /></label></>}
            <label className="ic-wide">Descrição<textarea rows="3" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
            <label className="ic-wide">Referência operacional<input value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} placeholder="Identificador do contrato, processo, bem ou registro" /></label>
            <div className="ic-wide ic-form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar registro'}</button><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button></div>
        </form></div>}
        {message && <p className="administrative-report-message">{message}</p>}
        <div className="ic-record-list">{displayedRecords.map(item => <article key={item.id} className="ic-record-row"><div><span className={`ic-status ${item.status || 'open'}`}>{item.status === 'done' ? 'Concluído' : item.status === 'in_progress' ? 'Em andamento' : item.severity === 'critical' ? 'Crítico' : 'Aberto'}</span><h3>{item.title || RECORD_LABELS[item.type]}</h3><p>{item.description || item.area || item.reference || 'Sem descrição registrada.'}</p>{item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer">Abrir evidência/documento</a>}</div><div className="ic-record-meta"><span>{item.responsibleName || 'Sem responsável'}</span><span>Prazo: {dateLabel(item.dueAt)}</span>{item.period && <span>Referência: {item.period}</span>}</div>{isManager && <div className="ic-row-actions"><button className="secondary-button" onClick={() => openEdit(item)}>Editar</button><button className="secondary-button" onClick={() => archiveRecord(item)}>Arquivar</button></div>}</article>)}{!displayedRecords.length && <div className="administrative-empty-state"><LiaClipboardCheckSolid /><h3>Nenhum registro nesta área</h3><p>Adicione os registros de acompanhamento para iniciar a trilha de controle.</p></div>}</div>
    </>;

    const renderModuleReport = () => {
        const module = activeArea.module;
        if (activeArea.external === 'procurement') return <section className="ic-panel"><div className="ic-section-heading"><div><h2>{activeArea.label}</h2><p>Consulta as contratações filtradas pelo CNPJ do órgão informado em Controles do Sistema.</p></div><div className="administrative-reports-controls"><label className="ic-year-filter">Ano<select value={procurementYear} onChange={event => { setProcurementYear(Number(event.target.value)); setRows([]); setMessage(''); }}><option value={new Date().getFullYear()}>{new Date().getFullYear()}</option><option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option><option value={new Date().getFullYear() - 2}>{new Date().getFullYear() - 2}</option><option value={new Date().getFullYear() - 3}>{new Date().getFullYear() - 3}</option></select></label><label className="ic-modality-filter">Modalidade<select value={procurementModality} onChange={event => { setProcurementModality(Number(event.target.value)); setRows([]); setMessage(''); }}>{PROCUREMENT_MODALITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className="primary-button" disabled={loading} onClick={loadReport}><LiaTableSolid />{loading ? 'Carregando...' : 'Consultar PNCP'}</button><button className="secondary-button" disabled={!rows.length} onClick={exportCsv}><LiaFileDownloadSolid /> CSV</button><button className="primary-button" disabled={!rows.length} onClick={exportPdf}><LiaFilePdfSolid /> PDF</button></div></div>{message && <p className="administrative-report-message">{message}</p>}{rows.length > 0 && <div className="administrative-table-wrap"><table className="administrative-table"><thead><tr>{REPORTS.licitacoes.columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{REPORTS.licitacoes.columns.map(([field, label]) => <td className={field === 'object' ? 'ic-cell-object' : ''} title={String(row[field] ?? '')} data-label={label} key={field}>{field === 'object' ? <span>{formatValue(row[field])}</span> : formatValue(row[field])}</td>)}</tr>)}</tbody></table></div>}</section>;
        const available = activeReports.filter(([, item]) => item.module === module);
        if (!allowed(module)) return <section className="ic-panel"><h2>{activeArea.label}</h2><p>Este módulo está desativado ou seu perfil não tem acesso. Quando habilitado, o Controle Interno consulta os dados operacionais existentes, sem duplicá-los.</p></section>;
        const key = available[0]?.[0];
        const report = REPORTS[key];
        if (!report) return <section className="ic-panel"><h2>{activeArea.label}</h2><p>Dados desta área serão obtidos do módulo operacional quando sua fonte estiver disponível.</p></section>;
        return <section className="ic-panel"><div className="ic-section-heading"><div><h2>{activeArea.label}</h2><p>Consulta somente leitura da fonte operacional {report.collection}.</p></div><div className="administrative-reports-controls"><button className="primary-button" disabled={loading} onClick={loadReport}><LiaTableSolid />{loading ? 'Carregando...' : 'Carregar dados'}</button><button className="secondary-button" disabled={!rows.length} onClick={exportCsv}><LiaFileDownloadSolid /> CSV</button><button className="primary-button" disabled={!rows.length} onClick={exportPdf}><LiaFilePdfSolid /> PDF</button></div></div>{rows.length > 0 && <div className="administrative-table-wrap"><table className="administrative-table"><thead><tr>{report.columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{report.columns.map(([field, label]) => <td data-label={label} key={field}>{formatValue(row[field])}</td>)}</tr>)}</tbody></table></div>}{!rows.length && <div className="administrative-empty-state"><LiaTableSolid /><h3>Nenhum dado carregado</h3><p>Carregue os dados para consultar e exportar.</p></div>}</section>;
    };

    return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content administrative-module-page ic-page">
        <header className="page-header-container administrative-module-header"><div><span>GOVERNANÇA E TRANSPARÊNCIA</span><h1>Controle Interno e Compliance</h1><p>Acompanhe obrigações, riscos, recomendações e evidências da Câmara.</p></div></header>
        <div className="ic-layout"><nav className="ic-nav" aria-label="Áreas de controle interno">{AREAS.map(item => { const Icon = item.icon || LiaClipboardCheckSolid; return <button key={item.id} className={areaId === item.id ? 'active' : ''} onClick={() => { setAreaId(item.id); setRows([]); setMessage(''); }}><Icon /><span>{item.label}</span>{item.module && !allowed(item.module) && <small>Inativo</small>}</button>; })}</nav>
            <section className="ic-content">
                {areaId === 'dashboard' && <><div className="ic-section-heading"><div><h2>Dashboard da Presidência</h2><p>Visão executiva dos registros de controle e dos módulos habilitados.</p></div><span className="ic-asof">Atualizado em {new Date().toLocaleDateString('pt-BR')}</span></div><div className="ic-kpis"><article><strong>{openItems.length}</strong><span>Providências abertas</span></article><article><strong>{overdue.length}</strong><span>Prazos vencidos</span></article><article><strong>{records.filter(item => item.type === 'finding').length}</strong><span>Achados registrados</span></article><article><strong>{records.filter(item => item.type === 'risk' && ['high', 'critical'].includes(item.severity)).length}</strong><span>Riscos altos/críticos</span></article></div><div className="ic-panels"><section className="ic-panel"><h3>Áreas operacionais</h3><div className="ic-module-status">{['contratos', 'legislativo', 'patrimonio', 'almoxarifado'].map(id => <div key={id}><span>{AREAS.find(item => item.module === id)?.label}</span><b className={allowed(id) ? 'enabled' : ''}>{allowed(id) ? 'Ativo e acessível' : 'Inativo/sem acesso'}</b></div>)}</div></section><section className="ic-panel"><h3>Próximos prazos</h3>{records.filter(item => item.dueAt && item.status !== 'done').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 5).map(item => <div className="ic-deadline" key={item.id}><b>{item.title}</b><span>{item.responsibleName || 'Sem responsável'} · {dateLabel(item.dueAt)}</span></div>)}{!records.some(item => item.dueAt && item.status !== 'done') && <p>Não há prazos pendentes registrados.</p>}</section></div></>}
                {['checklists', 'recomendacoes', 'providencias', 'achados', 'responsaveis', 'evidencias', 'riscos', 'limites'].includes(areaId) && renderRecords()}
                {['contratos', 'patrimonio', 'almoxarifado'].includes(areaId) && renderModuleReport()}
                {areaId === 'licitacoes' && renderModuleReport()}
                {['diarias', 'folha'].includes(areaId) && <section className="ic-panel"><h2>{activeArea.label}</h2><p>A fonte operacional específica ainda não está configurada neste portal. Nenhum dado será inventado; conecte a coleção ou módulo correspondente em Controles do Sistema para habilitar a consulta.</p></section>}
                {areaId === 'relatorios' && <section className="ic-panel"><div className="ic-section-heading"><div><h2>Relatórios automáticos</h2><p>Gere arquivos institucionais a partir dos registros existentes.</p></div></div><div className="ic-report-picker"><label>Fonte de dados<select value={reportId} onChange={event => { setReportId(event.target.value); setRows([]); }}><option value="">Selecione um módulo ativo</option>{activeReports.map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><button className="primary-button" disabled={!reportId || loading} onClick={loadReport}><LiaTableSolid />{loading ? 'Carregando...' : 'Carregar dados'}</button><button className="secondary-button" disabled={!rows.length} onClick={exportCsv}><LiaFileDownloadSolid /> CSV</button><button className="primary-button" disabled={!rows.length} onClick={exportPdf}><LiaFilePdfSolid /> PDF</button></div>{message && <p className="administrative-report-message">{message}</p>}{rows.length > 0 && <div className="administrative-table-wrap"><table className="administrative-table"><thead><tr>{selected.columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{selected.columns.map(([key, label]) => <td data-label={label} key={key}>{formatValue(row[key])}</td>)}</tr>)}</tbody></table></div>}</section>}
                {areaId === 'auditoria' && <section className="ic-panel"><div className="ic-section-heading"><div><h2>Trilha de auditoria</h2><p>Eventos de criação, alteração, arquivamento e exportação realizados neste módulo.</p></div><span>{auditRows.length} evento(s)</span></div><div className="ic-audit-list">{auditRows.map(item => <article key={item.id}><time>{dateLabel(item.createdAt)}</time><div><b>{String(item.action || '').replaceAll('_', ' ')}</b><span>{item.entityType} · {item.entityId}</span></div><small>{item.actorName || item.actorId}</small></article>)}{!auditRows.length && <p>Nenhum evento registrado.</p>}</div></section>}
            </section>
        </div>
    </main></div>;
}
