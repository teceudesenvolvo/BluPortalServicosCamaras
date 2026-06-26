import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { firestore } from '../firebase';

export const youtubeFunctionsBaseUrl = 'https://southamerica-east1-blu-app-camara.cloudfunctions.net';
export const appFunctionsBaseUrl = process.env.REACT_APP_FUNCTIONS_BASE_URL?.replace(/\/$/, '') ||
    'https://us-central1-blu-app-camara.cloudfunctions.net';
export const youtubeFunctionInvokerEndpoint = `${appFunctionsBaseUrl}/invokeYoutubeFunction`;
export const videosEndpoint = `${youtubeFunctionsBaseUrl}/listarVideosTvCamara`;
export const fallbackVideosEndpoint = `${appFunctionsBaseUrl}/listarVideosTvCamaraFallback`;
export const tvCamaraPlaylistCollection = 'tv-camara-playlist';
export const tvCamaraLogsCollection = 'tv-camara-logs';

export const youtubeFunctions = [
    {
        id: 'atualizarPlaylistYoutube',
        name: 'atualizarPlaylistYoutube',
        label: 'Atualizar playlist do YouTube',
        endpoint: `${youtubeFunctionsBaseUrl}/atualizarPlaylistYoutube`,
        description: 'Automação original do projeto blu-app-camaras. Roda a cada 30 minutos, das 8h às 19h.',
        type: 'scheduled-function',
        method: 'SCHEDULE',
        callable: false,
        statusLabel: 'Automática',
    },
    {
        id: 'youtubeChannelWebhook',
        name: 'youtubeChannelWebhook',
        label: 'Webhook do canal YouTube',
        endpoint: `${youtubeFunctionsBaseUrl}/youtubeChannelWebhook`,
        description: 'Endpoint chamado pelo YouTube/WebSub. Chamadas manuais sem hub.challenge retornam 403 por segurança.',
        type: 'webhook',
        method: 'WEBHOOK',
        callable: false,
        statusLabel: 'Webhook externo',
    },
    {
        id: 'renovarWebhookYoutube',
        name: 'renovarWebhookYoutube',
        label: 'Renovar webhook YouTube',
        endpoint: `${youtubeFunctionsBaseUrl}/renovarWebhookYoutube`,
        description: 'Automação original do projeto blu-app-camaras. Renova a inscrição WebSub a cada 3 dias.',
        type: 'scheduled-function',
        method: 'SCHEDULE',
        callable: false,
        statusLabel: 'Automática',
    },
    {
        id: 'listarVideosTvCamara',
        name: 'listarVideosTvCamara',
        label: 'Listar vídeos da TV Câmara',
        endpoint: videosEndpoint,
        description: 'Busca os vídeos do YouTube usados na TV Câmara.',
        type: 'cloud-function',
        method: 'GET',
        callable: true,
        statusLabel: 'Testável',
    },
    {
        id: 'playlistManualTvCamara',
        name: 'playlistManualTvCamara',
        label: 'Playlist manual da TV Câmara',
        endpoint: null,
        description: 'Registra alterações manuais feitas na playlist exibida no portal.',
        type: 'firestore-action',
    },
];

export const getYoutubeFunctionById = (functionId) => (
    youtubeFunctions.find(item => item.id === functionId || item.name === functionId) || youtubeFunctions[0]
);

export const buildPlayerUrl = (videoId) => {
    if (!videoId) return null;

    const params = new URLSearchParams({
        rel: '0',
        modestbranding: '1',
        playsinline: '1',
    });

    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
};

export const getVideoTimestamp = (video) => {
    const timestamp = new Date(video?.publishedAt || video?.createdAt?.toDate?.() || video?.createdAt || '').getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const formatVideoDate = (value) => {
    if (!value) return 'TV Câmara';

    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'TV Câmara';

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

export const extractYoutubeVideoId = (value = '') => {
    const text = value.trim();
    if (!text) return '';

    if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

    const patterns = [
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
    }

    return '';
};

export const getYoutubeThumbnail = (videoId) => (
    videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''
);

export const normalizeVideo = (video = {}, source = 'endpoint') => {
    const videoId = video.videoId || extractYoutubeVideoId(video.url || video.link || '');

    return {
        ...video,
        videoId,
        title: video.title || video.titulo || 'Vídeo da TV Câmara',
        description: video.description || video.descricao || '',
        thumbnailUrl: video.thumbnailUrl || video.thumbnail || getYoutubeThumbnail(videoId),
        publishedAt: video.publishedAt || video.createdAt || new Date().toISOString(),
        source,
    };
};

const requestVideosEndpoint = async (endpoint, source = 'endpoint') => {
    const startedAt = Date.now();
    const response = await fetch(endpoint);
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status}`);
    }

    const payload = await response.json();
    const videos = Array.isArray(payload?.videos) ? payload.videos.map(video => normalizeVideo(video, source)) : [];

    return { payload, videos, durationMs, status: response.status };
};

export const fetchEndpointVideos = async () => {
    try {
        return await requestVideosEndpoint(videosEndpoint, 'endpoint');
    } catch (primaryError) {
        const fallbackResult = await requestVideosEndpoint(fallbackVideosEndpoint, 'public-feed');
        return {
            ...fallbackResult,
            primaryError: primaryError.message || 'Falha ao carregar endpoint principal.',
            fallback: true,
        };
    }
};

export const fetchManualPlaylistVideos = async () => {
    const snapshot = await getDocs(query(collection(firestore, tvCamaraPlaylistCollection), orderBy('createdAt', 'desc')));
    return snapshot.docs
        .map(docSnap => normalizeVideo({ id: docSnap.id, ...docSnap.data() }, 'manual'))
        .filter(video => video.active !== false && video.videoId);
};

export const mergeTvCamaraVideos = (manualVideos = [], endpointVideos = []) => {
    const seen = new Set();
    return [...manualVideos, ...endpointVideos]
        .filter((video) => {
            if (!video.videoId || seen.has(video.videoId)) return false;
            seen.add(video.videoId);
            return true;
        })
        .sort((firstVideo, secondVideo) => getVideoTimestamp(secondVideo) - getVideoTimestamp(firstVideo));
};

export const fetchTvCamaraVideos = async () => {
    const [manualResult, endpointResult] = await Promise.allSettled([
        fetchManualPlaylistVideos(),
        fetchEndpointVideos(),
    ]);
    const manualVideos = manualResult.status === 'fulfilled' ? manualResult.value : [];
    const endpoint = endpointResult.status === 'fulfilled'
        ? endpointResult.value
        : {
            payload: null,
            videos: [],
            durationMs: 0,
            status: null,
            error: endpointResult.reason?.message || 'Falha ao carregar vídeos da função listarVideosTvCamara.',
        };

    return {
        videos: mergeTvCamaraVideos(manualVideos, endpoint.videos),
        manualVideos,
        endpointVideos: endpoint.videos,
        endpoint,
        errors: {
            manual: manualResult.status === 'rejected' ? manualResult.reason?.message : null,
            endpoint: endpointResult.status === 'rejected' ? endpointResult.reason?.message : null,
        },
    };
};
