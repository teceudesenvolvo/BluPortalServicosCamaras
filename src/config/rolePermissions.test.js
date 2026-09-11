import { canAccessModule } from './rolePermissions';

test('preserva os acessos existentes sem configuração', () => {
    expect(canAccessModule({}, 'Recepção', '', 'recepcao', 'admin')).toBe(true);
    expect(canAccessModule({}, 'Cidadão', '', 'recepcao', 'admin')).toBe(false);
    expect(canAccessModule({}, 'Cidadão', '', 'balcao', 'portal')).toBe(true);
});
test('configuração pode conceder e revogar acesso por superfície', () => {
    const settings = { security: { rolePermissions: { Recepção: { recepcao: { admin: false }, balcao: { admin: true, portal: false } } } } };
    expect(canAccessModule(settings, 'Recepção', '', 'recepcao', 'admin')).toBe(false);
    expect(canAccessModule(settings, 'Recepção', '', 'balcao', 'admin')).toBe(true);
    expect(canAccessModule(settings, 'Recepção', '', 'balcao', 'portal')).toBe(false);
});
test('root mantém acesso mas não reativa módulo desligado', () => {
    const settings = { security: { rootEmails: ['root@example.com'], rolePermissions: { Admin: { balcao: { admin: false } } } } };
    expect(canAccessModule(settings, 'Admin', 'root@example.com', 'balcao', 'admin')).toBe(true);
    expect(canAccessModule({ ...settings, modules: { balcao: { admin: false } } }, 'Admin', 'root@example.com', 'balcao', 'admin')).toBe(false);
});
