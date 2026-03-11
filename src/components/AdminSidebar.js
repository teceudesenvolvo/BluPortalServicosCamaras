import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate,  } from 'react-router-dom';
import Logo from '../assets/logo-pacatuba.png';
import {
    LiaTachometerAltSolid,
    LiaGavelSolid,
    LiaUserFriendsSolid,
    LiaUsersCogSolid,
    LiaUserAstronautSolid,
    LiaFemaleSolid,
    LiaUsersSolid,
    LiaUser,
    LiaBarsSolid,
    LiaTimesSolid,
} from "react-icons/lia";
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { ref, get } from 'firebase/database';

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
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userType, setUserType] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Se o usuário estiver logado, busca o perfil no Realtime Database
                const userRef = ref(db, `users/${user.uid}`);
                try {
                    const snapshot = await get(userRef);
                    if (snapshot.exists()) {
                        const userData = snapshot.val();
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
            }
        });
        return () => unsubscribe(); // Limpa o listener ao desmontar o componente
    }, []); // O array vazio faz com que o efeito rode apenas uma vez

    const allMenuItems = [
        { title: 'Procon', icon: <LiaTachometerAltSolid />, path: '/admin-procon', roles: ['Admin', 'Procon'] },
        { title: 'Atendimentos Jurídicos', icon: <LiaGavelSolid />, path: '/admin-juridico', roles: ['Admin', 'Juridico'] },
        { title: 'Balcão do Cidadão', icon: <LiaUserFriendsSolid />, path: '/admin-balcao', roles: ['Admin', 'Balcão'] },
        { title: 'Ouvidoria', icon: <LiaUserAstronautSolid />, path: '/admin-ouvidoria', roles: ['Admin', 'Ouvidoria'] },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/admin-procuradoria', roles: ['Admin', 'Procuradoria'] },
        { title: 'Solicitações Vereadores', icon: <LiaUsersSolid />, path: '/admin-vereadores', roles: ['Admin', 'Vereador'] },
        { title: 'Gerenciar Usuários', icon: <LiaUsersCogSolid />, path: '/admin-users', roles: ['Admin'] },
        { title: 'Perfil', icon: <LiaUser />, path: '/perfil', roles: ['Admin', 'Vereador', 'Juridico', 'Procuradoria', 'Procon', 'Ouvidoria', 'Balcão'] },
    ];

    // Filtra os itens do menu com base no tipo de usuário
    const visibleMenuItems = allMenuItems.filter(item => {
        if (userType === 'Admin') {
            return true; // Admin vê tudo
        }
        if (item.roles) {
            return item.roles.includes(userType);
        }
        return false;
    });

    const handleMobileMenuToggle = () => setMobileMenuOpen(!isMobileMenuOpen);

    const handleItemClick = (path) => {
        navigate(path);
        setMobileMenuOpen(false);
    };

    return (
        <div className="dashboard-sidebar">
            <div className="sidebar-header">
                <img src={Logo} alt="Logo Pacatuba" className="sidebar-logo" style={{ height: '120px', width: 'auto' }} />
                <button className="sidebar-hamburger-btn" onClick={handleMobileMenuToggle}>
                    {isMobileMenuOpen ? <LiaTimesSolid size={24} /> : <LiaBarsSolid size={24} />}
                </button>
            </div>

            <div className={`sidebar-menu ${isMobileMenuOpen ? 'is-open' : ''}`}>
                {visibleMenuItems.map((item) => (
                    <AdminSidebarItem
                        key={item.title}
                        icon={item.icon}
                        title={item.title}
                        path={item.path}
                        isActive={location.pathname === item.path}
                        onClick={handleItemClick}
                    />
                ))}
            </div>
        </div>
    );
};

export default AdminSidebar;