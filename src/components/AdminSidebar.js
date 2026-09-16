import { canAccessModule } from '../config/rolePermissions';
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
    LiaBellSolid,
    LiaClipboardListSolid,
    LiaNewspaperSolid,
    LiaCommentsSolid,
    LiaTvSolid,
    LiaStarSolid,
    LiaCogSolid,
    LiaBuildingSolid,
    LiaFileAltSolid,
    LiaHandshakeSolid,
    LiaGraduationCapSolid,
    LiaUserTieSolid,
    LiaLandmarkSolid
} from "react-icons/lia";
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore } from '../firebase';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { countUnreadAdminMessages } from '../utils/adminMessages';
import { useSystemControl } from '../contexts/SystemControlContext';
import { findModuleByPath, isSystemRootEmail } from '../config/systemModules';

const MESSAGE_MENU_AREAS = [
    { role: 'Balcão', collectionName: 'balcao-cidadao' },
    { role: 'Ouvidoria', collectionName: 'ouvidoria' },
    { role: 'Procuradoria', collectionName: 'procuradoria-mulher' },
];

// --- Componente: Ítem do Menu Lateral (interno ao Sidebar) ---
const AdminSidebarItem = ({ badge, icon, title, path, isActive, onClick }) => (
    <div
        className={`sidebar-item ${isActive ? 'active' : ''}`}
        onClick={() => onClick(path)}
    >
        <span className="sidebar-icon">
            {icon}
            {badge > 0 && <span className="sidebar-icon-badge">{badge > 99 ? '99+' : badge}</span>}
        </span>
        <span className="sidebar-title">
            {title}
            {badge > 0 && <span className="sidebar-title-badge">{badge > 99 ? '99+' : badge}</span>}
        </span>
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
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
    const { settings } = useSystemControl();

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

    useEffect(() => {
        const fetchUnreadMessagesCount = async () => {
            if (!userType || userType === 'Cidadão') {
                setUnreadMessagesCount(0);
                return;
            }

            const visibleAreas = canAccessModule(settings, userType, userEmail, 'mensagens', 'admin')
                ? MESSAGE_MENU_AREAS
                : MESSAGE_MENU_AREAS.filter(area => area.role === userType);

            if (visibleAreas.length === 0) {
                setUnreadMessagesCount(0);
                return;
            }

            try {
                const snapshots = await Promise.all(
                    visibleAreas.map(area => getDocs(query(collection(firestore, area.collectionName), limit(300)))),
                );

                const total = snapshots.reduce((sum, snapshot) => (
                    sum + snapshot.docs.reduce((areaSum, docSnap) => (
                        areaSum + countUnreadAdminMessages(docSnap.data().messages)
                    ), 0)
                ), 0);

                setUnreadMessagesCount(total);
            } catch (error) {
                // Um perfil sem acesso a uma das áreas não deve produzir uma
                // rejeição não tratada nem repetir o mesmo erro a cada montagem.
                if (error?.code !== 'permission-denied') {
                    console.error('Erro ao buscar mensagens não lidas do menu:', error);
                }
                setUnreadMessagesCount(0);
            }
        };

        fetchUnreadMessagesCount();
    }, [settings, userEmail, userType]);

    const allMenuItems = [
        // { title: 'Atendimentos Jurídicos', icon: <LiaGavelSolid />, path: '/admin-juridico', roles: ['Admin', 'Juridico'] },
        { title: 'Balcão do Cidadão', icon: <LiaUserFriendsSolid />, path: '/admin-balcao', roles: ['Admin', 'Balcão'] },
        { title: 'Recepção', icon: <LiaClipboardListSolid />, path: '/recepcao', roles: ['Admin', 'Balcão', 'Recepção', 'Microempreendedor'] },
        { title: 'Mensagens', icon: <LiaCommentsSolid />, path: '/admin-mensagens', roles: ['Admin', 'Administrador', 'Balcão', 'Ouvidoria', 'Procuradoria'] },
        { title: 'Ouvidoria', icon: <LiaUserAstronautSolid />, path: '/admin-ouvidoria', roles: ['Admin', 'Ouvidoria'] },
        { title: 'e-SIC', icon: <LiaFileAltSolid />, path: '/admin-esic', roles: ['Admin', 'Administrador', 'Ouvidoria'] },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/admin-procuradoria', roles: ['Admin', 'Procuradoria'] },
        { title: 'PROCON', icon: <LiaBuildingSolid />, path: '/admin-procon', roles: ['Admin', 'Procon'] },
        { title: 'Microempreendedor', icon: <LiaHandshakeSolid />, path: '/admin-microempreendedor', roles: ['Admin', 'Microempreendedor'] },
        { title: 'Escola: cursos e conteúdo', icon: <LiaGraduationCapSolid />, path: '/admin-escola-parlamento', roles: ['Admin', 'Escola do Parlamento'] },
        { title: 'Avaliações', icon: <LiaStarSolid />, path: '/admin-avaliacoes', roles: ['Admin', 'Balcão'] },
        { title: 'Vereadores', icon: <LiaUserTieSolid />, path: '/admin-vereadores', roles: ['Admin', 'Vereador'] },
        { title: 'Gabinete Vereador', icon: <LiaLandmarkSolid />, path: '/admin-agenda-vereadores', roles: ['Admin', 'Vereador', 'Assessor'] },
        { title: 'Gestão legislativa', icon: <LiaLandmarkSolid />, path: '/admin-legislativo', roles: ['Admin', 'Secretaria Legislativa', 'Vereador', 'Assessor', 'Juridico'] },
        { title: 'PIEL', icon: <LiaUsersSolid />, path: '/admin-piel', roles: ['Admin'] },
        { title: 'Notícias do Site', icon: <LiaNewspaperSolid />, path: '/admin-noticias', roles: ['Admin'] },
        { title: 'TV Câmara', icon: <LiaTvSolid />, path: '/admin-tv-camara', roles: ['Admin'] },
        { title: 'Controle do Sistema', icon: <LiaCogSolid />, path: '/controle-sistema', roles: ['Admin'] },
        { title: 'Gerenciar Usuários', icon: <LiaUsersCogSolid />, path: '/admin-users', roles: ['Admin'] },
        { title: 'Histórico Notificações', icon: <LiaBellSolid />, path: '/admin-notifications', roles: ['Admin'] },
        { title: 'Perfil', icon: <LiaUser />, path: '/perfil', roles: ['Admin', 'Vereador', 'Assessor', 'Juridico', 'Procuradoria', 'Procon', 'Ouvidoria', 'Balcão', 'Recepção', 'Microempreendedor', 'Escola do Parlamento'] },
    ];

    // Filtra os itens do menu com base no tipo de usuário
    const visibleMenuItems = allMenuItems.filter(item => {
        const isSystemOwner = isSystemRootEmail(settings, userEmail);
        if (item.path === '/controle-sistema') return isSystemOwner;

        // Itens de infraestrutura aparecem apenas para os usuários root configurados no CMS.
        const systemPaths = ['/admin-mail', '/admin-notifications'];
        if (systemPaths.includes(item.path)) {
            return isSystemOwner;
        }

        const module = findModuleByPath(item.path);
        if (module) return canAccessModule(settings, userType, userEmail, module.id, 'admin');

        if (isSystemOwner) return true;
        if (userType === 'Admin') {
            return true; // Admin vê tudo
        }
        if (item.roles) {
            return item.roles.includes(userType);
        }
        return false;
    });
    const menuGroups = [
        { title: 'Atendimento', paths: ['/admin-balcao', '/recepcao', '/admin-mensagens', '/admin-ouvidoria', '/admin-esic', '/admin-procuradoria', '/admin-procon', '/admin-microempreendedor'] },
        { title: 'Gestão institucional', paths: ['/admin-escola-parlamento', '/admin-avaliacoes', '/admin-vereadores', '/admin-agenda-vereadores', '/admin-legislativo', '/admin-piel', '/admin-noticias', '/admin-tv-camara'] },
        { title: 'Sistema', paths: ['/controle-sistema', '/admin-users', '/admin-notifications', '/perfil'] },
    ].map(group => ({ ...group, items: visibleMenuItems.filter(item => group.paths.includes(item.path)) }));

    const handleItemClick = (path) => {
        navigate(path);
        setIsMobileExpanded(false); // Fecha o menu ao navegar
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

            <div className="sidebar-menu">
                {loadingRoles ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Carregando...</div>
                ) : (
                    menuGroups.map(group => group.items.length > 0 && <section className="sidebar-menu-group" key={group.title}><span className="sidebar-group-title">{group.title}</span>{group.items.map(item => <AdminSidebarItem badge={item.path === '/admin-mensagens' ? unreadMessagesCount : 0} key={item.title} icon={item.icon} title={item.title} path={item.path} isActive={location.pathname === item.path} onClick={handleItemClick} />)}</section>)
                )}
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

export default AdminSidebar;
