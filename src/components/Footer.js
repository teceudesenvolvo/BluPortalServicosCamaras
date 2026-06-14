import React, { useState, useEffect } from 'react';
import Logo from '../assets/logo-paraipaba.png';
import {
    LiaArrowRightSolid,
    LiaEnvelopeSolid,
    LiaMapMarkedAltSolid,
    LiaPhoneSolid,
    LiaShieldAltSolid,
} from 'react-icons/lia';


const Footer = () => {
    const [showBanner, setShowBanner] = useState(false);
    const [appLink, setAppLink] = useState('');

    useEffect(() => {
        // Verifica se o usuário já fechou o banner anteriormente
        const isDismissed = localStorage.getItem('app-banner-dismissed');
        if (isDismissed) return;

        const userAgent = navigator.userAgent || navigator.vendor || window.opera;

        // Lógica de detecção de dispositivo
        if (/android/i.test(userAgent)) {
            setAppLink('https://play.google.com/store/apps/details?id=com.blutecnologias.appcamara&pcampaignid=web_share');
            setShowBanner(true);
        } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            setAppLink('https://apps.apple.com/br/app/cm-paraipaba/id6769832252');
            setShowBanner(true);
        }
    }, []);

    const dismissBanner = () => {
        localStorage.setItem('app-banner-dismissed', 'true');
        setShowBanner(false);
    };

    return (
        <footer className="footer">
            {showBanner && (
                <div className="footer-app-banner">
                    <p>Acesse nossos serviços com mais facilidade pelo nosso aplicativo oficial!</p>
                    <div className="footer-app-banner-actions">
                        <a href={appLink} target="_blank" rel="noopener noreferrer">
                            <button>Baixar Aplicativo</button>
                        </a>
                        <button onClick={dismissBanner}>Agora não</button>
                    </div>
                </div>
            )}

        <div className="footer-content">
            <div className="footer-logo">
                <img src={Logo} alt="Paraipaba" />
                <span>Portal de Serviços</span>
                <p>Câmara Municipal de Paraipaba mais próxima do cidadão, com atendimento digital e informação oficial.</p>
            </div>

            <div className="footer-contact">
                <h4>Contato</h4>
                <p className="footer-contact-item">
                    <LiaMapMarkedAltSolid />
                    <span>Av. Domingos Barroso, 350 - Monte Alverne, Paraipaba - CE, 62685-000</span>
                </p>
                <p className="footer-contact-item"><LiaPhoneSolid /><span>(88) 3426-1212</span></p>
                <p className="footer-contact-item"><LiaEnvelopeSolid /><span>camara@camaraparaipaba.ce.gov.br</span></p>
            </div>

            <div className="footer-links">
                <h4>Nossos Serviços</h4>
                <ul>
                    <li><a href="/login">Entrar <LiaArrowRightSolid /></a></li>
                    <li><a href="/cadastro">Criar uma Conta <LiaArrowRightSolid /></a></li>
                    {/* <li>Procon</li> */}
                    {/* <li>Atendimento Jurídico</li> */}
                    <li><a href="/login">Balcão do Cidadão <LiaArrowRightSolid /></a></li>
                    <li><a href="https://esic.camaraparaipaba.ce.gov.br/ouvidoria" target="_blank" rel="noopener noreferrer">Ouvidoria <LiaArrowRightSolid /></a></li>
                    <li><a href="/login">Procuradoria da Mulher <LiaArrowRightSolid /></a></li>
                    {/* <li>Vereadores</li> */}
                </ul>
            </div>

            <div className="footer-app-links">
                <div className="footer-app-card">
                    <span><LiaShieldAltSolid /> App oficial</span>
                    <h4>Leve os serviços no celular</h4>
                    <p>Baixe o aplicativo da Câmara e acompanhe suas solicitações com mais praticidade.</p>
                </div>
                <div className="app-badges">
                    <a className="app-badge app-badge--apple" href="https://apps.apple.com/br/app/cm-paraipaba/id6769832252" target="_blank" rel="noopener noreferrer">
                        Baixar na App Store
                    </a>
                    <a className="app-badge app-badge--google" href="https://play.google.com/store/apps/details?id=com.blutecnologias.appcamara&pcampaignid=web_share" target="_blank" rel="noopener noreferrer">
                        Disponível no Google Play
                    </a>
                </div>
            </div>
        </div>
        <div className="footer-bottom">
            <p>
                Copyright © 2025. Todos os direitos reservados.
                <a href="https://blu-tecnologias-site.vercel.app" target="_blank" rel="noopener noreferrer">
                    Desenvolvido por Blu Tecnologias
                </a>
            </p>
        </div>
    </footer>
    );
};

export default Footer;
