import React from 'react';
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
    const { settings, loading } = useSystemControl();
    const module = findModuleByPath(location.pathname);
    if (loading || !module || settings.modules?.[module.id]?.[surface] !== false) return children;
    return <Navigate to={surface === 'admin' ? '/admin-balcao' : '/dashboard'} replace />;
};
