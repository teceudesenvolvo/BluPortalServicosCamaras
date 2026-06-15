import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import {
    LiaArrowLeftSolid,
    LiaCheckDoubleSolid,
    LiaCommentsSolid,
    LiaPaperPlane,
    LiaSearchSolid,
    LiaStar,
    LiaStarSolid,
    LiaSyncSolid,
    LiaUserCircleSolid,
} from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { firestore } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { getLastMessage, getMessagesArray, getMessageTime } from '../../utils/adminMessages';

const MESSAGE_AREAS = [
    {
        id: 'balcao',
        title: 'Balcão do Cidadão',
        collectionName: 'balcao-cidadao',
        subjectPath: ['dadosSolicitacao', 'assunto'],
        datePath: 'dataSolicitacao',
    },
    {
        id: 'ouvidoria',
        title: 'Ouvidoria',
        collectionName: 'ouvidoria',
        subjectPath: ['dadosManifestacao', 'assunto'],
        datePath: 'dataManifestacao',
    },
    {
        id: 'procuradoria',
        title: 'Procuradoria da Mulher',
        collectionName: 'procuradoria-mulher',
        subjectPath: ['dadosSolicitacao', 'assunto'],
        datePath: 'dataSolicitacao',
    },
];

const getNestedValue = (value, path) => path.reduce((current, key) => current?.[key], value);

const formatDateTime = (timestamp) => {
    const time = getMessageTime(timestamp);
    if (!time) return 'Sem data';
    return new Date(time).toLocaleString('pt-BR');
};

