import React, { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, query } from 'firebase/firestore';
import { LiaCheckCircleSolid, LiaClipboardSolid, LiaCloudSolid, LiaDatabaseSolid, LiaEyeSolid, LiaRedoAltSolid, LiaSearchSolid, LiaShieldAltSolid } from 'react-icons/lia';
import { getApp } from 'firebase/app';
import { firestore } from '../firebase';
import FirebaseSetupWizard from './FirebaseSetupWizard';

const COLLECTIONS = [
    ['balcao-cidadao', 'Atendimento', 'Solicitações do Balcão do Cidadão'],
    ['assessoria-microempreendedor', 'Atendimento', 'Solicitações do Microempreendedor'],
    ['atendimento-juridico', 'Atendimento', 'Atendimentos jurídicos'],
    ['ouvidoria', 'Atendimento', 'Manifestações da Ouvidoria'],
    ['procuradoria-mulher', 'Atendimento', 'Solicitações da Procuradoria da Mulher'],
    ['solicitacoes-vereadores', 'Atendimento', 'Solicitações aos vereadores'],
    ['atendimento-calendario', 'Operação', 'Agenda consolidada de atendimentos'],
    ['atendimento-fila', 'Operação', 'Fila operacional dos guichês'],
    ['atendimento-guiches', 'Operação', 'Guichês e posições de atendimento'],
    ['atendimento-guiche-relatorios', 'Operação', 'Sessões e métricas dos guichês'],
    ['atendimento-avaliacoes', 'Operação', 'Avaliações dos atendimentos'],
    ['balcao-config', 'Configuração', 'Configuração do Balcão'],
    ['availability', 'Configuração', 'Disponibilidade da agenda'],
    ['blockedDates', 'Configuração', 'Datas bloqueadas'],
    ['bookedSlots', 'Configuração', 'Horários reservados'],
    ['ouvidoria-config', 'Configuração', 'Configuração da Ouvidoria'],
    ['procuradoria-config', 'Configuração', 'Configuração da Procuradoria'],
    ['users', 'Sistema', 'Usuários do portal'],
    ['notifications', 'Sistema', 'Notificações do aplicativo'],
    ['mail', 'Sistema', 'Fila de envio de e-mails'],
    ['noticias', 'Conteúdo', 'Notícias do portal', true],
    ['vereadores', 'Conteúdo', 'Cadastro de vereadores', true],
    ['piel', 'Conteúdo', 'Informativos do PIEL', true],
    ['tv-camara-playlist', 'Conteúdo', 'Vídeos da TV Câmara', true],
    ['tv-camara-logs', 'Sistema', 'Registros da integração de vídeo'],
    ['procon-atendimentos', 'PROCON', 'Reclamações e atendimentos'],
    ['procon-consumidores', 'PROCON', 'Consumidores'],
    ['procon-fornecedores', 'PROCON', 'Fornecedores'],
    ['procon-audiencias', 'PROCON', 'Audiências'],
    ['procon-pareceres', 'PROCON', 'Pareceres'],
    ['procon-agendamentos', 'PROCON', 'Agendamentos'],
];

const SECRET_FIELD = /(password|senha|token|secret|authorization|credential|refresh|access.?key|api.?key)/i;

const safeValue = (key, value) => {
    if (SECRET_FIELD.test(key)) return '••••••••';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (value?.toDate instanceof Function) return value.toDate().toLocaleString('pt-BR');
    if (typeof value === 'string') return value.length > 180 ? `${value.slice(0, 180)}…` : value;
    if (Array.isArray(value)) return value.slice(0, 8).map((item, index) => safeValue(`${key}.${index}`, item));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 16).map(([childKey, childValue]) => [childKey, safeValue(childKey, childValue)]));
    return String(value);
};

