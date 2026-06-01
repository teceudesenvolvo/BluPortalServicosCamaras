import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate,  } from 'react-router-dom';
import Logo from '../assets/logo-paraipaba.png';
import {
    LiaUserFriendsSolid,
    LiaUsersCogSolid,
    LiaUserAstronautSolid,
    LiaFemaleSolid,
    LiaUser,
    LiaBarsSolid,
    LiaTimesSolid,
    LiaUsersSolid,
    LiaCloudDownloadAltSolid,
    LiaBellSolid,
    LiaNewspaperSolid
} from "react-icons/lia";
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// --- Componente: Ítem do Menu Lateral (interno ao Sidebar) ---
const AdminSidebarItem = ({ icon, title, path, isActive, onClick }) => (
    <div
        className={`sidebar-item ${isActive ? 'active' : ''}`}
        onClick={() => onClick(path)}
    >
        <span className="sidebar-icon">{icon}</span>
        <span className="sidebar-title">{title}</span>
    </div>
);

// --- Componente Principal: AdminSidebar ---
const AdminSidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isHovered, setIsHovered] = useState(false);
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);
    const [loadingRoles, setLoadingRoles] = useState(true);
    const [userType, setUserType] = useState(null);
    const [userEmail, setUserEmail] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserEmail(user.email);
                // Se o usuário estiver logado, busca o perfil no Firestore
                const userRef = doc(firestore, 'users', user.uid);
                try {
                    const snapshot = await getDoc(userRef);
                    if (snapshot.exists()) {
                        const userData = snapshot.data();
                        setUserType(userData.tipo || 'Cidadão');
                    } else {
                        setUserType('Cidadão'); // Define um padrão caso não encontre o perfil
                    }
                } catch (error) {
                    console.error("Erro ao buscar tipo de usuário:", error);
                    setUserType('Cidadão'); // Define um padrão em caso de erro
                }
            } else {
                setUserType(null); // Limpa o tipo se o usuário deslogar
                setUserEmail(null);
            }
            setLoadingRoles(false);
        });
        return () => unsubscribe(); // Limpa o listener ao desmontar o componente
    }, []); // O array vazio faz com que o efeito rode apenas uma vez

    const allMenuItems = [
        // { title: 'Procon', icon: <LiaTachometerAltSolid />, path: '/admin-procon', roles: ['Admin', 'Procon'] },
        // { title: 'Atendimentos Jurídicos', icon: <LiaGavelSolid />, path: '/admin-juridico', roles: ['Admin', 'Juridico'] },
        { title: 'Balcão do Cidadão', icon: <LiaUserFriendsSolid />, path: '/admin-balcao', roles: ['Admin', 'Balcão'] },
        { title: 'Notícias do Site', icon: <LiaNewspaperSolid />, path: '/admin-noticias', roles: ['Admin'] },
        { title: 'Ouvidoria', icon: <LiaUserAstronautSolid />, path: '/admin-ouvidoria', roles: ['Admin', 'Ouvidoria'] },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/admin-procuradoria', roles: ['Admin', 'Procuradoria'] },
        { title: 'Vereadores', icon: <LiaUserFriendsSolid />, path: '/admin-vereadores', roles: ['Admin', 'Vereador'] },
        { title: 'PIEL', icon: <LiaUsersSolid />, path: '/admin-piel', roles: ['Admin'] },
        { title: 'Gerenciar Usuários', icon: <LiaUsersCogSolid />, path: '/admin-users', roles: ['Admin'] },
        { title: 'Histórico Notificações', icon: <LiaBellSolid />, path: '/admin-notifications', roles: ['Admin'] },
        { title: 'Migração Firestore', icon: <LiaCloudDownloadAltSolid />, path: '/admin-migration', roles: ['Admin'] },
        { title: 'Perfil', icon: <LiaUser />, path: '/perfil', roles: ['Admin', 'Vereador', 'Juridico', 'Procuradoria', 'Procon', 'Ouvidoria', 'Balcão'] },
    ];

    // Filtra os itens do menu com base no tipo de usuário
    const visibleMenuItems = allMenuItems.filter(item => {
        // Restrição específica: Itens de sistema aparecem apenas para o email leo@gmail.com
        const systemPaths = ['/admin-migration', '/admin-mail', '/admin-notifications'];
        if (systemPaths.includes(item.path)) {
            return userEmail === 'leo@gmail.com';
        }

        if (userType === 'Admin') {
            return true; // Admin vê tudo
        }
        if (item.roles) {
            return item.roles.includes(userType);
        }
        return false;
    });

    const handleItemClick = (path) => {
        navigate(path);
        setIsMobileExpanded(false); // Fecha o menu ao navegar
    };

    const toggleMobileMenu = () => {
        setIsMobileExpanded(!isMobileExpanded);
    };

    return (
        <>
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

            <div className="sidebar-menu">
                {loadingRoles ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Carregando...</div>
                ) : (
                    visibleMenuItems.map((item) => (
                        <AdminSidebarItem
                            key={item.title}
                            icon={item.icon}
                            title={item.title}
                            path={item.path}
                            isActive={location.pathname === item.path}
                            onClick={handleItemClick}
                        />
                    ))
                )}
            </div>
        </div>
        </>
    );
};

export default AdminSidebar;