import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import {
    LiaArrowLeftSolid,
    LiaBoxesSolid,
    LiaCarSideSolid,
    LiaCheckCircleSolid,
    LiaClipboardCheckSolid,
    LiaCouchSolid,
    LiaFileContractSolid,
    LiaSearchSolid,
    LiaToolsSolid,
} from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { canPerformAction } from '../../config/rolePermissions';
import { firestore } from '../../firebase';
import { AdministrativeCommandService } from '../../modules/administrative-core';
import './AdministrativeFieldOperations.css';

const MODULES = {
    contratos: { label: 'Fiscalização', description: 'Registre a fiscalização dos contratos sob sua responsabilidade.', icon: LiaFileContractSolid, collection: 'contracts', action: 'contratos.fiscalizar' },
    almoxarifado: { label: 'Solicitar material', description: 'Solicite materiais e acompanhe suas requisições.', icon: LiaBoxesSolid, collection: 'materialRequests', action: 'almoxarifado.solicitar' },
    patrimonio: { label: 'Consulta patrimonial', description: 'Consulte bens por tombamento, descrição ou localização.', icon: LiaCouchSolid, collection: 'assets', action: 'patrimonio.visualizar' },
    manutencao: { label: 'Manutenção', description: 'Abra chamados e acompanhe as demandas de manutenção.', icon: LiaToolsSolid, collection: 'maintenanceTickets', action: 'manutencao.solicitar' },
    frotas: { label: 'Frotas', description: 'Registre abastecimentos e ocorrências em campo.', icon: LiaCarSideSolid, collection: 'fleetVehicles', action: 'frotas.registrar' },
};

const statusLabel = value => ({ active: 'Ativo', open: 'Aberto', requested: 'Solicitada', assigned: 'Atribuída', in_progress: 'Em execução', completed: 'Concluída', received: 'Recebida' }[value] || value || '—');
const dateLabel = value => value?.toDate?.().toLocaleDateString('pt-BR') || '—';

function useRows(name) {
    const [state, setState] = useState({ loading: true, rows: [], error: '' });
    useEffect(() => {
        if (!name) return undefined;
        return onSnapshot(query(collection(firestore, name), orderBy('createdAt', 'desc')),
            snapshot => setState({ loading: false, rows: snapshot.docs.map(item => ({ id: item.id, ...item.data() })), error: '' }),
            error => setState({ loading: false, rows: [], error: error.message }));
    }, [name]);
    return state;
}

function Feedback({ message }) { return message ? <p className="field-feedback">{message}</p> : null; }

function ContractInspection({ rows, uid }) {
    const [contractId, setContractId] = useState(''); const [description, setDescription] = useState(''); const [situation, setSituation] = useState('Conforme'); const [message, setMessage] = useState('');
    const myContracts = rows.filter(row => row.inspectorId === uid || row.substituteInspectorId === uid || row.managerId === uid);
    const submit = async event => { event.preventDefault(); try { await AdministrativeCommandService.run('contratos', 'addInspection', { contractId, description, situation, inspectedAt: new Date().toISOString() }); setContractId(''); setDescription(''); setMessage('Fiscalização registrada com sucesso.'); } catch (error) { setMessage(error.message || 'Não foi possível registrar a fiscalização.'); } };
    return <><form className="field-operation-form" onSubmit={submit}><h2>Registrar fiscalização</h2><label><span>Contrato *</span><select required value={contractId} onChange={event => setContractId(event.target.value)}><option value="">Selecione</option>{myContracts.map(row => <option key={row.id} value={row.id}>{row.identifier} · {row.contractNumber}</option>)}</select></label><label><span>Situação encontrada *</span><select value={situation} onChange={event => setSituation(event.target.value)}><option>Conforme</option><option>Com ressalvas</option><option>Não conforme</option></select></label><label className="wide"><span>Registro da fiscalização *</span><textarea required rows="4" value={description} onChange={event => setDescription(event.target.value)} placeholder="Descreva a verificação e as evidências encontradas." /></label><button className="field-primary-button" disabled={!myContracts.length}>Salvar fiscalização</button><Feedback message={message} /></form><RecordList title="Meus contratos" rows={myContracts} fields={[['identifier', 'Identificação'], ['supplierName', 'Fornecedor'], ['object', 'Objeto'], ['endsAt', 'Vigência', dateLabel], ['status', 'Situação', statusLabel]]} empty="Nenhum contrato está vinculado ao seu perfil." /></>;
}

