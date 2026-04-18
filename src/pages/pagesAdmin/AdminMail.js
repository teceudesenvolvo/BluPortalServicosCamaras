import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, startAfter } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaArrowLeftSolid, LiaSearchSolid, LiaEnvelopeSolid } from "react-icons/lia";

const AdminMail = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [emails, setEmails] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [cursors, setCursors] = useState([null]);
    const [lastDoc, setLastDoc] = useState(null);
    const [isLastPage, setIsLastPage] = useState(false);
    const itemsPerPage = 15;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchEmails = useCallback(async (cursor = null) => {
        setLoading(true);
        try {
            const mailRef = collection(firestore, 'mail');
            let q = query(mailRef, orderBy('timestamp', 'desc'), limit(itemsPerPage));
            
            if (cursor) {
                q = query(mailRef, orderBy('timestamp', 'desc'), startAfter(cursor), limit(itemsPerPage));
            }

            const snapshot = await getDocs(q);
            const fetchedData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                dateDisplay: doc.data().timestamp?.toMillis 
                    ? new Date(doc.data().timestamp.toMillis()).toLocaleString('pt-BR')
                    : doc.data().timestamp ? new Date(doc.data().timestamp).toLocaleString('pt-BR') : 'N/A'
            }));

            setEmails(fetchedData);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setIsLastPage(snapshot.docs.length < itemsPerPage);
        } catch (error) {
            console.error('Erro ao buscar e-mails:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthReady) fetchEmails();
    }, [isAuthReady, fetchEmails]);

    const handleNextPage = () => {
        if (!lastDoc || isLastPage) return;
        setCursors(prev => [...prev, lastDoc]);
        fetchEmails(lastDoc);
        setCurrentPage(prev => prev + 1);
    };

    const handlePrevPage = () => {
        if (currentPage <= 1) return;
        const newHistory = cursors.slice(0, -1);
        const targetCursor = newHistory[newHistory.length - 1];
        fetchEmails(targetCursor);
        setCursors(newHistory);
        setCurrentPage(prev => prev - 1);
    };

    const filteredEmails = emails.filter(email => 
        (email.to?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (email.message?.subject?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

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
                        <h1>Logs de E-mail</h1>
                        <p>Visualização da fila de mensagens enviadas pelo Firestore</p>
                    </div>
                </header>

                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div style={{ position: 'relative' }}>
                        <LiaSearchSolid style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por destinatário ou assunto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="form-input"
                            style={{ paddingLeft: '42px', margin: 0 }}
                        />
                    </div>
                </div>

                <div className="data-card">
                    <div className="card-header">
                        <h3>Histórico de Mensagens</h3>
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Página {currentPage}</span>
                    </div>

                    {loading ? <p style={{ padding: '20px' }}>Carregando fila...</p> : (
                        <ul className="data-list">
                            {filteredEmails.map((email) => (
                                <li key={email.id} className="data-list-item" style={{ cursor: 'default' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                        <div style={{ background: '#f3f4f6', padding: '10px', borderRadius: '8px' }}>
                                            <LiaEnvelopeSolid size={24} color="#3b82f6" />
                                        </div>
                                        <div className="item-main-info">
                                            <strong>{email.message?.subject || '(Sem Assunto)'}</strong>
                                            <span>Para: {email.to}</span>
                                            <small style={{ color: '#9ca3af' }}>Enviado em: {email.dateDisplay}</small>
                                        </div>
                                    </div>
                                    <div className="item-status">
                                        <span className="status-badge status-concluido" style={{ fontSize: '0.7rem' }}>
                                            Firestore Queue
                                        </span>
                                    </div>
                                </li>
                            ))}
                            {filteredEmails.length === 0 && <p style={{ padding: '20px', textAlign: 'center' }}>Nenhum registro encontrado.</p>}
                        </ul>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', padding: '20px' }}>
                        <button
                            onClick={handlePrevPage}
                            disabled={currentPage === 1 || loading}
                            className="btn-secondary"
                            style={{ padding: '6px 14px', opacity: currentPage === 1 ? 0.4 : 1 }}
                        >
                            Anterior
                        </button>
                        <button
                            onClick={handleNextPage}
                            disabled={isLastPage || loading}
                            className="btn-primary"
                            style={{ padding: '6px 20px', opacity: isLastPage ? 0.4 : 1 }}
                        >
                            Próxima Página ➔
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminMail;