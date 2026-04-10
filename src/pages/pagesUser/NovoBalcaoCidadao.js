import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase'; 
import config from '../../config'; // Importa a configuração
import { ref, get, push, set, serverTimestamp } from 'firebase/database';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';

// Ícones
import { LiaPaperPlane, LiaArrowLeftSolid } from "react-icons/lia";

const NovoBalcaoCidadao = () => {
    const navigate = useNavigate();
    const { id: editId } = useParams();
    const { currentUser } = useAuth();

    // States for form control
    const [assunto, setAssunto] = useState('');
    const [tipoDocumento, setTipoDocumento] = useState('');
    const [formData, setFormData] = useState({});
    const [anexos, setAnexos] = useState({});

    // States for beneficiary (requester vs other)
    const [destino, setDestino] = useState('voce'); // voce | outro
    const [parentesco, setParentesco] = useState('');
    const [otherPerson, setOtherPerson] = useState({ name: '', cpf: '', phone: '' });
    const [phonePreference, setPhonePreference] = useState('novo'); // novo | mesmo
    const [enderecoPreference, setEnderecoPreference] = useState('mesmo'); // mesmo | novo
    const [novoEndereco, setNovoEndereco] = useState({ cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: '' });

    // General states
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [existingSolicitacao, setExistingSolicitacao] = useState(null);
    const [, setLoadingProfile] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
        }
    }, [currentUser, navigate]);

    // Busca dados existentes para edição
    useEffect(() => {
        if (editId && currentUser) {
            const fetchExistingData = async () => {
                const docRef = ref(db, `${config.cityCollection}/balcao-cidadao/${editId}`);
                try {
                    const snap = await get(docRef);
                    if (snap.exists()) {
                        const data = snap.val();
                        // Segurança: impede que usuários editem solicitações de outros
                        if (data.userId !== currentUser.uid) {
                            navigate('/balcao');
                            return;
                        }

                        setExistingSolicitacao(data);
                        setAssunto(data.dadosSolicitacao?.assunto || '');
                        setTipoDocumento(data.dadosSolicitacao?.tipoDocumento || '');
                        
                        if (data.dadosSolicitacao?.detalhes) {
                            setFormData(data.dadosSolicitacao.detalhes);
                        } else if (data.dadosSolicitacao?.descricao) {
                            setFormData({ descricao: data.dadosSolicitacao.descricao });
                        }

                        if (data.dadosBeneficiario) {
                            const b = data.dadosBeneficiario;
                            setDestino(b.id === 'outro' ? 'outro' : 'voce');
                            if (b.id === 'outro') {
                                setParentesco(b.parentesco || '');
                                setOtherPerson({ name: b.name || '', cpf: b.cpf || '', phone: b.phone || '' });
                                // Verifica se o endereço é diferente do original para setar a preferência
                                if (b.endereco && b.endereco.cep !== loggedInUserData?.cep) {
                                    setEnderecoPreference('novo');
                                    setNovoEndereco(b.endereco);
                                }
                                if (b.phone !== loggedInUserData?.phone) {
                                    setPhonePreference('novo');
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Erro ao carregar solicitação:", err);
                }
            };
            fetchExistingData();
        }
    }, [editId, currentUser, navigate, loggedInUserData]);

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
        const filesArray = Array.from(files);
        const MAX_SIZE = 12 * 1024 * 1024; // 5MB

        const invalidFiles = filesArray.filter(file => file.size > MAX_SIZE);
        if (invalidFiles.length > 0) {
            setError(`Os seguintes arquivos excedem o limite de 12MB: ${invalidFiles.map(f => f.name).join(', ')}`);
            e.target.value = ""; 
            return;
        }

        setError('');
        // Salva diretamente os objetos File para upload no submit
        if (filesArray.length > 0) {
            setAnexos(prev => ({ ...prev, [name]: filesArray }));
        }
    };

    const handleOtherPersonChange = (e) => {
        const { name, value } = e.target;
        setOtherPerson(prev => ({ ...prev, [name]: value }));
    };

    const handleNovoEnderecoChange = (e) => {
        const { name, value } = e.target;
        setNovoEndereco(prev => ({ ...prev, [name]: value }));
    };

    const handleCepBlur = async (e) => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length !== 8) return;
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
            if (response.ok) {
                const data = await response.json();
                setNovoEndereco(prev => ({ ...prev, rua: data.street, bairro: data.neighborhood, cidade: data.city, estado: data.state }));
            }
        } catch (err) {
            console.error("Erro ao buscar CEP:", err);
        }
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
            // Validação de duplicidade (apenas para novas solicitações)
            if (!editId) {
                const beneficiaryName = destino === 'voce' ? (loggedInUserData?.name) : otherPerson.name;
                const beneficiaryCpf = destino === 'voce' ? (loggedInUserData?.cpf) : otherPerson.cpf;

                const checkRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
                const snapshot = await get(checkRef);
                
                if (snapshot.exists()) {
                    const existingRequests = Object.values(snapshot.val());
                    const isDuplicate = existingRequests.some(item => 
                        item.dadosBeneficiario?.cpf === beneficiaryCpf &&
                        item.dadosBeneficiario?.name?.toLowerCase() === beneficiaryName?.toLowerCase() &&
                        item.dadosSolicitacao?.assunto === assunto &&
                        item.status !== 'Concluído' && item.status !== 'Cancelado'
                    );

                    if (isDuplicate) {
                        setError(`Já existe uma solicitação de "${assunto}" em andamento para ${beneficiaryName} (CPF: ${beneficiaryCpf}).`);
                        setLoading(false);
                        return;
                    }
                }
            }

            const dadosUsuarioParaSalvar = {
                id: currentUser.uid,
                email: loggedInUserData?.email || currentUser.email,
                name: loggedInUserData?.name || 'Não informado',
                cpf: loggedInUserData?.cpf || 'Não informado',
                phone: loggedInUserData?.phone || 'Não informado',
            };

            let dadosBeneficiario;
            if (destino === 'voce') {
                dadosBeneficiario = { 
                    ...dadosUsuarioParaSalvar, 
                    parentesco: 'O Próprio', 
                    endereco: { 
                        rua: loggedInUserData?.address || 'Não informado', 
                        numero: loggedInUserData?.numero || 'S/N', 
                        bairro: loggedInUserData?.neighborhood || 'Não informado', 
                        cidade: loggedInUserData?.city || 'Não informado', 
                        estado: loggedInUserData?.state || 'Não informado', 
                        cep: loggedInUserData?.cep || 'Não informado' 
                    } 
                };
            } else {
                const phoneFinal = phonePreference === 'mesmo' ? (loggedInUserData?.phone || 'Não informado') : otherPerson.phone;
                const enderecoFinal = enderecoPreference === 'mesmo' 
                    ? { 
                        rua: loggedInUserData?.address || 'Não informado', 
                        numero: loggedInUserData?.numero || 'S/N', 
                        bairro: loggedInUserData?.neighborhood || 'Não informado', 
                        cidade: loggedInUserData?.city || 'Não informado', 
                        estado: loggedInUserData?.state || 'Não informado', 
                        cep: loggedInUserData?.cep || 'Não informado' 
                    }
                    : novoEndereco;
                
                dadosBeneficiario = {
                    id: 'outro',
                    name: otherPerson.name,
                    cpf: otherPerson.cpf,
                    phone: phoneFinal,
                    parentesco: parentesco || 'Não informado',
                    endereco: {
                        rua: enderecoFinal.rua || 'Não informado',
                        numero: enderecoFinal.numero || 'S/N',
                        bairro: enderecoFinal.bairro || 'Não informado',
                        cidade: enderecoFinal.cidade || 'Não informado',
                        estado: enderecoFinal.estado || 'Não informado',
                        cep: enderecoFinal.cep || 'Não informado'
                    }
                };
            }

            let dadosDaSolicitacao;
            if (assunto === 'Emissão de Documentos') {
                if (!tipoDocumento) {
                    setError('Por favor, selecione o tipo de documento.');
                    setLoading(false);
                    return;
                }
                
                // Processa anexos: Se houver novos, apaga os antigos do Storage
                const anexosProcessados = editId ? { ...(existingSolicitacao?.dadosSolicitacao?.anexos || {}) } : {};

                for (const [key, filesArray] of Object.entries(anexos)) {
                    const uploadedFiles = [];
                    for (const file of filesArray) {
                        const folderPath = `${config.cityCollection}/balcao-cidadao/${currentUser.uid}/anexos`;
                        const uploadResult = await uploadFileToStorage(file, folderPath);
                        uploadedFiles.push({
                            name: file.name,
                            type: file.type,
                            url: uploadResult.url // Somente a URL vai banco
                        });
                    }
                    anexosProcessados[key] = uploadedFiles;
                }

                dadosDaSolicitacao = {
                    assunto: assunto,
                    tipoDocumento: tipoDocumento,
                    detalhes: formData,
                    anexos: anexosProcessados,
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

            const solicitacaoRef = editId 
                ? ref(db, `${config.cityCollection}/balcao-cidadao/${editId}`)
                : push(ref(db, `${config.cityCollection}/balcao-cidadao`));

            const payload = {
                dadosSolicitacao: dadosDaSolicitacao,
                dadosUsuario: dadosUsuarioParaSalvar,
                dadosBeneficiario: dadosBeneficiario,
                userId: currentUser.uid,
                status: editId ? 'Documentação Reenviada' : 'Aguardando Atendimento',
                deletionTimestamp: null,
                dataSolicitacao: editId ? existingSolicitacao.dataSolicitacao : serverTimestamp(),
                ultimaAtualizacao: serverTimestamp()
            };

            await set(solicitacaoRef, payload);

            setSuccess(`Sua solicitação foi ${editId ? 'atualizada' : 'enviada'} com sucesso!`);
            setTimeout(() => navigate('/balcao'), 3000);
        } catch (err) {
            console.error("Erro ao enviar solicitação:", err);
            setError(`Erro ao enviar solicitação: ${err.message || 'Erro desconhecido'}`);
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
                        {/* <div className="form-group">
                            <label>CPF (Documento impresso ou digital) *</label>
                            <input type="file" name="cin_cpf" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Comprovante de Residência (Original, com CEP atualizado) *</label>
                            <input type="file" name="cin_residencia" onChange={handleFileChange} required accept="image/*,.pdf" />
                        </div> */}
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
                                <img src={loggedInUserData.avatar.startsWith('http') || loggedInUserData.avatar.startsWith('data') ? loggedInUserData.avatar : `data:image/jpeg;base64,${loggedInUserData.avatar}`} alt="Avatar do usuário" />
                            ) : (
                                <div className="user-avatar-placeholder" />
                            )}
                        </div>
                    </div>
                </header>

                <div className="form-container">
                    <form onSubmit={handleSubmit}>
                        <h3 className="form-section-title">Beneficiário do Atendimento</h3>
                        <div className="form-group">
                            <label>Para quem é esta solicitação?</label>
                            <div className="tab-button-container" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="button" className={`tab-button ${destino === 'voce' ? 'active' : ''}`} onClick={() => setDestino('voce')} style={{ flex: 1 }}>Para mim</button>
                                <button type="button" className={`tab-button ${destino === 'outro' ? 'active' : ''}`} onClick={() => setDestino('outro')} style={{ flex: 1 }}>Para outra pessoa</button>
                            </div>
                        </div>

                        {destino === 'outro' && (
                            <div className="data-card" style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f9fafb' }}>
                                <div className="form-group">
                                    <label>Grau de Parentesco (1º Grau) *</label>
                                    <select value={parentesco} onChange={(e) => setParentesco(e.target.value)} required className="form-input">
                                        <option value="">Selecione...</option>
                                        <option value="Pai/Mãe">Pai/Mãe</option>
                                        <option value="Filho(a)">Filho(a)</option>
                                        <option value="Tio/Tia">Tio/Tia</option>
                                        <option value="Avô/Avó">Avô/Avó</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Nome Completo do Beneficiário *</label>
                                    <input type="text" name="name" value={otherPerson.name} onChange={handleOtherPersonChange} required className="form-input" />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>CPF *</label>
                                        <input type="text" name="cpf" value={otherPerson.cpf} onChange={handleOtherPersonChange} required className="form-input" placeholder="000.000.000-00" />
                                    </div>
                                    <div className="form-group">
                                        <label>Telefone do Beneficiário *</label>
                                        <div style={{ display: 'flex', gap: '15px', marginTop: '5px', marginBottom: '10px' }}>
                                            <label><input type="radio" name="phonePref" checked={phonePreference === 'mesmo'} onChange={() => setPhonePreference('mesmo')} /> Usar o meu</label>
                                            <label><input type="radio" name="phonePref" checked={phonePreference === 'novo'} onChange={() => setPhonePreference('novo')} /> Informar novo</label>
                                        </div>
                                        {phonePreference === 'novo' && (
                                            <input type="tel" name="phone" value={otherPerson.phone} onChange={handleOtherPersonChange} required className="form-input" placeholder="(00) 00000-0000" />
                                        )}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Endereço do Beneficiário</label>
                                    <div style={{ display: 'flex', gap: '15px', marginTop: '5px' }}>
                                        <label><input type="radio" name="endPref" checked={enderecoPreference === 'mesmo'} onChange={() => setEnderecoPreference('mesmo')} /> Usar meu endereço</label>
                                        <label><input type="radio" name="endPref" checked={enderecoPreference === 'novo'} onChange={() => setEnderecoPreference('novo')} /> Informar novo endereço</label>
                                    </div>
                                </div>

                                {enderecoPreference === 'novo' && (
                                    <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>CEP *</label>
                                                <input type="text" name="cep" value={novoEndereco.cep} onChange={handleNovoEnderecoChange} onBlur={handleCepBlur} required className="form-input" />
                                            </div>
                                            <div className="form-group" style={{ flex: 2 }}>
                                                <label>Rua/Logradouro *</label>
                                                <input type="text" name="rua" value={novoEndereco.rua} onChange={handleNovoEnderecoChange} required className="form-input" />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Número *</label>
                                                <input type="text" name="numero" value={novoEndereco.numero} onChange={handleNovoEnderecoChange} required className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Bairro *</label>
                                                <input type="text" name="bairro" value={novoEndereco.bairro} onChange={handleNovoEnderecoChange} required className="form-input" />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Cidade</label>
                                                <input type="text" name="cidade" value={novoEndereco.cidade} readOnly className="form-input" style={{ backgroundColor: '#f3f4f6' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <h3 className="form-section-title">Detalhes da Solicitação</h3>
                        <div className="form-group">
                            <label htmlFor="assunto">Assunto *</label>
                            <select id="assunto" name="assunto" value={assunto} onChange={handleAssuntoChange} required>
                                <option value="">Selecione o assunto</option>
                                <option value="Informações Gerais">Informações Gerais</option>
                                <option value="Emissão de Documentos">Emissão de Documentos</option>
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