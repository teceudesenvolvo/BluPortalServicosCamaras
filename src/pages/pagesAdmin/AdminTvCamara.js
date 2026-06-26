import React, { useEffect, useMemo, useState } from 'react';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import {
    LiaExternalLinkAltSolid,
    LiaPlayCircleSolid,
    LiaPlusSolid,
    LiaSyncSolid,
    LiaTrashAltSolid,
    LiaTvSolid,
} from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { auth, firestore } from '../../firebase';
import {
    buildPlayerUrl,
    extractYoutubeVideoId,
    fetchEndpointVideos,
    fetchManualPlaylistVideos,
    formatVideoDate,
    getYoutubeThumbnail,
    mergeTvCamaraVideos,
    normalizeVideo,
    tvCamaraLogsCollection,
    tvCamaraPlaylistCollection,
    videosEndpoint,
    youtubeFunctionInvokerEndpoint,
    youtubeFunctions,
} from '../../utils/tvCamara';

const formatLogDate = (value) => {
    const date = value?.toDate ? value.toDate() : new Date(value || '');
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return date.toLocaleString('pt-BR');
};

const AdminTvCamara = () => {
    const [manualVideos, setManualVideos] = useState([]);
    const [endpointVideos, setEndpointVideos] = useState([]);
    const [logs, setLogs] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [monitoring, setMonitoring] = useState(false);
    const [runningFunctions, setRunningFunctions] = useState({});
    const [activeLogFunction, setActiveLogFunction] = useState('all');
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        url: '',
        title: '',
        description: '',
    });

    const mergedVideos = useMemo(() => mergeTvCamaraVideos(manualVideos, endpointVideos), [manualVideos, endpointVideos]);
    const playerUrl = buildPlayerUrl(selectedVideo?.videoId);
    const filteredLogs = useMemo(() => (
        activeLogFunction === 'all'
            ? logs
            : logs.filter(log => (log.functionName || log.functionId) === activeLogFunction)
    ), [activeLogFunction, logs]);
    const logsByFunction = useMemo(() => youtubeFunctions.map((youtubeFunction) => ({
        ...youtubeFunction,
        lastLog: logs.find(log => (log.functionName || log.functionId) === youtubeFunction.id || (log.functionName || log.functionId) === youtubeFunction.name),
        totalLogs: logs.filter(log => (log.functionName || log.functionId) === youtubeFunction.id || (log.functionName || log.functionId) === youtubeFunction.name).length,
    })), [logs]);
    const youtubeFunctionCards = useMemo(() => youtubeFunctions.filter(item => item.type !== 'firestore-action'), []);

    const registerYoutubeLog = async ({
        functionId = 'playlistManualTvCamara',
        status = 'success',
        message,
        durationMs = 0,
        details = {},
        endpoint = null,
        httpStatus = null,
        videosCount = null,
    }) => {
        const youtubeFunction = youtubeFunctions.find(item => item.id === functionId) || youtubeFunctions[0];
        await addDoc(collection(firestore, tvCamaraLogsCollection), {
            status,
            category: 'youtube',
            functionId: youtubeFunction.id,
            functionName: youtubeFunction.name,
            functionLabel: youtubeFunction.label,
            endpoint: endpoint || youtubeFunction.endpoint || null,
            httpStatus,
            durationMs,
            videosCount,
            message,
            details,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.email || 'admin',
        });
    };

    const fetchLogs = async () => {
        const snapshot = await getDocs(query(
            collection(firestore, tvCamaraLogsCollection),
            orderBy('createdAt', 'desc'),
            limit(25),
        ));

        setLogs(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
    };

    const fetchManualVideos = async () => {
        const videos = await fetchManualPlaylistVideos();
        setManualVideos(videos);
        setSelectedVideo(current => current || videos[0] || null);
    };

    const callYoutubeFunction = async (youtubeFunction, { silent = false } = {}) => {
        if (!youtubeFunction?.endpoint) return null;
        if (youtubeFunction.callable === false) {
            const message = `${youtubeFunction.label} é gerenciada automaticamente no projeto blu-app-camaras e não deve ser chamada manualmente pelo portal.`;
            if (!silent) alert(message);
            throw new Error(message);
        }

        setRunningFunctions(prev => ({ ...prev, [youtubeFunction.id]: true }));
        const startedAt = Date.now();

        try {
            const response = await fetch(youtubeFunctionInvokerEndpoint, {
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    functionName: youtubeFunction.name,
                    source: 'admin-tv-camara',
                    calledAt: new Date().toISOString(),
                }),
            });
            const durationMs = Date.now() - startedAt;
            const contentType = response.headers.get('content-type') || '';
            const responseText = await response.text();
            let payload = responseText;
            if (contentType.includes('application/json') && responseText) {
                payload = JSON.parse(responseText);
            }

            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || payload?.payload?.error || `Falha HTTP ${payload?.httpStatus || response.status}`);
            }

            const targetPayload = payload?.payload || payload;
            const videos = Array.isArray(targetPayload?.videos) ? targetPayload.videos : [];
            await registerYoutubeLog({
                functionId: youtubeFunction.id,
                status: 'success',
                httpStatus: payload?.httpStatus || response.status,
                durationMs: payload?.durationMs || durationMs,
                videosCount: videos.length || null,
                endpoint: youtubeFunction.endpoint,
                message: `${youtubeFunction.name} executada com sucesso${videos.length ? ` com ${videos.length} vídeo(s)` : ''}.`,
                details: {
                    method: youtubeFunction.method || 'GET',
                    responseType: contentType || 'text/plain',
                    proxyEndpoint: youtubeFunctionInvokerEndpoint,
                    payloadPreview: typeof targetPayload === 'string' ? targetPayload.slice(0, 500) : Object.keys(targetPayload || {}),
                },
            });

            if (youtubeFunction.id === 'listarVideosTvCamara') {
                const normalizedVideos = Array.isArray(targetPayload?.videos)
                    ? targetPayload.videos.map(video => normalizeVideo(video, 'endpoint'))
                    : [];
                if (normalizedVideos.length) {
                    setEndpointVideos(normalizedVideos);
                    setSelectedVideo(current => current || normalizedVideos[0] || null);
                }
            }

            if (!silent) alert(`${youtubeFunction.name} executada com sucesso.`);
            return targetPayload;
        } catch (functionError) {
            const durationMs = Date.now() - startedAt;
            await registerYoutubeLog({
                functionId: youtubeFunction.id,
                status: 'error',
                durationMs,
                endpoint: youtubeFunction.endpoint,
                message: functionError.message || `Erro ao executar ${youtubeFunction.name}.`,
                details: {
                    method: youtubeFunction.method || 'GET',
                    errorName: functionError.name || 'Error',
                },
            });
            if (!silent) alert(`Erro ao executar ${youtubeFunction.name}: ${functionError.message}`);
            throw functionError;
        } finally {
            setRunningFunctions(prev => ({ ...prev, [youtubeFunction.id]: false }));
            fetchLogs();
        }
    };

    const monitorEndpoint = async ({ silent = false } = {}) => {
        setMonitoring(true);
        setError('');
        const startedAt = Date.now();

        try {
            const result = await fetchEndpointVideos();
            setEndpointVideos(result.videos);
            setSelectedVideo(current => current || result.videos[0] || null);

            await registerYoutubeLog({
                functionId: 'listarVideosTvCamara',
                status: 'success',
                httpStatus: result.status,
                durationMs: result.durationMs,
                videosCount: result.videos.length,
                endpoint: videosEndpoint,
                message: `Listagem concluída com ${result.videos.length} vídeo(s).`,
                details: {
                    payloadKeys: Object.keys(result.payload || {}),
                },
            });

            if (!silent) alert('Monitoramento concluído com sucesso.');
        } catch (monitorError) {
            const durationMs = Date.now() - startedAt;
            setError(monitorError.message || 'Erro ao consultar a função.');

            await registerYoutubeLog({
                functionId: 'listarVideosTvCamara',
                status: 'error',
                durationMs,
                endpoint: videosEndpoint,
                message: monitorError.message || 'Erro ao consultar a função listarVideosTvCamara.',
                details: {
                    errorName: monitorError.name || 'Error',
                },
            });
        } finally {
            setMonitoring(false);
            fetchLogs();
        }
    };

    const handleRunYoutubeFunction = async (youtubeFunction) => {
        setError('');
        try {
            if (youtubeFunction.callable === false) {
                const message = `${youtubeFunction.label} é ${youtubeFunction.statusLabel?.toLowerCase() || 'automática'} e permanece ativa no projeto blu-app-camaras.`;
                setError(message);
                await registerYoutubeLog({
                    functionId: youtubeFunction.id,
                    status: 'success',
                    endpoint: youtubeFunction.endpoint,
                    message,
                    details: {
                        action: 'manual-call-blocked',
                        reason: 'scheduled-or-webhook-function',
                    },
                });
                await fetchLogs();
                return;
            }

            if (youtubeFunction.id === 'listarVideosTvCamara') {
                await monitorEndpoint();
                return;
            }

            await callYoutubeFunction(youtubeFunction);
        } catch (runError) {
            console.error(`Erro ao executar ${youtubeFunction.name}:`, runError);
            setError(runError.message || `Erro ao executar ${youtubeFunction.name}.`);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            await Promise.all([
                fetchManualVideos(),
                monitorEndpoint({ silent: true }),
                fetchLogs(),
            ]);
        } catch (loadError) {
            console.error('Erro ao carregar admin TV Câmara:', loadError);
            setError('Não foi possível carregar a administração da TV Câmara.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAddVideo = async (event) => {
        event.preventDefault();
        const videoId = extractYoutubeVideoId(formData.url);

        if (!videoId) {
            alert('Informe uma URL ou ID válido do YouTube.');
            return;
        }

        try {
            const docRef = await addDoc(collection(firestore, tvCamaraPlaylistCollection), {
                videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                title: formData.title || 'Vídeo da TV Câmara',
                description: formData.description,
                thumbnailUrl: getYoutubeThumbnail(videoId),
                active: true,
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser?.email || 'admin',
            });

            await registerYoutubeLog({
                functionId: 'playlistManualTvCamara',
                message: `Vídeo manual adicionado à playlist: ${formData.title || videoId}.`,
                details: {
                    action: 'add-video',
                    videoId,
                    videoDocId: docRef.id,
                },
            });

            setFormData({ url: '', title: '', description: '' });
            await fetchManualVideos();
            await fetchLogs();
            alert('Vídeo adicionado à playlist.');
        } catch (addError) {
            console.error('Erro ao adicionar vídeo:', addError);
            alert('Erro ao adicionar vídeo.');
        }
    };

    const handleToggleVideo = async (video) => {
        if (!video.id) return;
        const nextActive = video.active === false;
        await updateDoc(doc(firestore, tvCamaraPlaylistCollection, video.id), {
            active: nextActive,
            updatedAt: serverTimestamp(),
        });
        await registerYoutubeLog({
            functionId: 'playlistManualTvCamara',
            message: `Vídeo ${nextActive ? 'ativado' : 'ocultado'} na playlist manual: ${video.title || video.videoId}.`,
            details: {
                action: nextActive ? 'activate-video' : 'hide-video',
                videoId: video.videoId,
                videoDocId: video.id,
            },
        });
        fetchManualVideos();
        fetchLogs();
    };

    const handleDeleteVideo = async (video) => {
        if (!video.id) return;
        if (!window.confirm('Remover este vídeo da playlist manual?')) return;
        await deleteDoc(doc(firestore, tvCamaraPlaylistCollection, video.id));
        await registerYoutubeLog({
            functionId: 'playlistManualTvCamara',
            message: `Vídeo removido da playlist manual: ${video.title || video.videoId}.`,
            details: {
                action: 'delete-video',
                videoId: video.videoId,
                videoDocId: video.id,
            },
        });
        if (selectedVideo?.id === video.id) setSelectedVideo(null);
        fetchManualVideos();
        fetchLogs();
    };

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content admin-tv-camara-page">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Admin TV Câmara</h1>
                        <p>Monitore as funções do YouTube e gerencie vídeos manuais da playlist.</p>
                    </div>
                    <div className="admin-balcao-header-actions">
                        <button onClick={fetchData} className="admin-action-button action-refresh" disabled={loading || monitoring}>
                            <LiaSyncSolid />
                            <span className="admin-action-label">Atualizar</span>
                        </button>
                    </div>
                </header>

                <section className="admin-tv-camara-metrics">
                    <article>
                        <span>Playlist manual</span>
                        <strong>{manualVideos.length}</strong>
                    </article>
                    {logsByFunction.map(youtubeFunction => (
                        <article key={youtubeFunction.id}>
                            <span>{youtubeFunction.label}</span>
                            <strong>{youtubeFunction.lastLog?.status === 'error' ? 'Erro' : youtubeFunction.lastLog?.status === 'success' ? 'OK' : youtubeFunction.id === 'listarVideosTvCamara' ? endpointVideos.length : youtubeFunction.totalLogs}</strong>
                            <small>{youtubeFunction.description}</small>
                        </article>
                    ))}
                    <article>
                        <span>Total exibido no portal</span>
                        <strong>{mergedVideos.length}</strong>
                    </article>
                </section>

                {error && <div className="error-message-inline">{error}</div>}

                <main className="admin-tv-camara-grid">
                    <section className="data-card admin-tv-camara-functions-card">
                        <div className="card-header">
                            <h3><LiaTvSolid /> Funções YouTube</h3>
                            <span>{youtubeFunctionCards.length} função(ões)</span>
                        </div>
                        <div className="admin-tv-camara-functions">
                            {youtubeFunctionCards.map(youtubeFunction => (
                                <article key={youtubeFunction.id}>
                                    <div>
                                        <strong>{youtubeFunction.name}</strong>
                                        <span>{youtubeFunction.description}</span>
                                        <small>{youtubeFunction.method || 'GET'} · {youtubeFunction.statusLabel || 'Disponível'} · {youtubeFunction.endpoint}</small>
                                    </div>
                                    {youtubeFunction.callable === false ? (
                                        <span className="admin-tv-camara-function-badge">{youtubeFunction.statusLabel || 'Automática'}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={() => handleRunYoutubeFunction(youtubeFunction)}
                                            disabled={monitoring || runningFunctions[youtubeFunction.id]}
                                        >
                                            <LiaSyncSolid />
                                            {runningFunctions[youtubeFunction.id] || (monitoring && youtubeFunction.id === 'listarVideosTvCamara') ? 'Testando...' : 'Testar função'}
                                        </button>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="data-card admin-tv-camara-form-card">
                        <div className="card-header"><h3><LiaPlusSolid /> Adicionar vídeo</h3></div>
                        <form onSubmit={handleAddVideo} className="admin-tv-camara-form">
                            <div className="form-group">
                                <label>URL ou ID do YouTube</label>
                                <input className="form-input" value={formData.url} onChange={(event) => setFormData(prev => ({ ...prev, url: event.target.value }))} placeholder="https://www.youtube.com/watch?v=..." />
                            </div>
                            <div className="form-group">
                                <label>Título</label>
                                <input className="form-input" value={formData.title} onChange={(event) => setFormData(prev => ({ ...prev, title: event.target.value }))} placeholder="Título exibido na playlist" />
                            </div>
                            <div className="form-group">
                                <label>Descrição</label>
                                <textarea className="form-input" rows="3" value={formData.description} onChange={(event) => setFormData(prev => ({ ...prev, description: event.target.value }))} />
                            </div>
                            <button className="btn-primary"><LiaPlusSolid /> Adicionar à playlist</button>
                        </form>
                    </section>

                    <section className="data-card admin-tv-camara-preview-card">
                        <div className="card-header"><h3><LiaPlayCircleSolid /> Preview</h3></div>
                        <div className="admin-tv-camara-preview">
                            {playerUrl ? (
                                <iframe title={selectedVideo?.title || 'TV Câmara'} src={playerUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                            ) : (
                                <div className="tv-camara-empty-state"><LiaTvSolid size={40} /><strong>Selecione um vídeo</strong></div>
                            )}
                        </div>
                        {selectedVideo && (
                            <div className="admin-tv-camara-selected">
                                <strong>{selectedVideo.title}</strong>
                                <span>{selectedVideo.source === 'manual' ? 'Playlist manual' : 'Função listarVideosTvCamara'} · {formatVideoDate(selectedVideo.publishedAt)}</span>
                                <a href={`https://www.youtube.com/watch?v=${selectedVideo.videoId}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                                    <LiaExternalLinkAltSolid /> Abrir no YouTube
                                </a>
                            </div>
                        )}
                    </section>

                    <section className="data-card admin-tv-camara-list-card">
                        <div className="card-header">
                            <h3>Vídeos da playlist</h3>
                            <span>{mergedVideos.length} vídeo(s)</span>
                        </div>
                        <div className="admin-tv-camara-video-list">
                            {mergedVideos.map(video => (
                                <article key={`${video.source}-${video.id || video.videoId}`} className={selectedVideo?.videoId === video.videoId ? 'selected' : ''}>
                                    <button type="button" className="admin-tv-camara-video-main" onClick={() => setSelectedVideo(video)}>
                                        <img src={video.thumbnailUrl || getYoutubeThumbnail(video.videoId)} alt="" />
                                        <span>
                                            <strong>{video.title}</strong>
                                            <small>{video.source === 'manual' ? 'Manual' : 'Função'} · {formatVideoDate(video.publishedAt)}</small>
                                        </span>
                                    </button>
                                    {video.source === 'manual' && (
                                        <div className="admin-tv-camara-video-actions">
                                            <button type="button" className="btn-secondary" onClick={() => handleToggleVideo(video)}>
                                                {video.active === false ? 'Ativar' : 'Ocultar'}
                                            </button>
                                            <button type="button" className="btn-danger" onClick={() => handleDeleteVideo(video)}><LiaTrashAltSolid /></button>
                                        </div>
                                    )}
                                </article>
                            ))}
                            {!loading && mergedVideos.length === 0 && <p>Nenhum vídeo encontrado.</p>}
                        </div>
                    </section>

                    <section className="data-card admin-tv-camara-logs-card">
                        <div className="card-header">
                            <h3>Logs das funções YouTube</h3>
                            <button type="button" className="btn-secondary" onClick={fetchLogs}><LiaSyncSolid /> Atualizar logs</button>
                        </div>
                        <div className="admin-tv-camara-log-filters">
                            <button type="button" className={activeLogFunction === 'all' ? 'active' : ''} onClick={() => setActiveLogFunction('all')}>
                                Todas
                            </button>
                            {youtubeFunctions.map(youtubeFunction => (
                                <button
                                    key={youtubeFunction.id}
                                    type="button"
                                    className={activeLogFunction === youtubeFunction.id ? 'active' : ''}
                                    onClick={() => setActiveLogFunction(youtubeFunction.id)}
                                >
                                    {youtubeFunction.name}
                                </button>
                            ))}
                        </div>
                        <div className="admin-tv-camara-logs">
                            {filteredLogs.map(log => (
                                <article key={log.id} className={log.status === 'error' ? 'error' : 'success'}>
                                    <span>{log.status === 'error' ? 'Erro' : 'Sucesso'}</span>
                                    <em>{log.functionLabel || log.functionName || 'listarVideosTvCamara'}</em>
                                    <strong>{log.message}</strong>
                                    <small>{formatLogDate(log.createdAt)} · {log.durationMs || 0}ms · {log.createdBy || 'admin'}</small>
                                </article>
                            ))}
                            {filteredLogs.length === 0 && <p>Nenhum log registrado para este filtro. Clique em Testar Função.</p>}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

export default AdminTvCamara;
