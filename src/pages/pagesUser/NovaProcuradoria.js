import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase';
import { ref, get, push, set, serverTimestamp } from 'firebase/database';

// Ícones
import { LiaPaperPlane, LiaArrowLeftSolid } from "react-icons/lia";

const NovaProcuradoria = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [formData, setFormData] = useState({
        tipoAtendimento: '',
        tipoViolencia: '',
        identificacao: 'identificado',
        assunto: '',
        descricao: '',
        dataFato: '',
        nomeAgressor: '',
        relacaoAgressor: '',
        // Campos adicionais para denúncia anônima
        relacaoVitima: '',
        enderecoAcontecimento: '',
        pontoReferencia: '',
    });
    const [anexos, setAnexos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) return;
        const userRef = ref(db, 'users/' + currentUser.uid);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                setLoggedInUserData(snapshot.val());
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
        } else {
            fetchUserProfile();
        }
    }, [currentUser, navigate, fetchUserProfile]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevData => ({ ...prevData, [name]: value }));
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        const filePromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve({ name: file.name, type: file.type, data: event.target.result });
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });
        });

        Promise.all(filePromises)
            .then(fileData => setAnexos(fileData))
            .catch(err => setError("Erro ao processar arquivos."));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.tipoAtendimento || !formData.assunto || !formData.descricao) {
            setError('Por favor, preencha os campos: Tipo de Atendimento, Assunto e Descrição.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            let dadosUsuarioParaSalvar = { identificacao: 'Anônimo' };

            if (formData.identificacao === 'identificado' && currentUser) {
                dadosUsuarioParaSalvar = {
                    identificacao: 'Identificado',
                    id: currentUser.uid,
                    email: loggedInUserData?.email || currentUser.email,
                    name: loggedInUserData?.name || 'Não informado',
                    cpf: loggedInUserData?.cpf || 'Não informado',
                    phone: loggedInUserData?.phone || 'Não informado',
                };
            }

            const novaSolicitacaoRef = push(ref(db, 'procuradoria-mulher'));

            await set(novaSolicitacaoRef, {
                dadosSolicitacao: { ...formData, anexos },
                dadosUsuario: dadosUsuarioParaSalvar,
                userId: formData.identificacao === 'identificado' ? currentUser.uid : 'anonimo',
                status: 'Recebida',
                dataSolicitacao: serverTimestamp(),
            });

            setSuccess('Sua solicitação foi enviada com sucesso e será tratada com sigilo e urgência. Você será redirecionada em breve.');
            setTimeout(() => navigate('/procuradoria'), 3000);
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
                        <p>Procuradoria da Mulher - Novo Atendimento</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.name || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <div className="form-container">
                    <form onSubmit={handleSubmit}>
                        <h3 className="form-section-title">Registro de Atendimento</h3>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="tipoAtendimento">Tipo de Atendimento *</label>
                                <select id="tipoAtendimento" name="tipoAtendimento" value={formData.tipoAtendimento} onChange={handleChange} required>
                                    <option value="">Selecione o tipo</option>
                                    <option value="Aconselhamento Jurídico">Aconselhamento Jurídico</option>
                                    <option value="Apoio Psicológico">Apoio Psicológico</option>
                                    <option value="Denúncia de Violência">Denúncia de Violência</option>
                                    <option value="Solicitação de Medida Protetiva">Solicitação de Medida Protetiva</option>
                                    <option value="Outros">Outros</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="identificacao">Identificação</label>
                                <select id="identificacao" name="identificacao" value={formData.identificacao} onChange={handleChange}>
                                    <option value="identificado">Quero me identificar</option>
                                    <option value="anonimo">Prefiro não me identificar (Anônimo)</option>
                                </select>
                            </div>
                        </div>

                        {formData.tipoAtendimento === 'Denúncia de Violência' && (
                            <div className="form-group">
                                <label htmlFor="tipoViolencia">Tipo de Violência (se aplicável)</label>
                                <select id="tipoViolencia" name="tipoViolencia" value={formData.tipoViolencia} onChange={handleChange}>
                                    <option value="">Selecione o tipo de violência</option>
                                    <option value="Física">Física</option>
                                    <option value="Psicológica">Psicológica</option>
                                    <option value="Moral">Moral</option>
                                    <option value="Sexual">Sexual</option>
                                    <option value="Patrimonial">Patrimonial</option>
                                </select>
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="assunto">Assunto *</label>
                            <input type="text" id="assunto" name="assunto" value={formData.assunto} onChange={handleChange} required />
                        </div>

                        <div className="form-group">
                            <label htmlFor="descricao">Descrição detalhada da situação *</label>
                            <textarea id="descricao" name="descricao" rows="8" value={formData.descricao} onChange={handleChange} required placeholder="Descreva o que aconteceu com o máximo de detalhes possível. Sua segurança é nossa prioridade."></textarea>
                        </div>

                        {/* Seção que aparece apenas para denúncias anônimas */}
                        {formData.identificacao === 'anonimo' && (
                            <>
                                <h3 className="form-section-title">Informações da Ocorrência (Anônimo)</h3>
                                <div className="form-group">
                                    <label htmlFor="relacaoVitima">Quem é a vítima? *</label>
                                    <select id="relacaoVitima" name="relacaoVitima" value={formData.relacaoVitima} onChange={handleChange} required>
                                        <option value="">Selecione a vítima</option>
                                        <option value="Sou eu">Sou eu</option>
                                        <option value="Meu familiar">Meu familiar</option>
                                        <option value="Minha amiga">Minha amiga</option>
                                        <option value="Minha mãe">Minha mãe</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="enderecoAcontecimento">Endereço do Acontecimento *</label>
                                    <input type="text" id="enderecoAcontecimento" name="enderecoAcontecimento" value={formData.enderecoAcontecimento} onChange={handleChange} placeholder="Rua, número, bairro e cidade" required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="pontoReferencia">Ponto de Referência</label>
                                    <input type="text" id="pontoReferencia" name="pontoReferencia" value={formData.pontoReferencia} onChange={handleChange} />
                                </div>
                            </>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="dataFato">Data do Fato</label>
                                <input type="date" id="dataFato" name="dataFato" value={formData.dataFato} onChange={handleChange} />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="nomeAgressor">Nome do Acusado (se ouver)</label>
                                <input type="text" id="nomeAgressor" name="nomeAgressor" value={formData.nomeAgressor} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="relacaoAgressor">Sua relação com o acusado (se ouver)</label>
                                <input type="text" id="relacaoAgressor" name="relacaoAgressor" value={formData.relacaoAgressor} onChange={handleChange} placeholder="Ex: Cônjuge, ex-namorado, vizinho..." />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="anexos">Anexar Provas (fotos, prints, documentos, etc.)</label>
                            <input type="file" id="anexos" name="anexos" multiple onChange={handleFileChange} />
                        </div>

                        {error && <p className="error-message">{error}</p>}
                        {success && <p className="success-message">{success}</p>}

                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => navigate('/procuradoria')}>
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

export default NovaProcuradoria;