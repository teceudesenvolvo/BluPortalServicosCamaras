import React, { useState, useEffect } from 'react';
import { useSystemControl } from '../contexts/SystemControlContext';
import {
    LiaArrowRightSolid,
    LiaEnvelopeSolid,
    LiaMapMarkedAltSolid,
    LiaPhoneSolid,
    LiaShieldAltSolid,
} from 'react-icons/lia';


const Footer = () => {
    const { settings } = useSystemControl();
    const [showBanner, setShowBanner] = useState(false);
    const [appLink, setAppLink] = useState('');
    const integrations = settings.integrations || {};
    const home = settings.home || {};

    useEffect(() => {
        let dismissed = false;
        try { dismissed = localStorage.getItem('app-banner-dismissed') === 'true'; } catch (_) { /* storage indisponível */ }
        const userAgent = navigator.userAgent || navigator.vendor || '';
        const isAndroid = /android/i.test(userAgent);
        const isAppleMobile = /iPad|iPhone|iPod/i.test(userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const preferredUrl = isAndroid ? integrations.androidStoreUrl
            : isAppleMobile ? integrations.iosStoreUrl : '';
        const selectedUrl = preferredUrl || integrations.appDownloadUrl || '';
        setAppLink(selectedUrl);
        setShowBanner(Boolean(selectedUrl && !dismissed));
    }, [integrations.androidStoreUrl, integrations.iosStoreUrl, integrations.appDownloadUrl]);

    const dismissBanner = () => {
        localStorage.setItem('app-banner-dismissed', 'true');
        setShowBanner(false);
    };

    return (
        <footer className="footer">
            {showBanner && (
                <div className="footer-app-banner">
                    <p>{home.appPopupDescription}</p>
                    <div className="footer-app-banner-actions">
                        <a href={appLink} target="_blank" rel="noopener noreferrer">
                            <button>{home.footerDownloadLabel || 'Baixar aplicativo'}</button>
                        </a>
                        <button onClick={dismissBanner}>Agora não</button>
                    </div>
                </div>
            )}

        <div className="footer-content">
            <div className="footer-logo">
                {settings.branding?.logoUrl && <img src={settings.branding.logoUrl} alt={settings.branding?.logoAlt || settings.tenant?.name || 'Câmara Municipal'} />}
                <span>{settings.tenant?.portalTitle || home.panelTitle || 'Portal de Serviços'}</span>
                <p>{String(home.footerDescription || '').replaceAll('{{nome}}', settings.tenant?.name || '')}</p>
            </div>

            <div className="footer-contact">
                <h4>{home.footerContactTitle}</h4>
                <p className="footer-contact-item">
                    <LiaMapMarkedAltSolid />
                    <span>{[settings.tenant?.address, `${settings.tenant?.city} - ${settings.tenant?.state}`, settings.tenant?.postalCode].filter(Boolean).join(', ')}</span>
                </p>
                {settings.tenant?.phone && <p className="footer-contact-item"><LiaPhoneSolid /><span>{settings.tenant.phone}</span></p>}
                {settings.tenant?.email && <p className="footer-contact-item"><LiaEnvelopeSolid /><span>{settings.tenant.email}</span></p>}
            </div>

            <div className="footer-links">
                <h4>{home.footerServicesTitle}</h4>
                <ul>
                    {(home.quickLinks || []).map(item => <li key={item.id}><a href={item.path}>{item.title} <LiaArrowRightSolid /></a></li>)}
                </ul>
            </div>

            {(integrations.iosStoreUrl || integrations.androidStoreUrl || integrations.appDownloadUrl) && <div className="footer-app-links">
                <div className="footer-app-card">
                    <span><LiaShieldAltSolid /> {home.footerAppEyebrow}</span>
                    <h4>{home.footerAppTitle}</h4>
                    <p>{home.footerAppDescription}</p>
                </div>
                <div className="app-badges">
                    {integrations.iosStoreUrl && <a className="app-badge app-badge--apple" href={integrations.iosStoreUrl} target="_blank" rel="noopener noreferrer">{home.footerAppleLabel}</a>}
                    {integrations.androidStoreUrl && <a className="app-badge app-badge--google" href={integrations.androidStoreUrl} target="_blank" rel="noopener noreferrer">{home.footerGoogleLabel}</a>}
                    {integrations.appDownloadUrl && <a className="app-badge" href={integrations.appDownloadUrl} target="_blank" rel="noopener noreferrer">{home.footerDownloadLabel}</a>}
                </div>
            </div>}
        </div>
        <div className="footer-bottom">
            <p>
                Copyright © {new Date().getFullYear()}. {home.footerCopyright}
                <a href="https://blu-tecnologias-site.vercel.app" target="_blank" rel="noopener noreferrer">
                    Desenvolvido por Blu Tecnologias
                </a>
            </p>
        </div>
    </footer>
    );
};

export default Footer;
