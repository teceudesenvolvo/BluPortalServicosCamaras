import React, { useState, useEffect } from 'react';
import Logo from '../assets/logo-paraipaba.png';
import AppStore from '../assets/AppStore.png';
import GooglePlay from '../assets/GooglePlay.png';


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
                <div style={promptStyles.banner}>
                    <p style={promptStyles.text}>Acesse nossos serviços com mais facilidade pelo nosso aplicativo oficial!</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <a href={appLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <button style={promptStyles.downloadButton}>Baixar Aplicativo</button>
                        </a>
                        <button onClick={dismissBanner} style={promptStyles.dismissButton}>Agora não</button>
                    </div>
                </div>
            )}

        <div className="footer-content">
            <div className="footer-logo">
                <img src={Logo} alt="Paraipaba" style={{ height: '150px', marginTop: '15px' }} />
            </div>

            <div className="footer-contact">
                <h4>Contato</h4>
                <p>
                    <b>Endereço:</b> Av. Domingos Barroso, 350 - Monte Alverne, Paraipaba - CE, 62685-000
                </p>
                <p><b>Telefone:</b>(88) 3426-1212</p>
                <p><b>Email:</b>  camara@camaraparaipaba.ce.gov.br</p>
            </div>

            <div className="footer-links">
                <h4>Nossos Serviços</h4>
                <ul>
                    <li>Entrar</li>
                    <li>Criar uma Conta</li>
                    {/* <li>Procon</li> */}
                    {/* <li>Atendimento Jurídico</li> */}
                    <li>Balcão do Cidadão</li>
                    <li>Ouvidoria</li>
                    <li>Procuradoria da Mulher</li>
                    {/* <li>Vereadores</li> */}
                </ul>
            </div>

            <div className="footer-app-links">
               
                <div className="app-badges" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-10px' }}>
                    <p>Baixe nosso aplicativo:</p>
                    <a href="https://apps.apple.com/br/app/cm-paraipaba/id6769832252" target="_blank" rel="noopener noreferrer">
                        <img src={AppStore} alt="App Store" style={{ width: '150px'}} />
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=com.blutecnologias.appcamara&pcampaignid=web_share" target="_blank" rel="noopener noreferrer">
                        <img src={GooglePlay} alt="Google Play" style={{ width: '150px' }} />
                    </a>
                </div>
            </div>
        </div>
        <div className="footer-bottom">
            <p>
                Copyright © 2025. Todos os direitos reservados. <br/>
                Desenvolvido por Blu Tecnologias.
            </p>
        </div>
    </footer>
    );
};

const promptStyles = {
    banner: {
        backgroundColor: '#00128A',
        color: 'white',
        padding: '10px 20px',
        textAlign: 'center',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '15px',
        flexWrap: 'wrap',
        marginBottom: '20px', // Adiciona um espaço antes do conteúdo do rodapé
    },
    text: {
        margin: 0,
        fontSize: '1rem',
    },
    downloadButton: {
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        padding: '8px 15px',
        borderRadius: '5px',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: 'bold',
        transition: 'background-color 0.3s ease',
    },
    dismissButton: {
        backgroundColor: 'transparent',
        color: 'white',
        border: '1px solid white',
        padding: '8px 15px',
        borderRadius: '5px',
        cursor: 'pointer',
        fontSize: '0.9rem',
        transition: 'background-color 0.3s ease, color 0.3s ease',
    }
};
export default Footer;