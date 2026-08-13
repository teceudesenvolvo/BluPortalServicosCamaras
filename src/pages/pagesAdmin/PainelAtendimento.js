import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { LiaCogSolid, LiaImageSolid, LiaRedoAltSolid, LiaVolumeMuteSolid, LiaVolumeUpSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from '../../firebase';
import appQrCode from '../../assets/app-download-qr.png';

const getTime = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    return new Date(value).getTime() || 0;
};

const isToday = (value) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    const today = new Date();
    return !Number.isNaN(date.getTime())
        && date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
};

const PainelAtendimento = () => {
    const [tickets, setTickets] = useState([]);
    const [news, setNews] = useState([]);
    const [activeNewsIndex, setActiveNewsIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('queueVoiceEnabled') !== 'false');
    const [panelSettingsOpen, setPanelSettingsOpen] = useState(false);
    const [panelOptions, setPanelOptions] = useState(() => {
        try {
            return {
                showSideMenu: true,
                showHeader: true,
                showRecentCalls: true,
                showServiceQueues: true,
                showNews: true,
                ...JSON.parse(localStorage.getItem('queuePanelDisplayOptions') || '{}'),
            };
        } catch {
            return { showSideMenu: true, showHeader: true, showRecentCalls: true, showServiceQueues: true, showNews: true };
        }
    });
    const lastAnnouncementRef = useRef('');

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(firestore, 'atendimento-fila'), (snapshot) => {
            setTickets(snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
                .filter(item => isToday(item.criadoEm)));
            setLoading(false);
        }, (error) => {
            console.error('Erro ao carregar fila:', error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const newsRef = collection(firestore, 'noticias');
        const publishedNews = query(newsRef, where('status', '==', 'Publicado'), orderBy('createdAt', 'desc'), limit(8));
        const unsubscribe = onSnapshot(publishedNews, (snapshot) => {
            setNews(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
            setActiveNewsIndex(0);
        }, (error) => {
            console.error('Erro ao carregar notícias do painel:', error);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (news.length < 2) return undefined;
        const interval = window.setInterval(() => {
            setActiveNewsIndex(index => (index + 1) % news.length);
        }, 7000);
        return () => window.clearInterval(interval);
    }, [news.length]);

    const waiting = useMemo(() => tickets.filter(ticket => ticket.status === 'Aguardando'), [tickets]);
    const activeCalls = useMemo(() => tickets
        .filter(ticket => ['Chamando', 'Em Atendimento'].includes(ticket.status))
        .sort((a, b) => getTime(b.chamadoEm) - getTime(a.chamadoEm)), [tickets]);
    const current = activeCalls[0] || null;
    const recentCalls = activeCalls.slice(1, 6);
    const serviceSummary = useMemo(() => Object.entries(waiting.reduce((summary, ticket) => {
        const name = ticket.setor || 'Balcão do Cidadão';
        summary[name] = (summary[name] || 0) + 1;
        return summary;
    }, {})).sort((a, b) => b[1] - a[1]), [waiting]);

    const speakCall = useCallback((ticket) => {
        if (!ticket || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const service = ticket.setor || 'Balcão do Cidadão';
        const counter = ticket.guiche || 'guichê de atendimento';
        const text = `${ticket.nome}. Atendimento de ${service}. Compareça ao ${counter}.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.88;
        utterance.pitch = 1;
        const portugueseVoice = window.speechSynthesis.getVoices().find(voice => voice.lang?.toLowerCase().startsWith('pt-br'));
        if (portugueseVoice) utterance.voice = portugueseVoice;
        window.speechSynthesis.speak(utterance);
    }, []);

    useEffect(() => {
        if (!voiceEnabled || !current || current.status !== 'Chamando') return;
        const announcementId = `${current.id}-${getTime(current.chamadoEm)}-${current.chamadas || 1}`;
        if (lastAnnouncementRef.current === announcementId) return;
        lastAnnouncementRef.current = announcementId;
        speakCall(current);
    }, [current, speakCall, voiceEnabled]);

    const toggleVoice = () => {
        const nextValue = !voiceEnabled;
        setVoiceEnabled(nextValue);
        localStorage.setItem('queueVoiceEnabled', String(nextValue));
        if (!nextValue && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        if (nextValue && current) speakCall(current);
    };

    const updatePanelOption = (option) => {
        setPanelOptions(current => {
            const next = { ...current, [option]: !current[option] };
            localStorage.setItem('queuePanelDisplayOptions', JSON.stringify(next));
            return next;
        });
    };

    return (
        <div className={`dashboard-layout public-queue-shell ${!panelOptions.showSideMenu ? 'public-queue-menu-hidden' : ''} ${!panelOptions.showHeader ? 'public-queue-header-hidden' : ''} ${!panelOptions.showRecentCalls ? 'public-queue-recent-hidden' : ''} ${!panelOptions.showServiceQueues ? 'public-queue-services-hidden' : ''} ${!panelOptions.showNews ? 'public-queue-news-hidden' : ''}`}>
            {panelOptions.showSideMenu && <AdminSidebar />}
            <main className="dashboard-content public-queue-page">
                {panelOptions.showHeader && <header className="public-queue-header">
                    <div>
                        <span className="public-queue-eyebrow">Câmara Municipal de Paraipaba</span>
                        <h1>Painel de Atendimento</h1>
                    </div>
                    <div className="public-queue-clock">
                        <strong>{new Date().toLocaleDateString('pt-BR')}</strong>
                        <span>{waiting.length} aguardando</span>
                        <div className="public-queue-voice-controls">
                            <button type="button" onClick={toggleVoice} title={voiceEnabled ? 'Desativar voz' : 'Ativar voz'}>
                                {voiceEnabled ? <LiaVolumeUpSolid /> : <LiaVolumeMuteSolid />}
                                {voiceEnabled ? 'Voz ativa' : 'Voz desligada'}
                            </button>
                            <button type="button" onClick={() => speakCall(current)} disabled={!current} title="Repetir chamada">
                                <LiaRedoAltSolid /> Repetir
                            </button>
                        </div>
                    </div>
                </header>}

                <div className="queue-panel-floating-settings">
                    <button
                        type="button"
                        className="queue-panel-settings-button"
                        onClick={() => setPanelSettingsOpen(open => !open)}
                        aria-label="Configurar exibição do painel"
                        title="Configurar exibição"
                    >
                        <LiaCogSolid />
                    </button>
                    {panelSettingsOpen && (
                        <div className="queue-panel-settings-popover">
                            <strong>Exibição do painel</strong>
                            {[
                                ['showSideMenu', 'Exibir menu lateral'],
                                ['showHeader', 'Exibir cabeçalho'],
                                ['showRecentCalls', 'Exibir últimas chamadas'],
                                ['showServiceQueues', 'Exibir filas por serviço'],
                                ['showNews', 'Exibir notícias'],
                            ].map(([option, label]) => (
                                <label key={option}>
                                    <input type="checkbox" checked={panelOptions[option]} onChange={() => updatePanelOption(option)} />
                                    {label}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {loading ? <div className="queue-empty-state">Carregando chamadas...</div> : (
                    <div className="public-queue-layout">
                        <section className="public-current-call">
                            <a className="public-app-qr public-app-qr-persistent" href="https://servicos.camaraparaipaba.ce.gov.br/download-app" target="_blank" rel="noreferrer" aria-label="Baixar aplicativo da Câmara">
                                <img src={appQrCode} alt="QR Code para baixar o aplicativo da Câmara" />
                                <span><b>Baixe o app</b><small>Aponte a câmera</small></span>
                            </a>
                            <span>{current?.status === 'Em Atendimento' ? 'Em atendimento' : 'Chamando agora'}</span>
                            {current ? (
                                <>
                                    <strong>{current.senha}</strong>
                                    <div className="public-counter-name">{current.guiche || 'Dirija-se ao atendimento'}</div>
                                    <p>{current.nome}</p>
                                    <small>{current.setor || 'Balcão do Cidadão'}</small>
                                </>
                            ) : (
                                <div className="public-no-call">Aguarde a próxima chamada</div>
                            )}
                        </section>

                        {panelOptions.showRecentCalls && <aside className="public-recent-calls">
                            <div className="queue-section-title"><h2>Últimas chamadas</h2></div>
                            {recentCalls.length === 0 && <p className="queue-empty">As chamadas aparecerão aqui.</p>}
                            {recentCalls.map(ticket => (
                                <article key={ticket.id}>
                                    <strong>{ticket.senha}</strong>
                                    <div><b>{ticket.guiche || 'Atendimento'}</b><span>{ticket.setor || 'Balcão do Cidadão'}</span></div>
                                </article>
                            ))}
                        </aside>}

                        {panelOptions.showServiceQueues && <section className="public-service-queues">
                            <h2>Filas por serviço</h2>
                            <div>
                                {serviceSummary.map(([name, count]) => (
                                    <article key={name}><span>{name}</span><strong>{count}</strong><small>aguardando</small></article>
                                ))}
                                {serviceSummary.length === 0 && <p>Nenhum cidadão aguardando.</p>}
                            </div>
                        </section>}

                        {panelOptions.showNews && news.length > 0 && (
                            <section className="public-news-slider" aria-label="Notícias da Câmara">
                                <div className="public-news-track" style={{ transform: `translateX(-${activeNewsIndex * 100}%)` }}>
                                    {news.map(item => (
                                        <article key={item.id} className="public-news-slide">
                                            <div className="public-news-image">
                                                {item.capaUrl ? <img src={item.capaUrl} alt="" /> : <LiaImageSolid />}
                                            </div>
                                            <div className="public-news-content">
                                                <span>Notícias da Câmara</span>
                                                <h2>{item.titulo}</h2>
                                                {item.subtitulo && <p>{item.subtitulo}</p>}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                                {news.length > 1 && (
                                    <div className="public-news-dots" aria-label="Selecionar notícia">
                                        {news.map((item, index) => (
                                            <button key={item.id} type="button" className={index === activeNewsIndex ? 'active' : ''} onClick={() => setActiveNewsIndex(index)} aria-label={`Exibir notícia ${index + 1}`} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default PainelAtendimento;
