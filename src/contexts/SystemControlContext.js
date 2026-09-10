import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import { buildDefaultModuleSettings, DEFAULT_CMS_SETTINGS } from '../config/systemModules';

const SystemControlContext = createContext(null);

export const SystemControlProvider = ({ children }) => {
    const [settings, setSettings] = useState({ modules: buildDefaultModuleSettings(), ...DEFAULT_CMS_SETTINGS, maintenance: false, maintenanceMessage: '' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe = () => {};
        let active = true;
        const mergeSettings = data => setSettings(current => ({
            ...current, ...data,
            modules: { ...current.modules, ...(data.modules || {}) },
            tenant: { ...current.tenant, ...(data.tenant || {}) },
            design: { ...current.design, ...(data.design || {}) },
            branding: { ...current.branding, ...(data.branding || {}) },
            integrations: { ...current.integrations, ...(data.integrations || {}) },
            apiFeatures: { ...current.apiFeatures, ...(data.apiFeatures || {}) },
            security: { ...current.security, ...(data.security || {}) },
        }));

        fetch('/tenant.config.json', { cache: 'no-store' })
            .then(response => response.ok ? response.json() : null)
            .then(config => { if (active && config) mergeSettings(config); })
            .catch(error => console.warn('Configuração local do tenant não encontrada:', error))
            .finally(() => {
                if (!active) return;
                unsubscribe = onSnapshot(doc(firestore, 'system-control', 'portal'), snapshot => {
                    if (snapshot.exists()) mergeSettings(snapshot.data());
                    setLoading(false);
                }, error => {
                    console.error('Erro ao carregar o controle do sistema:', error);
                    setLoading(false);
                });
            });
        return () => { active = false; unsubscribe(); };
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        const design = settings.design || DEFAULT_CMS_SETTINGS.design;
        root.style.setProperty('--cms-primary', design.primaryColor);
        root.style.setProperty('--cms-secondary', design.secondaryColor);
        root.style.setProperty('--cms-accent', design.accentColor);
        root.style.setProperty('--cms-background', design.backgroundColor);
        root.style.setProperty('--cms-text', design.textColor);
        root.style.setProperty('--cms-radius', `${design.borderRadius}px`);
        root.style.setProperty('--cms-font', design.fontFamily);
        root.style.setProperty('--admin-premium-bg', design.backgroundColor);
        document.body.style.fontFamily = design.fontFamily;
        document.body.style.backgroundColor = design.backgroundColor;
        document.body.style.color = design.textColor;
        if (settings.branding?.faviconUrl) {
            let favicon = document.querySelector("link[rel='icon']");
            if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon); }
            favicon.href = settings.branding.faviconUrl;
        }
        if (settings.tenant?.portalTitle) document.title = settings.tenant.portalTitle;
    }, [settings.branding, settings.design, settings.tenant]);

    const value = useMemo(() => ({ settings, loading }), [settings, loading]);
    return <SystemControlContext.Provider value={value}>{children}</SystemControlContext.Provider>;
};

export const useSystemControl = () => useContext(SystemControlContext);
