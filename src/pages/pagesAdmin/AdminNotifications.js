import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, startAfter, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaArrowLeftSolid, LiaSearchSolid, LiaBellSolid, LiaPlusSolid, LiaTimesSolid, LiaPaperPlane } from "react-icons/lia";

/* ── Componente Modal para Enviar Notificação ── */
const SendNotificationModal = ({ onClose, onSend }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [sending, setSending] = useState(false);

    const searchUsers = async () => {
        if (searchTerm.length < 3) return;
        setLoadingUsers(true);
        try {
            const usersRef = collection(firestore, 'users');
            // Nota: Firestore não tem busca por 'contains', então buscamos um lote e filtramos
            const q = query(usersRef, limit(100));
            const snap = await getDocs(q);
            const results = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => 
                    (u.name?.toLowerCase().includes(searchTerm.toLowerCase())) || 
                    (u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
                );
            setUsers(results);
        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSend = async () => {
        if (!selectedUser || !title || !description) return alert("Preencha todos os campos e selecione um usuário.");
        setSending(true);
        try {
            await onSend(selectedUser, title, description);
            onClose();
        } catch (error) {
            alert("Erro ao enviar.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h3>Enviar Nova Notificação</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Buscar Usuário (Nome ou E-mail)</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-input" placeholder="Mínimo 3 caracteres..." />
                            <button onClick={searchUsers} className="btn-secondary" disabled={loadingUsers}>Pesquisar</button>
                        </div>
                    </div>

                    {users.length > 0 && !selectedUser && (
                        <ul className="data-list" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '15px', border: '1px solid #eee' }}>
                            {users.map(u => (
                                <li key={u.id} className="data-list-item" onClick={() => setSelectedUser(u)} style={{ padding: '8px', cursor: 'pointer' }}>
                                    <small>{u.name} ({u.email})</small>
                                </li>
                            ))}
                        </ul>
                    )}

                    {selectedUser && (
                        <div style={{ background: '#f3f4f6', padding: '10px', borderRadius: '8px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Para: <strong>{selectedUser.name}</strong></span>
                            <button onClick={() => setSelectedUser(null)} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Trocar</button>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Título da Notificação</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="form-input" placeholder="Ex: Documento Disponível" />
                    </div>

                    <div className="form-group">
                        <label>Mensagem / Descrição</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} className="form-input" rows="4" placeholder="Descreva o motivo da notificação..." />
                    </div>

                    <button onClick={handleSend} className="btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={sending}>
                        {sending ? 'Enviando...' : <><LiaPaperPlane /> Disparar Notificação</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminNotifications = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [currentPage, setCurrentPage] = useState(1);
    const [cursors, setCursors] = useState([null]);
    const [lastDoc, setLastDoc] = useState(null);
    const [isLastPage, setIsLastPage] = useState(false);
    const itemsPerPage = 15;
    const [showSendModal, setShowSendModal] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchNotifications = useCallback(async (cursor = null) => {
        setLoading(true);
        try {
            const notifyRef = collection(firestore, 'notifications');
            let q = query(notifyRef, orderBy('timestamp', 'desc'), limit(itemsPerPage));
            
            if (cursor) {
                q = query(notifyRef, orderBy('timestamp', 'desc'), startAfter(cursor), limit(itemsPerPage));
            }

            const snapshot = await getDocs(q);
            const fetchedData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                dateDisplay: doc.data().timestamp?.toMillis 
                    ? new Date(doc.data().timestamp.toMillis()).toLocaleString('pt-BR')
                    : doc.data().timestamp ? new Date(doc.data().timestamp).toLocaleString('pt-BR') : 'N/A'
            }));

            setNotifications(fetchedData);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setIsLastPage(snapshot.docs.length < itemsPerPage);
        } catch (error) {
            console.error('Erro ao buscar notificações:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthReady) fetchNotifications();
    }, [isAuthReady, fetchNotifications]);

    const handleNextPage = () => {
        if (!lastDoc || isLastPage) return;
        setCursors(prev => [...prev, lastDoc]);
        fetchNotifications(lastDoc);
        setCurrentPage(prev => prev + 1);
    };

    const handlePrevPage = () => {
        if (currentPage <= 1) return;
        const newHistory = cursors.slice(0, -1);
        const targetCursor = newHistory[newHistory.length - 1];
        fetchNotifications(targetCursor);
        setCursors(newHistory);
        setCurrentPage(prev => prev - 1);
    };

    const filteredNotifications = notifications.filter(n => 
        (n.userEmail?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (n.tituloNotification?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (n.protocolo?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const handleNewNotification = async (user, title, description) => {
        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        
        // 1. Salvar no Firestore de Notificações
        const notifyRef = collection(firestore, 'notifications');
        await addDoc(notifyRef, {
            isRead: false,
            targetUserId: user.id,
            timestamp: serverTimestamp(),
            tituloNotification: title,
            descricaoNotification: description,
            userEmail: user.email,
            userId: user.id,
            protocolo: 'ADMIN-MANUAL'
        });

        // 2. Salvar na fila de e-mail
        const mailRef = collection(firestore, 'mail');
        await addDoc(mailRef, {
            to: user.email,
            message: {
                subject: title,
                html: `<p><strong>Câmara Municipal de ${cityName}</strong></p><p>${description}</p>`,
            },
            timestamp: serverTimestamp()
        });
        fetchNotifications();
    };

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <button onClick={() => navigate('/admin-balcao')} className="btn-secondary" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                            <LiaArrowLeftSolid size={18} /> Voltar
                        </button>
                        <h1>Logs de Notificações</h1>
                        <p>Histórico de alertas enviados para os usuários (Push App)</p>
                    </div>
                    <div className="page-actions-bar" style={{ padding: 0 }}>
                        <button onClick={() => setShowSendModal(true)} className="btn-primary">
                            <LiaPlusSolid /> Enviar Nova Notificação
                        </button>
                    </div>
                </header>

                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div style={{ position: 'relative' }}>
                        <LiaSearchSolid style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por email, título ou protocolo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="form-input"
                            style={{ paddingLeft: '42px', margin: 0 }}
                        />
                    </div>
                </div>

                <div className="data-card">
                    <div className="card-header">
                        <h3>Notificações Disparadas</h3>
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Página {currentPage}</span>
                    </div>

                    {loading ? <p style={{ padding: '20px' }}>Carregando...</p> : (
                        <ul className="data-list">
                            {filteredNotifications.map((n) => (
                                <li key={n.id} className="data-list-item" style={{ cursor: 'default' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                        <div style={{ background: n.isRead ? '#f3f4f6' : '#eff6ff', padding: '10px', borderRadius: '8px' }}>
                                            <LiaBellSolid size={24} color={n.isRead ? '#9ca3af' : '#3b82f6'} />
                                        </div>
                                        <div className="item-main-info">
                                            <strong>{n.tituloNotification || 'Sem Título'}</strong>
                                            <span>{n.userEmail} {n.protocolo && `(Prot: ${n.protocolo})`}</span>
                                            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '4px 0' }}>{n.descricaoNotification}</p>
                                            <small style={{ color: '#9ca3af' }}>Disparado em: {n.dateDisplay}</small>
                                        </div>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${n.isRead ? 'status-concluido' : 'status-aguardando-atendimento'}`} style={{ fontSize: '0.65rem' }}>
                                            {n.isRead ? 'Lida pelo usuário' : 'Não lida'}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', padding: '20px' }}>
                        <button onClick={handlePrevPage} disabled={currentPage === 1 || loading} className="btn-secondary" style={{ padding: '6px 14px', opacity: currentPage === 1 ? 0.4 : 1 }}>
                            Anterior
                        </button>
                        <button onClick={handleNextPage} disabled={isLastPage || loading} className="btn-primary" style={{ padding: '6px 20px', opacity: isLastPage ? 0.4 : 1 }}>
                            Próxima Página ➔
                        </button>
                    </div>
                </div>
            </div>

            {showSendModal && (
                <SendNotificationModal 
                    onClose={() => setShowSendModal(false)} 
                    onSend={handleNewNotification} 
                />
            )}
        </div>
    );
};

export default AdminNotifications;