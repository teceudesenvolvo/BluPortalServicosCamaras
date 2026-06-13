import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    updateDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
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
import AdminSidebar from '../../components/AdminSidebar';
import { auth, firestore } from '../../firebase';
import {
    buildReadMessagesUpdate,
    countUnreadAdminMessages,
    getLastMessage,
    getMessagesArray,
    getMessageTime,
} from '../../utils/adminMessages';

const MESSAGE_AREAS = [
    {
        id: 'balcao',
        title: 'Balcão',
        role: 'Balcão',
        collectionName: 'balcao-cidadao',
        subjectPath: ['dadosSolicitacao', 'assunto'],
        datePath: 'dataSolicitacao',
    },
    {
        id: 'ouvidoria',
        title: 'Ouvidoria',
        role: 'Ouvidoria',
        collectionName: 'ouvidoria',
        subjectPath: ['dadosManifestacao', 'assunto'],
        datePath: 'dataManifestacao',
    },
    {
        id: 'procuradoria',
        title: 'Procuradoria',
        role: 'Procuradoria',
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
    if (!message) return 'Sem prévia';
    if (message.deletedByAdmin) return 'Mensagem apagada';
    return message.text || 'Sem prévia';
};

const AdminMensagens = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userType, setUserType] = useState('');
    const [loading, setLoading] = useState(true);
    const [threads, setThreads] = useState([]);
    const [activeTab, setActiveTab] = useState('');
    const [selectedThreadId, setSelectedThreadId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [conversationFilter, setConversationFilter] = useState('all');
    const [favoriteIds, setFavoriteIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('adminMessageFavorites') || '[]');
        } catch {
            return [];
        }
    });
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [actionMenuMessageId, setActionMenuMessageId] = useState('');
    const [editingMessage, setEditingMessage] = useState(null);
    const [forwardingMessage, setForwardingMessage] = useState(null);
    const [forwardSearchTerm, setForwardSearchTerm] = useState('');
    const [mobileChatOpen, setMobileChatOpen] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                navigate('/');
                return;
            }

            const userRef = doc(firestore, 'users', user.uid);
            const snapshot = await getDoc(userRef);
            const type = snapshot.exists() ? snapshot.data().tipo || 'Cidadão' : 'Cidadão';
            setUserType(type);
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, [navigate]);

    const visibleAreas = useMemo(() => {
        if (userType === 'Admin') return MESSAGE_AREAS;
        return MESSAGE_AREAS.filter(area => area.role === userType);
    }, [userType]);

    const activeArea = visibleAreas.find(area => area.id === activeTab) || visibleAreas[0];

    const fetchMessages = useCallback(async () => {
        if (!activeArea) return;

        setLoading(true);
        try {
            const snapshot = await getDocs(query(collection(firestore, activeArea.collectionName), limit(300)));
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
                        requester: item.dadosUsuario?.name || item.dadosUsuario?.email || 'Usuário não identificado',
                        requesterEmail: item.dadosUsuario?.email || '',
                        status: item.status || 'Sem status',
                        messages,
                        lastMessage,
                        unreadCount: countUnreadAdminMessages(item.messages),
                        requestTime: getMessageTime(item[activeArea.datePath]),
                        lastMessageTime: getMessageTime(lastMessage?.timestamp),
                    };
                })
                .filter(thread => thread.messages.length > 0)
                .sort((a, b) => (b.lastMessageTime || b.requestTime) - (a.lastMessageTime || a.requestTime));

            setThreads(data);
        } catch (error) {
            console.error('Erro ao carregar mensagens administrativas:', error);
        } finally {
            setLoading(false);
        }
    }, [activeArea]);

    useEffect(() => {
        if (!isAuthReady || visibleAreas.length === 0) return;
        if (!activeTab) {
            setActiveTab(visibleAreas[0].id);
        }
    }, [activeTab, isAuthReady, visibleAreas]);

    useEffect(() => {
        if (!isAuthReady || !activeArea) return;
        fetchMessages();
    }, [activeArea, fetchMessages, isAuthReady]);

    useEffect(() => {
        localStorage.setItem('adminMessageFavorites', JSON.stringify(favoriteIds));
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
                thread.requester,
                thread.requesterEmail,
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
    const pinnedMessages = selectedThread?.messages.filter(message => message.pinnedByAdmin && !message.deletedByAdmin) || [];
    const forwardableThreads = useMemo(() => {
        const search = forwardSearchTerm.trim().toLowerCase();

        return threads
            .filter(thread => !(thread.id === selectedThread?.id && thread.collectionName === selectedThread?.collectionName))
            .filter(thread => !search || [
                thread.requester,
                thread.requesterEmail,
                thread.areaTitle,
                thread.subject,
                thread.id,
                thread.status,
            ].some(value => String(value || '').toLowerCase().includes(search)));
    }, [forwardSearchTerm, selectedThread?.collectionName, selectedThread?.id, threads]);

    const handleMarkAsRead = async (thread) => {
        const updates = buildReadMessagesUpdate(
            thread.messages.reduce((acc, message) => {
                acc[message.id] = message;
                return acc;
            }, {}),
        );

        if (Object.keys(updates).length === 0) return;

        await updateDoc(doc(firestore, thread.collectionName, thread.id), updates);
        await fetchMessages();
    };

    const handleSelectThread = async (thread) => {
        setSelectedThreadId(thread.id);
        setReplyText('');
        setMobileChatOpen(true);
        if (thread.unreadCount > 0) {
            await handleMarkAsRead(thread);
        }
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
            sender: 'admin',
            timestamp: new Date().toISOString(),
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
            const firestoreMessage = {
                text,
                sender: 'admin',
                timestamp: newMessage.timestamp,
            };

            await updateDoc(doc(firestore, selectedThread.collectionName, selectedThread.id), {
                [`messages.${newMessageId}`]: firestoreMessage,
            });

            await fetchMessages();
        } catch (error) {
            console.error('Erro ao enviar mensagem administrativa:', error);
            setThreads(previousThreads);
            setReplyText(text);
            alert('Erro ao enviar mensagem.');
        } finally {
            setSending(false);
        }
    };

    const handleEditMessage = async () => {
        const text = editingMessage?.text?.trim();
        if (!text || !selectedThread || !editingMessage) return;

        try {
            await updateDoc(doc(firestore, selectedThread.collectionName, selectedThread.id), {
                [`messages.${editingMessage.id}.text`]: text,
                [`messages.${editingMessage.id}.editedAt`]: new Date().toISOString(),
            });
            setEditingMessage(null);
            setActionMenuMessageId('');
            await fetchMessages();
        } catch (error) {
            console.error('Erro ao editar mensagem:', error);
            alert('Erro ao editar mensagem.');
        }
    };

    const handleDeleteMessage = async (message) => {
        setActionMenuMessageId('');
        if (!selectedThread || !window.confirm('Apagar esta mensagem?')) return;

        try {
            await updateDoc(doc(firestore, selectedThread.collectionName, selectedThread.id), {
                [`messages.${message.id}.text`]: '',
                [`messages.${message.id}.deletedByAdmin`]: true,
                [`messages.${message.id}.deletedAt`]: new Date().toISOString(),
                [`messages.${message.id}.pinnedByAdmin`]: false,
            });
            await fetchMessages();
        } catch (error) {
            console.error('Erro ao apagar mensagem:', error);
            alert('Erro ao apagar mensagem.');
        }
    };

    const handleTogglePinnedMessage = async (message) => {
        if (!selectedThread) return;

        try {
            await updateDoc(doc(firestore, selectedThread.collectionName, selectedThread.id), {
                [`messages.${message.id}.pinnedByAdmin`]: !message.pinnedByAdmin,
                [`messages.${message.id}.pinnedAt`]: !message.pinnedByAdmin ? new Date().toISOString() : null,
            });
            setActionMenuMessageId('');
            await fetchMessages();
        } catch (error) {
            console.error('Erro ao fixar mensagem:', error);
            alert('Erro ao fixar mensagem.');
        }
    };

    const handleForwardMessage = async (targetThread) => {
        if (!forwardingMessage || !targetThread) return;

        try {
            const newMessageId = Date.now().toString();
            const forwardedText = forwardingMessage.deletedByAdmin ? '' : forwardingMessage.text;
            await updateDoc(doc(firestore, targetThread.collectionName, targetThread.id), {
                [`messages.${newMessageId}`]: {
                    text: forwardedText,
                    sender: 'admin',
                    timestamp: new Date().toISOString(),
                    forwarded: true,
                    forwardedFrom: {
                        threadId: selectedThread?.id || '',
                        collectionName: selectedThread?.collectionName || '',
                        messageId: forwardingMessage.id,
                    },
                },
            });
            setForwardingMessage(null);
            setForwardSearchTerm('');
            setActionMenuMessageId('');
            await fetchMessages();
        } catch (error) {
            console.error('Erro ao encaminhar mensagem:', error);
            alert('Erro ao encaminhar mensagem.');
        }
    };

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    if (visibleAreas.length === 0) {
        return (
            <div className="dashboard-layout">
                <AdminSidebar />
                <div className="dashboard-content" style={{ padding: '40px' }}>
                    <div className="data-card">
                        <h2>Acesso indisponível</h2>
                        <p>Seu usuário não possui permissão para acessar mensagens administrativas.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className={`dashboard-content admin-chat-page ${mobileChatOpen ? 'mobile-chat-open' : 'mobile-chat-list'}`}>
                <div className="admin-chat-shell">
                    <aside className="admin-chat-sidebar">
                        <div className="admin-chat-sidebar-header">
                            <div>
                                <h1>Conversas</h1>
                                <span>{unreadTotal} nova{unreadTotal === 1 ? '' : 's'} mensagem{unreadTotal === 1 ? '' : 's'}</span>
                            </div>
                            <button onClick={fetchMessages} className="admin-chat-icon-button" disabled={loading} title="Atualizar">
                                <LiaSyncSolid size={20} />
                            </button>
                        </div>

                        <div className="admin-chat-search">
                            <LiaSearchSolid size={18} />
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Pesquisar"
                            />
                        </div>

                        <div className="admin-chat-area-tabs">
                            {visibleAreas.map(area => (
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
                                    <button
                                        key={threadKey}
                                        className={`admin-chat-thread-item ${isSelected ? 'active' : ''}`}
                                        onClick={() => handleSelectThread(thread)}
                                    >
                                        <span className="admin-chat-avatar">{getInitials(thread.requester)}</span>
                                        <span className="admin-chat-thread-main">
                                            <span className="admin-chat-thread-title">
                                                <strong>{thread.requester}</strong>
                                                <small>{formatThreadTime(thread.lastMessage?.timestamp)}</small>
                                            </span>
                                            <span className="admin-chat-thread-subtitle">{thread.subject}</span>
                                            <span className="admin-chat-thread-last">
                                                {thread.lastMessage?.sender === 'admin' && <LiaCheckDoubleSolid size={14} />}
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
                                    <button
                                        className="admin-chat-back-button"
                                        onClick={() => setMobileChatOpen(false)}
                                        title="Voltar para conversas"
                                    >
                                        <LiaArrowLeftSolid size={22} />
                                    </button>
                                    <div className="admin-chat-avatar large">{getInitials(selectedThread.requester)}</div>
                                    <div>
                                        <h2>{selectedThread.requester}</h2>
                                        <span>{selectedThread.areaTitle} · {selectedThread.status} · Protocolo {selectedThread.id}</span>
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

                                {pinnedMessages.length > 0 && (
                                    <div className="admin-chat-pinned">
                                        <strong>Mensagem fixada</strong>
                                        <span>{getMessagePreview(pinnedMessages[pinnedMessages.length - 1])}</span>
                                    </div>
                                )}

                                <div className="admin-chat-messages">
                                    {selectedThread.messages.map(message => (
                                        <div key={message.id} className={`admin-chat-bubble-row ${message.sender === 'admin' ? 'admin' : 'user'} ${message.pinnedByAdmin ? 'pinned' : ''}`}>
                                            <div className={`admin-chat-bubble ${message.deletedByAdmin ? 'deleted' : ''}`}>
                                                <button
                                                    className="admin-chat-message-menu-button"
                                                    onClick={() => setActionMenuMessageId(prev => prev === message.id ? '' : message.id)}
                                                    title="Ações da mensagem"
                                                >
                                                    ...
                                                </button>
                                                {actionMenuMessageId === message.id && (
                                                    <div className="admin-chat-message-menu">
                                                        {message.sender === 'admin' && !message.deletedByAdmin && (
                                                            <button onClick={() => {
                                                                setActionMenuMessageId('');
                                                                setEditingMessage({ id: message.id, text: message.text || '' });
                                                            }}>Editar</button>
                                                        )}
                                                        {!message.deletedByAdmin && (
                                                            <>
                                                                <button onClick={() => {
                                                                    setActionMenuMessageId('');
                                                                    setForwardingMessage(message);
                                                                    setForwardSearchTerm('');
                                                                }}>Encaminhar</button>
                                                                <button onClick={() => {
                                                                    setActionMenuMessageId('');
                                                                    handleTogglePinnedMessage(message);
                                                                }}>
                                                                    {message.pinnedByAdmin ? 'Desafixar' : 'Fixar'}
                                                                </button>
                                                            </>
                                                        )}
                                                        <button onClick={() => handleDeleteMessage(message)}>Apagar</button>
                                                    </div>
                                                )}

                                                {editingMessage?.id === message.id ? (
                                                    <div className="admin-chat-edit-box">
                                                        <textarea
                                                            value={editingMessage.text}
                                                            onChange={(event) => setEditingMessage(prev => ({ ...prev, text: event.target.value }))}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter' && !event.shiftKey) {
                                                                    event.preventDefault();
                                                                    handleEditMessage();
                                                                }
                                                            }}
                                                            rows="3"
                                                            autoFocus
                                                        />
                                                        <div>
                                                            <button onClick={() => setEditingMessage(null)}>Cancelar</button>
                                                            <button onClick={handleEditMessage}>Salvar</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {message.forwarded && <span className="admin-chat-forwarded-label">Encaminhada</span>}
                                                        {message.pinnedByAdmin && <span className="admin-chat-pinned-label">Fixada</span>}
                                                        <p>{message.deletedByAdmin ? 'Mensagem apagada' : message.text}</p>
                                                    </>
                                                )}
                                                <small>
                                                    {formatMessageTime(message.timestamp)}
                                                    {message.editedAt && !message.deletedByAdmin && <span>Editada</span>}
                                                    {message.sender === 'admin' && <LiaCheckDoubleSolid size={14} />}
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

                {forwardingMessage && (
                    <div className="admin-chat-forward-modal">
                        <div className="admin-chat-forward-card">
                            <header>
                                <div>
                                    <strong>Encaminhar mensagem</strong>
                                    <span>{getMessagePreview(forwardingMessage)}</span>
                                </div>
                                <button onClick={() => {
                                    setForwardingMessage(null);
                                    setForwardSearchTerm('');
                                }}>Fechar</button>
                            </header>
                            <div className="admin-chat-forward-search">
                                <LiaSearchSolid size={18} />
                                <input
                                    value={forwardSearchTerm}
                                    onChange={(event) => setForwardSearchTerm(event.target.value)}
                                    placeholder="Pesquisar conversa"
                                    autoFocus
                                />
                            </div>
                            <div className="admin-chat-forward-list">
                                {forwardableThreads.length === 0 && (
                                    <div className="admin-chat-forward-empty">Nenhuma conversa encontrada.</div>
                                )}

                                {forwardableThreads.map(thread => (
                                    <button key={`${thread.collectionName}-${thread.id}`} onClick={() => handleForwardMessage(thread)}>
                                        <span className="admin-chat-avatar">{getInitials(thread.requester)}</span>
                                        <span>
                                            <strong>{thread.requester}</strong>
                                            <small>{thread.areaTitle} · {thread.subject}</small>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminMensagens;
