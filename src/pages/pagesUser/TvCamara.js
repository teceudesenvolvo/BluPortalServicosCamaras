import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import {
    LiaExternalLinkAltSolid,
    LiaPlayCircleSolid,
    LiaSyncSolid,
    LiaTvSolid,
} from 'react-icons/lia';
import { buildPlayerUrl, fetchTvCamaraVideos, formatVideoDate } from '../../utils/tvCamara';

const TvCamara = () => {
    const navigate = useNavigate();
    const { currentUser, loading: authLoading } = useAuth();
    const [videos, setVideos] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const playerUrl = useMemo(() => buildPlayerUrl(selectedVideo?.videoId), [selectedVideo]);

    const fetchVideos = async () => {
        try {
            setLoading(true);
            setError('');

            const { videos: orderedVideos } = await fetchTvCamaraVideos();

            setVideos(orderedVideos);
            setSelectedVideo((currentVideo) => {
                if (!currentVideo) return orderedVideos[0] || null;
                return orderedVideos.find(video => video.videoId === currentVideo.videoId) || orderedVideos[0] || null;
            });
        } catch (fetchError) {
            console.error('Falha ao carregar videos da TV Camara:', fetchError);
            setError('Não foi possível carregar a TV Câmara agora.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVideos();
    }, []);

    useEffect(() => {
        if (!authLoading && !currentUser) {
            navigate('/login', { replace: true });
        }
    }, [authLoading, currentUser, navigate]);

    if (authLoading || !currentUser) {
        return <div className="loading-screen">Carregando...</div>;
    }

    return (
        <div className="dashboard-layout tv-camara-layout">
            <Sidebar onItemClick={(path) => navigate(path)} />

            <div className="dashboard-content tv-camara-page">
                <header className="tv-camara-header">
                    <div className="tv-camara-brand">
                        <span className="tv-camara-brand-mark" />
                        <div>
                            <h1>TV Câmara</h1>
                            <p>Acompanhe os vídeos e sessões da Câmara Municipal de Paraipaba.</p>
                        </div>
                    </div>

                    <div className="tv-camara-header-actions">
                        <span className="tv-camara-badge">
                            <span className="tv-camara-live-dot" />
                            NO PORTAL
                        </span>
                        <button className="btn-secondary tv-camara-refresh" onClick={fetchVideos} disabled={loading}>
                            <LiaSyncSolid size={18} />
                            Atualizar
                        </button>
                    </div>
                </header>

                <main className="tv-camara-content">
                    <section className="tv-camara-player-panel">
                        <div className="tv-camara-player">
                            {loading && !selectedVideo ? (
                                <div className="tv-camara-empty-state">
                                    <LiaTvSolid size={42} />
                                    <strong>Carregando TV Câmara...</strong>
                                </div>
                            ) : error || !selectedVideo || !playerUrl ? (
                                <div className="tv-camara-empty-state">
                                    <LiaTvSolid size={42} />
                                    <strong>{error || 'Nenhum vídeo encontrado na playlist.'}</strong>
                                    <button className="btn-primary" onClick={fetchVideos}>Tentar novamente</button>
                                </div>
                            ) : (
                                <iframe
                                    key={selectedVideo.videoId}
                                    src={playerUrl}
                                    title={selectedVideo.title || 'TV Câmara'}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            )}
                        </div>

                        <div className="tv-camara-spotlight">
                            <span>Agora na TV Câmara</span>
                            <h2>{selectedVideo?.title || 'Últimos vídeos do canal'}</h2>
                            {selectedVideo?.description && <p>{selectedVideo.description}</p>}

                            {selectedVideo?.videoId && (
                                <div className="tv-camara-actions">
                                    <a
                                        href={`https://www.youtube.com/watch?v=${selectedVideo.videoId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-secondary"
                                    >
                                        <LiaExternalLinkAltSolid size={18} />
                                        Abrir no YouTube
                                    </a>
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className="tv-camara-playlist">
                        <div className="tv-camara-playlist-header">
                            <h3>Todos os vídeos</h3>
                            <span>{videos.length} vídeo{videos.length === 1 ? '' : 's'}</span>
                        </div>

                        {loading && videos.length === 0 ? (
                            <div className="tv-camara-list-state">Carregando vídeos...</div>
                        ) : error ? (
                            <div className="tv-camara-list-state">{error}</div>
                        ) : videos.length === 0 ? (
                            <div className="tv-camara-list-state">Nenhum vídeo encontrado.</div>
                        ) : (
                            <div className="tv-camara-video-list">
                                {videos.map((video, index) => {
                                    const selected = selectedVideo?.videoId === video.videoId;

                                    return (
                                        <button
                                            key={`${video.videoId}-${index}`}
                                            className={`tv-camara-video-card ${selected ? 'selected' : ''}`}
                                            onClick={() => setSelectedVideo(video)}
                                        >
                                            <div className="tv-camara-thumbnail">
                                                {video.thumbnailUrl ? (
                                                    <img src={video.thumbnailUrl} alt="" />
                                                ) : (
                                                    <LiaPlayCircleSolid size={34} />
                                                )}
                                                <span className="tv-camara-play-icon">
                                                    <LiaPlayCircleSolid size={22} />
                                                </span>
                                            </div>
                                            <div className="tv-camara-video-info">
                                                <strong>{video.title || 'Vídeo da TV Câmara'}</strong>
                                                <span>{selected ? 'Reproduzindo agora' : formatVideoDate(video.publishedAt)}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </aside>
                </main>
            </div>
        </div>
    );
};

export default TvCamara;
