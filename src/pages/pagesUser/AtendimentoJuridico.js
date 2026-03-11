import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { db } from '../../firebase'; // Usa apenas o Realtime Database
import Sidebar from '../../components/Sidebar';
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database'; // Funções do Realtime Database

// Ícones
import { LiaPlusSolid, LiaTimesSolid } from "react-icons/lia";

// Componente Modal para exibir detalhes
const AtendimentoModal = ({ atendimento, onClose }) => {
    if (!atendimento) return null;

    const { dadosAcontecimento, status, dataSolicitacao } = atendimento;

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
                    <div className="detail-item"><strong>Situação:</strong> <span className={`status-badge ${getStatusClass(status)}`}>{status}</span></div>
                    <div className="detail-item"><strong>Data da Solicitação:</strong> {new Date(dataSolicitacao).toLocaleDateString('pt-BR')}</div>
                    <hr />
                    <h4>Sobre o Acontecimento</h4>
                    <div className="detail-item"><strong>Assunto:</strong> {dadosAcontecimento?.assunto || 'N/A'}</div>
                    <div className="detail-item"><strong>Data do Acontecimento:</strong> {dadosAcontecimento?.dataAcontecimento ? new Date(dadosAcontecimento.dataAcontecimento).toLocaleDateString('pt-BR') : 'N/A'}</div>
                    <div className="detail-item"><strong>Endereço do Acontecimento:</strong> {`${dadosAcontecimento?.enderecoAcontecimento || ''}, ${dadosAcontecimento?.numeroAcontecimento || ''} - ${dadosAcontecimento?.bairroAcontecimento || ''}, ${dadosAcontecimento?.cidadeAcontecimento || ''}`}</div>
                    <div className="detail-item"><strong>Descrição:</strong></div>
                    <p className="detail-description">{dadosAcontecimento?.descricao || 'N/A'}</p>
                </div>
            </div>
        </div>
    );
};

// Função auxiliar de classe de status (movida para fora para ser acessível pelo Modal)
const getStatusClass = (status) => {
    switch (status) {
        case 'Aguardando Atendimento': return 'status-pending';
        case 'Em Análise': return 'status-in-progress';
        case 'Concluído': return 'status-completed';
        default: return '';
    }
};

const AtendimentoJuridico = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [atendimentos, setAtendimentos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingProfile] = useState(true);
    const [selectedAtendimento, setSelectedAtendimento] = useState(null);

    useEffect(() => {
        const fetchAtendimentos = async () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            setLoading(true);
            try {
                const atendimentosRef = ref(db, 'atendimento-juridico');
                const q = query(atendimentosRef, orderByChild('userId'), equalTo(currentUser.uid));

                onValue(q, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const atendimentosList = Object.keys(data).map(key => ({
                            id: key,
                            ...data[key]
                        })).sort((a, b) => b.dataSolicitacao - a.dataSolicitacao); // Ordena do mais novo para o mais antigo
                        setAtendimentos(atendimentosList);
                    } else {
                        setAtendimentos([]);
                    }
                    setLoading(false);
                });

            } catch (err) {
                console.error("Erro ao buscar atendimentos:", err);
                setError("Não foi possível carregar seus atendimentos. Tente novamente mais tarde.");
                setLoading(false);
            }
        };

        fetchAtendimentos();
    }, [currentUser, navigate]);

    // Busca os dados do perfil do usuário no Realtime Database
    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) {
            setLoadingProfile(false);
            return;
        }

        const userId = currentUser.uid;
        const userRef = ref(db, 'users/' + userId); // Usa db
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

    const handleNavigation = (path) => {
        navigate(path);
    };

    const handleOpenModal = (atendimento) => {
        setSelectedAtendimento(atendimento);
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Atendimento Jurídico - Meus Atendimentos</p>
                    </div>

                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div> {/* Círculo Azul */}
                    </div>
                </header>

                <div className="page-actions-bar">
                    
                    <button className="btn-send-solicita" onClick={() => navigate('/juridico/novo')}>
                        <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                        Nova Solicitação
                    </button>
                </div>

                <div className="data-list-container">
                    {loading && <p>Carregando atendimentos...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && atendimentos.length === 0 && !error && (
                        <p>Você ainda não possui nenhuma solicitação de atendimento jurídico.</p>
                    )}
                    {!loading && atendimentos.length > 0 && (
                        <ul className="data-list">
                            {atendimentos.map(atendimento => (
                                <li key={atendimento.id} className="data-list-item" onClick={() => handleOpenModal(atendimento)}>
                                    <div className="item-main-info">
                                        <strong>Assunto: {atendimento.dadosAcontecimento?.assunto || 'Não especificado'}</strong>
                                        <span>
                                            Data: {new Date(atendimento.dataSolicitacao).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${getStatusClass(atendimento.status)}`}>
                                            {atendimento.status}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <AtendimentoModal atendimento={selectedAtendimento} onClose={() => setSelectedAtendimento(null)} />
            </div>
        </div>
    );
};

export default AtendimentoJuridico;