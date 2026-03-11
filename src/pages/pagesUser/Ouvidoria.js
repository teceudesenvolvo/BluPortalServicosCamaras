import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { db } from '../../firebase';
import Sidebar from '../../components/Sidebar';
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';

// Ícones
import { LiaPlusSolid, LiaTimesSolid } from "react-icons/lia";

// Componente Modal para exibir detalhes
const ManifestacaoModal = ({ manifestacao, onClose }) => {
    if (!manifestacao) return null;

    const { dadosManifestacao, status, dataManifestacao } = manifestacao;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Manifestação</h3>
                    <button onClick={onClose} className="modal-close-btn">
                        <LiaTimesSolid />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="detail-item"><strong>Status:</strong> <span className={`status-badge ${getStatusClass(status)}`}>{status}</span></div>
                    <div className="detail-item"><strong>Data da Manifestação:</strong> {new Date(dataManifestacao).toLocaleDateString('pt-BR')}</div>
                    <hr />
                    <h4>Detalhes</h4>
                    <div className="detail-item"><strong>Tipo:</strong> {dadosManifestacao?.tipoManifestacao || 'N/A'}</div>
                    <div className="detail-item"><strong>Assunto:</strong> {dadosManifestacao?.assunto || 'N/A'}</div>
                    <div className="detail-item"><strong>Descrição:</strong></div>
                    <p className="detail-description">{dadosManifestacao?.descricao || 'N/A'}</p>
                </div>
            </div>
        </div>
    );
};

const getStatusClass = (status) => {
    switch (status) {
        case 'Recebida': return 'status-pending';
        case 'Em Análise': return 'status-in-progress';
        case 'Respondida': return 'status-completed';
        case 'Encaminhada': return 'status-in-progress';
        default: return '';
    }
};

const Ouvidoria = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [manifestacoes, setManifestacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [selectedManifestacao, setSelectedManifestacao] = useState(null);

    useEffect(() => {
        const fetchManifestacoes = () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            setLoading(true);
            try {
                const manifestacoesRef = ref(db, 'ouvidoria');
                const q = query(manifestacoesRef, orderByChild('userId'), equalTo(currentUser.uid));

                onValue(q, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const manifestacoesList = Object.keys(data).map(key => ({
                            id: key,
                            ...data[key]
                        })).sort((a, b) => b.dataManifestacao - a.dataManifestacao);
                        setManifestacoes(manifestacoesList);
                    } else {
                        setManifestacoes([]);
                    }
                    setLoading(false);
                });

            } catch (err) {
                console.error("Erro ao buscar manifestações:", err);
                setError("Não foi possível carregar suas manifestações. Tente novamente mais tarde.");
                setLoading(false);
            }
        };

        fetchManifestacoes();
    }, [currentUser, navigate]);

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) return;
        const userRef = ref(db, 'users/' + currentUser.uid);
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
        }
    }, [currentUser]);

    useEffect(() => { fetchUserProfile(); }, [fetchUserProfile]);

    const handleNavigation = (path) => navigate(path);
    const handleOpenModal = (manifestacao) => setSelectedManifestacao(manifestacao);

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Ouvidoria - Minhas Manifestações</p>
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
                    <button className="btn-send-solicita" onClick={() => navigate('/ouvidoria/nova')}>
                        <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                        Nova Manifestação
                    </button>
                </div>

                <div className="data-list-container">
                    {loading && <p>Carregando manifestações...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && manifestacoes.length === 0 && !error && (
                        <p>Você ainda não possui nenhuma manifestação identificada.</p>
                    )}
                    {!loading && manifestacoes.length > 0 && (
                        <ul className="data-list">
                            {manifestacoes.map(item => (
                                <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}>
                                    <div className="item-main-info">
                                        <strong>Assunto: {item.dadosManifestacao?.assunto || 'Não especificado'}</strong>
                                        <span>Data: {new Date(item.dataManifestacao).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div className="item-status">
                                        <span className={`status-badge ${getStatusClass(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <ManifestacaoModal manifestacao={selectedManifestacao} onClose={() => setSelectedManifestacao(null)} />
            </div>
        </div>
    );
};

export default Ouvidoria;