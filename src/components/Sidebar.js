import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Logo from '../assets/logo-paraipaba.png';
import {
    LiaHomeSolid,
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaFemaleSolid,
    LiaUser,
    LiaBarsSolid,
    LiaTimesSolid,
    LiaTvSolid,
    LiaCommentsSolid,
} from "react-icons/lia";
//  import { FaGooglePlay, FaApple } from "react-icons/fa";


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
    const [isHovered, setIsHovered] = useState(false);
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);

    // Itens do menu agora são definidos diretamente aqui
    const menuItems = [
        { title: 'Início', icon: <LiaHomeSolid />, path: '/dashboard' },
        // { title: 'Procon', icon: <LiaBookOpenSolid />, path: '/procon-atendimentos' },
        // { title: 'Atendimento Jurídico', icon: <LiaBalanceScaleLeftSolid />, path: '/juridico' },
        { title: 'Balcão do Cidadão', icon: <LiaUserFriendsSolid />, path: '/balcao' },
        { title: 'Mensagens', icon: <LiaCommentsSolid />, path: '/mensagens' },
        { title: 'Ouvidoria', icon: <LiaUserAstronautSolid />, path: '/ouvidoria' },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/procuradoria' },
        { title: 'TV Câmara', icon: <LiaTvSolid />, path: '/tv-camara' },
        // { title: 'Vereadores', icon: <LiaUsersSolid />, path: '/vereadores' },
        { title: 'Perfil', icon: <LiaUser />, path: '/perfil' },
    ];

    const handleItemClick = (path) => {
        onItemClick(path);
        setIsMobileExpanded(false);
    };

    const toggleMobileMenu = () => {
        setIsMobileExpanded(!isMobileExpanded);
    };

    return (
        <>
            <button
                className={`mobile-sidebar-trigger ${isMobileExpanded ? 'hidden' : ''}`}
                onClick={toggleMobileMenu}
                aria-label={isMobileExpanded ? 'Fechar menu' : 'Abrir menu'}
            >
                <LiaBarsSolid size={24} />
            </button>

            {/* Overlay para fechar o menu ao clicar fora no mobile */}
            {isMobileExpanded && (
                <div className="sidebar-overlay" onClick={toggleMobileMenu} />
            )}
        <div 
            className={`dashboard-sidebar ${isHovered || isMobileExpanded ? 'expanded' : 'collapsed'}`}
            onMouseEnter={() => {
                if (window.innerWidth > 900) setIsHovered(true);
            }}
            onMouseLeave={() => {
                if (window.innerWidth > 900) setIsHovered(false);
            }}
            onClick={() => {
                // No mobile, se o usuário clicar fora do botão mas na barra (que é 100% largura), não fazemos nada indesejado
                if (window.innerWidth <= 900 && !isMobileExpanded) return;
            }}
        >
            <div className="sidebar-header">
                <button className="sidebar-hamburger-btn" onClick={toggleMobileMenu}>
                    {isMobileExpanded ? <LiaTimesSolid size={24} /> : <LiaBarsSolid size={24} />}
                </button>

                <img
                    src={Logo}
                    alt="Logo Paraipaba"
                    className="sidebar-logo"
                />
            </div>

            {/* O menu agora permanece sempre visível através dos ícones */}
            <div className="sidebar-menu">
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.title} // A chave continua sendo o título
                        icon={item.icon}
                        title={item.title}
                        path={item.path}
                        isActive={location.pathname === item.path}
                        onClick={handleItemClick}
                    />
                ))}
            </div>

            <div className="sidebar-app-download">
                <a
                    href="https://blu-tecnologias-site.vercel.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-dev-link"
                >
                    Desenvolvido por Blu Tecnologias
                </a>
            </div>

        </div>
        </>
    );
};

export default Sidebar;
