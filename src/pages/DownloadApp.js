import React, { useEffect, useMemo } from 'react';
import { LiaAndroid, LiaApple, LiaExternalLinkAltSolid, LiaMobileAltSolid } from 'react-icons/lia';
import { useSystemControl } from '../contexts/SystemControlContext';

const detectMobileStore = integrations => {
    const userAgent = navigator.userAgent || navigator.vendor || '';
    const isAndroid = /android/i.test(userAgent);
    const isAppleMobile = /iPad|iPhone|iPod/i.test(userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isAndroid && integrations.androidStoreUrl) return { name: 'Google Play', url: integrations.androidStoreUrl };
    if (isAppleMobile && integrations.iosStoreUrl) return { name: 'App Store', url: integrations.iosStoreUrl };
    return null;
};

const DownloadApp = () => {
    const { settings } = useSystemControl();
    const integrations = settings.integrations || {};
    const home = settings.home || {};
    const detectedStore = useMemo(() => detectMobileStore({
        androidStoreUrl: integrations.androidStoreUrl,
        iosStoreUrl: integrations.iosStoreUrl,
    }), [integrations.androidStoreUrl, integrations.iosStoreUrl]);

    useEffect(() => {
        if (!detectedStore) return undefined;
        const redirectTimer = window.setTimeout(() => {
            window.location.replace(detectedStore.url);
        }, 650);
        return () => window.clearTimeout(redirectTimer);
    }, [detectedStore]);

    return (
        <main className="app-download-page">
            <section className="app-download-card">
                {settings.branding?.logoUrl && <img src={settings.branding.logoUrl} alt={settings.branding?.logoAlt || settings.tenant?.name || 'Câmara Municipal'} className="app-download-logo" />}
                <span className="app-download-eyebrow"><LiaMobileAltSolid /> Aplicativo oficial</span>
                <h1>{settings.tenant?.shortName}</h1>
                <p>
                    {detectedStore
                        ? `Abrindo o aplicativo na ${detectedStore.name}...`
                        : 'Escolha a loja do seu dispositivo para baixar o aplicativo da Câmara.'}
                </p>

                <div className="app-download-actions">
                    {integrations.iosStoreUrl && <a href={integrations.iosStoreUrl} className="app-store-button apple">
                        <LiaApple />
                        <span><small>Baixar na</small><strong>App Store</strong></span>
                        <LiaExternalLinkAltSolid className="store-external-icon" />
                    </a>}
                    {integrations.androidStoreUrl && <a href={integrations.androidStoreUrl} className="app-store-button android">
                        <LiaAndroid />
                        <span><small>Disponível no</small><strong>Google Play</strong></span>
                        <LiaExternalLinkAltSolid className="store-external-icon" />
                    </a>}
                    {integrations.appDownloadUrl && <a href={integrations.appDownloadUrl} className="app-store-button">{home.footerDownloadLabel || 'Baixar aplicativo'}<LiaExternalLinkAltSolid className="store-external-icon" /></a>}
                </div>

                {detectedStore && <small className="app-download-fallback">Se a loja não abrir automaticamente, toque em um dos botões.</small>}
            </section>
        </main>
    );
};

export default DownloadApp;
