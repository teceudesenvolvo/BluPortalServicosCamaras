import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LiaUserFriendsSolid,
    LiaUserAstronautSolid,
    LiaVoteYeaSolid,
    LiaArrowRightSolid,
    LiaExternalLinkAltSolid,
    LiaPlayCircleSolid,
    LiaTvSolid,
    LiaShieldAltSolid,
    LiaCalendarCheckSolid,
    LiaBellSolid,
    LiaMobileAltSolid,
    LiaNewspaperSolid,
    LiaCommentsSolid,
    LiaMapMarkedAltSolid,
    LiaClipboardListSolid,
    LiaHourglassHalfSolid,
} from "react-icons/lia";


import Footer from '../components/Footer'; // Importa o novo componente
import VereadoresSlider from '../components/VereadoresSlider'; // Importa o slider
import NoticiasSlider from '../components/NoticiasSlider'; // Importa o slider de notícias
import MaintenancePopup from '../components/MaintenancePopup';
import { useSystemControl } from '../contexts/SystemControlContext';
import { buildPlayerUrl, fetchTvCamaraVideos, formatVideoDate } from '../utils/tvCamara';
import { requestFirebaseFunction } from '../services/firebaseApi';

const ServiceCard = ({ icon, title, description, tag, onClick }) => {
    return (
        <div className="service-card" onClick={onClick}>
            <div className="service-card-icon-background">
                {icon}
            </div>
            <div className="service-card-content">
                <span>{tag}</span>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
            <div className="service-card-action">
                <LiaArrowRightSolid />
            </div>
        </div>
    );
};

