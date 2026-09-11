import React from 'react';
import { canAccessModule } from '../config/rolePermissions';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/FirebaseAuthContext';
import { useSystemControl } from '../contexts/SystemControlContext';
import { findModuleByPath, isSystemRootEmail } from '../config/systemModules';

export const OwnerRoute = ({ children }) => {
    const { currentUser, loading: authLoading } = useAuth();
    const { settings, loading: settingsLoading } = useSystemControl();
    if (authLoading || settingsLoading) return null;
    return isSystemRootEmail(settings, currentUser?.email) ? children : <Navigate to="/dashboard" replace />;
};

export const ModuleRoute = ({ children, surface }) => {
    const location = useLocation();
    const { currentUser, role, roleLoading } = useAuth();
    const { settings, loading } = useSystemControl();
    const module = findModuleByPath(location.pathname);
    if (loading || roleLoading) return null;
    if (!module || canAccessModule(settings, role, currentUser?.email, module.id, surface)) return children;
    return <main className="dashboard-content"><h1>Acesso indisponível</h1><p>Seu perfil não tem acesso a este módulo ou ele foi desativado.</p><a href="/dashboard">Voltar ao início</a></main>;
};
