import React from 'react';
import './ServiceOperationsNav.css';
import {
    LiaCalendarAltSolid,
    LiaClipboardListSolid,
    LiaCogSolid,
    LiaFileAltSolid,
    LiaTachometerAltSolid,
    LiaUsersCogSolid,
} from 'react-icons/lia';

const ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LiaTachometerAltSolid },
    { id: 'requests', label: 'Solicitações', icon: LiaClipboardListSolid },
    { id: 'appointments', label: 'Agendamentos', icon: LiaCalendarAltSolid },
    { id: 'queue', label: 'Fila', icon: LiaUsersCogSolid },
    { id: 'reports', label: 'Relatórios', icon: LiaFileAltSolid },
    { id: 'settings', label: 'Configurações', icon: LiaCogSolid },
];

export const SERVICE_OPERATION_TABS = ITEMS;

export default function ServiceOperationsNav({ active, onChange, serviceName, items = ITEMS }) {
    return (
        <nav className="service-operations-nav" aria-label={`Operação de ${serviceName}`}>
            {items.map(({ id, label, icon: Icon }) => (
                <button
                    type="button"
                    key={id}
                    className={active === id ? 'active' : ''}
                    onClick={() => onChange(id)}
                    aria-current={active === id ? 'page' : undefined}
                >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                </button>
            ))}
        </nav>
    );
}
