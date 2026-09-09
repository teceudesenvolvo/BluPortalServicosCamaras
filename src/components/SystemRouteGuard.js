import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/FirebaseAuthContext';
import { useSystemControl } from '../contexts/SystemControlContext';
import { findModuleByPath, SYSTEM_OWNER_EMAIL } from '../config/systemModules';

export const OwnerRoute = ({ children }) => {
    const { currentUser, loading } = useAuth();
    if (loading) return null;
    return currentUser?.email?.toLowerCase() === SYSTEM_OWNER_EMAIL ? children : <Navigate to="/dashboard" replace />;
};

export const ModuleRoute = ({ children, surface }) => {
    const location = useLocation();
    const { settings, loading } = useSystemControl();
    const module = findModuleByPath(location.pathname);
    if (loading || !module || settings.modules?.[module.id]?.[surface] !== false) return children;
    return <Navigate to={surface === 'admin' ? '/admin-balcao' : '/dashboard'} replace />;
};
