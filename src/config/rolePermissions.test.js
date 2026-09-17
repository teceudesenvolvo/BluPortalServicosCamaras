import { canAccessModule, canPerformAction } from './rolePermissions';

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
test('operações móveis respeitam o perfil do servidor', () => {
    expect(canAccessModule({}, 'Manutenção', '', 'manutencao', 'app')).toBe(true);
    expect(canAccessModule({}, 'Cidadão', '', 'manutencao', 'app')).toBe(false);
    expect(canAccessModule({ modules: { manutencao: { app: false } } }, 'Manutenção', '', 'manutencao', 'app')).toBe(false);
});
test('root mantém acesso mas não reativa módulo desligado', () => {
    const settings = { security: { rootEmails: ['root@example.com'], rolePermissions: { Admin: { balcao: { admin: false } } } } };
    expect(canAccessModule(settings, 'Admin', 'root@example.com', 'balcao', 'admin')).toBe(true);
    expect(canAccessModule({ ...settings, modules: { balcao: { admin: false } } }, 'Admin', 'root@example.com', 'balcao', 'admin')).toBe(false);
});
test('permissões administrativas usam o papel como padrão', () => {
    const settings = { modules: { contratos: { admin: true } } };
    expect(canPerformAction(settings, 'Fiscal de Contrato', '', 'contratos.fiscalizar')).toBe(true);
    expect(canPerformAction(settings, 'Fiscal de Contrato', '', 'contratos.configurar')).toBe(false);
    expect(canPerformAction(settings, 'Cidadão', '', 'contratos.visualizar')).toBe(false);
});
test('permissão granular configurada concede ou revoga operação', () => {
    const settings = { modules: { almoxarifado: { admin: true } }, security: { actionPermissions: { Servidor: { 'almoxarifado.solicitar': true }, Almoxarifado: { 'almoxarifado.movimentar': false } } } };
    expect(canPerformAction(settings, 'Servidor', '', 'almoxarifado.solicitar')).toBe(true);
    expect(canPerformAction(settings, 'Almoxarifado', '', 'almoxarifado.movimentar')).toBe(false);
});
test('módulo desativado bloqueia ações administrativas', () => {
    const settings = { modules: { patrimonio: { admin: false } } };
    expect(canPerformAction(settings, 'Admin', '', 'patrimonio.inventariar')).toBe(false);
});
