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
    { id: 'juridico', name: 'Atendimento Jurídico', description: 'Orientações e solicitações jurídicas.', adminPaths: ['/admin-juridico'], userPaths: ['/juridico'], app: true },
    { id: 'balcao', name: 'Balcão do Cidadão', description: 'Solicitações, agenda e atendimento nos guichês.', adminPaths: ['/admin-balcao'], userPaths: ['/balcao'], app: true },
    { id: 'microempreendedor', name: 'Microempreendedor', description: 'Assessoria e solicitações para empreendedores.', adminPaths: ['/admin-microempreendedor'], userPaths: ['/microempreendedor'], app: true },
    { id: 'recepcao', name: 'Recepção', description: 'Cadastro presencial, confirmação e encaminhamento.', adminPaths: ['/recepcao'], userPaths: [], app: false },
    { id: 'mensagens', name: 'Mensagens', description: 'Comunicação entre cidadãos e equipes.', adminPaths: ['/admin-mensagens'], userPaths: ['/mensagens'], app: true },
    { id: 'noticias', name: 'Notícias', description: 'Publicação de notícias no portal e aplicativo.', adminPaths: ['/admin-noticias'], userPaths: [], app: true },
    { id: 'tvCamara', name: 'TV Câmara', description: 'Vídeos, transmissões e integração com YouTube.', adminPaths: ['/admin-tv-camara'], userPaths: ['/tv-camara'], app: true },
    { id: 'avaliacoes', name: 'Avaliações', description: 'Avaliação dos atendimentos realizados.', adminPaths: ['/admin-avaliacoes'], userPaths: ['/avaliar-atendimento'], app: true },
    { id: 'ouvidoria', name: 'Ouvidoria', description: 'Manifestações e acompanhamento da Ouvidoria.', adminPaths: ['/admin-ouvidoria'], userPaths: ['/ouvidoria'], app: true },
    { id: 'procuradoria', name: 'Procuradoria da Mulher', description: 'Solicitações, acolhimento e botão de pânico.', adminPaths: ['/admin-procuradoria'], userPaths: ['/procuradoria'], app: true },
    { id: 'vereadores', name: 'Vereadores', description: 'Solicitações direcionadas aos vereadores.', adminPaths: ['/admin-vereadores'], userPaths: ['/vereadores'], app: true },
    { id: 'piel', name: 'PIEL', description: 'Programa de integração do Legislativo.', adminPaths: ['/admin-piel'], userPaths: ['/piel'], app: true },
    { id: 'procon', name: 'PROCON', description: 'Atendimentos, fila, consumidores e fornecedores.', adminPaths: ['/admin-procon'], userPaths: ['/procon'], app: true },
    { id: 'usuarios', name: 'Gestão de usuários', description: 'Perfis, papéis e permissões administrativas.', adminPaths: ['/admin-users'], userPaths: [], app: false },
    { id: 'notificacoes', name: 'Notificações', description: 'Histórico e entrega de notificações.', adminPaths: ['/admin-notifications'], userPaths: [], app: true },
];

export const buildDefaultModuleSettings = () => Object.fromEntries(
    SYSTEM_MODULES.map(module => [module.id, { admin: true, portal: true, app: module.app }]),
);

export const DEFAULT_CMS_SETTINGS = {
    security: { rootEmails: INITIAL_SYSTEM_ROOT_EMAILS },
    tenant: { name: 'Câmara Municipal de Paraipaba', shortName: 'Câmara de Paraipaba', slug: 'paraipaba', city: 'Paraipaba', state: 'CE', portalTitle: 'Portal de Serviços', address: 'Av. Domingos Barroso, 350 - Monte Alverne', postalCode: '62685-000', phone: '', email: '', website: '' },
    design: { primaryColor: '#025AA1', secondaryColor: '#0284C7', accentColor: '#F59E0B', backgroundColor: '#F3F8FE', textColor: '#10233F', borderRadius: 14, fontFamily: 'Inter, system-ui, sans-serif' },
    branding: { logoUrl: '', compactLogoUrl: '', faviconUrl: '', loginCoverUrl: '', logoAlt: 'Câmara Municipal' },
    integrations: { functionsBaseUrl: '', publicApiUrl: '', youtubeApiUrl: '', appDownloadUrl: 'https://servicos.camaraparaipaba.ce.gov.br/download-app', privacyUrl: '', supportEmail: '', androidStoreUrl: '', iosStoreUrl: '' },
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