function MaterialRequest({ rows, uid }) {
    const products = useRows('inventoryProducts'); const warehouses = useRows('inventoryWarehouses');
    const [form, setForm] = useState({ productId: '', warehouseId: '', quantity: 1, justification: '' }); const [message, setMessage] = useState('');
    const submit = async event => { event.preventDefault(); const product = products.rows.find(row => row.id === form.productId); if (!product) return; try { await AdministrativeCommandService.run('almoxarifado', 'createRequest', { warehouseId: form.warehouseId, justification: form.justification, items: [{ productId: product.id, productDescription: product.description, quantity: form.quantity }] }); setForm({ productId: '', warehouseId: '', quantity: 1, justification: '' }); setMessage('Requisição enviada para autorização.'); } catch (error) { setMessage(error.message || 'Não foi possível enviar a requisição.'); } };
    const mine = rows.filter(row => row.requesterId === uid);
    return <><form className="field-operation-form" onSubmit={submit}><h2>Nova requisição</h2><label><span>Material *</span><select required value={form.productId} onChange={event => setForm({ ...form, productId: event.target.value })}><option value="">Selecione</option>{products.rows.map(row => <option key={row.id} value={row.id}>{row.description} · disponível: {row.currentStock || 0} {row.unit || ''}</option>)}</select></label><label><span>Depósito *</span><select required value={form.warehouseId} onChange={event => setForm({ ...form, warehouseId: event.target.value })}><option value="">Selecione</option>{warehouses.rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Quantidade *</span><input required type="number" min="1" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></label><label className="wide"><span>Justificativa *</span><textarea required rows="3" value={form.justification} onChange={event => setForm({ ...form, justification: event.target.value })} /></label><button className="field-primary-button" disabled={products.loading || warehouses.loading}>Enviar requisição</button><Feedback message={message} /></form><RecordList title="Minhas requisições" rows={mine} fields={[['identifier', 'Número'], ['status', 'Situação', statusLabel], ['createdAt', 'Solicitada em', dateLabel]]} empty="Você ainda não solicitou materiais." /></>;
}

function AssetLookup({ rows }) {
    const [term, setTerm] = useState(''); const filtered = useMemo(() => { const normalized = term.trim().toLowerCase(); return normalized ? rows.filter(row => [row.identifier, row.tombNumber, row.description, row.location, row.departmentName].some(value => String(value || '').toLowerCase().includes(normalized))) : rows; }, [rows, term]);
    return <><section className="field-search"><LiaSearchSolid /><input value={term} onChange={event => setTerm(event.target.value)} placeholder="Busque por tombamento, bem ou localização" /></section><RecordList title="Bens encontrados" rows={filtered} fields={[['tombNumber', 'Tombamento'], ['description', 'Bem'], ['departmentName', 'Setor'], ['location', 'Localização'], ['status', 'Situação', statusLabel]]} empty="Nenhum bem encontrado para esta busca." /></>;
}

function MaintenanceTicket({ rows, uid }) {
    const assets = useRows('assets'); const [form, setForm] = useState({ assetId: '', subject: '', description: '', priority: 'normal' }); const [message, setMessage] = useState('');
    const submit = async event => { event.preventDefault(); const asset = assets.rows.find(row => row.id === form.assetId); try { await AdministrativeCommandService.run('manutencao', 'createTicket', { ...form, assetIdentifier: asset?.tombNumber || asset?.identifier || '', assetDescription: asset?.description || '' }); setForm({ assetId: '', subject: '', description: '', priority: 'normal' }); setMessage('Chamado aberto. A equipe de manutenção será notificada.'); } catch (error) { setMessage(error.message || 'Não foi possível abrir o chamado.'); } };
    const mine = rows.filter(row => row.requesterId === uid);
    return <><form className="field-operation-form" onSubmit={submit}><h2>Abrir chamado</h2><label><span>Patrimônio</span><select value={form.assetId} onChange={event => setForm({ ...form, assetId: event.target.value })}><option value="">Não vincular agora</option>{assets.rows.map(row => <option key={row.id} value={row.id}>{row.tombNumber || row.identifier} · {row.description}</option>)}</select></label><label><span>Prioridade *</span><select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label className="wide"><span>Problema *</span><input required value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></label><label className="wide"><span>Descrição *</span><textarea required rows="4" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label><button className="field-primary-button">Abrir chamado</button><Feedback message={message} /></form><RecordList title="Meus chamados" rows={mine} fields={[['identifier', 'Número'], ['subject', 'Problema'], ['priority', 'Prioridade'], ['status', 'Situação', statusLabel], ['createdAt', 'Abertura', dateLabel]]} empty="Você ainda não abriu chamados." /></>;
}

function FleetEvent({ rows }) {
    const [form, setForm] = useState({ vehicleId: '', mileage: '', quantity: '', amount: '', supplierName: '', description: '' }); const [message, setMessage] = useState('');
    const submit = async event => { event.preventDefault(); try { await AdministrativeCommandService.run('frotas', 'createEvent', { ...form, kind: 'fueling', occurredAt: new Date().toISOString() }); setForm({ vehicleId: '', mileage: '', quantity: '', amount: '', supplierName: '', description: '' }); setMessage('Abastecimento registrado.'); } catch (error) { setMessage(error.message || 'Não foi possível registrar o abastecimento.'); } };
    return <><form className="field-operation-form" onSubmit={submit}><h2>Registrar abastecimento</h2><label><span>Veículo *</span><select required value={form.vehicleId} onChange={event => setForm({ ...form, vehicleId: event.target.value })}><option value="">Selecione</option>{rows.filter(row => row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.plate} · {row.description}</option>)}</select></label><label><span>Quilometragem *</span><input required type="number" min="0" value={form.mileage} onChange={event => setForm({ ...form, mileage: event.target.value })} /></label><label><span>Litros *</span><input required type="number" min="0" step="0.01" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></label><label><span>Valor (R$) *</span><input required type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label><label><span>Fornecedor</span><input value={form.supplierName} onChange={event => setForm({ ...form, supplierName: event.target.value })} /></label><label className="wide"><span>Observação *</span><textarea required rows="3" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label><button className="field-primary-button">Registrar abastecimento</button><Feedback message={message} /></form><RecordList title="Veículos disponíveis" rows={rows} fields={[['plate', 'Placa'], ['description', 'Veículo'], ['currentMileage', 'Quilometragem'], ['departmentName', 'Setor'], ['status', 'Situação', statusLabel]]} empty="Nenhum veículo cadastrado." /></>;
}

