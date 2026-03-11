import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext'; // Para obter dados do usuário
import Sidebar from '../../components/Sidebar'; 
import { ref, get } from 'firebase/database'; // Importa o Realtime Database
import { db } from '../../firebase'; // Importa a instância do db
import {
    LiaBookOpenSolid,
    LiaBalanceScaleLeftSolid,
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaFemaleSolid,
    LiaUsersSolid,
} from "react-icons/lia";

// --- Componente: Card de Serviço no Grid ---
const ServiceCard = ({ icon, title, path, navigate }) => {
    return (
        <div 
            className="service-card-dashboard" 
            onClick={() => navigate(path)}
        >
            <span className="card-icon-dashboard">{icon}</span>
            <p className="card-title-dashboard">{title}</p>
        </div>
    );
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
        { title: 'Procon', icon: <LiaBookOpenSolid />, path: '/procon-atendimentos' },
        { title: 'Atendimento Jurídico', icon: <LiaBalanceScaleLeftSolid />, path: '/juridico' },
        { title: 'Balcão do Cidadão', icon: <LiaUserFriendsSolid />, path: '/balcao' },
        { title: 'Ouvidoria', icon: <LiaUserAstronautSolid />, path: '/ouvidoria' },
        { title: 'Procuradoria da Mulher', icon: <LiaFemaleSolid />, path: '/procuradoria' },
        { title: 'Vereadores', icon: <LiaUsersSolid />, path: '/vereadores' },
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
        const userRef = ref(db, 'users/' + userId);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                setLoggedInUserData({
                    uid: userId,
                    nome: userData.name || user.email || 'Usuário',
                    email: user.email,
                    tipo: userData.tipo || 'Cidadão', // Busca o tipo do banco de dados
                    avatar: userData.avatarBase64 || null, // Adiciona o avatar ao estado
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
            <div className="dashboard-content">
               {/* Cabeçalho da Imagem */}
                <header className="page-header-container">
                    
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Seja bem-vindo ao Portal de Serviços</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || user?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar">
                            {loggedInUserData?.avatar ? (
                                <img src={`data:image/png;base64,${loggedInUserData.avatar}`} alt="Avatar do usuário" className='user-avatar' />
                            ) : (
                                <div className="user-avatar-placeholder" /> // Mantém um placeholder se não houver imagem
                            )}
                        </div>
                    </div>
                    
                </header>

                <main className="services-grid-main">
                    {serviceGridItems.map((item) => (
                        <ServiceCard 
                            key={item.title}
                            icon={item.icon}
                            title={item.title}
                            path={item.path}
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