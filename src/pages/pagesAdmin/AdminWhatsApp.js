import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { LiaCommentsSolid, LiaCogSolid, LiaProjectDiagramSolid, LiaPaperPlane, LiaPlusSolid, LiaRobotSolid, LiaSyncSolid, LiaTrashAltSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore, functions } from '../../firebase';
import './AdminWhatsApp.css';

const emptyMessage = { name: '', trigger: '', text: '', active: true };
const emptyFlow = { name: '', description: '', active: true, steps: [{ id: 'inicio', title: 'Início', message: '', options: [] }] };
const dateValue = value => value?.toDate ? value.toDate().toLocaleString('pt-BR') : value ? new Date(value).toLocaleString('pt-BR') : '—';

const AdminWhatsApp = () => {
    const [tab, setTab] = useState('overview');
    const [messages, setMessages] = useState([]);
    const [flows, setFlows] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [settings, setSettings] = useState({ enabled: false, provider: 'Meta Cloud API', phoneNumberId: '', businessAccountId: '', webhookUrl: '', greetingMessage: '', fallbackMessage: '', handoffMessage: '', tokenConfigured: false, verifyTokenConfigured: false });
    const [secrets, setSecrets] = useState({ accessToken: '', verifyToken: '' });
    const [messageForm, setMessageForm] = useState(emptyMessage);
    const [flowForm, setFlowForm] = useState(emptyFlow);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [reply, setReply] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const unsubs = [
            onSnapshot(collection(firestore, 'whatsappAutomaticMessages'), snap => setMessages(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))),
            onSnapshot(collection(firestore, 'whatsappFlows'), snap => setFlows(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))),
            onSnapshot(collection(firestore, 'whatsappConversations'), snap => setConversations(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)))),
            onSnapshot(doc(firestore, 'whatsappSettings', 'config'), snap => snap.exists() && setSettings(current => ({ ...current, ...snap.data() }))),
        ];
        return () => unsubs.forEach(unsubscribe => unsubscribe());
    }, []);

    const stats = useMemo(() => ({ received: conversations.reduce((total, item) => total + (item.unreadCount || 0), 0), open: conversations.filter(item => item.status !== 'closed').length, activeMessages: messages.filter(item => item.active !== false).length, activeFlows: flows.filter(item => item.active !== false).length }), [conversations, flows, messages]);

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
        setSaving(true);
        try { await addDoc(collection(firestore, 'whatsappFlows'), { ...flowForm, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); setFlowForm(emptyFlow); } finally { setSaving(false); }
    };
    const saveSettings = async event => { event.preventDefault(); setSaving(true); try { if (secrets.accessToken || secrets.verifyToken) { await httpsCallable(functions, 'saveWhatsAppCredentials')(secrets); setSecrets({ accessToken: '', verifyToken: '' }); } await setDoc(doc(firestore, 'whatsappSettings', 'config'), { ...settings, updatedAt: serverTimestamp() }, { merge: true }); } finally { setSaving(false); } };
    const sendReply = async event => {
        event.preventDefault();
        if (!selectedConversation || !reply.trim()) return;
        await addDoc(collection(firestore, 'whatsappMessages'), { conversationId: selectedConversation.id, phone: selectedConversation.phone || '', text: reply.trim(), direction: 'outbound', status: 'queued', createdAt: serverTimestamp() });
        await updateDoc(doc(firestore, 'whatsappConversations', selectedConversation.id), { lastMessage: reply.trim(), updatedAt: serverTimestamp(), unreadCount: 0 });
        setReply('');
    };

    return <div className="dashboard-layout admin-whatsapp-shell"><AdminSidebar /><main className="dashboard-content admin-whatsapp-main">
        <header className="admin-whatsapp-header"><div><span className="eyebrow">ATENDIMENTO DIGITAL</span><h1>Chatbot WhatsApp</h1><p>Configure respostas automáticas, fluxos e acompanhe as mensagens da Câmara.</p></div><span className={`wa-status ${settings.enabled ? 'is-on' : ''}`}>{settings.enabled ? 'Integração ativa' : 'Integração não configurada'}</span></header>
        <nav className="wa-tabs">{[['overview','Visão geral',LiaCommentsSolid],['conversations','Mensagens recebidas',LiaCommentsSolid],['messages','Mensagens automáticas',LiaRobotSolid],['flows','Fluxograma de atendimento',LiaProjectDiagramSolid],['settings','Configuração',LiaCogSolid]].map(([id,label,Icon]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon />{label}</button>)}</nav>
        {tab === 'overview' && <section><div className="wa-stat-grid"><div><strong>{stats.open}</strong><span>Conversas abertas</span></div><div><strong>{stats.received}</strong><span>Mensagens não lidas</span></div><div><strong>{stats.activeMessages}</strong><span>Mensagens automáticas</span></div><div><strong>{stats.activeFlows}</strong><span>Fluxos ativos</span></div></div><div className="wa-card"><h2>Como funciona</h2><p>As mensagens recebidas são armazenadas no Firestore e podem ser triadas pela equipe. Respostas automáticas e etapas de fluxo ficam versionadas para a operação revisar antes de publicar.</p><button className="wa-primary" onClick={() => setTab('settings')}>Configurar integração</button></div></section>}
        {tab === 'conversations' && <section className="wa-card"><div className="wa-card-heading"><div><h2>Mensagens recebidas</h2><p>Conversations vinculadas ao número oficial da Câmara.</p></div><LiaSyncSolid /></div><div className="wa-conversation-layout"><div className="wa-list">{conversations.length === 0 ? <div className="wa-empty">Nenhuma conversa recebida ainda.</div> : conversations.map(item => <button className={`wa-conversation ${selectedConversation?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedConversation(item)} key={item.id}><strong>{item.name || item.phone || 'Contato sem identificação'}</strong><span>{item.lastMessage || 'Sem mensagem'}</span><small>{dateValue(item.updatedAt)}</small>{item.unreadCount > 0 && <b>{item.unreadCount}</b>}</button>)}</div><div className="wa-thread">{selectedConversation ? <><h3>{selectedConversation.name || selectedConversation.phone}</h3><p className="wa-thread-note">As respostas ficam enfileiradas para o conector da API do WhatsApp.</p><form onSubmit={sendReply} className="wa-reply"><input value={reply} onChange={event => setReply(event.target.value)} placeholder="Digite uma resposta..." /><button className="wa-primary" type="submit"><LiaPaperPlane /></button></form></> : <div className="wa-empty">Selecione uma conversa para responder.</div>}</div></div></section>}
        {tab === 'messages' && <section className="wa-columns"><div className="wa-card"><h2>Nova mensagem automática</h2><form className="wa-form" onSubmit={saveMessage}><label>Nome interno<input value={messageForm.name} onChange={event => setMessageForm({ ...messageForm, name: event.target.value })} placeholder="Boas-vindas" /></label><label>Gatilho<input value={messageForm.trigger} onChange={event => setMessageForm({ ...messageForm, trigger: event.target.value })} placeholder="primeiro_contato" /></label><label>Mensagem<textarea value={messageForm.text} onChange={event => setMessageForm({ ...messageForm, text: event.target.value })} placeholder="Olá! Como podemos ajudar?" /></label><label className="wa-check"><input type="checkbox" checked={messageForm.active} onChange={event => setMessageForm({ ...messageForm, active: event.target.checked })} /> Ativa</label><button className="wa-primary" disabled={saving}><LiaPlusSolid /> Salvar mensagem</button></form></div><div className="wa-card"><h2>Mensagens cadastradas</h2>{messages.length === 0 ? <div className="wa-empty">Nenhuma mensagem automática cadastrada.</div> : messages.map(item => <div className="wa-row" key={item.id}><div><strong>{item.name}</strong><span>{item.trigger || 'sem gatilho'} · {item.active === false ? 'inativa' : 'ativa'}</span><p>{item.text}</p></div><button className="wa-icon-button" onClick={() => removeMessage(item.id)} aria-label="Excluir"><LiaTrashAltSolid /></button></div>)}</div></section>}
        {tab === 'flows' && <section className="wa-columns"><div className="wa-card"><h2>Novo fluxo</h2><form className="wa-form" onSubmit={saveFlow}><label>Nome do fluxo<input value={flowForm.name} onChange={event => setFlowForm({ ...flowForm, name: event.target.value })} placeholder="Atendimento geral" /></label><label>Descrição<textarea value={flowForm.description} onChange={event => setFlowForm({ ...flowForm, description: event.target.value })} /></label><label>Mensagem inicial<textarea value={flowForm.steps[0].message} onChange={event => setFlowForm({ ...flowForm, steps: [{ ...flowForm.steps[0], message: event.target.value }] })} placeholder="Escolha uma opção: 1 - Serviços, 2 - Protocolo" /></label><button className="wa-primary" disabled={saving}><LiaPlusSolid /> Salvar fluxo</button></form></div><div className="wa-card"><h2>Fluxos publicados</h2>{flows.length === 0 ? <div className="wa-empty">Nenhum fluxo configurado.</div> : flows.map(item => <div className="wa-row" key={item.id}><div><strong>{item.name}</strong><span>{item.active === false ? 'inativo' : 'ativo'}</span><p>{item.description || 'Sem descrição'}</p></div></div>)}</div></section>}
        {tab === 'settings' && <section className="wa-card"><h2>Configuração da integração</h2><p className="wa-help">O token é enviado uma única vez à Cloud Function e armazenado no Secret Manager. Ele nunca é salvo no navegador ou exibido novamente.</p><form className="wa-form wa-settings-form" onSubmit={saveSettings}><label className="wa-check"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} /> Ativar atendimento WhatsApp</label><label>Provedor<input value={settings.provider} onChange={event => setSettings({ ...settings, provider: event.target.value })} /></label><label>Phone Number ID<input value={settings.phoneNumberId} onChange={event => setSettings({ ...settings, phoneNumberId: event.target.value })} /></label><label>Business Account ID<input value={settings.businessAccountId} onChange={event => setSettings({ ...settings, businessAccountId: event.target.value })} /></label><label>Access Token da Meta<input type="password" value={secrets.accessToken} onChange={event => setSecrets({ ...secrets, accessToken: event.target.value })} placeholder={settings.tokenConfigured ? 'Token já configurado — informe apenas para substituir' : 'Cole o token permanente'} /></label><label>Verify Token do webhook<input type="password" value={secrets.verifyToken} onChange={event => setSecrets({ ...secrets, verifyToken: event.target.value })} placeholder={settings.verifyTokenConfigured ? 'Token já configurado — informe apenas para substituir' : 'Defina um token para a Meta'} /></label><label>URL do webhook<input value={settings.webhookUrl} onChange={event => setSettings({ ...settings, webhookUrl: event.target.value })} placeholder="Será preenchida após publicar a Function" /></label><label>Mensagem de boas-vindas<textarea value={settings.greetingMessage} onChange={event => setSettings({ ...settings, greetingMessage: event.target.value })} /></label><label>Mensagem de fallback<textarea value={settings.fallbackMessage} onChange={event => setSettings({ ...settings, fallbackMessage: event.target.value })} /></label><label>Mensagem para atendimento humano<textarea value={settings.handoffMessage} onChange={event => setSettings({ ...settings, handoffMessage: event.target.value })} /></label><button className="wa-primary" disabled={saving}><LiaSyncSolid /> Salvar configuração</button></form></section>}
    </main></div>;
};

export default AdminWhatsApp;