function RecordList({ title, rows, fields, empty }) { return <section className="field-record-list"><header><div><h2>{title}</h2><p>{rows.length} registro(s)</p></div><LiaClipboardCheckSolid /></header>{rows.length ? <div>{rows.map(row => <article key={row.id}>{fields.map(([key, label, format]) => <div key={key}><span>{label}</span><strong>{format ? format(row[key]) : (row[key] || '—')}</strong></div>)}</article>)}</div> : <div className="field-empty"><LiaCheckCircleSolid /><p>{empty}</p></div>}</section>; }

export default function AdministrativeFieldOperations() {
    const { moduleId } = useParams(); const navigate = useNavigate(); const { currentUser, role } = useAuth(); const { settings } = useSystemControl(); const module = MODULES[moduleId]; const records = useRows(module?.collection); const allowed = module && canPerformAction(settings, role, currentUser?.email, module.action);
    if (!module) return <main className="field-page"><p>Operação não encontrada.</p></main>;
    const Icon = module.icon;
    const content = !allowed ? <div className="field-empty"><LiaCheckCircleSolid /><h2>Ação indisponível</h2><p>Seu perfil pode acessar o módulo, mas não possui permissão para esta operação.</p></div> : ({ contratos: <ContractInspection rows={records.rows} uid={currentUser?.uid} />, almoxarifado: <MaterialRequest rows={records.rows} uid={currentUser?.uid} />, patrimonio: <AssetLookup rows={records.rows} />, manutencao: <MaintenanceTicket rows={records.rows} uid={currentUser?.uid} />, frotas: <FleetEvent rows={records.rows} /> })[moduleId];
    return <div className="dashboard-layout field-operations-layout"><Sidebar onItemClick={navigate} /><main className="dashboard-content field-page"><button className="field-back" onClick={() => navigate('/dashboard')}><LiaArrowLeftSolid /> Serviços</button><header className="field-header"><span><Icon /></span><div><small>OPERAÇÕES DE CAMPO</small><h1>{module.label}</h1><p>{module.description}</p></div></header>{records.loading ? <div className="field-empty"><span className="field-spinner" />Carregando dados...</div> : records.error ? <div className="field-empty"><p>Não foi possível carregar os dados: {records.error}</p></div> : content}</main></div>;
}
