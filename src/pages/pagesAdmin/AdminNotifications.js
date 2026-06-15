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
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [sending, setSending] = useState(false);

    const searchUsers = async (term) => {
        const trimmedTerm = term.trim();
        if (trimmedTerm.length < 3) {
            setUsers([]);
            return;
        }
        const normalizedTerm = trimmedTerm.toLowerCase();
        const digitTerm = trimmedTerm.replace(/\D/g, '');

        setLoadingUsers(true);
        try {
            const usersRef = collection(firestore, 'users');
            // Nota: Firestore não tem busca por 'contains', então buscamos um lote e filtramos
            const q = query(usersRef, limit(200));
            const snap = await getDocs(q);
            const results = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => {
                    const name = u.name?.toLowerCase() || '';
                    const email = u.email?.toLowerCase() || '';
                    const cpf = (u.cpf || u.CPF || '').toLowerCase();
                    const phone = (u.telefone || u.phone || '').toLowerCase();
                    const uid = (u.id || '').toLowerCase();
                    const userNumber = String(u.numero || u.number || '').toLowerCase();
                    const rawCpf = cpf.replace(/\D/g, '');
                    const rawPhone = phone.replace(/\D/g, '');
                    const hasSelected = selectedUsers.some(selected => selected.id === u.id);

                    return !hasSelected && (
                        name.includes(normalizedTerm) ||
                        email.includes(normalizedTerm) ||
                        cpf.includes(normalizedTerm) ||
                        phone.includes(normalizedTerm) ||
                        uid.includes(normalizedTerm) ||
                        userNumber.includes(normalizedTerm) ||
                        (digitTerm.length >= 2 && (rawCpf.includes(digitTerm) || rawPhone.includes(digitTerm)))
                    );
                })
                .slice(0, 50);
            setUsers(results);
        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSearchTermChange = (value) => {
        setSearchTerm(value);
        searchUsers(value);
    };

    const addUser = (user) => {
        if (selectedUsers.some(u => u.id === user.id) || selectedUsers.length >= 10) return;
        setSelectedUsers(prev => [...prev, user]);
        setUsers(prev => prev.filter(u => u.id !== user.id));
    };

    const removeUser = (userId) => {
        setSelectedUsers(prev => prev.filter(u => u.id !== userId));
    };

    const handleSend = async () => {
        if (selectedUsers.length === 0 || !title || !description) return alert("Preencha todos os campos e selecione ao menos 1 usuário.");
        setSending(true);
        try {
            await onSend(selectedUsers, title, description);
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
                        <label>Buscar Usuário (Nome, E-mail, CPF, Telefone)</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => handleSearchTermChange(e.target.value)}
                                className="form-input"
                                placeholder="Digite 3 ou mais caracteres"
                            />
                            <button onClick={() => searchUsers(searchTerm)} className="btn-secondary" disabled={loadingUsers || searchTerm.trim().length < 3}>
                                Pesquisar
                            </button>
                        </div>
                        <small style={{ color: '#6b7280', marginTop: '8px', display: 'block' }}>
                            Selecione até 10 usuários para enviar a mesma notificação.
                        </small>
                    </div>

                    {selectedUsers.length > 0 && (
                        <div style={{ marginBottom: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>Fila de Destinatários</strong>
                                <small style={{ color: '#6b7280' }}>{selectedUsers.length} de 10 selecionados</small>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {selectedUsers.map(user => (
                                    <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#eef2ff', borderRadius: '14px', minWidth: '220px' }}>
                                        <div>
                                            <strong style={{ display: 'block' }}>{user.name || user.email || 'Usuário'}</strong>
                                            <small style={{ color: '#4b5563' }}>
                                                {user.email ? `${user.email}` : ''}
                                                {user.cpf || user.CPF ? ` • ${user.cpf || user.CPF}` : ''}
                                                {user.telefone || user.phone ? ` • ${user.telefone || user.phone}` : ''}
                                            </small>
                                        </div>
                                        <button type="button" onClick={() => removeUser(user.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                            Remover
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {users.length > 0 && (
                        <ul className="data-list" style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '15px', border: '1px solid #eee' }}>
                            {users.map(u => (
                                <li key={u.id} className="data-list-item" onClick={() => addUser(u)} style={{ padding: '8px', cursor: selectedUsers.length >= 10 ? 'not-allowed' : 'pointer' }}>
                                    <small>{u.name || u.email} {u.email ? `(${u.email})` : ''}</small>
                                </li>
                            ))}
                        </ul>
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

    const handleNewNotification = async (users, title, description) => {
        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notifyRef = collection(firestore, 'notifications');
        const mailRef = collection(firestore, 'mail');

        const tasks = users.map(user => Promise.all([
            addDoc(notifyRef, {
                isRead: false,
                targetUserId: user.id,
                timestamp: serverTimestamp(),
                tituloNotification: title,
                descricaoNotification: description,
                userEmail: user.email,
                userId: user.id,
                protocolo: 'ADMIN-MANUAL'
            }),
            addDoc(mailRef, {
                to: user.email,
                message: {
                    subject: title,
                    html: `<p><strong>Câmara Municipal de ${cityName}</strong></p><p>${description}</p>`,
                },
                timestamp: serverTimestamp()
            })
        ]));

        await Promise.all(tasks);
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