// Componente Principal: Home Page
const HomePage = () => {
    const { settings } = useSystemControl();
    const cmsLogo = settings.branding?.logoUrl || settings.branding?.compactLogoUrl || '';
    const home = { ...settings.home };
    const integrations = settings.integrations || {};
    const appLinks = [
        { label: 'App Store', url: integrations.iosStoreUrl },
        { label: 'Google Play', url: integrations.androidStoreUrl },
        { label: 'Baixar aplicativo', url: integrations.appDownloadUrl },
    ].filter(item => String(item.url || '').trim());
    const navigate = useNavigate();
    const [showAppPopup, setShowAppPopup] = useState(false);
    const [tvVideos, setTvVideos] = useState([]);
    const [tvLoading, setTvLoading] = useState(true);
    const [tvError, setTvError] = useState('');
    const [balcaoBalance, setBalcaoBalance] = useState(null);

    const featuredVideo = tvVideos[0] || null;
    const featuredPlayerUrl = buildPlayerUrl(featuredVideo?.videoId);

    useEffect(() => {
        let dismissed = false;
        try { dismissed = localStorage.getItem('app-popup-shown') === 'true'; } catch (_) { /* storage indisponível */ }
        setShowAppPopup(Boolean(home.appPopupEnabled && appLinks.length && !dismissed));
    }, [home.appPopupEnabled, appLinks.length]);

    useEffect(() => {
        let mounted = true;

        const fetchTvVideos = async () => {
            try {
                setTvLoading(true);
                setTvError('');

                const { videos: orderedVideos } = await fetchTvCamaraVideos();

                if (mounted) {
                    setTvVideos(orderedVideos);
                }
            } catch (error) {
                console.error('Falha ao carregar videos da TV Camara na home:', error);
                if (mounted) {
                    setTvError('Não foi possível carregar a TV Câmara agora.');
                }
            } finally {
                if (mounted) {
                    setTvLoading(false);
                }
            }
        };

        fetchTvVideos();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        const fetchBalcaoBalance = async () => {
            try {
                const response = await requestFirebaseFunction(
                    `getBalcaoPublicBalance?t=${Date.now()}`,
                    { cache: 'no-store' },
                );
                if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
                const payload = await response.json();

                if (mounted && payload?.ok) setBalcaoBalance(payload);
            } catch (error) {
                console.error('Falha ao carregar balanço do Balcão:', error);
            }
        };

        fetchBalcaoBalance();

        return () => {
            mounted = false;
        };
    }, []);

    const handleDismissPopup = () => {
        localStorage.setItem('app-popup-shown', 'true');
        setShowAppPopup(false);
    };

    const serviceIcons = { balcao: <LiaUserFriendsSolid />, piel: <LiaVoteYeaSolid />, ouvidoria: <LiaUserAstronautSolid /> };
    const quickIcons = { esic: <LiaUserAstronautSolid />, agendamentos: <LiaCalendarCheckSolid />, mensagens: <LiaCommentsSolid />, noticias: <LiaNewspaperSolid />, tvCamara: <LiaTvSolid /> };
    const services = (home.services || []).map(item => ({
        ...item,
        icon: serviceIcons[item.id] || <LiaArrowRightSolid />,
        action: () => handleHomeNavigation(item.path),
    }));
    const quickAccessItems = (home.quickLinks || []).map(item => ({
        ...item,
        icon: quickIcons[item.id] || <LiaArrowRightSolid />,
    }));

    const interpolate = value => String(value || '')
        .replaceAll('{{nome}}', settings.tenant?.name || '')
        .replaceAll('{{municipio}}', settings.tenant?.city || '')
        .replaceAll('{{uf}}', settings.tenant?.state || '');

    function handleHomeNavigation(path) {
        if (path === '#noticias') {
            document.getElementById('noticias')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        const safePath = String(path || '').trim();
        if (safePath.startsWith('/') && !safePath.startsWith('//')) navigate(safePath);
    }

    const handleQuickAccess = (path) => {
        handleHomeNavigation(path);
    };

    return (
        <div className="home-page-modern">
            <MaintenancePopup />
            {showAppPopup && (
                <div style={popupStyles.overlay}>
                    <div style={popupStyles.content}>
                        <h2 style={popupStyles.title}>{home.appPopupTitle}</h2>
                        <p style={popupStyles.text}>{home.appPopupDescription}</p>
                        <div style={popupStyles.buttonContainer}>
                            {appLinks.map(item => <a key={item.label} href={item.url} target="_blank" rel="noopener noreferrer" style={popupStyles.downloadButton}>{item.label}</a>)}
                            <button style={popupStyles.dismissButton} onClick={handleDismissPopup}>Agora não</button>
                        </div>
                    </div>
                </div>
            )}
            <header className="home-header-modern landing-home-premium" style={settings.branding?.homeHeroUrl ? { backgroundImage: `url(${settings.branding.homeHeroUrl})` } : undefined}>
                <div className="header-blur-overlay"></div>
                <div className="nav-container">
                    <nav className="home-nav">
                        <div className="nav-logo">
                            {cmsLogo && <img src={cmsLogo} alt={settings.branding?.logoAlt || 'Logo da Câmara Municipal'} />}
                            <span>{settings.tenant?.name}</span>
                        </div>
                        <div className="nav-actions">
                            <button className="btn-nav-login" onClick={() => navigate('/login')}>{home.loginLabel}</button>
                            <button className="btn-nav-signup" onClick={() => navigate('/cadastro')}>{home.signupLabel}</button>
                        </div>
                    </nav>
                </div>
                <div className="hero-section">
                    <div className="hero-content-premium">
                        <span className="hero-eyebrow">
                            <LiaShieldAltSolid />
                            {home.heroEyebrow}
                        </span>
                        <h1>{interpolate(home.heroTitle)}</h1>
                        <p>{home.heroDescription}</p>

                        <div className="hero-actions-premium">
                            <button className="btn-hero-primary" onClick={() => handleHomeNavigation(home.primaryActionPath)}>
                                {home.primaryActionLabel}
                                <LiaArrowRightSolid />
                            </button>
                            <button className="btn-hero-secondary" onClick={() => handleHomeNavigation(home.secondaryActionPath)}>
                                {home.secondaryActionLabel}
                            </button>
                        </div>

                        <div className="hero-trust-row">
                            <span><LiaBellSolid /> {home.trustServicesLabel}</span>
                            <span><LiaMobileAltSolid /> {home.trustAppLabel}</span>
                            <span><LiaMapMarkedAltSolid /> {settings.tenant?.city} - {settings.tenant?.state}</span>
                        </div>
                    </div>

                    <div className="hero-panel-premium">
                        <div className="hero-panel-header">
                            {cmsLogo && <img src={cmsLogo} alt={settings.branding?.logoAlt || settings.tenant?.name || 'Câmara Municipal'} />}
                            <span>
                                <strong>{home.panelTitle}</strong>
                                <small>{home.panelSubtitle}</small>
                            </span>
                        </div>
                        <div className="hero-panel-grid">
                            {quickAccessItems.map((item) => (
                                <button key={item.title} type="button" onClick={() => handleQuickAccess(item.path)}>
                                    {item.icon}
                                    <span>
                                        <strong>{item.title}</strong>
                                        <small>{item.text}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            <main className="home-main-content">
                {home.showStats && <section className="landing-stats-section" aria-label="Destaques do portal">
                    {(home.stats || []).map((item, index) => <article key={item.id || index}><strong>{item.value}</strong><span>{item.label}</span></article>)}
                </section>}

                {home.showServices && <section className="services-section-modern">
                    <div className="landing-section-heading">
                        <span>{home.servicesEyebrow}</span>
                        <h2>{home.servicesTitle}</h2>
                        <p>{home.servicesDescription}</p>
                    </div>
                    <div className="services-container-modern">
                        {services.map(service => (
                            <ServiceCard
                                key={service.title}
                                icon={service.icon}
                                title={service.title}
                                description={service.description}
                                tag={service.tag}
                                onClick={service.action}
                            />
                        ))}
                    </div>
                </section>}

                {home.showBalance && <section className="home-balcao-balance-section">
                    <div className="home-balcao-balance-copy">
                        <span className="home-balcao-balance-eyebrow">
                            <LiaUserFriendsSolid />
                            {home.balanceEyebrow}
                        </span>
                        <h2>{home.balanceTitle}</h2>
                        <p>{home.balanceDescription}</p>
                    </div>

                    <div className="home-balcao-balance-grid">
                        <article>
                            <LiaClipboardListSolid />
                            <span>{balcaoBalance?.period?.label || home.balancePeriodLabel}</span>
                            <strong>{balcaoBalance?.counts?.total ?? '--'}</strong>
                            <small>{home.balanceTotalLabel}</small>
                        </article>
                        <article>
                            <LiaHourglassHalfSolid />
                            <span>{home.balanceWaitingLabel}</span>
                            <strong>{balcaoBalance?.counts?.aguardando ?? '--'}</strong>
                            <small>{home.balanceWaitingDetail}</small>
                        </article>
                        <article>
                            <LiaCalendarCheckSolid />
                            <span>{home.balanceScheduledLabel}</span>
                            <strong>{balcaoBalance?.counts?.agendados ?? '--'}</strong>
                            <small>{home.balanceScheduledDetail}</small>
                        </article>
                        <article>
                            <LiaShieldAltSolid />
                            <span>{home.balanceCompletedLabel}</span>
                            <strong>{balcaoBalance?.counts?.concluidos ?? '--'}</strong>
                            <small>{home.balanceCompletedDetail}</small>
                        </article>
                    </div>
                </section>}

                {home.showTv && <section className="home-tv-camara-section">
                    <div className="home-tv-camara-copy">
                        <span className="home-tv-camara-eyebrow">
                            <LiaTvSolid />
                            {home.tvEyebrow}
                        </span>
                        <h2>{home.tvTitle}</h2>
                        <p>{home.tvDescription}</p>

                        <div className="home-tv-camara-actions">
                            <button className="btn-nav-signup" onClick={() => handleHomeNavigation('/tv-camara')}>
                                {home.tvButtonLabel}
                            </button>
                            {featuredVideo?.videoId && (
                                <a
                                    href={`https://www.youtube.com/watch?v=${featuredVideo.videoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="home-tv-camara-link"
                                >
                                    <LiaExternalLinkAltSolid />
                                    {home.tvYoutubeLabel}
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="home-tv-camara-card">
                        <div className="home-tv-camara-player">
                            {tvLoading ? (
                                <div className="home-tv-camara-state">
                                    <LiaTvSolid />
                                    <strong>{home.tvLoadingLabel}</strong>
                                </div>
                            ) : tvError || !featuredVideo || !featuredPlayerUrl ? (
                                <div className="home-tv-camara-state">
                                    <LiaTvSolid />
                                    <strong>{tvError || home.tvEmptyLabel}</strong>
                                </div>
                            ) : (
                                <iframe
                                    src={featuredPlayerUrl}
                                    title={featuredVideo.title || 'TV Câmara'}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            )}
                        </div>

                        <div className="home-tv-camara-meta">
                            <span>
                                <LiaPlayCircleSolid />
                                {featuredVideo ? formatVideoDate(featuredVideo.publishedAt) : home.tvLatestLabel}
                            </span>
                            <strong>{featuredVideo?.title || 'TV Câmara'}</strong>
                        </div>
                    </div>
                </section>}

                 {home.showNews && <section id="noticias" className="noticias-section-modern">
                    <NoticiasSlider />
                </section>}

                {home.showCouncilors && <section className="vereadores-slider-section">
                    <VereadoresSlider />
                </section>}

                
            </main>

            <Footer />
        </div>
    );
};

const popupStyles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10001,
        padding: '20px'
    },
    content: {
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '20px',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    },
    title: {
        color: '#00128A',
        marginBottom: '15px',
        fontSize: '1.5rem',
        fontWeight: 'bold'
    },
    text: {
        color: '#4b5563',
        marginBottom: '25px',
        lineHeight: '1.6',
        fontSize: '1rem'
    },
    buttonContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    downloadButton: {
        backgroundColor: '#00128A',
        color: 'white',
        border: 'none',
        padding: '14px',
        borderRadius: '10px',
        width: '100%',
        fontWeight: 'bold',
        cursor: 'pointer',
        fontSize: '1rem'
    },
    dismissButton: {
        backgroundColor: 'transparent',
        color: '#9ca3af',
        border: 'none',
        padding: '10px',
        cursor: 'pointer',
        fontSize: '0.9rem',
        textDecoration: 'underline'
    }
};

export default HomePage;
