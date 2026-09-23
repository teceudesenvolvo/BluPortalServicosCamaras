import { ADMINISTRATIVE_MODULE_IDS, isSystemRootEmail } from './systemModules';

export const USER_ROLES = ['Admin', 'Administrador', 'Protocolo', 'Servidor', 'Gestor de Setor', 'Fiscal de Contrato', 'Gestor de Contrato', 'Fornecedor', 'Empresa', 'Almoxarifado', 'Patrimônio', 'Manutenção', 'Frotas', 'Secretaria Legislativa', 'Vereador', 'Assessor', 'Juridico', 'Procuradoria', 'Procon', 'Ouvidoria', 'Balcão', 'Recepção', 'Microempreendedor', 'Escola do Parlamento', 'Cidadão'];
const STAFF_MODULES = {
    protocolo: ['Protocolo', 'Servidor', 'Gestor de Setor', 'Secretaria Legislativa', 'Vereador', 'Assessor'],
    contratos: ['Fiscal de Contrato', 'Gestor de Contrato', 'Gestor de Setor'],
    fornecedores: ['Empresa', 'Fornecedor'],
    almoxarifado: ['Almoxarifado', 'Gestor de Setor'],
    patrimonio: ['Patrimônio', 'Gestor de Setor'],
    manutencao: ['Manutenção', 'Gestor de Setor'],
    frotas: ['Frotas', 'Gestor de Setor'],
    agendaVereadores: ['Vereador', 'Assessor'], legislativo: ['Secretaria Legislativa', 'Vereador', 'Assessor', 'Juridico'], juridico: ['Juridico'], balcao: ['Balcão'],
    microempreendedor: ['Microempreendedor'], recepcao: ['Balcão', 'Recepção', 'Microempreendedor'],
    mensagens: ['Balcão', 'Ouvidoria', 'Procuradoria'], avaliacoes: ['Balcão'],
    esic: ['Ouvidoria'], ouvidoria: ['Ouvidoria'], procuradoria: ['Procuradoria'], vereadores: ['Vereador'], procon: ['Procon'],
    escolaParlamento: ['Escola do Parlamento'],
    whatsapp: ['Admin', 'Administrador'],
    email: ['Admin', 'Administrador'],
};
export const defaultRolePermission = (role, moduleId, surface) => {
    if (['Admin', 'Administrador'].includes(role)) return true;
    if (surface === 'portal') return true;
    if (surface === 'adminApp') return Boolean(STAFF_MODULES[moduleId]?.includes(role));
    return Boolean(STAFF_MODULES[moduleId]?.includes(role));
};
export const rolePermission = (settings, role, moduleId, surface) => {
    const configured = settings.security?.rolePermissions?.[role]?.[moduleId]?.[surface];
    return typeof configured === 'boolean' ? configured : defaultRolePermission(role, moduleId, surface);
};
export const canAccessModule = (settings, role, email, moduleId, surface) => (
    settings.modules?.[moduleId]?.[surface] !== false
    && (isSystemRootEmail(settings, email) || rolePermission(settings, role, moduleId, surface))
);

export const ADMINISTRATIVE_PERMISSIONS = {
    contratos: ['visualizar', 'criar', 'editar', 'fiscalizar', 'atestar', 'gerenciar', 'configurar'],
    almoxarifado: ['visualizar', 'solicitar', 'movimentar', 'autorizar', 'gerenciar', 'configurar'],
    patrimonio: ['visualizar', 'criar', 'movimentar', 'inventariar', 'baixar', 'gerenciar', 'configurar'],
    manutencao: ['visualizar', 'solicitar', 'executar', 'validar', 'gerenciar', 'configurar'],
    frotas: ['visualizar', 'registrar', 'movimentar', 'gerenciar', 'configurar'],
    whatsapp: ['visualizar', 'configurar', 'gerenciar_mensagens', 'gerenciar_fluxos', 'responder'],
};

const ACTION_ROLE_DEFAULTS = {
    contratos: ['Fiscal de Contrato', 'Gestor de Contrato', 'Gestor de Setor'],
    almoxarifado: ['Almoxarifado', 'Gestor de Setor'],
    patrimonio: ['Patrimônio', 'Gestor de Setor'],
    manutencao: ['Manutenção', 'Gestor de Setor'],
    frotas: ['Frotas', 'Gestor de Setor'],
    whatsapp: ['Admin', 'Administrador'],
};

export const defaultActionPermission = (role, permission) => {
    if (['Admin', 'Administrador'].includes(role)) return true;
    const [moduleId, action] = String(permission || '').split('.');
    if (!ADMINISTRATIVE_PERMISSIONS[moduleId]?.includes(action)) return false;
    if (action === 'configurar') return false;
    return ACTION_ROLE_DEFAULTS[moduleId]?.includes(role) || false;
};

export const actionPermission = (settings, role, permission) => {
    const configured = settings.security?.actionPermissions?.[role]?.[permission];
    return typeof configured === 'boolean' ? configured : defaultActionPermission(role, permission);
};

export const canPerformAction = (settings, role, email, permission) => {
    const [moduleId] = String(permission || '').split('.');
    if (!moduleId || (ADMINISTRATIVE_MODULE_IDS.includes(moduleId) ? settings.modules?.[moduleId]?.admin !== true : settings.modules?.[moduleId]?.admin === false)) return false;
    return isSystemRootEmail(settings, email) || actionPermission(settings, role, permission);
};