const SystemCollectionsManager = () => {
    const [view, setView] = useState('setup');
    const [search, setSearch] = useState('');
    const [counts, setCounts] = useState({});
    const [selected, setSelected] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [loadingCounts, setLoadingCounts] = useState(true);
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [error, setError] = useState('');
    const [copiedApi, setCopiedApi] = useState('');
    const publicApiUrl = item => `https://firestore.googleapis.com/v1/projects/${getApp().options.projectId}/databases/(default)/documents/${item[0]}`;
    const copyPublicApi = async item => { await navigator.clipboard.writeText(publicApiUrl(item)); setCopiedApi(item[0]); setTimeout(() => setCopiedApi(''), 1800); };

    const loadCounts = async () => {
        setLoadingCounts(true); setError('');
        const results = await Promise.allSettled(COLLECTIONS.map(async ([id]) => {
            const snapshot = await getCountFromServer(collection(firestore, id));
            return [id, snapshot.data().count];
        }));
        const next = {};
        results.forEach((result, index) => { next[COLLECTIONS[index][0]] = result.status === 'fulfilled' ? result.value[1] : null; });
        if (results.every(result => result.status === 'rejected')) setError('Não foi possível consultar as coleções. Verifique as permissões do usuário root.');
        setCounts(next); setLoadingCounts(false);
    };

    useEffect(() => { loadCounts(); }, []);

    const openCollection = async item => {
        setSelected(item); setDocuments([]); setLoadingDocuments(true); setError('');
        try {
            const snapshot = await getDocs(query(collection(firestore, item[0]), limit(10)));
            setDocuments(snapshot.docs.map(document => ({ id: document.id, data: safeValue('', document.data()) })));
        } catch (loadError) {
            setError(`Não foi possível ler ${item[0]}: ${loadError.message}`);
        } finally { setLoadingDocuments(false); }
    };

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return term ? COLLECTIONS.filter(item => item.join(' ').toLowerCase().includes(term)) : COLLECTIONS;
    }, [search]);

    return <section className="data-card system-collections-card">
        <nav className="system-data-tabs" aria-label="Gestão do Firebase"><button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}><LiaCloudSolid /> Configurar Firebase</button><button className={view === 'collections' ? 'active' : ''} onClick={() => setView('collections')}><LiaDatabaseSolid /> Explorar coleções</button></nav>
        {view === 'setup' ? <FirebaseSetupWizard /> : <>
        <div className="system-collections-heading"><div><span><LiaDatabaseSolid /> Gestor de dados</span><h2>Coleções do Firestore</h2><p>Catálogo e amostra dos dados disponíveis nesta instalação.</p></div><button onClick={loadCounts} disabled={loadingCounts}><LiaRedoAltSolid /> {loadingCounts ? 'Atualizando...' : 'Atualizar contagens'}</button></div>
        <div className="system-readonly-note"><LiaShieldAltSolid /><div><strong>Consulta somente leitura</strong><span>Este gestor não cria, altera, exclui ou migra documentos. Campos que podem conter credenciais são ocultados na amostra.</span></div></div>
        <label className="system-collection-search"><LiaSearchSolid /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar coleção, área ou finalidade" /></label>
        {error && <p className="system-upload-error">{error}</p>}
        <div className="system-collections-layout">
            <div className="system-collection-list">{filtered.map(item => <button key={item[0]} className={selected?.[0] === item[0] ? 'active' : ''} onClick={() => openCollection(item)}><LiaDatabaseSolid /><div><strong>{item[0]}</strong><span>{item[2]}</span><small>{item[1]}{item[3] ? ' · API pública' : ''}</small></div><b>{loadingCounts ? '…' : counts[item[0]] == null ? '—' : counts[item[0]]}</b><LiaEyeSolid /></button>)}</div>
            <div className="system-collection-preview">{selected ? <><header><div><small>Endpoint lógico</small><strong>/{selected[0]}</strong><span>{selected[2]} · até 10 documentos na amostra</span></div><b>{counts[selected[0]] ?? '—'} registros</b></header>{selected[3] && <section className="system-public-api"><div><span>API pública REST</span><strong>{publicApiUrl(selected)}</strong><small>Leitura liberada pelas regras do Firestore. Pode ser consumida por outros sistemas.</small></div><button onClick={() => copyPublicApi(selected)}>{copiedApi === selected[0] ? <><LiaCheckCircleSolid /> Copiada</> : <><LiaClipboardSolid /> Copiar URL</>}</button></section>}{!selected[3] && <div className="system-private-api"><LiaShieldAltSolid /> Coleção protegida: autenticação obrigatória e URL pública indisponível.</div>}{loadingDocuments ? <p className="system-collection-empty">Carregando documentos...</p> : documents.length ? <div className="system-document-list">{documents.map(document => <article key={document.id}><strong>{document.id}</strong><pre>{JSON.stringify(document.data, null, 2)}</pre></article>)}</div> : <p className="system-collection-empty">A coleção não possui documentos ou ainda não foi criada.</p>}</> : <div className="system-collection-placeholder"><LiaDatabaseSolid /><strong>Selecione uma coleção</strong><span>Veja o endpoint, a quantidade e uma amostra dos documentos.</span></div>}</div>
        </div>
        </>}
    </section>;
};

export default SystemCollectionsManager;
