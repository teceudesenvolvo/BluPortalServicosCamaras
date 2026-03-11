import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Importações do Firebase
import { getDatabase, ref, query, orderByChild, equalTo, get } from 'firebase/database';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';

import {
    LiaPlusSolid,
    LiaPaperclipSolid,
    LiaTimesSolid,
} from "react-icons/lia";

// Componente Card de Reclamação
const ComplaintCard = ({ complaint, onDetailsClick }) => {
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleDateString('pt-BR');
    };

    const statusMap = {
        'Em Análise': 'analise',
        'Aberta': 'aberto',
        'Fechado': 'fechado',
        'aberta': 'aberto', // Adicionado para corresponder ao valor do formulário
        'Em Resposta': 'analise',
    };

    const statusClass = statusMap[complaint.status] || 'analise';

    return (
        <div className="card" onClick={() => onDetailsClick(complaint)}>
            <div className={`status-badge ${statusClass}`}>{complaint.status || 'Em Análise'}</div>
            <div className="card-protocol">Protocolo: {complaint.protocolo}</div>
            <div className="card-detail-item"><strong>Tipo:</strong> {complaint.tipoReclamacao || 'N/A'}</div>
            <div className="card-detail-item"><strong>Classificação:</strong> {complaint.classificacao || 'N/A'}</div>
            <div className="card-detail-item"><strong>Assunto:</strong> {complaint.assuntoDenuncia ? String(complaint.assuntoDenuncia).substring(0, 25) + '...' : 'N/A'}</div>
            <div className="card-detail-item"><strong>Data Contratação:</strong> {formatDate(complaint.dataContratacao)}</div>
            <div className="card-detail-item"><strong>Registrado em:</strong> {formatDate(complaint.createdAt)}</div>
            <a href="/procon-atendimentos" className="card-link" onClick={(e) => { e.preventDefault(); onDetailsClick(complaint); }}>
                Clique para ver detalhes
            </a>
        </div>
    );
};

