import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext'; // Para obter dados do usuário
import Sidebar from '../../components/Sidebar'; 
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../firebase';
import {
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaFemaleSolid,
    LiaTvSolid,
    LiaArrowRightSolid,
    LiaBellSolid,
    LiaShieldAltSolid,
} from "react-icons/lia";

// --- Componente: Card de Serviço no Grid ---
const ServiceCard = ({ icon, title, description, path, navigate, accent }) => {
    return (
        <div 
            className="service-card-dashboard" 
            style={{ '--service-accent': accent }}
            onClick={() => navigate(path)}
        >
            <span className="card-icon-dashboard">{icon}</span>
            <div className="service-card-dashboard-copy">
                <p className="card-title-dashboard">{title}</p>
                <span>{description}</span>
            </div>
            <span className="service-card-dashboard-action"><LiaArrowRightSolid size={18} /></span>
        </div>
    );
};

const getAvatarSrc = (avatarBase64) => {
    if (!avatarBase64) return null;
    if (avatarBase64.startsWith('http')) return avatarBase64;
    if (avatarBase64.startsWith('data:image')) return avatarBase64;
    return `data:image/jpeg;base64,${avatarBase64}`;
};

// --- Componente Principal: DashboardPage ---
const DashboardPage = () => {
    const navigate = useNavigate(); 
    const { currentUser: user, loading } = useAuth(); // Corrigido: usa currentUser e o renomeia para user
    
    // Estados para os dados do perfil do usuário
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingLoggedInUserData] = useState(true);
    
    // 2. Dados do Grid de Serviços (Principais)
    // O ideal é que o path reflita o ítem do menu lateral
    const serviceGridItems = [
        // { title: 'Procon', icon: <LiaBookOpenSolid />, path: '/procon-atendimentos' },
        // { title: 'Atendimento Jurídico', icon: <LiaBalanceScaleLeftSolid />, path: '/juridico' },
        { title: 'Balcão do Cidadão', description: 'Solicite documentos, acompanhe pedidos e agendamentos.', icon: <LiaUserFriendsSolid />, path: '/balcao', accent: '#025AA1' },
        { title: 'Ouvidoria', description: 'Envie manifestações, dúvidas, elogios e reclamações.', icon: <LiaUserAstronautSolid />, path: '/ouvidoria', accent: '#0f766e' },
        { title: 'Procuradoria da Mulher', description: 'Acesse atendimento e acolhimento especializado.', icon: <LiaFemaleSolid />, path: '/procuradoria', accent: '#8b5cf6' },
        { title: 'TV Câmara', description: 'Assista aos conteúdos e transmissões da Câmara.', icon: <LiaTvSolid />, path: '/tv-camara', accent: '#f59e0b' },
        // { title: 'Vereadores', icon: <LiaUsersSolid />, path: '/vereadores' },
        // Pode adicionar mais se necessário
    ];
    
    // Handler para navegação do menu lateral
    const handleMenuItemClick = (path) => {
        navigate(path);
    };

    // Busca os dados do perfil do usuário no Realtime Database
    const fetchUserProfile = useCallback(async () => {
        if (loading || !user) { // Se a autenticação ainda está carregando ou não há usuário, não faz nada
            setLoadingLoggedInUserData(false); // Garante que o loading termine se não houver usuário
            return;
        }

        const userId = user.uid;
        try {
            const userRef = doc(firestore, 'users', userId);
            const snapshot = await getDoc(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.data();
                setLoggedInUserData({
                    uid: userId,
                    nome: userData.name || user.email || 'Usuário',
                    email: user.email,
                    tipo: userData.tipo || 'Cidadão', // Busca o tipo do banco de dados
                    avatar: userData.avatarUrl || userData.avatarBase64 || null, // Prioriza URL do Storage
                });
            } else {
                // Caso o perfil não exista, usa dados básicos do Auth
                setLoggedInUserData({
                    uid: userId,
                    nome: user.displayName || 'Usuário',
                    email: user.email,
                    tipo: 'Cidadão',
                    avatar: null,
                });
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
            // Opcional: setar um estado de erro aqui
        } finally {
            setLoadingLoggedInUserData(false);
        }
    }, [user, loading]); // Dependências: user, loading (do AuthContext)

    useEffect(() => {
        fetchUserProfile();
    }, [fetchUserProfile]); // fetchUserProfile é uma função memorizada, então é seguro usá-la aqui

    // Se a rota for protegida (ProtectedRoute no App.js), não é necessário 
    // verificar o usuário aqui, mas é uma boa prática.
    if (!user) {
        navigate('/login', { replace: true }); // Redireciona se não houver usuário
        return null;
    }

    return (
        <div className="dashboard-layout">
            
            {/* 1. Sidebar Fixo */}
            <Sidebar onItemClick={handleMenuItemClick} />

            {/* 2. Conteúdo Principal */}
            <div className="dashboard-content user-dashboard-content">
               {/* Cabeçalho da Imagem */}
                <header className="page-header-container user-dashboard-hero">
                    
                    <div className="header-title-section">
                        <span className="user-dashboard-eyebrow">Portal de Serviços</span>
                        <h1>Câmara Municipal de Paraipaba</h1>
                        <p>Olá, {loggedInUserData?.nome?.split(' ')[0] || 'cidadão'}. Resolva seus atendimentos de forma simples, acompanhe solicitações e acesse os serviços digitais da Câmara.</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || user?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar">
                            {getAvatarSrc(loggedInUserData?.avatar) ? (
                                <img src={getAvatarSrc(loggedInUserData.avatar)} alt="Avatar do usuário" className='user-avatar' />
                            ) : (
                                <div className="user-avatar-placeholder" /> // Mantém um placeholder se não houver imagem
                            )}
                        </div>
                    </div>
                    
                </header>

                <section className="user-dashboard-summary">
                    <button type="button" className="user-dashboard-summary-card" onClick={() => navigate('/balcao')}>
                        <LiaBellSolid size={24} />
                        <span>
                            <strong>Meus atendimentos</strong>
                            <small>Acompanhe solicitações e mensagens recentes</small>
                        </span>
                    </button>
                    <button type="button" className="user-dashboard-summary-card" onClick={() => navigate('/perfil')}>
                        <LiaShieldAltSolid size={24} />
                        <span>
                            <strong>Perfil e segurança</strong>
                            <small>Atualize seus dados e preferências</small>
                        </span>
                    </button>
                </section>

                <div className="user-dashboard-section-heading">
                    <div>
                        <h2>Serviços disponíveis</h2>
                        <p>Escolha uma área para iniciar ou acompanhar seu atendimento.</p>
                    </div>
                </div>

                <main className="services-grid-main">
                    {serviceGridItems.map((item) => (
                        <ServiceCard 
                            key={item.title}
                            icon={item.icon}
                            title={item.title}
                            description={item.description}
                            path={item.path}
                            accent={item.accent}
                            navigate={navigate}
                        />
                    ))}
                </main>
                
                <footer className="dashboard-footer">
                     Desenvolvido por Blu Tecnologias
                </footer>
            </div>
        </div>
    );
};

export default DashboardPage;
