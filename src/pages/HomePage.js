import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaVoteYeaSolid,
    LiaArrowRightSolid,
} from "react-icons/lia";


import Footer from '../components/Footer'; // Importa o novo componente
import VereadoresSlider from '../components/VereadoresSlider'; // Importa o slider
import NoticiasSlider from '../components/NoticiasSlider'; // Importa o slider de notícias
import MaintenancePopup from '../components/MaintenancePopup';
import Logo from '../assets/logo-paraipaba.png';
import HeroBackground from '../assets/fachada2-cm.jpg';

// Componente: Card de Serviço Moderno
const ServiceCard = ({ icon, title, description, onClick }) => {
    return (
        <div className="service-card" onClick={onClick}>
            <div className="service-card-icon-background">
                {icon}
            </div>
            <div className="service-card-content">
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
            <div className="service-card-action">
                <LiaArrowRightSolid />
            </div>
        </div>
    );
};

// Componente Principal: Home Page
const HomePage = () => {
    const navigate = useNavigate();
    const [showAppPopup, setShowAppPopup] = useState(false);
    const [appLink, setAppLink] = useState('');

    useEffect(() => {
        // Verifica se o popup já foi exibido/fechado anteriormente
        const hasBeenShown = localStorage.getItem('app-popup-shown');
        if (hasBeenShown) return;

        const userAgent = navigator.userAgent || navigator.vendor || window.opera;

        // Identificação do dispositivo mobile
        if (/android/i.test(userAgent)) {
            setAppLink('https://play.google.com/store/apps/details?id=com.blutecnologias.appcamara&pcampaignid=web_share');
            setShowAppPopup(true);
        } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            setAppLink('https://apps.apple.com/br/app/cm-paraipaba/id6769832252');
            setShowAppPopup(true);
        }
    }, []);

    const handleDismissPopup = () => {
        localStorage.setItem('app-popup-shown', 'true');
        setShowAppPopup(false);
    };

    const services = [
        {
            icon: <LiaUserFriendsSolid />,
            title: "Balcão do Cidadão",
            description: "Solicite documentos e agende atendimentos de forma rápida.",
            action: () => navigate('/login'),
        },
        {
            icon: <LiaVoteYeaSolid />,
            title: "Ponto de Inclusão Eleitoral (PIEL)",
            description: "Consulte informativos sobre seu título de eleitor, local de votação e mais.",
            action: () => navigate('/piel'),
        },
        {
            icon: <LiaUserAstronautSolid />,
            title: "Ouvidoria",
            description: "Envie suas sugestões, reclamações, elogios ou críticas.",
            action: () => window.open('https://esic.camaraparaipaba.ce.gov.br/ouvidoria', '_blank', 'noopener,noreferrer'),
        }
    ];

    return (
        <div className="home-page-modern">
            <MaintenancePopup />
            {showAppPopup && (
                <div style={popupStyles.overlay}>
                    <div style={popupStyles.content}>
                        <h2 style={popupStyles.title}>Baixe nosso App!</h2>
                        <p style={popupStyles.text}>Acesse os serviços da Câmara Municipal direto do seu celular com muito mais praticidade.</p>
                        <div style={popupStyles.buttonContainer}>
                            <a href={appLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                <button style={popupStyles.downloadButton} onClick={handleDismissPopup}>Baixar Agora</button>
                            </a>
                            <button style={popupStyles.dismissButton} onClick={handleDismissPopup}>Agora não</button>
                        </div>
                    </div>
                </div>
            )}
            <header className="home-header-modern" style={{ backgroundImage: `url(${HeroBackground})` }}>
                <div className="header-blur-overlay"></div>
                <div className="nav-container">
                    <nav className="home-nav">
                        <div className="nav-logo">
                            <img src={Logo} alt="Logo Câmara Municipal de Paraipaba" />
                            <span>Portal de Serviços</span>
                        </div>
                        <div className="nav-actions">
                            <button className="btn-nav-login" onClick={() => navigate('/login')}>Entrar</button>
                            <button className="btn-nav-signup" onClick={() => navigate('/cadastro')}>Cadastrar</button>
                        </div>
                    </nav>
                </div>
                <div className="hero-section">
                    <h1>O poder legislativo, <br />agora na palma da sua mão.</h1>
                    <p>Acesse serviços, acompanhe solicitações e fale com a Câmara Municipal de Paraipaba de onde estiver.</p>
                </div>
            </header>

            <main className="home-main-content">
               

                <section className="services-section-modern">
                    <h2>Nossos Serviços</h2>
                    <div className="services-container-modern">
                        {services.map(service => (
                            <ServiceCard
                                key={service.title}
                                icon={service.icon}
                                title={service.title}
                                description={service.description}
                                onClick={service.action}
                            />
                        ))}
                    </div>
                </section>
                 <section className="noticias-section-modern" style={{ padding: '40px 0 0 0', maxWidth: '1200px', margin: '0 auto' }}>
                    <NoticiasSlider />
                </section>

                <section className="vereadores-slider-section">
                    <VereadoresSlider />
                </section>

                
            </main>

            <Footer />
        </div>
    );
};

const popupStyles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10001,
        padding: '20px'
    },
    content: {
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '20px',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    },
    title: {
        color: '#00128A',
        marginBottom: '15px',
        fontSize: '1.5rem',
        fontWeight: 'bold'
    },
    text: {
        color: '#4b5563',
        marginBottom: '25px',
        lineHeight: '1.6',
        fontSize: '1rem'
    },
    buttonContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    downloadButton: {
        backgroundColor: '#00128A',
        color: 'white',
        border: 'none',
        padding: '14px',
        borderRadius: '10px',
        width: '100%',
        fontWeight: 'bold',
        cursor: 'pointer',
        fontSize: '1rem'
    },
    dismissButton: {
        backgroundColor: 'transparent',
        color: '#9ca3af',
        border: 'none',
        padding: '10px',
        cursor: 'pointer',
        fontSize: '0.9rem',
        textDecoration: 'underline'
    }
};

export default HomePage;