// Componente Modal de Detalhes
const ComplaintDetailsModal = ({ complaint, onClose }) => {
    if (!complaint) return null;

    const formatDate = (dateStringOrTimestamp) => {
        if (!dateStringOrTimestamp) return 'N/A';
        const date = new Date(dateStringOrTimestamp);
        return date.toLocaleDateString('pt-BR');
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <button className="modal-close-button" onClick={onClose}>
                    <LiaTimesSolid />
                </button>
                <h2 className="modal-title">Detalhes da Reclamação</h2>
                
                <div className="status-badge analise">Protocolo: {complaint.protocolo}</div>
                
                <div className="modal-section-title">Informações Principais</div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Status:</span>
                    <span className="modal-detail-value">{complaint.status || 'Em Análise'}</span>
                </div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Empresa Reclamada:</span>
                    <span className="modal-detail-value">{complaint.companyName || 'N/A'}</span>
                </div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">CNPJ:</span>
                    <span className="modal-detail-value">{complaint.cnpjEmpresaReclamada || 'N/A'}</span>
                </div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Registrado em:</span>
                    <span className="modal-detail-value">{formatDate(complaint.createdAt)}</span>
                </div>

                <div className="modal-section-title">Detalhes do Contrato</div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Tipo de Reclamação:</span>
                    <span className="modal-detail-value">{complaint.tipoReclamacao}</span>
                </div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Assunto / Serviço:</span>
                    <span className="modal-detail-value">{complaint.assuntoDenuncia}</span>
                </div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Valor da Compra:</span>
                    <span className="modal-detail-value">{complaint.valorCompra || '0,00'}</span>
                </div>
                <div className="modal-detail-row">
                    <span className="modal-detail-label">Data Contratação:</span>
                    <span className="modal-detail-value">{formatDate(complaint.dataContratacao)}</span>
                </div>
                
                <div className="modal-section-title">Descrição da Reclamação</div>
                <p className="modal-description">
                    {complaint.descricao || 'Descrição não fornecida.'}
                </p>

                <div className="modal-section-title">Pedido do Consumidor</div>
                <p className="modal-description">
                    {complaint.pedidoConsumidor || 'N/A'}
                </p>
                
                {/* Lista de Arquivos */}
                {(complaint.arquivos && complaint.arquivos.length > 0) && (
                    <>
                        <div className="modal-section-title">Arquivos Anexados</div>
                        <ul className="file-list">
                            {complaint.arquivos.map((file, index) => (
                                <li key={index}>
                                    <a href={file.data} target="_blank" rel="noopener noreferrer" className="file-link">
                                        <LiaPaperclipSolid /> {file.name}
                                    </a>
                                    {file.sender === 'admin' && <span className="sender-tag admin-tag">Admin</span>}
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {/* Histórico de Mensagens */}
                <div className="modal-section-title">Mensagens</div>
                <div className="message-history">
                    {complaint.messages && Object.values(complaint.messages).length > 0 ? Object.values(complaint.messages).map((msg, index) => (
                        <div key={index} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
                            <p>{msg.text}</p>
                            <small>{new Date(msg.timestamp).toLocaleString('pt-BR')}</small>
                        </div>
                    )) : <p>Nenhuma mensagem trocada.</p>}
                </div>
            </div>
        </div>
    );
};


const ProconAtendimento = () => {
    const navigate = useNavigate();
    const { currentUser: user } = useAuth();
    
    // ESTADOS ESPECÍFICOS DE ATENDIMENTO
    const [complaints, setComplaints] = useState([]);
    const [loadingComplaints, setLoadingComplaints] = useState(true);
    const [error, setError] = useState(null);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    // Adiciona o estado para os dados do perfil do usuário
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingLoggedInUserData] = useState(true);
    
    const handleNavigation = (path) => {
        navigate(path);
    };

    // 2. BUSCA DE RECLAMAÇÕES (APÓS AUTENTICAÇÃO)
    const fetchComplaints = useCallback(async () => {
        if (!user) return;

        setLoadingComplaints(true);
        setError(null);
        
        const db = getDatabase();
        const complaintsRef = ref(db, 'denuncias-procon');
        
        try {
            const q = query(complaintsRef, orderByChild('userId'), equalTo(user.uid));
            const snapshot = await get(q);

            if (snapshot.exists()) {
                const data = snapshot.val();
                const complaintsList = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                // Ordena pela data de criação mais recente
                complaintsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setComplaints(complaintsList);
            } else {
                setComplaints([]);
            }
        } catch (error) {
            console.error("Erro ao buscar reclamações:", error);
            setError("Erro ao carregar o histórico de atendimentos. Verifique as regras de segurança do seu Realtime Database.");
        } finally {
            setLoadingComplaints(false);
        }
    }, [user]);

    // Busca os dados do perfil do usuário
    const fetchUserProfile = useCallback(async () => {
        if (!user) return;
        const db = getDatabase();
        const userRef = ref(db, 'users/' + user.uid); // Busca o usuário específico pelo UID
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                setLoggedInUserData({
                    uid: user.uid,
                    name: userData.name || user.displayName || 'Usuário',
                    email: user.email,
                    tipo: userData.tipo || 'Cidadão',
                });
            } else {
                setLoggedInUserData({ uid: user.uid, name: user.displayName || 'Usuário', email: user.email, tipo: 'Cidadão' });
            }
        } finally {
            setLoadingLoggedInUserData(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchComplaints();
            fetchUserProfile();
        }
    }, [user, fetchComplaints, fetchUserProfile]);

    // Funções do Modal
    const openDetailsModal = (complaint) => {
        setSelectedComplaint(complaint);
    };

    const closeDetailsModal = () => {
        setSelectedComplaint(null);
    };


    if (error) {
        return (
            <div className="loading-full-screen">
                <div className="error-message">
                    <h1>Erro Crítico</h1>
                    <p>{error}</p>
                    <p>Por favor, recarregue a página ou verifique a conexão.</p>
                </div>
            </div>
        );
    }
    
    // Conteúdo Principal
    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                
                {/* Cabeçalho da Imagem */}
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Procon - Meus Atendimentos</p>
                    </div>

                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.name || user?.email || 'Usuário'}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div> {/* Círculo Azul */}
                    </div>
                </header>
                
                {loadingComplaints ? (
                    <div className="loading-full-screen" style={{ minHeight: '300px' }}>
                        Carregando suas reclamações...
                    </div>
                ) : (
                    <div className="complaint-grid">
                        
                        {/* Card: Criar Novo Chamado */}
                        <div className="card new-complaint" onClick={() => handleNavigation('/procon')}>
                            <LiaPlusSolid className="icon-plus" />
                            <span>Criar Novo Chamado</span>
                            <small>Inicie um novo processo de reclamação ou solicitação</small>
                        </div>

                        {/* Lista de Reclamações */}
                        {complaints.length > 0 ? (
                            complaints.map(complaint => (
                                <ComplaintCard 
                                    key={complaint.id} 
                                    complaint={complaint} 
                                    onDetailsClick={openDetailsModal} 
                                />
                            ))
                        ) : (
                            <p style={{ gridColumn: 'span 2', textAlign: 'center', color: '#6b7280' }}>
                                Você ainda não possui reclamações registradas.
                            </p>
                        )}
                    </div>
                )}
                
                {/* Modal de Detalhes */}
                <ComplaintDetailsModal 
                    complaint={selectedComplaint} 
                    onClose={closeDetailsModal} 
                />

                <footer style={{ marginTop: '50px', textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af' }}>
                    Desenvolvido por Blu Tecnologias
                </footer>
            </div>
        </div>
    );
};

export default ProconAtendimento;
