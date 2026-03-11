import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo-pacatuba.png';
import {
    LiaTachometerAltSolid,
    LiaBarsSolid,
    LiaTimesSolid,
} from "react-icons/lia";
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

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

   

    const menuItems = [
        { title: 'Dashboard Procon', icon: <LiaTachometerAltSolid />, path: '/admin-procon' },
        // Adicione outras rotas de admin aqui no futuro
        // { title: 'Atendimentos Jurídicos', icon: <LiaGavelSolid />, path: '/admin-juridico' },
    ];

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
                {menuItems.map((item) => (
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