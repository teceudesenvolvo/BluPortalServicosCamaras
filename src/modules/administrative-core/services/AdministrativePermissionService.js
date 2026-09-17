import { canAccessModule, canPerformAction } from '../../../config/rolePermissions';

export const AdministrativePermissionService = {
    canAccess(settings, actor, moduleId, surface = 'admin') {
        return canAccessModule(settings, actor?.role, actor?.email, moduleId, surface);
    },
    can(settings, actor, permission) {
        return canPerformAction(settings, actor?.role, actor?.email, permission);
    },
    assert(settings, actor, permission) {
        if (!this.can(settings, actor, permission)) {
            const error = new Error('Seu perfil não possui permissão para realizar esta operação.');
            error.code = 'permission-denied';
            throw error;
        }
    },
};

