import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext'; // Para obter dados do usuário
import Sidebar from '../../components/Sidebar'; 
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { APP_HOME_MODULE_IDS, DEFAULT_APP_HOME_MODULES, SYSTEM_MODULES } from '../../config/systemModules';
import { canAccessModule } from '../../config/rolePermissions';
import {
    LiaArrowRightSolid,
    LiaBellSolid,
    LiaIdCardSolid,
    LiaInfoCircleSolid,
    LiaLandmarkSolid,
    LiaBalanceScaleLeftSolid,
    LiaGavelSolid,
    LiaStoreSolid,
    LiaHandshakeSolid,
    LiaClipboardListSolid,
    LiaCommentsSolid,
    LiaNewspaperSolid,
    LiaTvSolid,
    LiaStarSolid,
    LiaBullhornSolid,
    LiaFemaleSolid,
    LiaUserTieSolid,
    LiaUsersSolid,
    LiaGraduationCapSolid,
    LiaShieldAltSolid,
    LiaCogSolid,
    LiaFileContractSolid,
    LiaBoxesSolid,
    LiaCouchSolid,
    LiaToolsSolid,
    LiaCarSideSolid,
} from "react-icons/lia";

const MODULE_PRESENTATION = {
    esic: { icon: LiaInfoCircleSolid, accent: '#0f766e' },
    agendaVereadores: { icon: LiaLandmarkSolid, accent: '#7c3aed' },
    legislativo: { icon: LiaBalanceScaleLeftSolid, accent: '#0f4c81' },
    juridico: { icon: LiaGavelSolid, accent: '#a16207' },
    balcao: { icon: LiaStoreSolid, accent: '#025AA1' },
    microempreendedor: { icon: LiaHandshakeSolid, accent: '#047857' },
    recepcao: { icon: LiaClipboardListSolid, accent: '#c2410c' },
    mensagens: { icon: LiaCommentsSolid, accent: '#0369a1' },
    noticias: { icon: LiaNewspaperSolid, accent: '#be185d' },
    tvCamara: { icon: LiaTvSolid, accent: '#b45309' },
    avaliacoes: { icon: LiaStarSolid, accent: '#9333ea' },
    ouvidoria: { icon: LiaBullhornSolid, accent: '#0f766e' },
    procuradoria: { icon: LiaFemaleSolid, accent: '#6d28d9' },
    vereadores: { icon: LiaUserTieSolid, accent: '#1d4ed8' },
    piel: { icon: LiaUsersSolid, accent: '#0e7490' },
    escolaParlamento: { icon: LiaGraduationCapSolid, accent: '#15803d' },
    procon: { icon: LiaShieldAltSolid, accent: '#b91c1c' },
    usuarios: { icon: LiaIdCardSolid, accent: '#475569' },
    notificacoes: { icon: LiaCogSolid, accent: '#334155' },
    contratos: { icon: LiaFileContractSolid, accent: '#0f766e' },
    almoxarifado: { icon: LiaBoxesSolid, accent: '#b45309' },
    patrimonio: { icon: LiaCouchSolid, accent: '#7c3aed' },
    manutencao: { icon: LiaToolsSolid, accent: '#c2410c' },
    frotas: { icon: LiaCarSideSolid, accent: '#0369a1' },
    protocolo: { icon: LiaClipboardListSolid, accent: '#075da2' },
};

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
    const { currentUser: user, loading, role } = useAuth(); // Corrigido: usa currentUser e o renomeia para user
    const { settings } = useSystemControl();
    
    // Estados para os dados do perfil do usuário
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingLoggedInUserData] = useState(true);
    
    const configuredHomeModules = Array.isArray(settings.appHomeModules)
        ? settings.appHomeModules
        : DEFAULT_APP_HOME_MODULES;
    const visibleServiceGridItems = configuredHomeModules
        .filter((id, index, list) => APP_HOME_MODULE_IDS.includes(id) && list.indexOf(id) === index)
        .map(id => SYSTEM_MODULES.find(module => module.id === id))
        .filter(Boolean)
        .flatMap(module => {
        const portalPath = module.userPaths[0];
        const administrativeFieldModule = ['contratos', 'almoxarifado', 'patrimonio', 'manutencao', 'frotas'].includes(module.id);
        const surface = administrativeFieldModule ? 'app' : 'portal';
        const canOpenPortal = portalPath && canAccessModule(settings, role, user?.email, module.id, surface);
        const presentation = MODULE_PRESENTATION[module.id];

        if (!canOpenPortal || !presentation) return [];
        const Icon = presentation.icon;
        return [{ id: module.id, title: module.name, description: module.description, icon: <Icon />, path: portalPath, accent: presentation.accent }];
    });
    
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
                        <h1>{settings.tenant?.name}</h1>
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
                        <LiaIdCardSolid size={24} />
                        <span>
                            <strong>Perfil e segurança</strong>
                            <small>Atualize seus dados e preferências</small>
                        </span>
                    </button>
                </section>

                <div className="user-dashboard-section-heading">
                    <div>
                        <h2>Serviços em destaque</h2>
                        <p>Serviços definidos pela Câmara para a Home e liberados para o seu perfil.</p>
                    </div>
                </div>

                <main className="services-grid-main">
                    {visibleServiceGridItems.map((item) => (
                        <ServiceCard 
                            key={item.id}
                            icon={item.icon}
                            title={item.title}
                            description={item.description}
                            path={item.path}
                            accent={item.accent}
                            navigate={navigate}
                        />
                    ))}
                    {!visibleServiceGridItems.length && <p className="dashboard-empty-services">Nenhum serviço foi configurado para a Home.</p>}
                </main>
                
                <footer className="dashboard-footer">
                     Desenvolvido por Blu Tecnologias
                </footer>
            </div>
        </div>
    );
};

export default DashboardPage;
