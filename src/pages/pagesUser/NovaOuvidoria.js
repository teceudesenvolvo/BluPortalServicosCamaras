import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase';
import { ref, get, push, set, serverTimestamp } from 'firebase/database';

// Ícones
import { LiaPaperPlane, LiaArrowLeftSolid } from "react-icons/lia";

const NovaOuvidoria = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [formData, setFormData] = useState({
        tipoManifestacao: '',
        identificacao: 'identificado', // 'identificado' ou 'anonimo'
        assunto: '',
        descricao: '',
        localFato: '',
        dataFato: '',
        envolvidos: '',
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

        if (!formData.tipoManifestacao || !formData.assunto || !formData.descricao) {
            setError('Por favor, preencha os campos: Tipo de Manifestação, Assunto e Descrição.');
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

            const novaManifestacaoRef = push(ref(db, 'ouvidoria'));

            await set(novaManifestacaoRef, {
                dadosManifestacao: { ...formData, anexos },
                dadosUsuario: dadosUsuarioParaSalvar,
                userId: formData.identificacao === 'identificado' ? currentUser.uid : 'anonimo',
                status: 'Recebida',
                dataManifestacao: serverTimestamp(),
            });

            setSuccess('Sua manifestação foi enviada com sucesso! Você será redirecionado em breve.');
            setTimeout(() => navigate('/ouvidoria'), 3000);
        } catch (err) {
            console.error("Erro ao enviar manifestação:", err);
            setError('Ocorreu um erro ao enviar sua manifestação. Tente novamente mais tarde.');
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
                        <p>Ouvidoria - Nova Manifestação</p>
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
                        <h3 className="form-section-title">Registro de Manifestação</h3>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="tipoManifestacao">Tipo de Manifestação *</label>
                                <select id="tipoManifestacao" name="tipoManifestacao" value={formData.tipoManifestacao} onChange={handleChange} required>
                                    <option value="">Selecione o tipo</option>
                                    <option value="Reclamação">Reclamação</option>
                                    <option value="Sugestão">Sugestão</option>
                                    <option value="Denúncia">Denúncia</option>
                                    <option value="Elogio">Elogio</option>
                                    <option value="Crítica">Crítica</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="identificacao">Identificação</label>
                                <select id="identificacao" name="identificacao" value={formData.identificacao} onChange={handleChange}>
                                    <option value="identificado">Identificado</option>
                                    <option value="anonimo">Anônimo</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="assunto">Assunto *</label>
                            <input type="text" id="assunto" name="assunto" value={formData.assunto} onChange={handleChange} required />
                        </div>

                        <div className="form-group">
                            <label htmlFor="descricao">Descrição detalhada da manifestação *</label>
                            <textarea id="descricao" name="descricao" rows="8" value={formData.descricao} onChange={handleChange} required></textarea>
                        </div>

                        <h3 className="form-section-title">Informações Adicionais (Opcional)</h3>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="dataFato">Data do Fato</label>
                                <input type="date" id="dataFato" name="dataFato" value={formData.dataFato} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="localFato">Local do Fato</label>
                                <input type="text" id="localFato" name="localFato" value={formData.localFato} onChange={handleChange} />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="envolvidos">Pessoas ou setores envolvidos</label>
                            <input type="text" id="envolvidos" name="envolvidos" value={formData.envolvidos} onChange={handleChange} />
                        </div>

                        <div className="form-group">
                            <label htmlFor="anexos">Anexar Arquivos (fotos, documentos, etc.)</label>
                            <input type="file" id="anexos" name="anexos" multiple onChange={handleFileChange} />
                        </div>

                        {error && <p className="error-message">{error}</p>}
                        {success && <p className="success-message">{success}</p>}

                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => navigate('/ouvidoria')}>
                                <LiaArrowLeftSolid size={18} style={{ marginRight: '8px' }} />
                                Voltar
                            </button>
                            <button type="submit" className="btn-submit" disabled={loading}>
                                <LiaPaperPlane size={18} style={{ marginRight: '8px' }} />
                                {loading ? 'Enviando...' : 'Enviar Manifestação'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default NovaOuvidoria;