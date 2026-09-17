import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { LiaFileDownloadSolid, LiaFilePdfSolid, LiaTableSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from '../../firebase';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { AdministrativeCommandService } from '../../modules/administrative-core';
import '../../modules/administrative-core/administrative-core.css';
import './AdministrativeReports.css';

pdfMake.vfs = pdfFonts?.pdfMake?.vfs || pdfFonts;

const REPORTS = {
    contratos: { label: 'Contratos', collection: 'contracts', columns: [['identifier', 'Identificação'], ['contractNumber', 'Contrato'], ['supplierName', 'Fornecedor'], ['object', 'Objeto'], ['currentValue', 'Valor atualizado'], ['status', 'Situação']] },
    almoxarifado: { label: 'Estoque', collection: 'inventoryProducts', columns: [['code', 'Código'], ['description', 'Produto'], ['category', 'Categoria'], ['currentStock', 'Estoque'], ['minimumStock', 'Mínimo'], ['averageValue', 'Valor médio']] },
    patrimonio: { label: 'Patrimônio', collection: 'assets', columns: [['tombNumber', 'Tombamento'], ['description', 'Bem'], ['category', 'Categoria'], ['departmentName', 'Setor'], ['responsibleName', 'Responsável'], ['status', 'Situação']] },
    manutencao: { label: 'Ordens de serviço', collection: 'maintenanceWorkOrders', columns: [['identifier', 'OS'], ['subject', 'Serviço'], ['assetDescription', 'Patrimônio'], ['technicianName', 'Técnico'], ['status', 'Situação'], ['actualCost', 'Custo']] },
    frotas: { label: 'Veículos', collection: 'fleetVehicles', columns: [['plate', 'Placa'], ['description', 'Veículo'], ['departmentName', 'Setor'], ['currentMileage', 'Quilometragem'], ['insuranceExpiresAt', 'Seguro'], ['status', 'Situação']] },
};
const formatValue = value => value?.toDate?.().toLocaleDateString('pt-BR') || (value === null || value === undefined || value === '' ? '—' : String(value));
const csvValue = value => `"${formatValue(value).replace(/"/g, '""')}"`;

export default function AdministrativeReports() {
    const { settings } = useSystemControl();
    const [moduleId, setModuleId] = useState('contratos'); const [rows, setRows] = useState([]); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false);
    const activeReports = useMemo(() => Object.entries(REPORTS).filter(([id]) => settings.modules?.[id]?.admin === true), [settings.modules]);
    useEffect(() => {
        if (activeReports.length && !activeReports.some(([id]) => id === moduleId)) setModuleId(activeReports[0][0]);
    }, [activeReports, moduleId]);
    const selected = REPORTS[moduleId] || REPORTS.contratos;
    const load = async () => { setLoading(true); setMessage(''); try { const snapshot = await getDocs(query(collection(firestore, selected.collection))); setRows(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setMessage(`${snapshot.size} registro(s) carregado(s).`); } catch (error) { setRows([]); setMessage(error.message || 'Não foi possível carregar o relatório.'); } finally { setLoading(false); } };
    const register = format => AdministrativeCommandService.run(moduleId, 'registerExport', { reportName: selected.label, format, rowCount: rows.length });
    const exportCsv = async () => { if (!rows.length) return setMessage('Carregue os dados antes de exportar.'); try { await register('csv'); const content = [selected.columns.map(([, label]) => csvValue(label)).join(','), ...rows.map(row => selected.columns.map(([key]) => csvValue(row[key])).join(','))].join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${moduleId}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); } catch (error) { setMessage(error.message || 'Não foi possível exportar o CSV.'); } };
    const exportPdf = async () => { if (!rows.length) return setMessage('Carregue os dados antes de exportar.'); try { await register('pdf'); const institution = settings.tenant?.name || settings.tenant?.portalTitle || 'Câmara Municipal'; const footer = [settings.tenant?.address, settings.tenant?.phone, settings.tenant?.email].filter(Boolean).join(' · '); pdfMake.createPdf({ pageOrientation: 'landscape', pageMargins: [34, 58, 34, 48], header: { margin: [34, 18, 34, 0], text: institution.toUpperCase(), alignment: 'center', bold: true, color: '#075a9e' }, footer: { margin: [34, 0, 34, 18], text: footer || institution, alignment: 'center', fontSize: 8, color: '#607891' }, content: [{ text: `RELATÓRIO ADMINISTRATIVO — ${selected.label.toUpperCase()}`, bold: true, fontSize: 15, margin: [0, 0, 0, 14] }, { text: `Emitido em ${new Date().toLocaleString('pt-BR')} · ${rows.length} registro(s)`, color: '#607891', margin: [0, 0, 0, 12] }, { table: { headerRows: 1, widths: selected.columns.map(() => '*'), body: [selected.columns.map(([, label]) => ({ text: label, bold: true, fillColor: '#e8f2f9' })), ...rows.map(row => selected.columns.map(([key]) => formatValue(row[key])))] }, layout: 'lightHorizontalLines' }] }).download(`relatorio-${moduleId}-${new Date().toISOString().slice(0, 10)}.pdf`); } catch (error) { setMessage(error.message || 'Não foi possível gerar o PDF.'); } };
    return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content administrative-module-page"><header className="page-header-container administrative-module-header"><div><span>GESTÃO ADMINISTRATIVA</span><h1>Relatórios e exportações</h1><p>Gere arquivos com identidade institucional e rastreabilidade.</p></div></header><section className="data-card administrative-reports-card"><div className="administrative-reports-controls"><label><span>Relatório</span><select value={moduleId} onChange={event => { setModuleId(event.target.value); setRows([]); setMessage(''); }}>{activeReports.map(([id, item]) => <option value={id} key={id}>{item.label}</option>)}</select></label><button className="primary-button" disabled={loading || !activeReports.length} onClick={load}><LiaTableSolid />{loading ? 'Carregando...' : 'Carregar dados'}</button><button className="secondary-button" disabled={!rows.length} onClick={exportCsv}><LiaFileDownloadSolid /> CSV</button><button className="primary-button" disabled={!rows.length} onClick={exportPdf}><LiaFilePdfSolid /> PDF</button></div>{message && <p className="administrative-report-message">{message}</p>}<div className="administrative-table-wrap"><table className="administrative-table"><thead><tr>{selected.columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{selected.columns.map(([key, label]) => <td data-label={label} key={key}>{formatValue(row[key])}</td>)}</tr>)}</tbody></table></div>{!rows.length && <div className="administrative-empty-state"><LiaTableSolid /><h3>Nenhum dado carregado</h3><p>Escolha um relatório ativo e carregue os registros antes de gerar o arquivo.</p></div>}</section></main></div>;
}
