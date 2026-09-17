import React, { useState } from 'react';
import { SYSTEM_MODULES } from '../config/systemModules';
import { ADMINISTRATIVE_PERMISSIONS, USER_ROLES, actionPermission, rolePermission } from '../config/rolePermissions';

export default function SystemRolePermissions({ settings, onRolePermissionsChange, onActionPermissionsChange }) {
    const [role, setRole] = useState('Recepção');
    const change = (moduleId, surface, checked) => {
        const all = settings.security?.rolePermissions || {};
        onRolePermissionsChange({ ...all, [role]: { ...all[role], [moduleId]: { ...all[role]?.[moduleId], [surface]: checked } } });
    };
    const changeAction = (permission, checked) => {
        const all = settings.security?.actionPermissions || {};
        const next = { ...all, [role]: { ...all[role], [permission]: checked } };
        onActionPermissionsChange(next);
    };
    return <section className="data-card system-role-permissions">
        <h2>Permissões por tipo de usuário</h2>
        <p>Defina o acesso aos módulos. As alterações entram em vigor ao salvar. Usuários root mantêm acesso administrativo; módulos desativados continuam indisponíveis.</p>
        <label className="system-field"><span>Tipo de usuário</span><select value={role} onChange={event => setRole(event.target.value)}>{USER_ROLES.map(item => <option key={item}>{item}</option>)}</select></label>
        <div className="system-role-permissions-table"><table>
            <thead><tr><th>Módulo</th><th>Admin</th><th>Portal</th><th>Aplicativo</th></tr></thead>
            <tbody>{SYSTEM_MODULES.map(module => <tr key={module.id}><th>{module.name}</th>{['admin', 'portal', 'app'].map(surface => {
                const supported = surface === 'app' ? module.app : surface === 'admin' ? module.adminPaths.length > 0 : module.userPaths.length > 0;
                return <td key={surface} style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${role}: ${module.name}, ${surface}`} disabled={!supported} checked={supported && rolePermission(settings, role, module.id, surface)} onChange={event => change(module.id, surface, event.target.checked)} /></td>;
            })}</tr>)}</tbody>
        </table></div>
        <h3>Operações administrativas</h3>
        <p>Além do acesso ao módulo, defina quais operações este perfil poderá executar. As mesmas permissões serão verificadas no backend.</p>
        <div className="system-role-permissions-table"><table>
            <thead><tr><th>Módulo</th><th>Permissão</th><th>Permitida</th></tr></thead>
            <tbody>{Object.entries(ADMINISTRATIVE_PERMISSIONS).flatMap(([moduleId, actions]) => actions.map(action => {
                const permission = `${moduleId}.${action}`;
                const module = SYSTEM_MODULES.find(item => item.id === moduleId);
                return <tr key={permission}><th>{module?.name || moduleId}</th><td>{permission}</td><td style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${role}: ${permission}`} checked={actionPermission(settings, role, permission)} onChange={event => changeAction(permission, event.target.checked)} /></td></tr>;
            }))}</tbody>
        </table></div>
        <p>O acesso ao módulo não transfere a titularidade de solicitações: aprovar motivos continua sendo atribuição do vereador destinatário.</p>
    </section>;
}
