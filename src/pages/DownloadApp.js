import React, { useEffect, useMemo } from 'react';
import { LiaAndroid, LiaApple, LiaExternalLinkAltSolid, LiaMobileAltSolid } from 'react-icons/lia';
import Logo from '../assets/logo-paraipaba-azul.png';

const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.blutecnologias.appcamara&pcampaignid=web_share';
const IOS_URL = 'https://apps.apple.com/br/app/cm-paraipaba/id6769832252';

const detectMobileStore = () => {
    const userAgent = navigator.userAgent || navigator.vendor || '';
    const isAndroid = /android/i.test(userAgent);
    const isAppleMobile = /iPad|iPhone|iPod/i.test(userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isAndroid) return { name: 'Google Play', url: ANDROID_URL };
    if (isAppleMobile) return { name: 'App Store', url: IOS_URL };
    return null;
};

const DownloadApp = () => {
    const detectedStore = useMemo(detectMobileStore, []);

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
                <img src={Logo} alt="Câmara Municipal de Paraipaba" className="app-download-logo" />
                <span className="app-download-eyebrow"><LiaMobileAltSolid /> Aplicativo oficial</span>
                <h1>CM Paraipaba</h1>
                <p>
                    {detectedStore
                        ? `Abrindo o aplicativo na ${detectedStore.name}...`
                        : 'Escolha a loja do seu dispositivo para baixar o aplicativo da Câmara.'}
                </p>

                <div className="app-download-actions">
                    <a href={IOS_URL} className="app-store-button apple">
                        <LiaApple />
                        <span><small>Baixar na</small><strong>App Store</strong></span>
                        <LiaExternalLinkAltSolid className="store-external-icon" />
                    </a>
                    <a href={ANDROID_URL} className="app-store-button android">
                        <LiaAndroid />
                        <span><small>Disponível no</small><strong>Google Play</strong></span>
                        <LiaExternalLinkAltSolid className="store-external-icon" />
                    </a>
                </div>

                {detectedStore && <small className="app-download-fallback">Se a loja não abrir automaticamente, toque em um dos botões.</small>}
            </section>
        </main>
    );
};

export default DownloadApp;
