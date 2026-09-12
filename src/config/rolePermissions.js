import { isSystemRootEmail } from './systemModules';

export const USER_ROLES = ['Admin', 'Vereador', 'Assessor', 'Juridico', 'Procuradoria', 'Procon', 'Ouvidoria', 'Balcão', 'Recepção', 'Microempreendedor', 'Cidadão'];
const STAFF_MODULES = {
    agendaVereadores: ['Vereador', 'Assessor'], juridico: ['Juridico'], balcao: ['Balcão'],
    microempreendedor: ['Microempreendedor'], recepcao: ['Balcão', 'Recepção', 'Microempreendedor'],
    mensagens: ['Balcão', 'Ouvidoria', 'Procuradoria'], avaliacoes: ['Balcão'],
    esic: ['Ouvidoria'], ouvidoria: ['Ouvidoria'], procuradoria: ['Procuradoria'], vereadores: ['Vereador'], procon: ['Procon'],
};
export const defaultRolePermission = (role, moduleId, surface) => surface !== 'admin' || role === 'Admin' || Boolean(STAFF_MODULES[moduleId]?.includes(role));
export const rolePermission = (settings, role, moduleId, surface) => {
    const configured = settings.security?.rolePermissions?.[role]?.[moduleId]?.[surface];
    return typeof configured === 'boolean' ? configured : defaultRolePermission(role, moduleId, surface);
};
export const canAccessModule = (settings, role, email, moduleId, surface) => (
    settings.modules?.[moduleId]?.[surface] !== false
    && (isSystemRootEmail(settings, email) || rolePermission(settings, role, moduleId, surface))
);
