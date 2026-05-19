import React, { useEffect } from 'react';
import Logo from '../assets/logo-paraipaba-azul.png';

/**
 * Página de Redirecionamento e Download do App
 * Detecta o sistema operacional do usuário e redireciona automaticamente para a loja correspondente.
 */
const DownloadApp = () => {
    const androidLink = 'https://play.google.com/store/apps/details?id=com.blutecnologias.appcamara&pcampaignid=web_share';
    const iosLink = 'https://apps.apple.com/br/app/cm-paraipaba/id6769832252';

    useEffect(() => {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;

        // Lógica de detecção e redirecionamento automático
        if (/android/i.test(userAgent)) {
            window.location.href = androidLink;
        } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            window.location.href = iosLink;
        }
    }, [androidLink, iosLink]);

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <img src={Logo} alt="Câmara Municipal" style={styles.logo} />
                
                <h1 style={styles.title}>Baixe nosso Aplicativo</h1>
                <p style={styles.text}>
                    Estamos identificando seu dispositivo para redirecioná-lo à loja de aplicativos oficial.
                </p>

                <div style={styles.buttonContainer}>
                    <a href={androidLink} target="_blank" rel="noopener noreferrer" style={styles.badgeLink}>
                        <img 
                            src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" 
                            alt="Disponível no Google Play" 
                            style={styles.badge} 
                        />
                    </a>
                    <a href={iosLink} target="_blank" rel="noopener noreferrer" style={styles.badgeLink}>
                        <img 
                            src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Download_on_the_App_Store_Badge.svg" 
                            alt="Baixar na App Store" 
                            style={styles.badge} 
                        />
                    </a>
                </div>

                <p style={styles.footer}>
                    Se o redirecionamento não ocorrer automaticamente em alguns segundos, clique em um dos botões acima para baixar manualmente.
                </p>
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f3f4f6',
        padding: '20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    },
    card: {
        backgroundColor: '#ffffff',
        padding: '48px 32px',
        borderRadius: '24px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        maxWidth: '450px',
        width: '100%',
        textAlign: 'center',
    },
    logo: {
        height: '200px',
        marginBottom: '32px',
    },
    title: {
        color: '#111827',
        fontSize: '1.75rem',
        fontWeight: '800',
        marginBottom: '12px',
        letterSpacing: '-0.025em',
    },
    text: {
        color: '#4b5563',
        fontSize: '1rem',
        lineHeight: '1.6',
        marginBottom: '40px',
    },
    buttonContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
    },
    badgeLink: {
        display: 'inline-block',
        transition: 'transform 0.2s ease',
    },
    badge: {
        height: '60px',
    },
    footer: {
        marginTop: '40px',
        fontSize: '0.875rem',
        color: '#9ca3af',
        lineHeight: '1.5',
    },
};

export default DownloadApp;