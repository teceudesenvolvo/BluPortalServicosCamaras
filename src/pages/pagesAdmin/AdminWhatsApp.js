import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, auth, collection, deleteDoc, deleteField, doc, firestore, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, writeBatch } from "../../services/firebaseApi.js";
import { LiaCommentsSolid, LiaCogSolid, LiaProjectDiagramSolid, LiaPaperPlane, LiaPlusSolid, LiaSyncSolid, LiaTrashAltSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { SYSTEM_MODULES } from '../../config/systemModules';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import './AdminWhatsApp.css';

const emptyMessage = { name: '', trigger: '', text: '', active: true };
const makeStep = (title = 'Nova etapa', type = 'menu', position) => ({ id: `etapa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title, type, ...(position ? { position } : {}), message: '', fallbackMessage: '', options: [], moduleId: '', allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'], maxFiles: 3 });
const emptyFlow = { name: '', description: '', completionMessage: 'Atendimento concluído. Obrigado pelo contato.', handoffMessage: 'Vou encaminhar você para um atendente.', active: false, steps: [{ id: 'inicio', title: 'Início', type: 'menu', message: '', fallbackMessage: '', options: [] }] };
const dateValue = value => value?.toDate ? value.toDate().toLocaleString('pt-BR') : value ? new Date(value).toLocaleString('pt-BR') : '—';
const timestampMillis = value => value?.toMillis ? value.toMillis() : value?.seconds ? value.seconds * 1000 : value ? new Date(value).getTime() : 0;
const waitDuration = value => { const minutes = Math.max(0, Math.floor((Date.now() - timestampMillis(value)) / 60000)); return minutes < 1 ? 'agora' : `${minutes} min`; };

// Firestore rejects undefined even when it is nested inside a step/option.
// Preserve Firebase special values (FieldValue, Timestamp, etc.) as-is.
const omitUndefined = value => {
    if (Array.isArray(value)) return value.map(item => item === undefined ? null : omitUndefined(item));
    if (!value || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, omitUndefined(item)]));
};

const validateFlow = flow => {
    const steps = flow.steps || [];
    const issues = [];
    if (!steps.length) issues.push('Adicione pelo menos uma etapa.');
    if (steps.length && !String(steps[0].message || '').trim()) issues.push('A etapa inicial precisa ter uma mensagem.');
    const ids = new Set(steps.map(step => step.id));
    steps.forEach((step, index) => {
        if (!String(step.title || '').trim()) issues.push(`Etapa ${index + 1}: informe um título.`);
        if (!String(step.message || '').trim()) issues.push(`Etapa ${index + 1}: informe a mensagem.`);
        const type = step.type || ((step.options || []).length ? 'menu' : 'message');
        if (type === 'service' && !step.moduleId) issues.push(`Etapa ${index + 1}: selecione o módulo do serviço.`);
        if (type === 'file' && !step.moduleId) issues.push(`Etapa ${index + 1}: associe os arquivos a um módulo de serviço.`);
        if (type === 'menu' && !(step.options || []).some(option => String(option.label || '').trim())) issues.push(`Etapa ${index + 1}: adicione ao menos uma opção ou altere o tipo para mensagem final.`);
        (step.options || []).forEach((option, optionIndex) => {
            if (!String(option.label || '').trim()) issues.push(`Etapa ${index + 1}, opção ${optionIndex + 1}: informe um texto.`);
            if (option.nextStepId && !ids.has(option.nextStepId)) issues.push(`Etapa ${index + 1}, opção ${optionIndex + 1}: o destino não existe mais.`);
            if (option.nextStepId === step.id) issues.push(`Etapa ${index + 1}: uma opção não pode apontar para a própria etapa.`);
        });
    });
    if (steps.length) {
        const reachable = new Set([steps[0].id]);
        const queue = [steps[0].id];
        while (queue.length) {
            const step = steps.find(item => item.id === queue.shift());
            [...(step?.options || []).map(option => option.nextStepId), step?.nextStepId].forEach(targetId => {
                if (ids.has(targetId) && !reachable.has(targetId)) { reachable.add(targetId); queue.push(targetId); }
            });
        }
        steps.forEach((step, index) => { if (!reachable.has(step.id)) issues.push(`Etapa ${index + 1} (“${step.title || 'sem título'}”) não pode ser alcançada desde o início.`); });
    }
    return [...new Set(issues)];
};

const FlowMapPreview = ({ flow, selectedStepId, pendingConnection, onAddStep, onAddOption, onSelectStep, onBeginConnection, onConnect, onMoveStep, onArrange }) => {
    const steps = flow.steps || [];
    const [drag, setDrag] = useState(null);
    if (!steps.length) return <div className="wa-map-shell"><div className="wa-map-empty"><span>◇</span><strong>Seu mapa começa aqui</strong><p>Adicione um bloco para desenhar o atendimento.</p><div className="wa-map-toolbar"><button type="button" className="wa-primary" onClick={() => onAddStep('menu')}>+ Menu</button><button type="button" className="wa-secondary" onClick={() => onAddStep('informative')}>+ Informativo</button><button type="button" className="wa-secondary" onClick={() => onAddStep('message')}>+ Mensagem final</button></div></div></div>;
    const stepById = new Map(steps.map((step, index) => [step.id, { ...step, index }]));
    const depth = new Map([[steps[0].id, 0]]);
    const queue = [steps[0].id];
    while (queue.length) {
        const currentId = queue.shift();
        const current = stepById.get(currentId);
        [...(current?.options || []).map(option => option.nextStepId), current?.nextStepId].forEach(targetId => {
            if (stepById.has(targetId) && !depth.has(targetId)) { depth.set(targetId, depth.get(currentId) + 1); queue.push(targetId); }
        });
    }
    const maxDepth = Math.max(0, ...depth.values());
    steps.forEach(step => { if (!depth.has(step.id)) depth.set(step.id, maxDepth + 1); });
    const layers = new Map();
    steps.forEach(step => { const layer = depth.get(step.id); layers.set(layer, [...(layers.get(layer) || []), step]); });
    const positions = new Map();
    layers.forEach((layerSteps, layer) => {
        let y = 42;
        layerSteps.forEach((step, row) => {
            const estimatedHeight = 150 + (step.options || []).length * 28;
            positions.set(step.id, step.position && Number.isFinite(step.position.x) ? step.position : { x: 42 + layer * 330, y: y + row * 2 });
            y += estimatedHeight + 30;
        });
    });
    const width = Math.max(780, ...[...positions.values()].map(point => point.x + 540), 42 + (Math.max(...layers.keys()) + 1) * 520);
    const height = Math.max(400, ...steps.map(step => positions.get(step.id).y + 180 + (step.options || []).length * 28), 90 + Math.max(...[...layers.values()].map(layer => layer.length)) * 230);
    const startDrag = (event, step) => {
        if (event.target.closest('button')) return;
        const point = positions.get(step.id);
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ id: step.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: point.x, y: point.y });
    };
    const moveDrag = event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        onMoveStep(drag.id, { x: Math.max(18, drag.x + event.clientX - drag.startX), y: Math.max(18, drag.y + event.clientY - drag.startY) });
    };
    const linePath = (from, to) => {
        const x1 = from.x + 270, y1 = from.y + 72, x2 = to.x, y2 = to.y + 72;
        const bend = Math.max(50, Math.abs(x2 - x1) * .45);
        return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    };
    return <div className="wa-map-shell"><div className="wa-map-heading"><div><span className="wa-map-kicker">MAPA DO CHATBOT</span><h3>{flow.name || 'Novo fluxo'}</h3><p>{pendingConnection ? 'Agora selecione no mapa a etapa de destino.' : 'Clique no conector de saída de uma opção e depois no conector de entrada do bloco de destino.'}</p></div><span className={`wa-map-state ${flow.active === false ? 'inactive' : ''}`}>{flow.active === false ? 'Rascunho' : 'Publicado'}</span></div><div className="wa-map-toolbar"><button type="button" className="wa-primary" onClick={() => onAddStep('menu')}>+ Menu numérico</button><button type="button" className="wa-secondary" onClick={() => onAddStep('informative')}>+ Informativo</button><button type="button" className="wa-secondary" onClick={() => onAddStep('service')}>+ Serviço</button><button type="button" className="wa-secondary" onClick={() => onAddStep('file')}>+ Envio de arquivos</button><button type="button" className="wa-secondary" onClick={() => onAddStep('message')}>+ Fim</button><button type="button" className="wa-secondary" onClick={onArrange}>Organizar mapa</button>{pendingConnection && <button type="button" className="wa-secondary" onClick={() => onBeginConnection(null)}>Cancelar conexão</button>}</div><div className="wa-map-scroll"><div className="wa-map-canvas wa-visual-canvas" style={{ width, height }} onPointerMove={moveDrag} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}><svg className="wa-map-edges" width={width} height={height} aria-label="Conexões entre blocos"><defs><marker id="wa-map-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="#63a9d7" /></marker></defs>{steps.flatMap(step => [...(step.options || []).map((option, optionIndex) => ({targetId: option.nextStepId, label: option.label, key: `${step.id}_${optionIndex}`})), ...(step.nextStepId ? [{targetId: step.nextStepId, label: step.type === 'file' ? 'Após anexos' : 'Após solicitação', key: `${step.id}_next`}] : [])].filter(edge => stepById.has(edge.targetId)).map(edge => <g key={edge.key}><path className="wa-map-path" d={linePath(positions.get(step.id), positions.get(edge.targetId))} markerEnd="url(#wa-map-arrow)" /><text className="wa-map-edge-label" x={(positions.get(step.id).x + 270 + positions.get(edge.targetId).x) / 2} y={(positions.get(step.id).y + positions.get(edge.targetId).y) / 2 + 64}>{edge.label}</text></g>))}</svg>{steps.map((step, index) => {
        const point = positions.get(step.id);
        const type = step.type || ((step.options || []).length ? 'menu' : 'message');
        const isStart = index === 0;
        const isTarget = Boolean(pendingConnection && pendingConnection.stepId !== step.id);
        const labels = {menu:'MENU NUMÉRICO',message:'FIM',informative:'INFORMATIVO',service:'SERVIÇO',file:'ANEXOS',handoff:'ATENDENTE'};
        return <article className={`wa-map-node wa-visual-node ${isStart ? 'start' : ''} ${type === 'handoff' ? 'handoff' : ''} ${selectedStepId === step.id ? 'selected' : ''} ${isTarget ? 'connect-target' : ''}`} key={step.id} style={{ left: point.x, top: point.y }} onPointerDown={event => startDrag(event, step)} onClick={() => pendingConnection ? onConnect(step.id) : onSelectStep(step.id)}><div className="wa-map-node-top"><span>{isStart ? 'INÍCIO' : labels[type] || 'BLOCO'}</span><button type="button" onClick={event => { event.stopPropagation(); onSelectStep(step.id); }} aria-label={`Editar ${step.title}`}>✎</button></div><button type="button" className={`wa-map-input-port ${pendingConnection && pendingConnection.stepId !== step.id ? 'ready' : ''}`} aria-label={`Conector de entrada para ${step.title}`} title={pendingConnection ? 'Conectar aqui' : 'Entrada do bloco'} onClick={event => { event.stopPropagation(); pendingConnection ? onConnect(step.id) : onSelectStep(step.id); }} /><strong>{step.title || `Etapa ${index + 1}`}</strong><p>{step.message || 'Edite este bloco no painel lateral.'}</p>{type === 'menu' ? <ul>{(step.options || []).map((option, optionIndex) => <li key={`${step.id}_option_${optionIndex}`}><span>{optionIndex + 1}. {option.label || `Opção ${optionIndex + 1}`}</span><button type="button" disabled={option.action === 'handoff'} className={pendingConnection?.stepId === step.id && pendingConnection?.optionIndex === optionIndex ? 'connecting' : ''} onClick={event => { event.stopPropagation(); onBeginConnection({ stepId: step.id, optionIndex }); }}><span className="wa-map-output-port" aria-hidden="true" />{option.action === 'handoff' ? 'Atendente' : stepById.has(option.nextStepId) ? 'Mudar destino' : 'Conectar saída'}</button></li>)}<li className="wa-map-add-option"><button type="button" onClick={event => { event.stopPropagation(); onAddOption(index); }}>+ Adicionar opção</button></li></ul> : <div className="wa-map-end">{type === 'service' ? (step.moduleId || 'Escolha módulo') : type === 'file' ? `${step.maxFiles || 3} arquivo(s)` : type === 'handoff' ? 'Transferir para atendente' : type === 'informative' ? 'Enviar comunicado' : 'Fim do atendimento'}{['service','file','informative'].includes(type) && <button type="button" onClick={event => { event.stopPropagation(); onBeginConnection({ stepId: step.id, next: true }); }}><span className="wa-map-output-port" aria-hidden="true" />{stepById.has(step.nextStepId) ? 'Mudar conexão' : 'Conectar saída'}</button>}</div>}</article>;
        })}<div className="wa-map-finish" style={{ left: width - 222, top: Math.max(30, height / 2 - 34) }}><span>✓</span><strong>Fim do atendimento</strong></div></div></div><div className="wa-map-legend"><span><i className="start-dot" /> Início</span><span><i className="step-dot" /> Menu</span><span><i className="finish-dot" /> Conclusão</span><span><i className="handoff-dot" /> Atendente</span></div></div>;
};
const AdminWhatsApp = () => {
    const { settings: systemSettings } = useSystemControl();
    const { currentUser } = useAuth();
    const [attendantName, setAttendantName] = useState('');
    const availableServices = useMemo(() => SYSTEM_MODULES.filter(module => (module.userPaths || []).length > 0 && (systemSettings.modules?.[module.id]?.portal === true || systemSettings.modules?.[module.id]?.admin === true || systemSettings.modules?.[module.id]?.app === true)), [systemSettings.modules]);
    const [tab, setTab] = useState('overview');
    const [messages, setMessages] = useState([]);
    const [flows, setFlows] = useState([]);
    const chatbotLoaded = useRef(false);
    const [conversations, setConversations] = useState([]);
    const [serviceRequests, setServiceRequests] = useState([]);
    const [settings, setSettings] = useState({ enabled: false, provider: 'Baileys', bridgeUrl: '', greetingMessage: '', fallbackMessage: '', handoffMessage: '' });
    const [runtimeStatus, setRuntimeStatus] = useState({ status: 'disconnected', qrCode: '' });
    const [runtimeLoaded, setRuntimeLoaded] = useState(false);
    const [messageForm, setMessageForm] = useState(emptyMessage);
    const [flowForm, setFlowForm] = useState(emptyFlow);
    const [selectedStepId, setSelectedStepId] = useState('inicio');
    const [pendingConnection, setPendingConnection] = useState(null);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [reply, setReply] = useState('');
    const [saving, setSaving] = useState(false);
    const [threadMessages, setThreadMessages] = useState([]);
    const [notice, setNotice] = useState('');
    const [conversationMenuId, setConversationMenuId] = useState(null);
    const [, setQueueClock] = useState(Date.now());

    useEffect(() => {
        let active = true;
        if (!currentUser?.uid) { setAttendantName(''); return undefined; }
        getDoc(doc(firestore, 'users', currentUser.uid)).then(snapshot => {
            if (!active) return;
            const profile = snapshot.data() || {};
            setAttendantName(String(profile.name || profile.nome || profile.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Atendente').trim());
        }).catch(() => setAttendantName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Atendente'));
        return () => { active = false; };
    }, [currentUser]);

    useEffect(() => {
        const timer = setInterval(() => setQueueClock(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!selectedConversation?.id || !(selectedConversation.unreadCount > 0)) return;
        setDoc(doc(firestore, 'whatsappConversations', selectedConversation.id), { unreadCount: 0 }, { merge: true })
            .catch(error => {
                console.error('Não foi possível marcar a conversa do WhatsApp como lida:', error);
                setNotice('A conversa abriu, mas não foi possível atualizar o estado de leitura.');
            });
    }, [selectedConversation?.id, selectedConversation?.unreadCount]);

    useEffect(() => {
        const onReadError = label => error => {
            console.error(`Falha ao carregar ${label} do WhatsApp:`, error);
            setNotice(`Não foi possível carregar ${label}: ${error.message || 'verifique o acesso ao Firestore.'}`);
        };
        const unsubs = [
            onSnapshot(collection(firestore, 'whatsappAutomaticMessages'), snap => setMessages(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))), onReadError('mensagens automáticas')),
            onSnapshot(collection(firestore, 'whatsappFlows'), snap => {
                const next = snap.docs.map(item => ({ id: item.id, ...item.data() }));
                setFlows(next);
                if (!chatbotLoaded.current && next.length) {
                    const saved = next.find(item => item.id === 'main') || next.find(item => item.active === true) || next[0];
                    const content = saved.draft || saved;
                    const steps = (content.steps || []).map(step => ({ ...step, options: step.options || [] }));
                    setFlowForm({ ...emptyFlow, ...content, active: saved.id === 'main' ? saved.active !== false && !saved.draft : saved.active !== false && !saved.draft, steps });
                    setSelectedStepId(steps[0]?.id || 'inicio');
                    chatbotLoaded.current = true;
                }
            }, onReadError('chatbot')),
            onSnapshot(collection(firestore, 'whatsappConversations'), snap => { const next = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)); setConversations(next); setSelectedConversation(current => current ? next.find(item => item.id === current.id) || current : current); }, onReadError('conversas')),
            onSnapshot(collection(firestore, 'whatsappMessages'), snap => setThreadMessages(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))), onReadError('mensagens')),
            onSnapshot(collection(firestore, 'whatsappServiceRequests'), snap => setServiceRequests(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), onReadError('solicitações dos serviços')),
            onSnapshot(doc(firestore, 'whatsappSettings', 'config'), snap => snap.exists() && setSettings(current => ({ ...current, ...snap.data() })), onReadError('configuração')),
            onSnapshot(doc(firestore, 'whatsappRuntime', 'session'), snap => { setRuntimeStatus(snap.exists() ? snap.data() : { status: 'disconnected', qrCode: '' }); setRuntimeLoaded(true); }, onReadError('estado da sessão')),
        ];
        return () => unsubs.forEach(unsubscribe => unsubscribe());
    }, []);

    const stats = useMemo(() => ({ received: conversations.reduce((total, item) => total + (item.unreadCount || 0), 0), open: conversations.filter(item => item.status !== 'closed').length, activeMessages: messages.filter(item => item.active !== false).length, activeFlows: flows.some(item => item.id === 'main' && item.active !== false) || (!flows.some(item => item.id === 'main') && flows.some(item => item.active !== false)) ? 1 : 0 }), [conversations, flows, messages]);
    const humanQueue = useMemo(() => conversations.filter(item => item.status === 'waiting_human').sort((a, b) => timestampMillis(a.handoffRequestedAt || a.updatedAt) - timestampMillis(b.handoffRequestedAt || b.updatedAt)), [conversations]);
    const dashboard = useMemo(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const inboundToday = threadMessages.filter(item => item.direction === 'inbound' && timestampMillis(item.createdAt) >= today.getTime()).length;
        const outboundToday = threadMessages.filter(item => item.direction === 'outbound' && timestampMillis(item.createdAt) >= today.getTime()).length;
        const waits = humanQueue.map(item => Math.max(0, Math.floor((Date.now() - timestampMillis(item.handoffRequestedAt || item.updatedAt)) / 60000)));
        const days = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
            const start = date.getTime();
            return { label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), count: threadMessages.filter(item => item.direction === 'inbound' && timestampMillis(item.createdAt) >= start && timestampMillis(item.createdAt) < start + 86400000).length };
        });
        return { inboundToday, outboundToday, averageWait: waits.length ? Math.round(waits.reduce((sum, value) => sum + value, 0) / waits.length) : null, longestWait: waits.length ? Math.max(...waits) : null, days };
    }, [humanQueue, threadMessages]);

    const saveMessage = async event => {
        event.preventDefault();
        if (!messageForm.name.trim() || !messageForm.text.trim()) return;
        setSaving(true);
        try { await addDoc(collection(firestore, 'whatsappAutomaticMessages'), { ...messageForm, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); setMessageForm(emptyMessage); } finally { setSaving(false); }
    };
    const removeMessage = id => deleteDoc(doc(firestore, 'whatsappAutomaticMessages', id));
    const saveFlow = async event => {
        event.preventDefault();
        if (!flowForm.name.trim()) return;
        const shouldActivate = event.nativeEvent?.submitter?.value === 'publish';
        const issues = shouldActivate ? validateFlow(flowForm) : [];
        if (shouldActivate) flowForm.steps.forEach((step, index) => {
            if (['service', 'file'].includes(step.type) && step.moduleId && !availableServices.some(module => module.id === step.moduleId)) issues.push(`Etapa ${index + 1}: o módulo associado está desativado.`);
        });
        if (issues.length) { setNotice(`Revise o fluxo: ${issues.slice(0, 3).join(' ')}`); return; }
        setSaving(true);
        try {
            const { id: _flowId, ...flowData } = flowForm;
            const normalizedFlow = omitUndefined({ ...flowData, steps: flowForm.steps.map(step => ({ ...step, moduleName: SYSTEM_MODULES.find(module => module.id === step.moduleId)?.name || '', fallbackMessage: String(step.fallbackMessage || '').trim(), options: (step.options || []).filter(option => String(option.label || '').trim()).map(option => ({ ...option, label: String(option.label || '').trim() })) })) });
            const flowRef = doc(firestore, 'whatsappFlows', 'main');
            if (shouldActivate) {
                const data = { ...normalizedFlow, active: true, draft: deleteField(), updatedAt: serverTimestamp() };
                const batch = writeBatch(firestore);
                flows.filter(item => item.active !== false && item.id !== 'main').forEach(item => batch.update(doc(firestore, 'whatsappFlows', item.id), { active: false, updatedAt: serverTimestamp() }));
                batch.set(flowRef, { ...data, ...(!flows.some(item => item.id === 'main') ? { createdAt: serverTimestamp() } : {}) }, { merge: true });
                await batch.commit();
            } else {
                const data = { ...normalizedFlow, active: false, draft: { ...normalizedFlow, active: false }, updatedAt: serverTimestamp() };
                const existing = flows.find(item => item.id === 'main');
                if (existing?.active !== false) await setDoc(flowRef, { draft: data.draft, updatedAt: serverTimestamp() }, { merge: true });
                else await setDoc(flowRef, { ...data, ...(!existing ? { createdAt: serverTimestamp() } : {}) }, { merge: true });
            }
            setFlowForm(current => ({ ...current, ...normalizedFlow, active: shouldActivate })); setPendingConnection(null); setNotice(shouldActivate ? 'Chatbot único salvo e ativado.' : 'Rascunho do chatbot salvo; ele ainda não responderá no WhatsApp.');
        } catch (error) { setNotice(error.message || 'Não foi possível salvar o fluxo.'); }
        finally { setSaving(false); }
    };
    const updateStep = (index, changes) => setFlowForm(current => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...changes } : step) }));
    const updateStepById = (id, changes) => setFlowForm(current => ({ ...current, steps: current.steps.map(step => step.id === id ? { ...step, ...changes } : step) }));
    const addFlowStep = type => setFlowForm(current => { const index = current.steps.length; const labels = { menu: 'Menu', message: 'Mensagem final', informative: 'Informativo', service: 'Solicitação de serviço', file: 'Envio de arquivos' }; const step = makeStep(`${labels[type] || 'Etapa'} ${index + 1}`, type, { x: 42 + index * 330, y: 42 }); setSelectedStepId(step.id); return { ...current, steps: [...current.steps, step] }; });
    const removeFlowStep = index => {
        const removed = flowForm.steps[index];
        const remaining = flowForm.steps.filter((_, stepIndex) => stepIndex !== index);
        setFlowForm(current => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index).map(step => ({ ...step, nextStepId: step.nextStepId === removed.id ? '' : step.nextStepId, options: step.options.map(option => option.nextStepId === removed.id ? { ...option, nextStepId: '' } : option) })) }));
        if (selectedStepId === removed.id) setSelectedStepId(remaining[0]?.id || '');
        if (pendingConnection?.stepId === removed.id) setPendingConnection(null);
    };
    const addFlowOption = index => updateStep(index, { options: [...(flowForm.steps[index].options || []), { label: `Opção ${(flowForm.steps[index].options || []).length + 1}`, nextStepId: '', action: 'continue' }] });
    const updateFlowOption = (stepIndex, optionIndex, changes) => updateStep(stepIndex, { options: flowForm.steps[stepIndex].options.map((option, index) => index === optionIndex ? { ...option, ...changes } : option) });
    const removeFlowOption = (stepIndex, optionIndex) => updateStep(stepIndex, { options: flowForm.steps[stepIndex].options.filter((_, index) => index !== optionIndex) });
    const selectFlowStep = id => setSelectedStepId(id);
    const beginFlowConnection = connection => setPendingConnection(connection);
    const connectFlowStep = targetId => {
        if (!pendingConnection) return;
        if (pendingConnection.stepId === targetId) { setNotice('Escolha uma etapa diferente para criar a conexão.'); return; }
        const sourceIndex = flowForm.steps.findIndex(step => step.id === pendingConnection.stepId);
        if (sourceIndex < 0 || (!pendingConnection.next && !flowForm.steps[sourceIndex].options?.[pendingConnection.optionIndex])) { setPendingConnection(null); return; }
        if (pendingConnection.next) updateStep(sourceIndex, { nextStepId: targetId });
        else updateFlowOption(sourceIndex, pendingConnection.optionIndex, { nextStepId: targetId, action: 'continue' });
        setPendingConnection(null);
    };
    const arrangeFlow = () => setFlowForm(current => {
        const steps = current.steps || [];
        const stepById = new Map(steps.map(step => [step.id, step]));
        const depth = new Map(steps.length ? [[steps[0].id, 0]] : []);
        const queue = steps.length ? [steps[0].id] : [];
        while (queue.length) { const id = queue.shift(); const step = stepById.get(id); [...(step?.options || []).map(option => option.nextStepId), step?.nextStepId].forEach(target => { if (stepById.has(target) && !depth.has(target)) { depth.set(target, depth.get(id) + 1); queue.push(target); } }); }
        const maxDepth = Math.max(0, ...depth.values());
        steps.forEach(step => { if (!depth.has(step.id)) depth.set(step.id, maxDepth + 1); });
        const rows = new Map();
        return { ...current, steps: steps.map(step => { const column = depth.get(step.id); const y = rows.get(column) || 42; rows.set(column, y + 180 + (step.options || []).length * 28); return { ...step, position: { x: 42 + column * 330, y } }; }) };
    });
    const bridgeRequest = async (path, body) => {
        const baseUrl = String(settings.bridgeUrl || '').trim().replace(/\/+$/, '');
        if (!baseUrl) throw new Error('Informe e salve o endereço do serviço de conexão primeiro.');
        if (!auth.currentUser) throw new Error('Entre novamente no portal para continuar.');
        const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Não foi possível concluir esta operação. Tente novamente.');
        return result;
    };
    const saveSettings = async event => {
        event.preventDefault(); setSaving(true); setNotice('');
        try {
            const { gatewayUrl, sessionId, webhookUrl, webhookConfigured, tokenConfigured, verifyTokenConfigured, ...current } = settings;
            await setDoc(doc(firestore, 'whatsappSettings', 'config'), { ...current, provider: 'Baileys', bridgeUrl: String(current.bridgeUrl || '').trim().replace(/\/+$/, ''), gatewayUrl: deleteField(), sessionId: deleteField(), webhookUrl: deleteField(), webhookConfigured: deleteField(), tokenConfigured: deleteField(), verifyTokenConfigured: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
            setNotice('Configurações do atendimento salvas.');
        } catch (error) { setNotice(error.message || 'Não foi possível salvar as configurações.'); } finally { setSaving(false); }
    };
    const manageSession = async action => {
        setSaving(true); setNotice('');
        try { const result = action === 'start' ? await bridgeRequest('/api/session/start') : await bridgeRequest('/api/session/logout'); setRuntimeStatus(current => ({ ...current, ...result })); setNotice(action === 'start' ? 'Solicitação de conexão enviada. Escaneie o QR Code com o WhatsApp.' : 'Sessão desconectada.'); }
        catch (error) { setNotice(error.message || 'Não foi possível controlar a sessão.'); }
        finally { setSaving(false); }
    };
    const sendReply = async event => {
        event.preventDefault();
        if (!selectedConversation || !reply.trim()) return;
        if (selectedConversation.status === 'waiting_human' && selectedConversation.assignedTo !== currentUser?.uid) return;
        try { await bridgeRequest('/api/messages/send', { conversationId: selectedConversation.id, phone: selectedConversation.phone, text: reply.trim() }); setReply(''); setNotice('Mensagem enviada pelo WhatsApp.'); } catch (error) { setNotice(error.message || 'Falha ao enviar mensagem.'); }
    };
    const openRequestFile = async (requestId, file) => {
        const tab = window.open('about:blank', '_blank');
        try { const result = await bridgeRequest('/api/files/signed-url', {requestId, path: file.path}); if (tab) tab.location.href = result.url; else window.location.assign(result.url); }
        catch (error) { tab?.close(); setNotice(error.message || 'Não foi possível abrir o arquivo.'); }
    };
    const deleteConversation = async () => {
        if (!selectedConversation) return;
        const confirmed = window.confirm(`Excluir a conversa com ${selectedConversation.name || selectedConversation.phone || 'este contato'} e todas as mensagens exibidas no portal? Esta ação não apaga as mensagens do WhatsApp do contato.`);
        if (!confirmed) return;
        setSaving(true);
        try {
            await bridgeRequest('/api/conversations/delete', { conversationId: selectedConversation.id });
            setSelectedConversation(null);
            setReply('');
            setNotice('Conversa e mensagens excluídas do portal. Uma nova mensagem iniciará outro atendimento.');
        } catch (error) { setNotice(error.message || 'Não foi possível excluir a conversa.'); }
        finally { setSaving(false); }
    };
    const setConversationRead = async (conversation, isRead) => {
        if (!isRead && selectedConversation?.id === conversation.id) setSelectedConversation(null);
        try {
            await setDoc(doc(firestore, 'whatsappConversations', conversation.id), { unreadCount: isRead ? 0 : Math.max(1, conversation.unreadCount || 0) }, { merge: true });
            setConversationMenuId(null);
        } catch (error) { setNotice(error.message || 'Não foi possível atualizar a leitura da conversa.'); }
    };
    const deleteListedConversation = async conversation => {
        const confirmed = window.confirm(`Excluir a conversa com ${conversation.name || conversation.phone || 'este contato'} e todas as mensagens do portal? Isso não apaga as mensagens do WhatsApp do contato.`);
        if (!confirmed) return;
        setSaving(true);
        try {
            await bridgeRequest('/api/conversations/delete', { conversationId: conversation.id });
            if (selectedConversation?.id === conversation.id) setSelectedConversation(null);
            setConversationMenuId(null);
            setNotice('Conversa e mensagens excluídas do portal.');
        } catch (error) { setNotice(error.message || 'Não foi possível excluir a conversa.'); }
        finally { setSaving(false); }
    };
    const routeRequestToOuvidoria = async request => {
        setSaving(true);
        try {
            const result = await bridgeRequest('/api/service-requests/route-ouvidoria', {requestId: request.id});
            setNotice(`Solicitação encaminhada à Ouvidoria${result.protocolo ? ` · protocolo ${result.protocolo}` : ''}.`);
        } catch (error) { setNotice(error.message || 'Não foi possível encaminhar a solicitação à Ouvidoria.'); }
        finally { setSaving(false); }
    };
    const claimHumanConversation = async conversation => {
        if (!conversation || !currentUser?.uid) return;
        const assigneeName = attendantName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Atendente';
        try {
            const conversationRef = doc(firestore, 'whatsappConversations', conversation.id);
            let shouldSendGreeting = false;
            await runTransaction(firestore, async transaction => {
                const snapshot = await transaction.get(conversationRef);
                const data = snapshot.data() || {};
                if (data.status !== 'waiting_human') throw new Error('Este atendimento já saiu da fila. Atualize a lista.');
                if (data.assignedTo && data.assignedTo !== currentUser.uid) throw new Error(`Este atendimento já foi assumido por ${data.assignedToName || 'outro atendente'}.`);
                shouldSendGreeting = !data.humanGreetingSentAt;
                transaction.update(conversationRef, { assignedTo: currentUser.uid, assignedToName: assigneeName, claimedAt: serverTimestamp() });
            });
            setSelectedConversation(current => current?.id === conversation.id ? { ...current, assignedTo: currentUser.uid, assignedToName: assigneeName } : current);
            if (shouldSendGreeting) {
                const greeting = `Olá, ${conversation.name || 'tudo bem'}! Meu nome é ${assigneeName} e vou iniciar seu atendimento por aqui. 😊`;
                try {
                    await bridgeRequest('/api/messages/send', { conversationId: conversation.id, phone: conversation.phone, text: greeting });
                    await setDoc(conversationRef, { humanGreetingSentAt: serverTimestamp() }, { merge: true });
                    setNotice(`Atendimento assumido. Mensagem de apresentação enviada para ${conversation.name || conversation.phone}.`);
                } catch (sendError) {
                    setNotice(`Atendimento assumido, mas não foi possível enviar a apresentação automática: ${sendError.message || 'verifique a conexão do WhatsApp.'}`);
                }
            } else setNotice(`Atendimento de ${conversation.name || conversation.phone} assumido por você.`);
        } catch (error) { setNotice(error.message || 'Não foi possível assumir este atendimento.'); }
    };
    const takeNextHumanConversation = async () => {
        const next = humanQueue.find(item => !item.assignedTo || item.assignedTo === currentUser?.uid);
        if (!next) { setNotice(humanQueue.length ? 'Os atendimentos da fila já foram assumidos por outros atendentes.' : 'A fila de atendimento humano está vazia.'); return; }
        setSelectedConversation(next);
        await claimHumanConversation(next);
    };
    const finishHumanConversation = async () => {
        if (!selectedConversation) return;
        setSaving(true);
        try {
            const ratingMessage = 'Agradecemos por conversar com nossa equipe. Antes de encerrarmos, avalie seu atendimento de 1 a 5:\n1️⃣ Muito ruim\n2️⃣ Ruim\n3️⃣ Regular\n4️⃣ Bom\n5️⃣ Muito bom';
            await bridgeRequest('/api/messages/send', { conversationId: selectedConversation.id, phone: selectedConversation.phone, text: ratingMessage });
            await setDoc(doc(firestore, 'whatsappConversations', selectedConversation.id), {
                status: 'closed', activeFlowId: '', activeFlowStepId: '', resolvedAt: serverTimestamp(),
                whatsappRatingState: 'awaiting_score', whatsappRatingFlowName: 'Atendimento humano',
                assignedTo: deleteField(), assignedToName: deleteField(), claimedAt: deleteField(), handoffRequestedAt: deleteField(),
            }, { merge: true });
            setNotice('Atendimento encerrado. Pesquisa de avaliação de 1 a 5 enviada pelo WhatsApp.');
        } catch (error) { setNotice(error.message || 'Não foi possível concluir o atendimento.'); }
        finally { setSaving(false); }
    };

    return <div className="dashboard-layout admin-whatsapp-shell"><AdminSidebar /><main className="dashboard-content admin-whatsapp-main">
        <header className="admin-whatsapp-header"><div><span className="eyebrow">ATENDIMENTO DIGITAL</span><h1>Whatsapp Câmara</h1><p>Configure respostas automáticas, fluxos e acompanhe as mensagens da Câmara.</p></div><span className={`wa-status ${runtimeStatus.status === 'connected' ? 'is-on' : ''}`}>{runtimeStatus.status === 'connected' ? 'WhatsApp conectado' : `WhatsApp: ${runtimeStatus.status || 'desconectado'}`}</span></header>
        <nav className="wa-tabs">{[['overview','Visão geral',LiaCommentsSolid],['conversations','Fila e mensagens',LiaCommentsSolid],['requests','Solicitações de serviço',LiaPaperPlane],['flows','Mindmap do chatbot',LiaProjectDiagramSolid],['settings','Configuração',LiaCogSolid]].map(([id,label,Icon]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon />{label}</button>)}</nav>
        {tab === 'overview' && <section className="wa-dashboard">
            <div className="wa-dashboard-heading"><div><span className="wa-map-kicker">PAINEL OPERACIONAL</span><h2>Visão geral do atendimento</h2><p>Indicadores atualizados conforme as conversas e mensagens chegam.</p></div><button className="wa-secondary" onClick={() => setTab('settings')}>Configurar integração</button></div>
            <div className="wa-dashboard-metrics">
                <article className="wa-metric-card queue"><span>Fila humana</span><strong>{humanQueue.length}</strong><small>{humanQueue.length ? `Mais antiga: ${waitDuration(humanQueue[0].handoffRequestedAt || humanQueue[0].updatedAt)}` : 'Nenhum atendimento aguardando'}</small></article>
                <article className="wa-metric-card wait"><span>Espera média atual</span><strong>{dashboard.averageWait === null ? '—' : `${dashboard.averageWait} min`}</strong><small>{humanQueue.length ? `Maior espera: ${dashboard.longestWait} min` : 'Sem fila no momento'}</small></article>
                <article className="wa-metric-card inbound"><span>Recebidas hoje</span><strong>{dashboard.inboundToday}</strong><small>{stats.received} mensagens não lidas</small></article>
                <article className="wa-metric-card open"><span>Conversas abertas</span><strong>{stats.open}</strong><small>{dashboard.outboundToday} respostas enviadas hoje</small></article>
            </div>
            <div className="wa-dashboard-panels">
                <article className="wa-card wa-volume-card"><div className="wa-dashboard-panel-heading"><div><h3>Mensagens recebidas</h3><p>Volume diário nos últimos sete dias</p></div><strong>{dashboard.inboundToday}<small> hoje</small></strong></div><div className="wa-volume-chart" role="img" aria-label="Mensagens recebidas nos últimos sete dias">{dashboard.days.map((day, index) => { const max = Math.max(1, ...dashboard.days.map(item => item.count)); return <div className="wa-volume-day" key={`${day.label}-${index}`}><span>{day.count}</span><div><i style={{ height: `${Math.max(day.count ? 8 : 3, day.count / max * 100)}%` }} /></div><small>{day.label}</small></div>; })}</div></article>
                <article className="wa-card wa-dashboard-queue"><div className="wa-dashboard-panel-heading"><div><h3>Próximos atendimentos</h3><p>Ordenados pelo maior tempo de espera</p></div><button className="wa-text-button" onClick={() => setTab('conversations')}>Abrir fila</button></div>{humanQueue.length ? <ol>{humanQueue.slice(0, 5).map(item => <li key={item.id}><button onClick={() => { setSelectedConversation(item); setTab('conversations'); }}><strong>{item.name || item.phone || 'Contato sem identificação'}</strong><span>{item.lastMessage || 'Solicitou atendimento humano'}</span></button><b>{waitDuration(item.handoffRequestedAt || item.updatedAt)}</b></li>)}</ol> : <div className="wa-dashboard-empty">A fila humana está vazia.</div>}</article>
            </div>
            <div className="wa-dashboard-footer"><span className={runtimeStatus.status === 'connected' ? 'is-connected' : 'is-disconnected'}><i />WhatsApp {runtimeStatus.status === 'connected' ? 'conectado' : runtimeStatus.status || 'desconectado'}</span><span>{stats.activeMessages} respostas automáticas ativas</span><span>{stats.activeFlows} chatbot ativo</span><button className="wa-text-button" onClick={() => setTab('flows')}>Editar chatbot</button>{runtimeStatus.status !== 'connected' && <button type="button" className="wa-reconnect-dashboard" disabled={saving || !runtimeLoaded} onClick={() => manageSession('start')}>{saving ? 'Conectando…' : runtimeStatus.status === 'qr_required' ? 'Gerar QR Code' : 'Reconectar WhatsApp'}</button>}</div>
        </section>}
        {notice && <div className="wa-notice" role="status">{notice}</div>}
        {tab === 'conversations' && <section className="wa-card"><div className="wa-card-heading"><div><h2>Mensagens recebidas</h2><p>Conversas vinculadas ao número oficial da Câmara.</p></div><LiaSyncSolid /></div><div className="wa-human-queue"><div className="wa-human-queue-heading"><div><span className="wa-map-kicker">FILA DE ATENDIMENTO HUMANO</span><strong>{humanQueue.length} aguardando</strong><small>{humanQueue.length ? `Mais antigo aguardando há ${waitDuration(humanQueue[0].handoffRequestedAt || humanQueue[0].updatedAt)}` : 'Nenhum atendimento aguardando.'}</small></div><button type="button" className="wa-primary" disabled={!humanQueue.length || saving} onClick={takeNextHumanConversation}>Atender próxima</button></div>{humanQueue.length > 0 && <ol>{humanQueue.map(item => <li key={item.id}><button type="button" onClick={() => setSelectedConversation(item)}><strong>{item.name || item.phone}</strong><span>{item.lastMessage || 'Solicitou atendimento humano'}</span></button><small>{waitDuration(item.handoffRequestedAt || item.updatedAt)}</small>{item.assignedTo && <em>Com {item.assignedToName || 'atendente'}</em>}</li>)}</ol>}</div><div className="wa-conversation-layout"><div className="wa-list">{conversations.length === 0 ? <div className="wa-empty">Nenhuma conversa recebida ainda.</div> : conversations.map(item => <div className={`wa-conversation-row ${selectedConversation?.id === item.id ? 'selected' : ''}`} key={item.id}><button className="wa-conversation" onClick={() => { setSelectedConversation(item); setConversationMenuId(null); }}><span className="wa-conversation-copy"><strong>{item.name || item.phone || 'Contato sem identificação'}</strong><span>{item.lastMessage || 'Sem mensagem'}</span>{item.status === 'waiting_human' && <small className="wa-human-status">Aguardando atendente</small>}<small>{dateValue(item.updatedAt)}</small></span>{item.unreadCount > 0 && <b>{item.unreadCount}</b>}</button><button type="button" className="wa-conversation-menu-trigger" aria-label={`Opções de ${item.name || item.phone || 'conversa'}`} aria-expanded={conversationMenuId === item.id} onClick={() => setConversationMenuId(current => current === item.id ? null : item.id)}>⋮</button>{conversationMenuId === item.id && <div className="wa-conversation-menu" role="menu"><button type="button" role="menuitem" onClick={() => setConversationRead(item, item.unreadCount > 0)}>{item.unreadCount > 0 ? 'Marcar como lida' : 'Marcar como não lida'}</button><button type="button" role="menuitem" className="danger" disabled={saving} onClick={() => deleteListedConversation(item)}>Excluir conversa</button></div>}</div>)}</div><div className="wa-thread">{selectedConversation ? <><div className="wa-thread-heading"><div><h3>{selectedConversation.name || selectedConversation.phone}</h3>{selectedConversation.status === 'waiting_human' && <span>Aguardando atendimento humano</span>}</div><div className="wa-thread-actions">{selectedConversation.status === 'waiting_human' && !selectedConversation.assignedTo && <button type="button" className="wa-primary" onClick={() => claimHumanConversation(selectedConversation)}>Assumir atendimento</button>}{selectedConversation.status === 'waiting_human' && selectedConversation.assignedTo === currentUser?.uid && <button type="button" className="wa-finish-human" disabled={saving} onClick={finishHumanConversation}>{saving ? 'Encerrando…' : 'Encerrar atendimento'}</button>}{selectedConversation.status === 'waiting_human' && selectedConversation.assignedTo && selectedConversation.assignedTo !== currentUser?.uid && <span className="wa-assigned-label">Com {selectedConversation.assignedToName || 'outro atendente'}</span>}<button type="button" className="wa-delete-conversation" disabled={saving} onClick={deleteConversation}><LiaTrashAltSolid /> Excluir conversa</button></div></div><div className="wa-message-history">{threadMessages.filter(item => item.conversationId === selectedConversation.id).map(item => <div className={`wa-bubble ${item.direction === 'outbound' ? 'outbound' : ''}`} key={item.id}><span>{item.text}</span><small>{dateValue(item.createdAt)}</small></div>)}</div><form onSubmit={sendReply} className="wa-reply"><input value={reply} onChange={event => setReply(event.target.value)} placeholder={selectedConversation.status === 'waiting_human' && selectedConversation.assignedTo !== currentUser?.uid ? 'Assuma o atendimento para responder...' : 'Digite uma resposta...'} disabled={selectedConversation.status === 'waiting_human' && selectedConversation.assignedTo !== currentUser?.uid} /><button className="wa-primary" type="submit" disabled={selectedConversation.status === 'waiting_human' && selectedConversation.assignedTo !== currentUser?.uid}><LiaPaperPlane /></button></form></> : <div className="wa-empty">Selecione uma conversa para responder.</div>}</div></div></section>}
        {tab === 'requests' && <section className="wa-card"><div className="wa-card-heading"><div><span className="wa-map-kicker">MÓDULOS HABILITADOS</span><h2>Solicitações recebidas pelo WhatsApp</h2><p>Pedidos e arquivos vinculados ao módulo escolhido no mindmap.</p></div><span>{serviceRequests.length}</span></div>{serviceRequests.length ? serviceRequests.map(item => <article className="wa-service-request" key={item.id}><div><strong>{item.moduleName || item.moduleId}</strong><span>{item.contactName || item.phone} · {item.status || 'recebido'} · {dateValue(item.createdAt)}</span><p>{item.description || 'Sem descrição'}</p>{item.moduleId === 'ouvidoria' && (item.ouvidoriaId ? <small className="wa-ouvidoria-routed">Registrada na Ouvidoria · {item.ouvidoriaProtocol || item.ouvidoriaId}</small> : <button type="button" className="wa-primary wa-route-ouvidoria" disabled={saving} onClick={() => routeRequestToOuvidoria(item)}>Registrar na Ouvidoria</button>)}{(item.attachments || []).map(file => <button type="button" className="wa-request-file" key={file.path} onClick={() => openRequestFile(item.id, file)}>{file.name} · {Math.ceil((file.size || 0) / 1024)} KB · Abrir</button>)}</div></article>) : <div className="wa-empty">Ainda não há solicitações de serviço.</div>}</section>}
        {tab === 'messages' && <section className="wa-columns"><div className="wa-card"><h2>Nova mensagem automática</h2><form className="wa-form" onSubmit={saveMessage}><label>Nome interno<input value={messageForm.name} onChange={event => setMessageForm({ ...messageForm, name: event.target.value })} placeholder="Boas-vindas" /></label><label>Gatilho<input value={messageForm.trigger} onChange={event => setMessageForm({ ...messageForm, trigger: event.target.value })} placeholder="primeiro_contato" /></label><label>Mensagem<textarea value={messageForm.text} onChange={event => setMessageForm({ ...messageForm, text: event.target.value })} placeholder="Olá! Como podemos ajudar?" /></label><label className="wa-check"><input type="checkbox" checked={messageForm.active} onChange={event => setMessageForm({ ...messageForm, active: event.target.checked })} /> Ativa</label><button className="wa-primary" disabled={saving}><LiaPlusSolid /> Salvar mensagem</button></form></div><div className="wa-card"><h2>Mensagens cadastradas</h2>{messages.length === 0 ? <div className="wa-empty">Nenhuma mensagem automática cadastrada.</div> : messages.map(item => <div className="wa-row" key={item.id}><div><strong>{item.name}</strong><span>{item.trigger || 'sem gatilho'} · {item.active === false ? 'inativa' : 'ativa'}</span><p>{item.text}</p></div><button className="wa-icon-button" onClick={() => removeMessage(item.id)} aria-label="Excluir"><LiaTrashAltSolid /></button></div>)}</div></section>}
        {tab === 'flows' && <section className="wa-flow-workspace"><form className="wa-flow-map-form" onSubmit={saveFlow}><div className="wa-card wa-flow-canvas-card"><div className="wa-flow-meta"><label>Nome do chatbot<input value={flowForm.name} onChange={event => setFlowForm({ ...flowForm, name: event.target.value })} placeholder="Atendimento geral" required /></label><label>Descrição<textarea rows="2" value={flowForm.description} onChange={event => setFlowForm({ ...flowForm, description: event.target.value })} placeholder="Objetivo deste atendimento" /></label></div><FlowMapPreview flow={flowForm} selectedStepId={selectedStepId} pendingConnection={pendingConnection} onAddStep={addFlowStep} onAddOption={addFlowOption} onSelectStep={selectFlowStep} onBeginConnection={beginFlowConnection} onConnect={connectFlowStep} onMoveStep={(id, position) => updateStepById(id, { position })} onArrange={arrangeFlow} /></div><div className="wa-flow-inspector-column"><div className="wa-card wa-flow-inspector"><div className="wa-card-heading"><div><span className="wa-map-kicker">PROPRIEDADES DO BLOCO</span><h2>{flowForm.steps.find(step => step.id === selectedStepId)?.title || 'Selecione um bloco'}</h2></div>{flowForm.steps.length > 1 && <button type="button" className="wa-icon-button" onClick={() => removeFlowStep(flowForm.steps.findIndex(step => step.id === selectedStepId))} aria-label="Remover bloco"><LiaTrashAltSolid /></button>}</div>{(() => { const stepIndex = flowForm.steps.findIndex(step => step.id === selectedStepId); const step = flowForm.steps[stepIndex]; if (!step) return <p className="wa-help">Selecione um bloco no mapa para configurar título, mensagem, opções e integrações.</p>; const type = step.type || ((step.options || []).length ? 'menu' : 'message'); return <div className="wa-form wa-flow-inspector-form"><label>Título<input value={step.title || ''} onChange={event => updateStep(stepIndex, { title: event.target.value })} /></label><label>Tipo de bloco<select value={type} onChange={event => updateStep(stepIndex, { type: event.target.value, ...(event.target.value !== 'menu' ? { options: [] } : {}) })}><option value="menu">Menu numérico</option><option value="message">Mensagem final</option><option value="informative">Informativo</option><option value="service">Solicitar serviço</option><option value="file">Receber arquivos</option></select></label><label>Mensagem<textarea value={step.message || ''} onChange={event => updateStep(stepIndex, { message: event.target.value })} placeholder={type === 'file' ? 'Envie os documentos solicitados como arquivo ou foto.' : 'Digite a mensagem desta etapa.'} /></label>{type === 'menu' && <><label>Resposta para opção inválida<textarea value={step.fallbackMessage || ''} onChange={event => updateStep(stepIndex, { fallbackMessage: event.target.value })} placeholder="Digite 1, 2 ou uma das opções indicadas." /></label><div className="wa-flow-options"><strong>Opções numeradas</strong>{(step.options || []).map((option, optionIndex) => <div className="wa-flow-option" key={`${step.id}_${optionIndex}`}><label>Texto<input value={option.label || ''} onChange={event => updateFlowOption(stepIndex, optionIndex, { label: event.target.value })} placeholder={`Opção ${optionIndex + 1}`} /></label><label>Ação<select value={option.action || 'continue'} onChange={event => updateFlowOption(stepIndex, optionIndex, { action: event.target.value, ...(event.target.value === 'handoff' ? { nextStepId: '' } : {}) })}><option value="continue">Seguir conexão do mapa</option><option value="handoff">Atendimento humano</option></select></label><small>Digite {optionIndex + 1} para escolher</small><button type="button" className="wa-secondary" onClick={() => removeFlowOption(stepIndex, optionIndex)}>Remover</button></div>)}<button type="button" className="wa-secondary" onClick={() => addFlowOption(stepIndex)}>+ Adicionar opção</button></div></>}{type === 'service' && <><label>Serviço / módulo<select value={step.moduleId || ''} onChange={event => updateStep(stepIndex, { moduleId: event.target.value })}><option value="">Selecione um módulo habilitado</option>{availableServices.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label><p className="wa-help">O pedido será registrado na fila de solicitações do WhatsApp com identificação do serviço e conversa de origem.</p></>}{type === 'file' && <><label>Vincular ao serviço<select value={step.moduleId || ''} onChange={event => updateStep(stepIndex, { moduleId: event.target.value })}><option value="">Selecione um módulo habilitado</option>{availableServices.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label><label>Arquivos por solicitação<input type="number" min="1" max="10" value={step.maxFiles || 3} onChange={event => updateStep(stepIndex, { maxFiles: Number(event.target.value) })} /></label><label>Tamanho máximo por arquivo (MB)<input type="number" min="1" max="25" value={step.maxFileSizeMB || 10} onChange={event => updateStep(stepIndex, { maxFileSizeMB: Number(event.target.value) })} /></label><label>Tipos aceitos<select multiple value={step.allowedMimeTypes || ['application/pdf', 'image/jpeg', 'image/png']} onChange={event => updateStep(stepIndex, { allowedMimeTypes: [...event.target.selectedOptions].map(option => option.value) })}><option value="application/pdf">PDF</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="video/mp4">Vídeo MP4</option></select></label><label>Próxima etapa<select value={step.nextStepId || ''} onChange={event => updateStep(stepIndex, { nextStepId: event.target.value })}><option value="">Concluir após receber os arquivos</option>{flowForm.steps.filter(item => item.id !== step.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></>}{['service','informative'].includes(type) && <label>Próxima etapa<select value={step.nextStepId || ''} onChange={event => updateStep(stepIndex, { nextStepId: event.target.value })}><option value="">{type === 'service' ? 'Concluir após registrar o pedido' : 'Encerrar após o informativo'}</option>{flowForm.steps.filter(item => item.id !== step.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}</div>; })()}</div><div className="wa-card wa-flow-publish-card"><div className="wa-flow-publish-note"><strong>{flowForm.active ? 'Fluxo publicado' : 'Rascunho'}</strong><span>Conecte as opções entre blocos no mapa. Módulos desativados não aparecem no bloco de serviço.</span></div><label className="wa-form">Mensagem ao concluir<textarea value={flowForm.completionMessage || ''} onChange={event => setFlowForm({ ...flowForm, completionMessage: event.target.value })} /></label><label className="wa-form">Mensagem de encaminhamento humano<textarea value={flowForm.handoffMessage || ''} onChange={event => setFlowForm({ ...flowForm, handoffMessage: event.target.value })} /></label><div className="wa-flow-save-actions"><button type="submit" name="flowAction" value="draft" className="wa-secondary" disabled={saving}>Salvar rascunho</button><button type="submit" name="flowAction" value="publish" className="wa-primary" disabled={saving}><LiaPlusSolid /> Publicar fluxo</button></div></div></div></form></section>}
        {tab === 'settings' && <section className="wa-card"><h2>Conexão do WhatsApp</h2><p className="wa-help">Configure o número oficial e personalize as mensagens automáticas. Para conectar, informe o endereço do serviço de atendimento fornecido pela equipe responsável.</p><form className="wa-form wa-settings-form" onSubmit={saveSettings}><label className="wa-check"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} /> Ativar chatbot (respostas automáticas)</label><label>Endereço do serviço de conexão<input required type="url" value={settings.bridgeUrl || ''} onChange={event => setSettings({ ...settings, bridgeUrl: event.target.value })} placeholder="https://endereco-fornecido-pela-equipe" /></label><label>Mensagem de boas-vindas<textarea value={settings.greetingMessage || ''} onChange={event => setSettings({ ...settings, greetingMessage: event.target.value })} /></label><label>Mensagem de fallback<textarea value={settings.fallbackMessage || ''} onChange={event => setSettings({ ...settings, fallbackMessage: event.target.value })} /></label><label>Mensagem para atendimento humano<textarea value={settings.handoffMessage || ''} onChange={event => setSettings({ ...settings, handoffMessage: event.target.value })} /></label><button className="wa-primary" disabled={saving}><LiaSyncSolid /> Salvar configurações</button></form><div className="wa-session-control"><h3>Sessão WhatsApp</h3><p>Estado: <strong>{runtimeStatus.status || 'disconnected'}</strong>{runtimeStatus.phone ? ` · ${runtimeStatus.phone}` : ''}</p>{runtimeStatus.qrCode && runtimeStatus.status === 'qr_required' && <img className="wa-qr-code" src={runtimeStatus.qrCode} alt="QR Code para conectar o WhatsApp" />}<div className="wa-session-actions"><button className="wa-primary" type="button" disabled={saving || !runtimeLoaded || runtimeStatus.status === 'connected'} onClick={() => manageSession('start')}>{saving ? 'Conectando…' : runtimeStatus.status === 'connected' ? 'WhatsApp conectado' : runtimeStatus.status === 'qr_required' ? 'Gerar novo QR Code' : 'Reconectar WhatsApp'}</button><button className="wa-secondary" type="button" disabled={saving || runtimeStatus.status !== 'connected'} onClick={() => manageSession('logout')}>Desconectar sessão</button></div>{runtimeStatus.lastError && <p role="alert">{runtimeStatus.lastError}</p>}</div></section>}
    </main></div>;
};

export default AdminWhatsApp;
