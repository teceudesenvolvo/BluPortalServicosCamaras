import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getApp } from 'firebase/app';
import { LiaCheckCircleSolid, LiaClipboardSolid, LiaCloudSolid, LiaDatabaseSolid, LiaEyeSolid, LiaRedoAltSolid, LiaSearchSolid, LiaShieldAltSolid } from 'react-icons/lia';
import FirebaseSetupWizard from './FirebaseSetupWizard';
import ExternalApiManager from './ExternalApiManager';

const COLLECTIONS = [
    ['balcao-cidadao','Atendimento','Solicitações do Balcão do Cidadão'], ['assessoria-microempreendedor','Atendimento','Solicitações do Microempreendedor'], ['atendimento-juridico','Atendimento','Atendimentos jurídicos'], ['ouvidoria','Atendimento','Manifestações da Ouvidoria'], ['procuradoria-mulher','Atendimento','Solicitações da Procuradoria da Mulher'], ['solicitacoes-vereadores','Atendimento','Solicitações aos vereadores'],
    ['atendimento-calendario','Operação','Agenda consolidada de atendimentos'], ['atendimento-fila','Operação','Fila operacional dos guichês'], ['atendimento-guiches','Operação','Guichês e posições de atendimento'], ['atendimento-guiche-relatorios','Operação','Sessões e métricas dos guichês'], ['atendimento-avaliacoes','Operação','Avaliações dos atendimentos'],
    ['balcao-config','Configuração','Configuração do Balcão'], ['availability','Configuração','Disponibilidade da agenda'], ['blockedDates','Configuração','Datas bloqueadas'], ['bookedSlots','Configuração','Horários reservados'], ['ouvidoria-config','Configuração','Configuração da Ouvidoria'], ['procuradoria-config','Configuração','Configuração da Procuradoria'],
    ['users','Sistema','Usuários do portal'], ['notifications','Sistema','Notificações do aplicativo'], ['mail','Sistema','Fila de envio de e-mails'], ['noticias','Conteúdo','Notícias do portal'], ['vereadores','Conteúdo','Cadastro de vereadores'], ['piel','Conteúdo','Informativos do PIEL'], ['tv-camara-playlist','Conteúdo','Vídeos da TV Câmara'], ['tv-camara-logs','Sistema','Registros da integração de vídeo'],
    ['procon-atendimentos','PROCON','Reclamações e atendimentos'], ['procon-consumidores','PROCON','Consumidores'], ['procon-fornecedores','PROCON','Fornecedores'], ['procon-audiencias','PROCON','Audiências'], ['procon-pareceres','PROCON','Pareceres'], ['procon-agendamentos','PROCON','Agendamentos'],
];

