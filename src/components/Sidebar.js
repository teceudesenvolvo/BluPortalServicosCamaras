import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Logo from '../assets/logo-pacatuba.png';
import {
    LiaHomeSolid,
    LiaBookOpenSolid,
    LiaBalanceScaleLeftSolid,
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaFemaleSolid,
    LiaUsersSolid,
    LiaUser,
    LiaBarsSolid,
    LiaTimesSolid,
} from "react-icons/lia";
 import { FaGooglePlay, FaApple } from "react-icons/fa";


// --- Componente: Ítem do Menu Lateral (interno ao Sidebar) ---
const SidebarItem = ({ icon, title, path, isActive, onClick }) => (
    <div
        className={`sidebar-item ${isActive ? 'active' : ''}`} // A lógica de 'active' agora é interna
        onClick={() => onClick(path)}
    >
        <span className="sidebar-icon">{icon}</span>
        <span className="sidebar-title">{title}</span>
    </div>
);

// --- Componente Principal: Sidebar ---
const Sidebar = ({ onItemClick }) => {
    const location = useLocation(); // Hook para obter a rota atual
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Itens do menu agora são definidos diretamente aqui
    const menuItems = [
        { title: 'Início', icon: <LiaHomeSolid />, path: '/dashboard' },
        { title: 'Procon', icon: <LiaBookOpenSolid />, path: '/procon-atendimentos' },
        { title: 'Atendimento Jurídico', icon: <LiaBalanceScaleLeftSolid />, path: '/juridico' },
        { title: 'Balcão do Cidadão', icon: <LiaUserFriendsSolid />, path: '/balcao' },
        { title: 'Ouvidoria', icon: <LiaUserAstronautSolid />, path: '/ouvidoria' },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/procuradoria' },
        { title: 'Vereadores', icon: <LiaUsersSolid />, path: '/vereadores' },
        { title: 'Perfil', icon: <LiaUser />, path: '/perfil' },
    ];

    const handleMobileMenuToggle = () => {
        setMobileMenuOpen(!isMobileMenuOpen);
    };

    // Fecha o menu mobile ao clicar em um item
    const handleMobileItemClick = (path) => {
        onItemClick(path);
        setMobileMenuOpen(false);
    };

    return (
        <div className="dashboard-sidebar">
            <div className="sidebar-header">
                <img
                    src={Logo}
                    alt="Logo Pecatuba"
                    className="sidebar-logo"
                    style={{ height: '120px', width: 'auto' }}
                />
                {/* Botão Hambúrguer para Mobile */}
                <button className="sidebar-hamburger-btn" onClick={handleMobileMenuToggle}>
                    {isMobileMenuOpen ? <LiaTimesSolid size={24} /> : <LiaBarsSolid size={24} />}
                </button>
            </div>

            {/* O menu agora usa uma classe condicional para ser exibido no mobile */}
            <div className={`sidebar-menu ${isMobileMenuOpen ? 'is-open' : ''}`}>
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.title} // A chave continua sendo o título
                        icon={item.icon}
                        title={item.title}
                        path={item.path}
                        isActive={location.pathname === item.path}
                        onClick={handleMobileItemClick} // Usa o novo handler
                    />
                ))}
            </div>

            <div className="sidebar-app-download">
                <p className="sidebar-app-title">Baixe o aplicativo</p>
                <div className="sidebar-app-icons">
                    {/* Adicione os links para as lojas de aplicativos aqui */}
                    <a href="#!" className="app-icon-link"><FaApple size={32} /></a>
                    <a href="#!" className="app-icon-link"><FaGooglePlay size={32} /></a>
                </div>
            </div>

        </div>
    );
};

export default Sidebar;