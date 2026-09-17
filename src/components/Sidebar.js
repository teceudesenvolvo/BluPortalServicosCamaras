import { useAuth } from '../contexts/FirebaseAuthContext';
import { canAccessModule } from '../config/rolePermissions';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../assets/logo-paraipaba.png';
import {
    LiaHomeSolid,
    LiaFemaleSolid,
    LiaUser,
    LiaBarsSolid,
    LiaTimesSolid,
    LiaTvSolid,
    LiaCommentsSolid,
    LiaShieldAltSolid,
    LiaBookSolid,
    LiaStoreSolid,
    LiaHandshakeSolid,
    LiaGraduationCapSolid,
    LiaLandmarkSolid,
    LiaFileAltSolid,
    LiaHeadsetSolid,
    LiaNewspaperSolid,
    LiaClipboardListSolid,
} from "react-icons/lia";
import { useSystemControl } from '../contexts/SystemControlContext';
import { findModuleByPath } from '../config/systemModules';
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
    const navigate = useNavigate();
    const [isHovered, setIsHovered] = useState(false);
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);
    const { settings } = useSystemControl();
    const { currentUser, role } = useAuth();

    // Itens do menu agora são definidos diretamente aqui
    const menuItems = [
        { title: 'Início', icon: <LiaHomeSolid />, path: '/dashboard' },
        { title: 'Balcão do Cidadão', icon: <LiaStoreSolid />, path: '/balcao' },
        { title: 'Protocolos', icon: <LiaClipboardListSolid />, path: '/protocolo' },
        { title: 'Ouvidoria', icon: <LiaHeadsetSolid />, path: '/ouvidoria' },
        { title: 'e-SIC', icon: <LiaFileAltSolid />, path: '/esic' },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/procuradoria' },
        { title: 'PROCON', icon: <LiaShieldAltSolid />, path: '/procon' },
        { title: 'Microempreendedor', icon: <LiaHandshakeSolid />, path: '/microempreendedor' },
        { title: 'Escola do Parlamento', icon: <LiaGraduationCapSolid />, path: '/escola-parlamento' },
        { title: 'Meus cursos', icon: <LiaBookSolid />, path: '/escola-parlamento/meus-cursos' },
        { title: 'TV Câmara', icon: <LiaTvSolid />, path: '/tv-camara' },
        { title: 'Notícias da Câmara', icon: <LiaNewspaperSolid />, path: '/noticias' },
        { title: 'Mensagens', icon: <LiaCommentsSolid />, path: '/mensagens' },
        { title: 'Vereadores', icon: <LiaLandmarkSolid />, path: '/vereadores' },
        { title: 'Perfil', icon: <LiaUser />, path: '/perfil' },
    ];
    const visibleMenuItems = menuItems.filter(item => {
        const module = findModuleByPath(item.path);
        return !module || canAccessModule(settings, role, currentUser?.email, module.id, 'portal');
    });
    const menuGroups = [
        { title: 'Atendimento', paths: ['/dashboard', '/balcao', '/protocolo', '/ouvidoria', '/esic', '/procuradoria', '/procon', '/microempreendedor'] },
        { title: 'Conteúdo e formação', paths: ['/escola-parlamento', '/escola-parlamento/meus-cursos', '/tv-camara', '/noticias', '/vereadores'] },
        { title: 'Minha conta', paths: ['/mensagens', '/perfil'] },
    ].map(group => ({ ...group, items: visibleMenuItems.filter(item => group.paths.includes(item.path)) }));

    const handleItemClick = (path) => {
        // Algumas telas reutilizam o menu sem informar um callback. Nesse
        // caso, a própria barra realiza a navegação padrão sem interromper a
        // interface com uma exceção.
        if (typeof onItemClick === 'function') {
            onItemClick(path);
        } else {
            navigate(path);
        }
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
                    src={settings.branding?.compactLogoUrl || settings.branding?.logoUrl || Logo}
                    alt={settings.branding?.logoAlt || 'Logo da Câmara'}
                    className="sidebar-logo"
                />
            </div>

            {/* O menu agora permanece sempre visível através dos ícones */}
            <div className="sidebar-menu">
                {menuGroups.map(group => group.items.length > 0 && <section className="sidebar-menu-group" key={group.title}><span className="sidebar-group-title">{group.title}</span>{group.items.map(item => <SidebarItem key={item.title} icon={item.icon} title={item.title} path={item.path} isActive={location.pathname === item.path || (item.path === '/escola-parlamento/meus-cursos' && location.pathname.startsWith('/escola-parlamento/curso/'))} onClick={handleItemClick} />)}</section>)}
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
