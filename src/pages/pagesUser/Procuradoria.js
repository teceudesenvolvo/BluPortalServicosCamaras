import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { db } from '../../firebase';
import Sidebar from '../../components/Sidebar';
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';

// Ícones
import { LiaPlusSolid, LiaTimesSolid, LiaShieldAltSolid, LiaExclamationTriangleSolid } from "react-icons/lia";

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
                    <div className="detail-item"><strong>Tipo de Atendimento:</strong> {dadosSolicitacao?.tipoAtendimento || 'N/A'}</div>
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
        case 'Recebida': return 'status-pending';
        case 'Em Acolhimento': return 'status-in-progress';
        case 'Encaminhada': return 'status-in-progress';
        case 'Concluída': return 'status-completed';
        default: return '';
    }
};

const Procuradoria = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [selectedSolicitacao, setSelectedSolicitacao] = useState(null);

    const handlePanicClick = async () => {
        if (!window.confirm("Tem certeza que deseja acionar o botão de pânico? Uma mensagem de ajuda será preparada para envio.")) {
            return;
        }

        // 1. Buscar o contato de emergência
        const configRef = ref(db, `procuradoria-mulher-btn-panico/${currentUser.uid}`);
        const snapshot = await get(configRef);

        if (!snapshot.exists() || !snapshot.val().telefone) {
            alert("Você precisa configurar um telefone de confiança primeiro. Vá para 'Configurar Botão de Pânico'.");
            navigate('/procuradoria/panico-config');
            return;
        }
        const telefoneContato = snapshot.val().telefone;

        // 2. Obter a localização
        if (!navigator.geolocation) {
            alert("Geolocalização não é suportada pelo seu navegador.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
                const mensagem = `SOCORRO! Preciso de ajuda urgente. Minha localização aproximada é: ${mapsLink}`;
                
                // 3. Abrir o app de SMS
                window.location.href = `sms:${telefoneContato}?body=${encodeURIComponent(mensagem)}`;
            },
            () => {
                alert("Não foi possível obter sua localização. Verifique as permissões do navegador.");
            }
        );
    };

    useEffect(() => {
        const fetchSolicitacoes = () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            setLoading(true);
            try {
                const solicitacoesRef = ref(db, 'procuradoria-mulher');
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
        if (!currentUser) return;
        const userRef = ref(db, 'users/' + currentUser.uid);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                setLoggedInUserData({
                    nome: userData.name || currentUser.email,
                    tipo: userData.tipo || 'Cidadão',
                    sexo: userData.sexo, // Adiciona o sexo para a lógica do botão
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
    const handleOpenModal = (solicitacao) => setSelectedSolicitacao(solicitacao);

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p style={{ color: '#ff15ffff' }}>Procuradoria da Mulher - Meus Atendimentos</p>
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
                    <div className="page-actions-buttons">
                        {loggedInUserData?.sexo === 'feminino' && (
                            <>
                                <button className="btn-secondary" onClick={() => navigate('/procuradoria/panico-config')}>
                                    <LiaShieldAltSolid size={18} style={{ marginRight: '8px' }} />
                                    Configurar Pânico
                                </button>
                                <button className="btn-danger" onClick={handlePanicClick}>
                                    <LiaExclamationTriangleSolid size={18} style={{ marginRight: '8px' }} />
                                    Botão de Pânico
                                </button>
                            </>
                        )}
                        <button className="btn-send-solicita" onClick={() => navigate('/procuradoria/nova')}>
                            <LiaPlusSolid size={18} style={{ marginRight: '8px' }} />
                            Novo Atendimento
                        </button>
                    </div>
                </div>

                <div className="data-list-container">
                    {loading && <p>Carregando atendimentos...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && solicitacoes.length === 0 && !error && (
                        <p>Você ainda não possui nenhum atendimento identificado registrado.</p>
                    )}
                    {!loading && solicitacoes.length > 0 && (
                        <ul className="data-list">
                            {solicitacoes.map(item => (
                                <li key={item.id} className="data-list-item" onClick={() => handleOpenModal(item)}>
                                    <div className="item-main-info">
                                        <strong>Assunto: {item.dadosSolicitacao?.assunto || 'Não especificado'}</strong>
                                        <span>Data: {new Date(item.dataSolicitacao).toLocaleDateString('pt-BR')}</span>
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

                <SolicitacaoModal solicitacao={selectedSolicitacao} onClose={() => setSelectedSolicitacao(null)} />
            </div>
        </div>
    );
};

export default Procuradoria;