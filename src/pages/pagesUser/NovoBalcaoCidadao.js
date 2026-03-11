import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase';
import config from '../../config'; // Importa a configuração
import { ref, get, push, set, serverTimestamp } from 'firebase/database';

// Ícones
import { LiaPaperPlane, LiaArrowLeftSolid } from "react-icons/lia";

const NovoBalcaoCidadao = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    // States for form control
    const [assunto, setAssunto] = useState('');
    const [tipoDocumento, setTipoDocumento] = useState('');
    const [formData, setFormData] = useState({});
    const [anexos, setAnexos] = useState({});

    // General states
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
    const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
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

    // Handlers for form changes
    const handleAssuntoChange = (e) => {
        setAssunto(e.target.value);
        setTipoDocumento('');
        setFormData({});
        setAnexos({});
    };

    const handleTipoDocumentoChange = (e) => {
        setTipoDocumento(e.target.value);
        setFormData({});
        setAnexos({});
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const { name, files } = e.target;
        const filePromises = Array.from(files).map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve({ name: file.name, type: file.type, data: event.target.result });
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });
        });

        Promise.all(filePromises)
            .then(fileData => {
                setAnexos(prev => ({ ...prev, [name]: fileData }));
            })
            .catch(err => {
                console.error("Erro ao processar arquivos:", err);
                setError("Erro ao processar arquivos.");
            });
    };

    // Form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser || !loggedInUserData) {
            setError('Você precisa estar logado e ter um perfil para enviar uma solicitação.');
            return;
        }
        if (!assunto) {
            setError('Por favor, selecione um assunto.');
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

            let dadosDaSolicitacao;
            if (assunto === 'Emissão de Documentos') {
                if (!tipoDocumento) {
                    setError('Por favor, selecione o tipo de documento.');
                    setLoading(false);
                    return;
                }
                dadosDaSolicitacao = {
                    assunto: assunto,
                    tipoDocumento: tipoDocumento,
                    detalhes: formData,
                    anexos: anexos,
                };
            } else {
                if (!formData.descricao) {
                    setError('Por favor, preencha a descrição da sua solicitação.');
                    setLoading(false);
                    return;
                }
                dadosDaSolicitacao = {
                    assunto: assunto,
                    descricao: formData.descricao,
                };
            }

      const novaSolicitacaoRef = push(ref(db, `${config.cityCollection}/balcao-cidadao`));

            await set(novaSolicitacaoRef, {
                dadosSolicitacao: dadosDaSolicitacao,
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

    // Component to render specific document fields
    const renderDocumentFields = () => {
        switch (tipoDocumento) {
            case 'cin':
                return (
                    <>
                        <h4 className="form-section-title">Carteira de Identidade Nacional (CIN)</h4>
                        <p className="form-info-text">Para 1ª e 2ª via. O CPF regularizado é indispensável. A foto biométrica é geralmente tirada no local do atendimento.</p>
                        <div className="form-group">
                            <label htmlFor="estadoCivil">Estado Civil *</label>
                            <select id="estadoCivil" name="estadoCivil" value={formData.estadoCivil || ''} onChange={handleFormChange} required>
                                <option value="">Selecione...</option>
                                <option value="solteiro">Solteiro(a)</option>
                                <option value="casado">Casado(a)</option>
                                <option value="divorciado">Divorciado(a)</option>
                                <option value="viuvo">Viúvo(a)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Certidão de Nascimento/Casamento (Original, legível) *</label>
                            <input type="file" name="cin_certidao" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>CPF (Documento impresso ou digital) *</label>
                            <input type="file" name="cin_cpf" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Comprovante de Residência (Original, com CEP atualizado) *</label>
                            <input type="file" name="cin_residencia" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                        <p className="form-info-text">Para menores de 16 anos, é obrigatória a presença de um responsável legal (pai, mãe, avós, tios de 1º grau) com RG original.</p>
                        <div className="form-group">
                            <label>Documento do Responsável (se aplicável)</label>
                            <input type="file" name="cin_responsavel" onChange={handleFileChange} accept="image/*,.pdf" />
                        </div>
                    </>
                );
            case 'cpf':
                return (
                    <>
                        <h4 className="form-section-title">CPF (2ª Via e Atualização)</h4>
                        <p className="form-info-text">A atualização de dados no sistema da Receita Federal é essencial para a emissão de outros documentos.</p>
                        <div className="form-group">
                            <label>Documento de Identidade (RG, CNH, etc. - Frente e Verso) *</label>
                            <input type="file" name="cpf_identidade" onChange={handleFileChange} multiple required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Comprovante de Estado Civil (Nascimento ou Casamento) *</label>
                            <input type="file" name="cpf_estado_civil" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Selfie segurando o documento de identidade ao lado do rosto *</label>
                            <input type="file" name="cpf_selfie" onChange={handleFileChange} required accept="image/*" />
                        </div>
                        <div className="form-group">
                            <label>Comprovante de Residência (Recente, últimos 3 meses) *</label>
                            <input type="file" name="cpf_residencia" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                    </>
                );
            case 'ctd':
                return (
                    <>
                        <h4 className="form-section-title">Carteira de Trabalho Digital</h4>
                        <p className="form-info-text">A versão física não é mais emitida na maioria dos casos. O acesso é pela conta Gov.br. Se estiver com dificuldades, descreva o problema abaixo para que possamos auxiliar na validação dos seus dados.</p>
                        <div className="form-group">
                            <label htmlFor="descricao">Descreva sua dificuldade com o aplicativo *</label>
                            <textarea id="descricao" name="descricao" rows="6" value={formData.descricao || ''} onChange={handleFormChange} required></textarea>
                        </div>
                    </>
                );
            case 'antecedentes':
                return (
                    <>
                        <h4 className="form-section-title">Atestado de Antecedentes Criminais</h4>
                        <p className="form-info-text">Preencha os dados abaixo para a emissão do atestado. O documento é emitido online, mas podemos auxiliar no processo.</p>
                        <div className="form-group">
                            <label>Nome Completo *</label>
                            <input type="text" name="nomeCompleto" value={formData.nomeCompleto || ''} onChange={handleFormChange} required />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Nº do RG *</label>
                                <input type="text" name="rgNumero" value={formData.rgNumero || ''} onChange={handleFormChange} required />
                            </div>
                            <div className="form-group">
                                <label>Data de Emissão do RG *</label>
                                <input type="date" name="rgDataEmissao" value={formData.rgDataEmissao || ''} onChange={handleFormChange} required />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Órgão Expedidor do RG *</label>
                            <input type="text" name="rgOrgaoExpedidor" value={formData.rgOrgaoExpedidor || ''} onChange={handleFormChange} required placeholder="Ex: SSP/CE" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Nome do Pai *</label>
                                <input type="text" name="nomePai" value={formData.nomePai || ''} onChange={handleFormChange} required />
                            </div>
                            <div className="form-group">
                                <label>Nome da Mãe *</label>
                                <input type="text" name="nomeMae" value={formData.nomeMae || ''} onChange={handleFormChange} required />
                            </div>
                        </div>
                    </>
                );
            case 'titulo':
                return (
                    <>
                        <h4 className="form-section-title">Título de Eleitor (Consulta ou Atualização)</h4>
                        <p className="form-info-text">Para regularização, transferência ou primeiro título. Fique atento aos prazos do TSE, que costumam encerrar em maio de anos eleitorais.</p>
                        <div className="form-group">
                            <label>Documento de Identidade (Frente e Verso) *</label>
                            <p className="form-info-text" style={{fontSize: '0.8em', marginTop: '-8px', marginBottom: '8px'}}>CNH não é aceita para primeiro título.</p>
                            <input type="file" name="titulo_identidade" onChange={handleFileChange} multiple required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Comprovante de Residência *</label>
                            <input type="file" name="titulo_residencia" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Selfie segurando o documento de identidade *</label>
                            <input type="file" name="titulo_selfie" onChange={handleFileChange} required accept="image/*" />
                        </div>
                        <div className="form-group">
                            <label>Certificado de Quitação Militar (para homens de 19 anos)</label>
                            <input type="file" name="titulo_militar" onChange={handleFileChange} accept="image/*,.pdf" />
                        </div>
                    </>
                );
            default:
                return null;
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={(path) => navigate(path)} />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Paraipaba</h1>
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
                            <select id="assunto" name="assunto" value={assunto} onChange={handleAssuntoChange} required>
                                <option value="">Selecione o assunto</option>
                                <option value="Informações Gerais">Informações Gerais</option>
                                <option value="Emissão de Documentos">Emissão de Documentos</option>
                                <option value="Agendamento">Agendamento</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>

                        {assunto === 'Emissão de Documentos' ? (
                            <>
                                <div className="form-group">
                                    <label htmlFor="tipoDocumento">Qual documento você precisa? *</label>
                                    <select id="tipoDocumento" name="tipoDocumento" value={tipoDocumento} onChange={handleTipoDocumentoChange} required>
                                        <option value="">Selecione o documento</option>
                                        <option value="cin">Carteira de Identidade Nacional (CIN)</option>
                                        <option value="cpf">CPF (2ª via / Atualização)</option>
                                        <option value="ctd">Carteira de Trabalho Digital (Auxílio)</option>
                                        <option value="antecedentes">Atestado de Antecedentes Criminais</option>
                                        <option value="titulo">Título de Eleitor</option>
                                    </select>
                                </div>
                                {renderDocumentFields()}
                            </>
                        ) : assunto ? (
                            <div className="form-group">
                                <label htmlFor="descricao">Descreva sua solicitação *</label>
                                <textarea id="descricao" name="descricao" rows="6" value={formData.descricao || ''} onChange={handleFormChange} required></textarea>
                            </div>
                        ) : null}
                        
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