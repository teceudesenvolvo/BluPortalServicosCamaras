export const SYSTEM_OWNER_EMAIL = 'leo@gmail.com';

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
    tenant: { name: 'Câmara Municipal de Paraipaba', shortName: 'Câmara de Paraipaba', slug: 'paraipaba', city: 'Paraipaba', state: 'CE', portalTitle: 'Portal de Serviços', address: 'Av. Domingos Barroso, 350 - Monte Alverne', postalCode: '62685-000', phone: '', email: '', website: '' },
    design: { primaryColor: '#025AA1', secondaryColor: '#0284C7', accentColor: '#F59E0B', backgroundColor: '#F3F8FE', textColor: '#10233F', borderRadius: 14, fontFamily: 'Inter, system-ui, sans-serif' },
    branding: { logoUrl: '', compactLogoUrl: '', faviconUrl: '', loginCoverUrl: '', logoAlt: 'Câmara Municipal' },
    integrations: { functionsBaseUrl: '', publicApiUrl: '', youtubeApiUrl: '', appDownloadUrl: 'https://servicos.camaraparaipaba.ce.gov.br/download-app', privacyUrl: '', supportEmail: '', androidStoreUrl: '', iosStoreUrl: '' },
    apiFeatures: { youtube: true, notifications: true, email: true, artificialIntelligence: true, publicBalance: true },
};

export const findModuleByPath = path => SYSTEM_MODULES.find(module => (
    [...module.adminPaths, ...module.userPaths].some(prefix => path === prefix || path.startsWith(`${prefix}/`))
));
