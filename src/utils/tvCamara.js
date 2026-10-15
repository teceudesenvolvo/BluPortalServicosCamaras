import { collection, getDocs, orderBy, query } from "../services/firebaseApi.js";
import { firestore } from "../services/firebaseApi.js";
import {
    firebaseFunctionsRegion,
    getFirebaseFunctionUrl,
    getFirebaseFunctionsBaseUrl,
    requestFirebaseRest,
    requestFirebaseFunction,
} from '../services/firebaseApi';

export const youtubeFunctionsRegion = String(
    process.env.REACT_APP_FIREBASE_YOUTUBE_FUNCTIONS_REGION || 'southamerica-east1',
).trim();
export const youtubeFunctionsBaseUrl = getFirebaseFunctionsBaseUrl(youtubeFunctionsRegion);
export const appFunctionsBaseUrl = getFirebaseFunctionsBaseUrl(firebaseFunctionsRegion);
export const youtubeFunctionInvokerEndpoint = getFirebaseFunctionUrl('invokeYoutubeFunction');
export const youtubeSyncLogsEndpoint = getFirebaseFunctionUrl('syncYoutubeFunctionLogs');
export const youtubeOAuthUrlEndpoint = getFirebaseFunctionUrl('getYoutubeOAuthUrl');
export const youtubeRefreshTokenEndpoint = getFirebaseFunctionUrl('updateYoutubeRefreshToken');
export const videosEndpoint = getFirebaseFunctionUrl('listarVideosTvCamara', youtubeFunctionsRegion);
export const tvCamaraPlaylistCollection = 'tv-camara-playlist';
export const tvCamaraLogsCollection = 'tv-camara-logs';

export const youtubeFunctions = [
    {
        id: 'atualizarPlaylistYoutube',
        name: 'atualizarPlaylistYoutube',
        label: 'Atualizar playlist do YouTube',
        endpoint: getFirebaseFunctionUrl('atualizarPlaylistYoutube', youtubeFunctionsRegion),
        description: 'Automação agendada na instalação Firebase da Câmara.',
        type: 'scheduled-function',
        method: 'SCHEDULE',
        callable: false,
        statusLabel: 'Automática',
    },
    {
        id: 'youtubeChannelWebhook',
        name: 'youtubeChannelWebhook',
        label: 'Webhook do canal YouTube',
        endpoint: getFirebaseFunctionUrl('youtubeChannelWebhook', youtubeFunctionsRegion),
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
        endpoint: getFirebaseFunctionUrl('renovarWebhookYoutube', youtubeFunctionsRegion),
        description: 'Renovação agendada na instalação Firebase da Câmara.',
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
        publishedAt: video.publishedAt || (source === 'manual' ? video.createdAt : null) || null,
        source,
    };
};

const requestVideosEndpoint = async ({ endpoint = '', functionName, region, source = 'endpoint', fresh = false }) => {
    const startedAt = Date.now();
    let requestUrl = endpoint;
    let request;
    if (requestUrl) {
        const url = new URL(requestUrl);
        if (fresh) {
            url.searchParams.set('refresh', '1');
            url.searchParams.set('ts', String(Date.now()));
        }
        requestUrl = url.toString();
        request = requestFirebaseRest(requestUrl, { cache: fresh ? 'no-store' : 'default' });
    } else {
        const endpointName = fresh ? `${functionName}?refresh=1&ts=${Date.now()}` : functionName;
        request = requestFirebaseFunction(endpointName, {
            region,
            ...(fresh ? { cache: 'no-store' } : {}),
        });
    }
    const response = await request;
    const durationMs = Date.now() - startedAt;

    const responseText = await response.text();
    let payload = {};
    try {
        payload = responseText ? JSON.parse(responseText) : {};
    } catch {
        payload = { error: responseText };
    }
    if (!response.ok || payload?.ok === false) {
        throw new Error(
            payload?.error || `Falha HTTP ${response.status} ao carregar a playlist.`,
        );
    }
    if (!Array.isArray(payload?.videos)) {
        throw new Error('A Function da playlist retornou uma resposta inválida.');
    }

    const videos = Array.isArray(payload?.videos) ? payload.videos.map(video => normalizeVideo(video, source)) : [];

    return { payload, videos, durationMs, status: response.status };
};

export const fetchEndpointVideos = async ({ fresh = false, endpoint = videosEndpoint } = {}) => {
    return requestVideosEndpoint({ endpoint, source: 'youtube-channel-playlist', fresh });
};

export const fetchManualPlaylistVideos = async () => {
    const snapshot = await getDocs(query(collection(firestore, tvCamaraPlaylistCollection), orderBy('createdAt', 'desc')));
    return snapshot.docs
        .map(docSnap => normalizeVideo({ id: docSnap.id, ...docSnap.data() }, 'manual'))
        .filter(video => video.active !== false && video.videoId);
};

export const mergeTvCamaraVideos = (manualVideos = [], endpointVideos = []) => {
    const byVideoId = new Map();
    [...manualVideos, ...endpointVideos].forEach(video => {
        if (!video.videoId) return;
        const existing = byVideoId.get(video.videoId);
        if (!existing) {
            byVideoId.set(video.videoId, video);
            return;
        }

        const manual = existing.source === 'manual' ? existing : video;
        const published = existing.source === 'manual' ? video : existing;
        byVideoId.set(video.videoId, {
            ...published,
            ...manual,
            publishedAt: published.publishedAt || manual.publishedAt || null,
            viewCount: published.viewCount ?? manual.viewCount ?? null,
        });
    });

    return [...byVideoId.values()].sort((firstVideo, secondVideo) => (
        getVideoTimestamp(secondVideo) - getVideoTimestamp(firstVideo)
    ));
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
