import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { db } from '../../firebase';
import Sidebar from '../../components/Sidebar';
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';

// Ícones
import { LiaPlusSolid, LiaTimesSolid } from "react-icons/lia";

// Componente Modal para exibir detalhes
const SolicitacaoModal = ({ solicitacao, onClose }) => {
    if (!solicitacao) return null;

    const { dadosSolicitacao, status, dataSolicitacao } = solicitacao;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Solicitação</h3>
                    <button onClick={onClose} className="modal-close-btn">
                        <LiaTimesSolid />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="detail-item"><strong>Status:</strong> <span className={`status-badge ${getStatusClass(status)}`}>{status}</span></div>
                    <div className="detail-item"><strong>Data da Solicitação:</strong> {new Date(dataSolicitacao).toLocaleDateString('pt-BR')}</div>
                    <hr />
                    <h4>Detalhes</h4>
                    <div className="detail-item"><strong>Assunto:</strong> {dadosSolicitacao?.assunto || 'N/A'}</div>
                    <div className="detail-item"><strong>Descrição:</strong></div>
                    <p className="detail-description">{dadosSolicitacao?.descricao || 'N/A'}</p>
                </div>
            </div>
        </div>
    );
};

const getStatusClass = (status) => {
    switch (status) {
        case 'Aguardando Atendimento': return 'status-pending';
        case 'Em Análise': return 'status-in-progress';
        case 'Concluído': return 'status-completed';
        default: return '';
    }
};

const BalcaoCidadao = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingProfile] = useState(true);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    useEffect(() => {
        const fetchSolicitacoes = () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            setLoading(true);
            try {
                const solicitacoesRef = ref(db, 'balcao-cidadao');
                const q = query(solicitacoesRef, orderByChild('userId'), equalTo(currentUser.uid));

                onValue(q, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const solicitacoesList = Object.keys(data).map(key => ({
                            id: key,
                            ...data[key]
                        })).sort((a, b) => b.dataSolicitacao - a.dataSolicitacao);
                        setSolicitacoes(solicitacoesList);
                    } else {
                        setSolicitacoes([]);
                    }
                    setLoading(false);
                });

            } catch (err) {
                console.error("Erro ao buscar solicitações:", err);
                setError("Não foi possível carregar suas solicitações. Tente novamente mais tarde.");
                setLoading(false);
            }
        };

        fetchSolicitacoes();
    }, [currentUser, navigate]);

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) {
            setLoadingProfile(false);
            return;
        }

        const userId = currentUser.uid;
        const userRef = ref(db, 'users/' + userId);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                setLoggedInUserData({
                    nome: userData.name || currentUser.email,
                    tipo: userData.tipo || 'Cidadão',
                });
            } else {
                setLoggedInUserData({ nome: currentUser.displayName || 'Usuário', tipo: 'Cidadão' });
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        } finally {
            setLoadingProfile(false);
        }
    }, [currentUser]);

    useEffect(() => { fetchUserProfile(); }, [fetchUserProfile]);

    const handleNavigation = (path) => navigate(path);
    const handleOpenModal = (solicitacao) => setSelectedSolicitacao(solicitacao);

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Balcão do Cidadão - Minhas Solicitações</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <div className="page-actions-bar">
                    <button className="btn-send-solicita" onClick={() => navigate('/balcao/novo')}>
                        <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                        Nova Solicitação
                    </button>
                </div>

                <div className="data-list-container">
                    {loading && <p>Carregando solicitações...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && solicitacoes.length === 0 && !error && (
                        <p>Você ainda não possui nenhuma solicitação no Balcão do Cidadão.</p>
                    )}
                    {!loading && solicitacoes.length > 0 && (
                        <ul className="data-list">
                            {solicitacoes.map(solicitacao => (
                                <li key={solicitacao.id} className="data-list-item" onClick={() => handleOpenModal(solicitacao)}>
                                    <div className="item-main-info">
                                        <strong>Assunto: {solicitacao.dadosSolicitacao?.assunto || 'Não especificado'}</strong>
                                        <span>Data: {new Date(solicitacao.dataSolicitacao).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${getStatusClass(solicitacao.status)}`}>
                                            {solicitacao.status}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <SolicitacaoModal solicitacao={selectedSolicitacao} onClose={() => setSelectedSolicitacao(null)} />
            </div>
        </div>
    );
};

export default BalcaoCidadao;