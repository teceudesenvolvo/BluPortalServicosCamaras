import React, { useState } from 'react';
import { SYSTEM_MODULES } from '../config/systemModules';
import { USER_ROLES, rolePermission } from '../config/rolePermissions';

export default function SystemRolePermissions({ settings, onChange }) {
    const [role, setRole] = useState('Recepção');
    const change = (moduleId, surface, checked) => {
        const all = settings.security?.rolePermissions || {};
        onChange({ ...all, [role]: { ...all[role], [moduleId]: { ...all[role]?.[moduleId], [surface]: checked } } });
    };
    return <section className="data-card">
        <h2>Permissões por tipo de usuário</h2>
        <p>Defina o acesso aos módulos. As alterações entram em vigor ao salvar. Usuários root mantêm acesso administrativo; módulos desativados continuam indisponíveis.</p>
        <label className="system-field"><span>Tipo de usuário</span><select value={role} onChange={event => setRole(event.target.value)}>{USER_ROLES.map(item => <option key={item}>{item}</option>)}</select></label>
        <div style={{ overflowX: 'auto', marginTop: 20 }}><table style={{ width: '100%', minWidth: 460 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Módulo</th><th>Admin</th><th>Portal</th><th>Aplicativo</th></tr></thead>
            <tbody>{SYSTEM_MODULES.map(module => <tr key={module.id}><th style={{ textAlign: 'left', padding: '12px 0' }}>{module.name}</th>{['admin', 'portal', 'app'].map(surface => {
                const supported = surface === 'app' ? module.app : surface === 'admin' ? module.adminPaths.length > 0 : module.userPaths.length > 0;
                return <td key={surface} style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${role}: ${module.name}, ${surface}`} disabled={!supported} checked={supported && rolePermission(settings, role, module.id, surface)} onChange={event => change(module.id, surface, event.target.checked)} /></td>;
            })}</tr>)}</tbody>
        </table></div>
        <p>O acesso ao módulo não transfere a titularidade de solicitações: aprovar motivos continua sendo atribuição do vereador destinatário.</p>
    </section>;
}
