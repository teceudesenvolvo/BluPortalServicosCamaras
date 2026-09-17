import React from 'react';

export default function AdministrativeEmptyState({ icon: Icon, title, description, action }) {
    return <div className="administrative-empty-state">{Icon && <Icon />}<h3>{title}</h3><p>{description}</p>{action}</div>;
}

