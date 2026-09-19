export const INITIAL_SYSTEM_ROOT_EMAILS = ['leo@gmail.com'];

export const normalizeRootEmails = emails => [...new Set((Array.isArray(emails) ? emails : [])
    .map(email => String(email || '').trim().toLowerCase())
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];

export const isSystemRootEmail = (settings, email) => {
    const configured = normalizeRootEmails(settings?.security?.rootEmails);
    const roots = configured.length ? configured : INITIAL_SYSTEM_ROOT_EMAILS;
    return roots.includes(String(email || '').trim().toLowerCase());
};

export const SYSTEM_MODULES = [
    { id: 'protocolo', name: 'Protocolo e Processos', description: 'Protocolos, processos administrativos, tramitação, documentos e acompanhamento.', adminPaths: ['/admin/protocolo', '/admin-protocolo'], userPaths: ['/protocolo'], app: true },
    { id: 'contratos', name: 'Fiscalização de Contratos', description: 'Execução contratual, fiscalização, medições, ocorrências, obrigações e alertas.', adminPaths: ['/admin/contratos'], userPaths: ['/operacoes/contratos'], app: true, enabledByDefault: false },
    { id: 'almoxarifado', name: 'Almoxarifado', description: 'Produtos, depósitos, entradas, requisições e movimentações de estoque.', adminPaths: ['/admin/almoxarifado'], userPaths: ['/operacoes/almoxarifado'], app: true, enabledByDefault: false },
    { id: 'patrimonio', name: 'Patrimônio', description: 'Bens, movimentações, responsabilidade, identificação e inventários patrimoniais.', adminPaths: ['/admin/patrimonio'], userPaths: ['/operacoes/patrimonio'], app: true, enabledByDefault: false },
    { id: 'manutencao', name: 'Manutenção Patrimonial', description: 'Chamados, ordens de serviço e manutenção preventiva e corretiva.', adminPaths: ['/admin/manutencao'], userPaths: ['/operacoes/manutencao'], app: true, enabledByDefault: false },
    { id: 'frotas', name: 'Gestão de Frotas', description: 'Veículos, motoristas, abastecimentos, documentos, manutenção e custos.', adminPaths: ['/admin/frotas'], userPaths: ['/operacoes/frotas'], app: true, enabledByDefault: false },
    { id: 'relatorios', name: 'Relatórios administrativos', description: 'Consultas e exportações dos módulos administrativos ativos.', adminPaths: ['/admin-relatorios'], userPaths: [], app: false, enabledByDefault: false },
    { id: 'esic', name: 'e-SIC', description: 'Pedidos de acesso à informação, respostas e recursos.', adminPaths: ['/admin-esic'], userPaths: ['/esic'], app: true },
    { id: 'agendaVereadores', name: 'Gabinete Vereador', description: 'Agenda, demandas, visitantes, equipe, tarefas, eventos e relatórios dos gabinetes.', adminPaths: ['/admin-agenda-vereadores'], userPaths: ['/vereadores'], app: true },
    { id: 'legislativo', name: 'Gestão legislativa', description: 'Matérias, tramitação, pautas, sessões, comissões e documentos acessórios.', adminPaths: ['/admin-legislativo'], userPaths: [], app: true },
    { id: 'juridico', name: 'Atendimento Jurídico', description: 'Orientações e solicitações jurídicas.', adminPaths: ['/admin-juridico'], userPaths: ['/juridico'], app: true },
    { id: 'balcao', name: 'Balcão do Cidadão', description: 'Solicitações, agenda e atendimento nos guichês.', adminPaths: ['/admin-balcao'], userPaths: ['/balcao'], app: true },
    { id: 'microempreendedor', name: 'Microempreendedor', description: 'Assessoria e solicitações para empreendedores.', adminPaths: ['/admin-microempreendedor'], userPaths: ['/microempreendedor'], app: true },
    { id: 'recepcao', name: 'Recepção', description: 'Cadastro presencial, confirmação e encaminhamento.', adminPaths: ['/recepcao'], userPaths: [], app: false },
    { id: 'mensagens', name: 'Mensagens', description: 'Comunicação entre cidadãos e equipes.', adminPaths: ['/admin-mensagens'], userPaths: ['/mensagens'], app: true },
    { id: 'noticias', name: 'Notícias', description: 'Publicação de notícias no portal e aplicativo.', adminPaths: ['/admin-noticias'], userPaths: ['/noticias'], app: true },
    { id: 'tvCamara', name: 'TV Câmara', description: 'Vídeos, transmissões e integração com YouTube.', adminPaths: ['/admin-tv-camara'], userPaths: ['/tv-camara'], app: true },
    { id: 'avaliacoes', name: 'Avaliações', description: 'Avaliação dos atendimentos realizados.', adminPaths: ['/admin-avaliacoes'], userPaths: ['/avaliar-atendimento'], app: true },
    { id: 'ouvidoria', name: 'Ouvidoria', description: 'Manifestações e acompanhamento da Ouvidoria.', adminPaths: ['/admin-ouvidoria'], userPaths: ['/ouvidoria'], app: true },
    { id: 'procuradoria', name: 'Procuradoria da Mulher', description: 'Solicitações, acolhimento e botão de pânico.', adminPaths: ['/admin-procuradoria'], userPaths: ['/procuradoria'], app: true },
    { id: 'vereadores', name: 'Vereadores', description: 'Cadastro e apresentação dos parlamentares.', adminPaths: ['/admin-vereadores'], userPaths: [], app: true },
    { id: 'piel', name: 'PIEL', description: 'Programa de integração do Legislativo.', adminPaths: ['/admin-piel'], userPaths: ['/piel'], app: true },
    { id: 'escolaParlamento', name: 'Escola do Parlamento', description: 'Cursos, aulas, materiais e notícias de formação legislativa.', adminPaths: ['/admin-escola-parlamento'], userPaths: ['/escola-parlamento'], app: true },
    { id: 'procon', name: 'PROCON', description: 'Atendimentos, fila, consumidores e fornecedores.', adminPaths: ['/admin-procon'], userPaths: ['/procon'], app: true },
    { id: 'usuarios', name: 'Gestão de usuários', description: 'Perfis, papéis e permissões administrativas.', adminPaths: ['/admin-users'], userPaths: [], app: false },
    { id: 'notificacoes', name: 'Notificações', description: 'Histórico e entrega de notificações.', adminPaths: ['/admin-notifications'], userPaths: [], app: true },
];

export const ADMINISTRATIVE_MODULE_IDS = ['contratos', 'almoxarifado', 'patrimonio', 'manutencao', 'frotas'];

export const APP_HOME_MODULE_IDS = ['protocolo', 'balcao', 'ouvidoria', 'esic', 'procuradoria', 'procon', 'microempreendedor', 'escolaParlamento', 'tvCamara', 'noticias', 'vereadores', 'piel', 'mensagens', 'avaliacoes'];
export const DEFAULT_APP_HOME_MODULES = ['protocolo', 'balcao', 'ouvidoria', 'procuradoria', 'tvCamara'];
// A barra inferior mantém Início e Perfil fixos. Estes são os três slots
// intermediários que a Câmara pode escolher no controle de módulos.
export const APP_BOTTOM_BAR_OPTIONS = [
    { id: 'servicos', name: 'Serviços', path: '/dashboard', staticPage: true },
    { id: 'licitacoes', name: 'Licitações', path: '/legislativo-publico', staticPage: true },
    ...['balcao', 'legislativo', 'protocolo', 'ouvidoria', 'esic', 'procuradoria', 'procon', 'microempreendedor', 'escolaParlamento', 'tvCamara', 'noticias', 'vereadores', 'piel', 'mensagens', 'avaliacoes'].map(id => ({
        id,
        name: SYSTEM_MODULES.find(module => module.id === id)?.name || id,
        moduleId: id,
    })),
];
export const APP_BOTTOM_BAR_MODULE_IDS = APP_BOTTOM_BAR_OPTIONS.map(option => option.id);
export const DEFAULT_APP_BOTTOM_BAR_MODULES = ['servicos', 'licitacoes', 'mensagens'];

export const buildDefaultModuleSettings = () => Object.fromEntries(
    SYSTEM_MODULES.map(module => [module.id, { admin: module.enabledByDefault !== false, portal: module.enabledByDefault !== false, app: module.app && module.enabledByDefault !== false }]),
);

export const DEFAULT_CMS_SETTINGS = {
    appHomeModules: DEFAULT_APP_HOME_MODULES,
    appBottomBarModules: DEFAULT_APP_BOTTOM_BAR_MODULES,
    security: { rootEmails: INITIAL_SYSTEM_ROOT_EMAILS },
    tenant: { name: 'Câmara Municipal de Paraipaba', shortName: 'Câmara de Paraipaba', slug: 'paraipaba', city: 'Paraipaba', state: 'CE', portalTitle: 'Portal de Serviços', address: 'Av. Domingos Barroso, 350 - Monte Alverne', postalCode: '62685-000', phone: '', email: '', website: '' },
    design: { primaryColor: '#025AA1', secondaryColor: '#0284C7', accentColor: '#F59E0B', backgroundColor: '#F3F8FE', textColor: '#10233F', borderRadius: 14, fontFamily: 'Inter, system-ui, sans-serif' },
    branding: { logoUrl: '', compactLogoUrl: '', faviconUrl: '', loginCoverUrl: '', logoAlt: 'Câmara Municipal' },
    integrations: { functionsBaseUrl: '', publicApiUrl: '', youtubeApiUrl: '', appDownloadUrl: 'https://servicos.camaraparaipaba.ce.gov.br/download-app', privacyUrl: '', supportEmail: '', androidStoreUrl: '', iosStoreUrl: '', legislativeApi: { enabled: false, provider: 'sapl', url: '', responsePath: '', fields: { id: 'id', name: 'nome', cargo: 'nome_parlamentar', party: 'partido.sigla', photo: 'foto', email: 'email', userId: 'userId' } } },
    email: { enabled: true, provider: 'cloudflare', domain: '', senderName: '', senderEmail: '', replyTo: '', functionsEndpoint: '', routingAddress: '', dnsVerified: false },
    notificationTemplates: {
        welcome: { label: 'Boas-vindas', enabled: true, channels: { email: true, push: true }, subject: 'Bem-vindo ao Portal de Serviços', body: '<p>Olá, <strong>{{nome}}</strong>! Seu cadastro foi criado com sucesso.</p>' },
        appointmentConfirmed: { label: 'Agendamento confirmado', enabled: true, channels: { email: true, push: true }, subject: 'Agendamento confirmado', body: '<p>Seu atendimento para <strong>{{data}}</strong> às <strong>{{horario}}</strong> foi confirmado.</p>' },
        documentReady: { label: 'Documento pronto', enabled: true, channels: { email: true, push: true }, subject: 'Seu documento está pronto', body: '<p>Olá, {{nome}}. O documento referente ao protocolo <strong>{{protocolo}}</strong> está pronto.</p>' },
        queueCalled: { label: 'Chamada para atendimento', enabled: true, channels: { email: false, push: true }, subject: 'Sua senha foi chamada', body: '<p>A senha <strong>{{senha}}</strong> foi chamada. Dirija-se ao guichê {{guiche}}.</p>' },
    },
    apiFeatures: { youtube: true, notifications: true, email: true, artificialIntelligence: true, publicBalance: true },
    externalApis: [],
    updates: { upstream: 'teceudesenvolvo/BluPortalServicosCamaras', enabled: true, schedule: 'weekly', autoMerge: false, deployOnMerge: false, deployCommand: 'npm run build' },
};

export const findModuleByPath = path => SYSTEM_MODULES.find(module => (
    [...module.adminPaths, ...module.userPaths].some(prefix => path === prefix || path.startsWith(`${prefix}/`))
));
