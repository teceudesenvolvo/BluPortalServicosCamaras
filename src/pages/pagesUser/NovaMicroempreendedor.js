import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaPaperPlane, LiaSearchSolid } from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { firestore } from '../../firebase';
import { printProtocolReceipt } from '../../utils/printReport';

const TIPOS_ASSESSORIA = [
    'Orientação para abertura de um novo negócio (MEI)',
    'Dicas e orientações para melhorar seu negócio',
    'Ajuda para organização de finanças',
    'Informações sobre impostos e obrigações',
];

const onlyDigits = (value = '') => value.replace(/\D/g, '');

const formatCnpj = (value = '') => {
    const digits = onlyDigits(value).slice(0, 14);
    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
};

const NovaMicroempreendedor = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [formData, setFormData] = useState({
        tipo: '',
        nomeNegocio: '',
        cnpj: '',
        contatoPreferencial: 'WhatsApp',
        descricao: '',
        cnpjData: null,
    });
    const [loading, setLoading] = useState(false);
    const [loadingCnpj, setLoadingCnpj] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) return;
        try {
            const snapshot = await getDoc(doc(firestore, 'users', currentUser.uid));
            setLoggedInUserData(snapshot.exists() ? snapshot.data() : { name: currentUser.email, email: currentUser.email });
        } catch (err) {
            console.error('Erro ao buscar perfil:', err);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return;
        }

        fetchUserProfile();
    }, [currentUser, fetchUserProfile, navigate]);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((prev) => ({
            ...prev,
            [name]: name === 'cnpj' ? formatCnpj(value) : value,
            ...(name === 'cnpj' ? { cnpjData: null } : {}),
        }));
    };

    const handleFetchCnpj = async () => {
        const cnpj = onlyDigits(formData.cnpj);
        if (!cnpj) return;
        if (cnpj.length !== 14) {
            setError('Informe um CNPJ válido com 14 dígitos.');
            return;
        }

        setLoadingCnpj(true);
        setError('');

        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (!response.ok) {
                throw new Error(response.status === 404 ? 'CNPJ não encontrado.' : 'Não foi possível consultar o CNPJ.');
            }

            const data = await response.json();
            setFormData((prev) => ({
                ...prev,
                nomeNegocio: prev.nomeNegocio || data.nome_fantasia || data.razao_social || '',
                contatoPreferencial: data.email ? 'Email' : prev.contatoPreferencial,
                cnpj: formatCnpj(data.cnpj || cnpj),
                cnpjData: {
                    razaoSocial: data.razao_social || '',
                    nomeFantasia: data.nome_fantasia || '',
                    cnpj: data.cnpj || cnpj,
                    situacaoCadastral: data.descricao_situacao_cadastral || '',
                    naturezaJuridica: data.natureza_juridica || '',
                    cnaeFiscalDescricao: data.cnae_fiscal_descricao || '',
                    telefone: [data.ddd_telefone_1, data.ddd_telefone_2].filter(Boolean).join(' / '),
                    email: data.email || '',
                    endereco: {
                        logradouro: data.logradouro || '',
                        numero: data.numero || '',
                        complemento: data.complemento || '',
                        bairro: data.bairro || '',
                        municipio: data.municipio || '',
                        uf: data.uf || '',
                        cep: data.cep || '',
                    },
                },
            }));
        } catch (err) {
            console.error('Erro ao consultar CNPJ:', err);
            setError(err.message || 'Erro ao consultar CNPJ.');
        } finally {
            setLoadingCnpj(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!formData.tipo || !formData.descricao) {
            setError('Selecione o tipo de assessoria e descreva sua necessidade.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const dadosUsuario = {
                id: currentUser.uid,
                email: loggedInUserData?.email || currentUser.email,
                name: loggedInUserData?.name || currentUser.email,
                cpf: loggedInUserData?.cpf || 'Não informado',
                phone: loggedInUserData?.phone || loggedInUserData?.telefone || 'Não informado',
            };

            const payload = {
                dadosAssessoria: {
                    ...formData,
                    cnpj: formatCnpj(formData.cnpj),
                },
                dadosUsuario,
                userId: currentUser.uid,
                status: 'Recebida',
                dataSolicitacao: serverTimestamp(),
                ultimaAtualizacao: serverTimestamp(),
                messages: {},
            };

            const docRef = await addDoc(collection(firestore, 'assessoria-microempreendedor'), payload);

            printProtocolReceipt({
                title: 'Comprovante de Assessoria ao Microempreendedor',
                protocol: docRef.id,
                status: payload.status,
                createdAt: new Date(),
                requester: {
                    Nome: dadosUsuario.name,
                    Email: dadosUsuario.email,
                    CPF: dadosUsuario.cpf,
                    Telefone: dadosUsuario.phone,
                },
                beneficiary: {
                    Setor: 'Assessoria ao Microempreendedor',
                },
                details: {
                    'Tipo de Assessoria': formData.tipo,
                    'Nome do Negócio': formData.nomeNegocio,
                    CNPJ: formData.cnpj,
                    'Contato Preferencial': formData.contatoPreferencial,
                    Descrição: formData.descricao,
                },
            });

            setSuccess('Solicitação enviada com sucesso! Você será redirecionado em breve.');
            setTimeout(() => navigate('/microempreendedor'), 2500);
        } catch (err) {
            console.error('Erro ao enviar assessoria:', err);
            setError('Não foi possível enviar sua solicitação. Tente novamente.');
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
                        <h1>Assessoria ao Microempreendedor</h1>
                        <p>Nova solicitação de orientação para o seu negócio.</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.name || currentUser?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                <div className="form-container micro-form-container">
                    <form onSubmit={handleSubmit}>
                        <div className="micro-form-intro">
                            <span>Assessoria especializada</span>
                            <h3>Como podemos ajudar?</h3>
                            <p>Preencha as informações principais para que a equipe entenda sua necessidade antes do primeiro contato.</p>
                        </div>
                        <div className="form-group">
                            <label htmlFor="tipo">Tipo de assessoria *</label>
                            <select id="tipo" name="tipo" value={formData.tipo} onChange={handleChange} required className="form-input">
                                <option value="">Selecione...</option>
                                {TIPOS_ASSESSORIA.map((tipo) => (
                                    <option key={tipo} value={tipo}>{tipo}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="nomeNegocio">Nome do negócio</label>
                                <input id="nomeNegocio" name="nomeNegocio" value={formData.nomeNegocio} onChange={handleChange} placeholder="Se já existir" className="form-input" />
                            </div>
                            <div className="form-group">
                                <label htmlFor="cnpj">CNPJ</label>
                                <div className="form-inline-action">
                                    <input
                                        id="cnpj"
                                        name="cnpj"
                                        value={formData.cnpj}
                                        onChange={handleChange}
                                        onBlur={handleFetchCnpj}
                                        placeholder="00.000.000/0000-00"
                                        className="form-input"
                                    />
                                    <button type="button" className="btn-secondary" onClick={handleFetchCnpj} disabled={loadingCnpj || !formData.cnpj}>
                                        <LiaSearchSolid />
                                        {loadingCnpj ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                                {formData.cnpjData && (
                                    <small className="form-info-text">
                                        {formData.cnpjData.razaoSocial || formData.cnpjData.nomeFantasia} · {formData.cnpjData.situacaoCadastral || 'Situação não informada'}
                                    </small>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="contatoPreferencial">Contato preferencial</label>
                            <select id="contatoPreferencial" name="contatoPreferencial" value={formData.contatoPreferencial} onChange={handleChange} className="form-input">
                                <option value="WhatsApp">WhatsApp</option>
                                <option value="Telefone">Telefone</option>
                                <option value="Email">Email</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="descricao">Descreva sua necessidade *</label>
                            <textarea id="descricao" name="descricao" rows="6" value={formData.descricao} onChange={handleChange} required placeholder="Conte em poucas palavras qual orientação você precisa." className="form-input" />
                        </div>

                        {error && <p className="error-message">{error}</p>}
                        {success && <p className="success-message">{success}</p>}

                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => navigate('/microempreendedor')}>
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

export default NovaMicroempreendedor;