const formatMessageTime = (timestamp) => {
    const time = getMessageTime(timestamp);
    if (!time) return '';
    return new Date(time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatThreadTime = (timestamp) => {
    const time = getMessageTime(timestamp);
    if (!time) return '';

    const date = new Date(time);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const getInitials = (name = '') => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
};

const getMessagePreview = (message) => {
    if (!message) return 'Sem mensagens';
    if (message.deletedByAdmin) return 'Mensagem apagada';
    return message.text || 'Sem prévia';
};

const countUnreadUserMessages = (messages = {}) => getMessagesArray(messages).filter(message => (
    message.sender === 'admin' && !message.readByUser && !message.deletedByAdmin
)).length;

const buildReadUserMessagesUpdate = (messages = {}) => Object.entries(messages).reduce((updates, [id, message]) => {
    if (message.sender === 'admin' && !message.readByUser && !message.deletedByAdmin) {
        updates[`messages.${id}.readByUser`] = true;
    }
    return updates;
}, {});

const MensagensUsuario = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [threads, setThreads] = useState([]);
    const [activeTab, setActiveTab] = useState(MESSAGE_AREAS[0].id);
    const [selectedThreadId, setSelectedThreadId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [conversationFilter, setConversationFilter] = useState('all');
    const [favoriteIds, setFavoriteIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('userMessageFavorites') || '[]');
        } catch {
            return [];
        }
    });
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [mobileChatOpen, setMobileChatOpen] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!currentUser) navigate('/login');
    }, [currentUser, navigate]);

    const activeArea = MESSAGE_AREAS.find(area => area.id === activeTab) || MESSAGE_AREAS[0];

    const fetchMessages = useCallback(async () => {
        if (!currentUser || !activeArea) return;

        setLoading(true);
        try {
            const snapshot = await getDocs(query(
                collection(firestore, activeArea.collectionName),
                where('userId', '==', currentUser.uid),
                limit(300),
            ));

            const data = snapshot.docs
                .map((docSnap) => {
                    const item = docSnap.data();
                    const messages = getMessagesArray(item.messages);
                    const lastMessage = getLastMessage(item.messages);

                    return {
                        id: docSnap.id,
                        areaId: activeArea.id,
                        areaTitle: activeArea.title,
                        collectionName: activeArea.collectionName,
                        subject: getNestedValue(item, activeArea.subjectPath) || 'Sem assunto',
                        status: item.status || 'Sem status',
                        messages,
                        rawMessages: item.messages || {},
                        lastMessage,
                        unreadCount: countUnreadUserMessages(item.messages),
                        requestTime: getMessageTime(item[activeArea.datePath]),
                        lastMessageTime: getMessageTime(lastMessage?.timestamp),
                    };
                })
                .filter(thread => thread.messages.length > 0)
                .sort((a, b) => (b.lastMessageTime || b.requestTime) - (a.lastMessageTime || a.requestTime));

            setThreads(data);
        } catch (error) {
            console.error('Erro ao carregar mensagens do usuário:', error);
        } finally {
            setLoading(false);
        }
    }, [activeArea, currentUser]);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    useEffect(() => {
        localStorage.setItem('userMessageFavorites', JSON.stringify(favoriteIds));
    }, [favoriteIds]);

    const selectedThread = threads.find(thread => thread.id === selectedThreadId) || threads[0] || null;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ block: 'end' });
    }, [selectedThread?.id, selectedThread?.messages.length]);

    useEffect(() => {
        if (threads.length === 0) {
            setSelectedThreadId('');
            return;
        }

        if (!threads.some(thread => thread.id === selectedThreadId)) {
            setSelectedThreadId(threads[0].id);
        }
    }, [selectedThreadId, threads]);

    const filteredThreads = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();

        return threads.filter((thread) => {
            const matchesSearch = !search || [
                thread.areaTitle,
                thread.subject,
                thread.id,
                thread.status,
                thread.lastMessage?.text,
            ].some(value => String(value || '').toLowerCase().includes(search));

            const threadKey = `${thread.collectionName}-${thread.id}`;
            const matchesFilter =
                conversationFilter === 'all' ||
                (conversationFilter === 'unread' && thread.unreadCount > 0) ||
                (conversationFilter === 'favorites' && favoriteIds.includes(threadKey));

            return matchesSearch && matchesFilter;
        });
    }, [conversationFilter, favoriteIds, searchTerm, threads]);

    const unreadTotal = threads.reduce((total, thread) => total + thread.unreadCount, 0);

    const handleMarkAsRead = async (thread) => {
        const updates = buildReadUserMessagesUpdate(thread.rawMessages);
        if (Object.keys(updates).length === 0) return;

        await updateDoc(doc(firestore, thread.collectionName, thread.id), updates);
        await fetchMessages();
    };

    const handleSelectThread = async (thread) => {
        setSelectedThreadId(thread.id);
        setReplyText('');
        setMobileChatOpen(true);
        if (thread.unreadCount > 0) await handleMarkAsRead(thread);
    };

    const toggleFavorite = (thread) => {
        const threadKey = `${thread.collectionName}-${thread.id}`;
        setFavoriteIds(prev => (
            prev.includes(threadKey)
                ? prev.filter(id => id !== threadKey)
                : [...prev, threadKey]
        ));
    };

    const handleSendReply = async () => {
        const text = replyText.trim();
        if (!text || !selectedThread || sending) return;

        setSending(true);
        const newMessageId = Date.now().toString();
        const newMessage = {
            id: newMessageId,
            text,
            sender: 'user',
            timestamp: new Date().toISOString(),
            userId: currentUser.uid,
        };
        const previousThreads = threads;

        setReplyText('');
        setThreads(prev => prev.map(thread => (
            thread.collectionName === selectedThread.collectionName && thread.id === selectedThread.id
                ? {
                    ...thread,
                    messages: [...thread.messages, newMessage],
                    lastMessage: newMessage,
                    lastMessageTime: getMessageTime(newMessage.timestamp),
                }
                : thread
        )));

        try {
            await updateDoc(doc(firestore, selectedThread.collectionName, selectedThread.id), {
                [`messages.${newMessageId}`]: {
                    text,
                    sender: 'user',
                    timestamp: newMessage.timestamp,
                    userId: currentUser.uid,
                },
            });

            await fetchMessages();
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            setThreads(previousThreads);
            setReplyText(text);
            alert('Erro ao enviar mensagem.');
        } finally {
            setSending(false);
        }
    };

    if (!currentUser) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={(path) => navigate(path)} />
            <div className={`dashboard-content admin-chat-page user-chat-page ${mobileChatOpen ? 'mobile-chat-open' : 'mobile-chat-list'}`}>
                <div className="admin-chat-shell">
                    <aside className="admin-chat-sidebar">
                        <div className="admin-chat-sidebar-header">
                            <div>
                                <h1>Mensagens</h1>
                                <span>{unreadTotal} nova{unreadTotal === 1 ? '' : 's'} mensagem{unreadTotal === 1 ? '' : 's'}</span>
                            </div>
                            <button onClick={fetchMessages} className="admin-chat-icon-button" disabled={loading} title="Atualizar">
                                <LiaSyncSolid size={20} />
                            </button>
                        </div>

                        <div className="admin-chat-search">
                            <LiaSearchSolid size={18} />
                            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Pesquisar" />
                        </div>

                        <div className="admin-chat-area-tabs">
                            {MESSAGE_AREAS.map(area => (
                                <button
                                    key={area.id}
                                    className={activeArea?.id === area.id ? 'active' : ''}
                                    onClick={() => {
                                        setActiveTab(area.id);
                                        setSelectedThreadId('');
                                        setSearchTerm('');
                                    }}
                                >
                                    {area.title}
                                </button>
                            ))}
                        </div>

                        <div className="admin-chat-filters">
                            <button className={conversationFilter === 'all' ? 'active' : ''} onClick={() => setConversationFilter('all')}>Todas</button>
                            <button className={conversationFilter === 'unread' ? 'active' : ''} onClick={() => setConversationFilter('unread')}>Não lidas</button>
                            <button className={conversationFilter === 'favorites' ? 'active' : ''} onClick={() => setConversationFilter('favorites')}>Favoritas</button>
                        </div>

                        <div className="admin-chat-thread-list">
                            {loading && <p className="admin-chat-loading">Carregando conversas...</p>}

                            {!loading && filteredThreads.length === 0 && (
                                <div className="admin-chat-empty-list">
                                    <LiaCommentsSolid size={34} />
                                    <strong>Nenhuma conversa encontrada.</strong>
                                </div>
                            )}

                            {!loading && filteredThreads.map(thread => {
                                const threadKey = `${thread.collectionName}-${thread.id}`;
                                const isFavorite = favoriteIds.includes(threadKey);
                                const isSelected = selectedThread?.id === thread.id && selectedThread?.collectionName === thread.collectionName;

                                return (
                                    <button key={threadKey} className={`admin-chat-thread-item ${isSelected ? 'active' : ''}`} onClick={() => handleSelectThread(thread)}>
                                        <span className="admin-chat-avatar">{getInitials(thread.areaTitle)}</span>
                                        <span className="admin-chat-thread-main">
                                            <span className="admin-chat-thread-title">
                                                <strong>{thread.areaTitle}</strong>
                                                <small>{formatThreadTime(thread.lastMessage?.timestamp)}</small>
                                            </span>
                                            <span className="admin-chat-thread-subtitle">{thread.subject}</span>
                                            <span className="admin-chat-thread-last">
                                                {thread.lastMessage?.sender === 'user' && <LiaCheckDoubleSolid size={14} />}
                                                {getMessagePreview(thread.lastMessage)}
                                            </span>
                                        </span>
                                        <span className="admin-chat-thread-actions">
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                className={`admin-chat-favorite ${isFavorite ? 'active' : ''}`}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    toggleFavorite(thread);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        toggleFavorite(thread);
                                                    }
                                                }}
                                                title={isFavorite ? 'Remover dos favoritos' : 'Favoritar conversa'}
                                            >
                                                {isFavorite ? <LiaStarSolid size={18} /> : <LiaStar size={18} />}
                                            </span>
                                            {thread.unreadCount > 0 && <small className="admin-chat-unread-count">{thread.unreadCount}</small>}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <section className="admin-chat-panel">
                        {selectedThread ? (
                            <>
                                <header className="admin-chat-panel-header">
                                    <button className="admin-chat-back-button" onClick={() => setMobileChatOpen(false)} title="Voltar para conversas">
                                        <LiaArrowLeftSolid size={22} />
                                    </button>
                                    <div className="admin-chat-avatar large">{getInitials(selectedThread.areaTitle)}</div>
                                    <div>
                                        <h2>{selectedThread.areaTitle}</h2>
                                        <span>{selectedThread.status} · Protocolo {selectedThread.id}</span>
                                    </div>
                                    <button
                                        className={`admin-chat-icon-button favorite ${favoriteIds.includes(`${selectedThread.collectionName}-${selectedThread.id}`) ? 'active' : ''}`}
                                        onClick={() => toggleFavorite(selectedThread)}
                                        title="Favoritar conversa"
                                    >
                                        {favoriteIds.includes(`${selectedThread.collectionName}-${selectedThread.id}`) ? <LiaStarSolid size={22} /> : <LiaStar size={22} />}
                                    </button>
                                </header>

                                <div className="admin-chat-subject">
                                    <strong>{selectedThread.subject}</strong>
                                    <span>Última atividade: {formatDateTime(selectedThread.lastMessage?.timestamp)}</span>
                                </div>

                                <div className="admin-chat-messages">
                                    {selectedThread.messages.map(message => (
                                        <div key={message.id} className={`admin-chat-bubble-row ${message.sender === 'user' ? 'admin' : 'user'}`}>
                                            <div className={`admin-chat-bubble ${message.deletedByAdmin ? 'deleted' : ''}`}>
                                                {message.forwarded && <span className="admin-chat-forwarded-label">Encaminhada</span>}
                                                <p>{message.deletedByAdmin ? 'Mensagem apagada' : message.text}</p>
                                                <small>
                                                    {formatMessageTime(message.timestamp)}
                                                    {message.editedAt && !message.deletedByAdmin && <span>Editada</span>}
                                                    {message.sender === 'user' && <LiaCheckDoubleSolid size={14} />}
                                                </small>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>

                                <footer className="admin-chat-composer">
                                    <textarea
                                        value={replyText}
                                        onChange={(event) => setReplyText(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && !event.shiftKey) {
                                                event.preventDefault();
                                                handleSendReply();
                                            }
                                        }}
                                        placeholder="Digite uma mensagem"
                                        rows="1"
                                    />
                                    <button onClick={handleSendReply} disabled={!replyText.trim() || sending}>
                                        <LiaPaperPlane size={22} />
                                    </button>
                                </footer>
                            </>
                        ) : (
                            <div className="admin-chat-empty-panel">
                                <LiaUserCircleSolid size={58} />
                                <strong>Selecione uma conversa</strong>
                                <span>As mensagens aparecerão aqui.</span>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default MensagensUsuario;
