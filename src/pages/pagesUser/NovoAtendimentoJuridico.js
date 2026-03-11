import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase'; // Usa apenas o Realtime Database
import { ref, get, push, set, serverTimestamp } from 'firebase/database'; // Funções do Realtime Database
 
// Ícones
import { LiaPaperPlane, LiaArrowLeftSolid } from "react-icons/lia";

const NovoAtendimentoJuridico = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [formData, setFormData] = useState({
        assunto: '',
        descricao: '',
        dataAcontecimento: '',
        cepAcontecimento: '',
        cidadeAcontecimento: '',
        bairroAcontecimento: '',
        enderecoAcontecimento: '',
        numeroAcontecimento: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(''); 
    const [success, setSuccess] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingProfile] = useState(true);

    // Preenche dados do usuário logado, se disponíveis
    useEffect(() => {
        if (currentUser) {
            // Apenas verifica se o usuário está logado
        } else {
            // Se não houver usuário, redireciona para o login
            navigate('/login');
        }
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
                // Carrega todos os dados do perfil do usuário
                setLoggedInUserData({
                    nome: userData.name || currentUser.displayName || currentUser.email,
                    tipo: userData.tipo || 'Cidadão',
                    ...userData // Inclui cpf, telefone, endereço, etc.
                });
            } else {
                setError("Seu perfil de usuário não foi encontrado. Por favor, complete seu cadastro na página de Perfil.");
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
        setFormData(prevData => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            setError('Você precisa estar logado para enviar uma solicitação.');
            return;
        }

        // Validação dos novos campos
        if (!formData.assunto || !formData.descricao || !formData.dataAcontecimento) {
            setError('Por favor, preencha os campos: Assunto, Descrição e Data do acontecimento.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            // Estrutura os dados do usuário conforme solicitado
            const dadosUsuarioParaSalvar = {
                id: currentUser.uid,
                email: loggedInUserData?.email || currentUser.email,
                name: loggedInUserData?.name || 'Não informado',
                cpf: loggedInUserData?.cpf || 'Não informado',
                phone: loggedInUserData?.phone || 'Não informado',
                address: loggedInUserData?.address || 'Não informado',
                city: loggedInUserData?.city || 'Não informado',
                state: loggedInUserData?.state || 'Não informado',
                cep: loggedInUserData?.cep || 'Não informado',
            };

            // Cria uma nova referência com um ID único na coleção 'atendimento-juridico'
            const novaSolicitacaoRef = push(ref(db, 'atendimento-juridico'));

            // Salva os dados no Realtime Database
            await set(novaSolicitacaoRef, {
                dadosAcontecimento: formData, // Dados do formulário
                dadosUsuario: dadosUsuarioParaSalvar, // Dados filtrados do usuário
                userId: currentUser.uid,
                status: 'Aguardando Atendimento',
                dataSolicitacao: serverTimestamp(),
            });
            setSuccess('Sua solicitação foi enviada com sucesso! Você será redirecionado em breve.');
            setTimeout(() => navigate('/juridico'), 3000); // Redireciona para a lista após 3s
        } catch (err) {
            console.error("Erro ao enviar solicitação:", err);
            setError('Ocorreu um erro ao enviar sua solicitação. Tente novamente mais tarde.');
        } finally {
            setLoading(false);
        }
    };

    const handleNavigation = (path) => {
        navigate(path);
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleNavigation} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Atendimento Jurídico - Nova Solicitação</p>
                    </div>

                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div> {/* Círculo Azul */}
                    </div>
                </header>

                <div className="form-container">
                    <form onSubmit={handleSubmit}>
                        {/* Campos sobre o acontecimento */}
                        <h3 className="form-section-title">Sobre o Acontecimento</h3>
                        <div className="form-group">
                            <label htmlFor="dataAcontecimento">Data do Acontecimento *</label>
                            <input type="date" id="dataAcontecimento" name="dataAcontecimento" value={formData.dataAcontecimento} onChange={handleChange} required />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="cepAcontecimento">CEP</label>
                                <input type="text" id="cepAcontecimento" name="cepAcontecimento" value={formData.cepAcontecimento} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="cidadeAcontecimento">Cidade</label>
                                <input type="text" id="cidadeAcontecimento" name="cidadeAcontecimento" value={formData.cidadeAcontecimento} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="bairroAcontecimento">Bairro</label>
                                <input type="text" id="bairroAcontecimento" name="bairroAcontecimento" value={formData.bairroAcontecimento} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="enderecoAcontecimento">Endereço</label>
                                <input type="text" id="enderecoAcontecimento" name="enderecoAcontecimento" value={formData.enderecoAcontecimento} onChange={handleChange} />
                            </div>
                             <div className="form-group">
                                <label htmlFor="numeroAcontecimento">Número</label>
                                <input type="text" id="numeroAcontecimento" name="numeroAcontecimento" value={formData.numeroAcontecimento} onChange={handleChange} />
                            </div>
                        </div>

                        {/* Campos sobre a solicitação */}
                        <h3 className="form-section-title">Detalhes da Solicitação</h3>
                        <div className="form-group">
                            <label htmlFor="assunto">Assunto *</label>
                            <select id="assunto" name="assunto" value={formData.assunto} onChange={handleChange} required>
                                <option value="">Selecione o assunto</option>
                                <option value="Direito de Família">Direito de Família</option>
                                <option value="Questões de Vizinhança">Questões de Vizinhança</option>
                                <option value="Regularização de Imóveis">Regularização de Imóveis</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="descricao">Descreva seu caso *</label>
                            <textarea id="descricao" name="descricao" rows="6" value={formData.descricao} onChange={handleChange} required></textarea>
                        </div>
                        {error && <p className="error-message">{error}</p>}
                        {success && <p className="success-message">{success}</p>}
                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => navigate('/juridico')}>
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

export default NovoAtendimentoJuridico;