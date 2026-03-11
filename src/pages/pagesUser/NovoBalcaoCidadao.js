import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase';
import { ref, get, push, set, serverTimestamp } from 'firebase/database';

// Ícones
import { LiaPaperPlane, LiaArrowLeftSolid } from "react-icons/lia";

const NovoBalcaoCidadao = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [formData, setFormData] = useState({
        assunto: '',
        descricao: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingProfile] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
        }
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
                // Adiciona o avatar ao estado, assim como em Painel.js
                setLoggedInUserData({ ...userData, avatar: userData.avatarBase64 || null });
            } else {
                setError("Seu perfil de usuário não foi encontrado. Por favor, complete seu cadastro.");
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        } finally {
            setLoadingProfile(false);
        }
    }, [currentUser]);

    useEffect(() => { fetchUserProfile(); }, [fetchUserProfile]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevData => ({ ...prevData, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser || !loggedInUserData) {
            setError('Você precisa estar logado e ter um perfil para enviar uma solicitação.');
            return;
        }

        if (!formData.assunto || !formData.descricao) {
            setError('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const dadosUsuarioParaSalvar = {
                id: currentUser.uid,
                email: loggedInUserData?.email || currentUser.email,
                name: loggedInUserData?.name || 'Não informado',
                cpf: loggedInUserData?.cpf || 'Não informado',
                phone: loggedInUserData?.phone || 'Não informado',
            };

            const novaSolicitacaoRef = push(ref(db, 'balcao-cidadao'));

            await set(novaSolicitacaoRef, {
                dadosSolicitacao: formData,
                dadosUsuario: dadosUsuarioParaSalvar,
                userId: currentUser.uid,
                status: 'Aguardando Atendimento',
                dataSolicitacao: serverTimestamp(),
            });
            setSuccess('Sua solicitação foi enviada com sucesso! Você será redirecionado em breve.');
            setTimeout(() => navigate('/balcao'), 3000);
        } catch (err) {
            console.error("Erro ao enviar solicitação:", err);
            setError('Ocorreu um erro ao enviar sua solicitação. Tente novamente mais tarde.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={(path) => navigate(path)} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Balcão do Cidadão - Nova Solicitação</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.name || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar">
                            {loggedInUserData?.avatar ? (
                                <img src={`data:image/png;base64,${loggedInUserData.avatar}`} alt="Avatar do usuário" />
                            ) : (
                                <div className="user-avatar-placeholder" />
                            )}
                        </div>
                    </div>
                </header>

                <div className="form-container">
                    <form onSubmit={handleSubmit}>
                        <h3 className="form-section-title">Detalhes da Solicitação</h3>
                        <div className="form-group">
                            <label htmlFor="assunto">Assunto *</label>
                            <select id="assunto" name="assunto" value={formData.assunto} onChange={handleChange} required>
                                <option value="">Selecione o assunto</option>
                                <option value="Informações Gerais">Informações Gerais</option>
                                <option value="Solicitação de Documentos">Solicitação de Documentos</option>
                                <option value="Agendamento">Agendamento</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="descricao">Descreva sua solicitação *</label>
                            <textarea id="descricao" name="descricao" rows="6" value={formData.descricao} onChange={handleChange} required></textarea>
                        </div>
                        {error && <p className="error-message">{error}</p>}
                        {success && <p className="success-message">{success}</p>}
                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => navigate('/balcao')}>
                                <LiaArrowLeftSolid size={18} style={{ marginRight: '8px' }} />
                                Voltar
                            </button>
                            <button type="submit" className="btn-submit" disabled={loading}>
                                <LiaPaperPlane size={18} style={{ marginRight: '8px' }} />
                                {loading ? 'Enviando...' : 'Enviar Solicitação'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default NovoBalcaoCidadao;