const EXAMPLES = {
    'balcao-cidadao': { userId: 'uid-do-cidadao', protocolo: 'BAL-2026-0001', status: 'Agendado', dadosSolicitacao: { assunto: 'Emissão de documento', tipoDocumento: 'cin' }, dataSolicitacao: 'Timestamp' },
    'assessoria-microempreendedor': { userId: 'uid-do-cidadao', protocolo: 'MEI-2026-0001', status: 'Em análise', assunto: 'Formalização MEI', createdAt: 'Timestamp' },
    'atendimento-juridico': { userId: 'uid-do-cidadao', protocolo: 'JUR-2026-0001', assunto: 'Orientação jurídica', status: 'Pendente', createdAt: 'Timestamp' },
    ouvidoria: { userId: 'uid-do-cidadao', protocolo: 'OUV-2026-0001', tipoManifestacao: 'Solicitação', assunto: 'Assunto', descricao: 'Descrição', status: 'Pendente', createdAt: 'Timestamp' },
    'procuradoria-mulher': { userId: 'uid-do-cidadao', protocolo: 'PM-2026-0001', assunto: 'Acolhimento', status: 'Pendente', createdAt: 'Timestamp' },
    'solicitacoes-vereadores': { userId: 'uid-do-cidadao', vereadorId: 'id-do-vereador', assunto: 'Solicitação', status: 'Pendente', createdAt: 'Timestamp' },
    'atendimento-calendario': { protocolo: 'BAL-2026-0001', appointmentDate: '2026-09-09', appointmentTime: '10:00', status: 'Confirmado', userId: 'uid-do-cidadao' },
    'atendimento-fila': { senha: 'A001', setor: 'Balcão', prioridade: false, status: 'Aguardando', ordemFilaEm: 'Timestamp' },
    'atendimento-guiches': { numero: 1, atendenteId: 'uid-do-atendente', atendenteNome: 'Nome do atendente', status: 'Disponível', updatedAt: 'Timestamp' },
    'atendimento-guiche-relatorios': { atendenteId: 'uid-do-atendente', totalAtendimentos: 12, tempoMedioEsperaSegundos: 300, tempoMedioAtendimentoSegundos: 720, data: '2026-09-09' },
    'atendimento-avaliacoes': { protocolo: 'BAL-2026-0001', userId: 'uid-do-cidadao', nota: 5, comentario: 'Comentário', updatedAt: 'Timestamp' },
    users: { name: 'Nome completo', email: 'usuario@exemplo.com', cpf: '000.000.000-00', tipo: 'Cidadão', createdAt: 'Timestamp' },
    notifications: { userId: 'uid-do-cidadao', title: 'Título', body: 'Mensagem', read: false, createdAt: 'Timestamp' },
    mail: { to: ['usuario@exemplo.com'], message: { subject: 'Assunto', html: '<p>Conteúdo</p>' }, delivery: { state: 'PENDING' } },
    noticias: { titulo: 'Título da notícia', resumo: 'Resumo público', conteudo: 'Conteúdo', imagemUrl: 'https://...', publicada: true, createdAt: 'Timestamp' },
    vereadores: { nome: 'Nome do vereador', partido: 'SIGLA', email: 'gabinete@camara.gov.br', fotoUrl: 'https://...', ativo: true },
    piel: { titulo: 'Título do informativo', descricao: 'Descrição', arquivoUrl: 'https://...', publicadoEm: 'Timestamp' },
    'tv-camara-playlist': { title: 'Título do vídeo', youtubeId: 'video-id', thumbnailUrl: 'https://...', publishedAt: 'Timestamp', active: true },
    'tv-camara-logs': { action: 'sync', status: 'success', message: 'Descrição técnica', createdAt: 'Timestamp' },
    'procon-atendimentos': { userId: 'uid-do-consumidor', protocolo: 'PROCON-2026-0001', fornecedorId: 'id-do-fornecedor', descricao: 'Reclamação', status: 'Recebida', createdAt: 'Timestamp' },
    'procon-consumidores': { userId: 'uid-do-consumidor', nome: 'Nome completo', cpf: '000.000.000-00', email: 'usuario@exemplo.com' },
    'procon-fornecedores': { razaoSocial: 'Empresa Exemplo Ltda.', nomeFantasia: 'Empresa Exemplo', cnpj: '00.000.000/0001-00', ativo: true },
    'procon-audiencias': { atendimentoId: 'id-do-atendimento', data: '2026-09-09', horario: '14:00', status: 'Agendada' },
    'procon-pareceres': { atendimentoId: 'id-do-atendimento', responsavelId: 'uid-do-servidor', parecer: 'Texto do parecer', createdAt: 'Timestamp' },
    'procon-agendamentos': { userId: 'uid-do-consumidor', appointmentDate: '2026-09-09', appointmentTime: '09:00', assunto: 'Atendimento PROCON', status: 'Agendado' },
};
const configExample = id => id.includes('blocked') ? { dates: ['2026-12-25'], updatedAt: 'Timestamp' } : id === 'availability' ? { weekday: 1, enabled: true, slots: ['08:00','09:00'] } : id === 'bookedSlots' ? { date: '2026-09-09', time: '09:00', appointmentId: 'id-do-agendamento' } : { enabled: true, schedule: { start: '08:00', end: '17:00', intervalMinutes: 30 }, updatedAt: 'Timestamp' };
const exampleFor = item => EXAMPLES[item[0]] || (item[1] === 'Configuração' ? configExample(item[0]) : { id: 'document-id', status: 'Ativo', createdAt: 'Timestamp', updatedAt: 'Timestamp' });

