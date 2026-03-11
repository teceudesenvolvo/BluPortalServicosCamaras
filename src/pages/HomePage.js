import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LiaBookOpenSolid,
    LiaBalanceScaleLeftSolid,
    LiaUserFriendsSolid,
    LiaFemaleSolid,
    LiaUsersSolid,
} from "react-icons/lia";


import Footer from '../components/Footer'; // Importa o novo componente
import VereadoresSlider from '../components/VereadoresSlider'; // Importa o slider
import Foto from '../assets/fachada2-cm.jpg'; // Imagem placeholder
// Componente: Item do Serviço (Todos vão para o Login)
const ServiceButton = ({ icon, title, navigate }) => {
    return (
        <button
            className="service-btn"
            onClick={() => navigate('/login')}
        >
            <div className="service-icon">{icon}</div>
            <p className="service-title">{title}</p>
        </button>
    );
};

// Componente Principal: Home Page
const HomePage = () => {
    const navigate = useNavigate();

    // Simulação dos ícones dos serviços (Usando Unicode ou Font Icons)
    const icons = {
        procon: <LiaBookOpenSolid />,
        juridico: <LiaBalanceScaleLeftSolid />,
        balcao: <LiaUserFriendsSolid />,
        procuradoria: <LiaFemaleSolid />,
        vereadores: <LiaUsersSolid />
    };

    return (
        <div className="home-page">

            {/* 1. Header Principal */}
            <header className="main-header">
                <img src={Foto} alt="Capa" className="header-bg-image" />
                <div className="header-overlay">
                    <p className="header-subtitle-top">Câmara Municipal de Pacatuba - CE</p>
                    <h1 className="header-title">Bem vindo ao Portal de Serviços</h1>
                        <p className="header-subtitle">Seu acesso fácil e rápido ao Poder Legislativo Municipal.</p>
                    <div className="header-actions">
                        <button className="btn-home-entrar" onClick={() => navigate('/login')}>Entrar</button>
                        <button className="btn-home-cadastrar" onClick={() => navigate('/cadastro')}>Cadastrar</button>
                    </div>
                </div>
            </header> 

            {/* 2. Seção de Serviços */}
            <section className="services-grid-section">
                <div className="services-grid">
                    <ServiceButton icon={icons.procon} title="Procon" navigate={navigate} />
                    <ServiceButton icon={icons.juridico} title="Atendimento Jurídico" navigate={navigate} />
                    <ServiceButton icon={icons.balcao} title="Balcão do Cidadão" navigate={navigate} />
                    <ServiceButton icon={icons.procuradoria} title="Procuradoria da Mulher" navigate={navigate} />
                    {/* O botão "Vereadores" da grade vai para Login, mas o slider abaixo é para informações abertas */}
                    <ServiceButton icon={icons.vereadores} title="Vereadores" navigate={navigate} />
                </div>
            </section>

            {/* 3. Slider de Vereadores (Com dados da API) */}
            <section className="vereadores-slider-section">
                <VereadoresSlider />
            </section>

            {/* 4. Rodapé */}
            <Footer />
        </div>
    );
};

export default HomePage;