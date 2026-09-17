import React from 'react';
import { NavLink } from 'react-router-dom';
import AdminSidebar from '../../../components/AdminSidebar';
import '../administrative-core.css';

export default function AdministrativeModuleLayout({ eyebrow = 'GESTÃO ADMINISTRATIVA', title, description, navigation = [], actions, children }) {
    return <div className="dashboard-layout">
        <AdminSidebar />
        <main className="dashboard-content administrative-module-page">
            <header className="page-header-container administrative-module-header">
                <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
                {actions && <div className="administrative-header-actions">{actions}</div>}
            </header>
            <div className="administrative-module-layout">
                <aside className="administrative-module-nav" aria-label={`Navegação de ${title}`}>
                    {navigation.map(group => <section key={group.label}>
                        <span>{group.label}</span>
                        {group.items.map(item => <NavLink key={item.path} end={Boolean(item.end)} to={item.path}>{item.icon && <item.icon />}<em>{item.label}</em></NavLink>)}
                    </section>)}
                </aside>
                <div className="administrative-module-content">{children}</div>
            </div>
        </main>
    </div>;
}