const SystemCollectionsManager = ({ externalApis = [], onExternalApisChange }) => {
    const [view, setView] = useState('setup'); const [search, setSearch] = useState(''); const [selected, setSelected] = useState(null); const [publicStatus, setPublicStatus] = useState({}); const [checking, setChecking] = useState(false); const [copiedApi, setCopiedApi] = useState('');
    const { projectId, apiKey } = getApp().options;
    const publicApiUrl = useCallback(item => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${item[0]}`, [projectId]);
    const checkRules = useCallback(async () => { setChecking(true); const results = await Promise.allSettled(COLLECTIONS.map(async item => { const probe = `${publicApiUrl(item)}?pageSize=1&mask.fieldPaths=_public_probe&key=${encodeURIComponent(apiKey || '')}`; const response = await fetch(probe); return [item[0], response.ok]; })); const next = {}; results.forEach((result,index) => { next[COLLECTIONS[index][0]] = result.status === 'fulfilled' && result.value[1]; }); setPublicStatus(next); setChecking(false); }, [apiKey, publicApiUrl]);
    useEffect(() => { checkRules(); }, [checkRules]);
    const copyPublicApi = async item => { await navigator.clipboard.writeText(publicApiUrl(item)); setCopiedApi(item[0]); setTimeout(() => setCopiedApi(''), 1800); };
    const filtered = useMemo(() => { const term = search.trim().toLowerCase(); return term ? COLLECTIONS.filter(item => item.join(' ').toLowerCase().includes(term)) : COLLECTIONS; }, [search]);

    return <section className="data-card system-collections-card"><nav className="system-data-tabs three" aria-label="Gestão do Firebase"><button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}><LiaCloudSolid /> Configurar Firebase</button><button className={view === 'collections' ? 'active' : ''} onClick={() => setView('collections')}><LiaDatabaseSolid /> Explorar coleções</button><button className={view === 'external' ? 'active' : ''} onClick={() => setView('external')}><LiaCloudSolid /> Integrar APIs</button></nav>{view === 'setup' ? <FirebaseSetupWizard /> : view === 'external' ? <ExternalApiManager integrations={externalApis} onChange={onExternalApisChange} /> : <>
        <div className="system-collections-heading"><div><span><LiaDatabaseSolid /> Gestor de dados</span><h2>Modelos das coleções</h2><p>Estruturas de exemplo sem carregar documentos reais.</p></div><button onClick={checkRules} disabled={checking}><LiaRedoAltSolid /> {checking ? 'Verificando...' : 'Verificar regras públicas'}</button></div>
        <div className="system-readonly-note"><LiaShieldAltSolid /><div><strong>Catálogo sem dados reais</strong><span>Os objetos abaixo são modelos fixos. A URL aparece somente quando uma consulta sem autenticação confirma que a regra implantada é pública.</span></div></div>
        <label className="system-collection-search"><LiaSearchSolid /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar coleção, área ou finalidade" /></label>
        <div className="system-collections-layout"><div className="system-collection-list">{filtered.map(item => <button key={item[0]} className={selected?.[0] === item[0] ? 'active' : ''} onClick={() => setSelected(item)}><LiaDatabaseSolid /><div><strong>{item[0]}</strong><span>{item[2]}</span><small>{item[1]}</small></div><b className={publicStatus[item[0]] ? 'public' : ''}>{checking ? '…' : publicStatus[item[0]] ? 'Pública' : 'Protegida'}</b><LiaEyeSolid /></button>)}</div>
        <div className="system-collection-preview">{selected ? <><header><div><small>Modelo lógico</small><strong>/{selected[0]}</strong><span>{selected[2]} · exemplo sem dados reais</span></div></header>{publicStatus[selected[0]] ? <section className="system-public-api"><div><span>API pública REST</span><strong>{publicApiUrl(selected)}</strong><small>O acesso sem autenticação foi confirmado nas regras implantadas.</small></div><button onClick={() => copyPublicApi(selected)}>{copiedApi === selected[0] ? <><LiaCheckCircleSolid /> Copiada</> : <><LiaClipboardSolid /> Copiar URL</>}</button></section> : <div className="system-private-api"><LiaShieldAltSolid /> Coleção protegida: o modelo permanece visível, mas a URL pública não é disponibilizada.</div>}<div className="system-model-object"><span>Objeto de exemplo</span><pre>{JSON.stringify(exampleFor(selected), null, 2)}</pre></div></> : <div className="system-collection-placeholder"><LiaDatabaseSolid /><strong>Selecione uma coleção</strong><span>Veja sua finalidade, regra de acesso e objeto de exemplo.</span></div>}</div></div>
    </>}</section>;
};
export default SystemCollectionsManager;
