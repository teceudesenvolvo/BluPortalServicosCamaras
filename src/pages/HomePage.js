import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaVoteYeaSolid,
    LiaArrowRightSolid,
} from "react-icons/lia";


import Footer from '../components/Footer'; // Importa o novo componente
import VereadoresSlider from '../components/VereadoresSlider'; // Importa o slider
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

                <section className="vereadores-slider-section">
                    <VereadoresSlider />
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default HomePage;