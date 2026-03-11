import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, get } from 'firebase/database';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

import { useAuth } from '../../contexts/FirebaseAuthContext';
import { db } from '../../firebase';
import Sidebar from '../../components/Sidebar'; // Importa o componente Sidebar real

pdfMake.vfs = pdfFonts.vfs;


const AddProducts = () => {
    // Abas: 1: Detalhes da Reclamação, 2: Anexos e Envio
    const [activeTab, setActiveTab] = useState(1);

    // Dados do usuário logado (cujo userId/uid está no localStorage)
    const [loggedInUserData, setLoggedInUserData] = useState(null);
    const [, setLoadingLoggedInUserData] = useState(true);

    const [reclamacaoFormData, setReclamacaoFormData] = useState({
        tipoReclamacao: '',
        classificacao: '',
        assuntoDenuncia: '',
        fornecedorResolver: '',
        formaAquisicao: '',
        tipoContratacao: '',
        dataContratacao: '',
        nomeServico: '',
        detalhesServico: '',
        tipoDocumento: '',
        numeroDocumento: '',
        dataOcorrencia: '',
        dataCancelamento: '',
        formaPagamento: '',
        valorCompra: '',
        descricao: '',
        pedidoConsumidor: '',
        numeroMateriaExt: '',
        cnpj: '',
    });

    const [fileData, setFileData] = useState([]);
    const [empresaInfo, setEmpresaInfo] = useState(null);
    const [cnpjError, setCnpjError] = useState('');
    const [loadingCnpj, setLoadingCnpj] = useState(false);
    const [fileInputKey, setFileInputKey] = useState(Date.now());
    const [fileErrors, setFileErrors] = useState([]);
    const [fileCount, setFileCount] = useState(0);

    const navigate = useNavigate();
    const { currentUser: user, loading: loadingAuth } = useAuth(); // Usando o hook de autenticação

    const handleMenuItemClick = (path) => {
        navigate(path);
    };

    // Busca os dados do usuário logado no Firestore
    const fetchUserData = useCallback(async () => {
        if (loadingAuth) return;

        const userId = user?.uid;
        if (!userId) {
            navigate('/login');
            return;
        }

        // Busca os dados do perfil do usuário no Realtime Database
        const userRef = ref(db, 'users/' + userId);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                // Carrega todos os dados do perfil do usuário
                setLoggedInUserData({ ...userData, uid: userId, email: user.email });
            } else {
                // Caso o perfil não exista, usa dados básicos
                setLoggedInUserData({ uid: userId, nome: user.displayName || 'Usuário', email: user.email, tipo: 'Cidadão' });
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        } finally {
            setLoadingLoggedInUserData(false);
        }
    }, [user, loadingAuth, navigate]);

    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    const handleReclamacaoChange = (e) => {
        setReclamacaoFormData({ ...reclamacaoFormData, [e.target.name]: e.target.value });
        if (e.target.name === 'cnpj') {
            setEmpresaInfo(null);
            setCnpjError('');
        }
    };

    const handleFileChange = (e) => {
        const files = e.target.files;
        const errors = [];
        const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];

        const validatedFiles = Array.from(files).filter(file => {
            if (!allowedTypes.includes(file.type)) {
                errors.push(`O arquivo "${file.name}" não é um formato permitido. Use .png, .jpg ou .pdf.`);
                return false;
            }
            if (file.size > 2 * 1024 * 1024) { // 2MB limite
                errors.push(`O arquivo "${file.name}" excede o limite de 2MB.`);
                return false;
            }
            return true;
        });

        const filePromises = validatedFiles.map((file) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    resolve({
                        name: file.name,
                        type: file.type,
                        data: event.target.result, // Base64
                    });
                };
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });
        });

        Promise.all(filePromises)
            .then((data) => {
                setFileData(data);
                setFileCount(validatedFiles.length);
                setFileErrors(errors);
            })
            .catch((error) => console.error('Erro ao converter arquivos:', error));
    };

    const buscarEmpresaPorCnpj = async () => {
        const cnpj = reclamacaoFormData.cnpj.replace(/\D/g, '');
        if (cnpj.length !== 14) {
            setCnpjError('CNPJ inválido');
            setEmpresaInfo(null);
            return;
        }
        setCnpjError('');
        setLoadingCnpj(true);
        setEmpresaInfo(null);

        try {
            // URL da API externa para CNPJ
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (response.ok) {
                const data = await response.json();
                setEmpresaInfo(data);
            } else {
                // Se a resposta não for 200, tenta ler a mensagem de erro da API
                try {
                    const errorData = await response.json();
                    setCnpjError(errorData.message || 'Erro ao buscar CNPJ');
                } catch (jsonError) {
                    setCnpjError('CNPJ não encontrado ou API indisponível.');
                }
            }
        } catch (error) {
            setCnpjError('Erro ao conectar com a API');
            console.error('Erro ao buscar CNPJ:', error);
        } finally {
            setLoadingCnpj(false);
        }
    };

    const gerarProtocolo = (comprimento = 10) => {
        let protocolo = '';
        for (let i = 0; i < comprimento; i++) {
            protocolo += Math.floor(Math.random() * 10);
        }
        return protocolo;
    };

    const gerarPDF = (protocolo, userProfileData, reclamacaoForm, empresaInfo) => {
        const docDefinition = {
            content: [
                { text: 'Comprovante de Reclamação - PROCON', style: 'header' },
                { text: `Protocolo: ${protocolo}`, style: 'subheader' },
                { text: `Data: ${new Date().toLocaleString()}`, style: 'subheader' },
                { text: 'Dados do Consumidor', style: 'sectionHeader' },
                `Nome: ${userProfileData.nome}`,
                `Email: ${userProfileData.email}`,
                { text: 'Dados da Reclamação', style: 'sectionHeader', margin: [0, 20, 0, 10] },
                `Empresa Reclamada: ${empresaInfo?.razao_social || 'Não informado'}`,
                `CNPJ: ${reclamacaoForm.cnpj}`,
                `Assunto: ${reclamacaoForm.assuntoDenuncia}`,
                { text: 'Sua reclamação foi registrada e será analisada por nossa equipe.', margin: [0, 20, 0, 0] }
            ],
            styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10], alignment: 'center' },
                subheader: { fontSize: 14, margin: [0, 2, 0, 2] },
                sectionHeader: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] }
            }
        };

        pdfMake.createPdf(docDefinition).download(`protocolo-${protocolo}.pdf`);
    };

    const handleNextTab = () => {
        // Validação da aba atual antes de avançar
        if (activeTab === 1) { // Detalhes da Reclamação
            // Apenas as variáveis usadas na validação são desestruturadas
            const { tipoReclamacao, classificacao, assuntoDenuncia, cnpj, fornecedorResolver, descricao } = reclamacaoFormData;
            if (!tipoReclamacao || !classificacao || !assuntoDenuncia || !cnpj || !fornecedorResolver || !descricao) {
                alert('Por favor, preencha todos os campos obrigatórios da Aba 1.');
                return;
            }
            if (!empresaInfo && cnpj.replace(/\D/g, '').length === 14) {
                alert('Por favor, busque e valide as informações da empresa pelo CNPJ.');
                return;
            }
        }
        setActiveTab(prev => prev + 1);
    };

    const handlePrevTab = () => {
        setActiveTab(prev => prev - 1);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const userId = user?.uid;
        const userEmail = loggedInUserData?.email;
        const timestamp = new Date().toISOString();
        const protocolo = gerarProtocolo();

        if (!userId || !userEmail || !loggedInUserData) {
            alert('Erro: Dados do usuário logado não disponíveis.');
            return;
        }

        // Objeto com os dados do usuário, garantindo que todos os campos solicitados estejam presentes
        const dadosUsuarioParaSalvar = {
            userId: userId, // Padronizando o campo para 'userId'
            name: loggedInUserData?.name || 'Não informado',
            email: userEmail,
            phone: loggedInUserData?.phone || 'Não informado',
            address: loggedInUserData?.address || 'Não informado',
            neighborhood: loggedInUserData?.neighborhood || 'Não informado',
            city: loggedInUserData?.city || 'Não informado',
            state: loggedInUserData?.state || 'Não informado',
            cep: loggedInUserData?.cep || 'Não informado',
            sexo: loggedInUserData?.sexo || 'Não informado',
            tipo: loggedInUserData?.tipo || 'Cidadão',
        };

        // Objeto com todos os dados a serem salvos no Realtime Database
        const reclamacaoDataFinal = {
            ...reclamacaoFormData,
            protocolo: protocolo,
            companyName: empresaInfo?.razao_social || '',
            cnpjEmpresaReclamada: empresaInfo?.cnpj || reclamacaoFormData.cnpj,
            arquivos: fileData,
            createdAt: timestamp,
            userDataAtTimeOfComplaint: dadosUsuarioParaSalvar, // Salva o objeto completo do usuário
        };

        try {
            // Envia os dados para o nó 'denuncias-procon' no Realtime Database
            await push(ref(db, 'denuncias-procon'), reclamacaoDataFinal);

            gerarPDF(protocolo, loggedInUserData, reclamacaoFormData, empresaInfo);
            alert(`Reclamação registrada com sucesso! Protocolo: ${protocolo}`);

            setFileInputKey(Date.now());
            navigate('/dashboard');
        } catch (error) {
            console.error('Erro ao enviar reclamação para o Firebase:', error);
            alert('Erro ao registrar reclamação. Tente novamente.');
        }
    };


    // Conteúdo Principal
    return (
        <div className="dashboard-layout">
            <Sidebar onItemClick={handleMenuItemClick} />
            <div className="dashboard-content">

                {/* Cabeçalho da Imagem */}
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Procon - Realizar Reclamação</p>
                    </div>

                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{loggedInUserData?.nome || user?.email}</p>
                            <p className="user-type-display">{loggedInUserData?.tipo || 'Cidadão'}</p>
                        </div>
                        <div className="user-avatar"></div> {/* Círculo Azul */}
                    </div>
                </header>

                {/* Contêiner da Reclamação */}
                <div className="form-container-tabs">
                    <div className="tabs-header">
                        <button
                            className={`tab-button ${activeTab === 1 ? 'active' : ''}`}
                            onClick={() => setActiveTab(1)}
                        >
                            1. Detalhes da Reclamação
                        </button>
                        <button
                            className={`tab-button ${activeTab === 2 ? 'active' : ''}`}
                            onClick={() => setActiveTab(2)}
                            disabled={activeTab < 2}
                        >
                            2. Anexos e Envio
                        </button>
                    </div>

                    <div className="tab-content">
                        {/* Aba 1: Detalhes da Reclamação */}
                        {activeTab === 1 && (
                            <form onSubmit={(e) => { e.preventDefault(); handleNextTab(); }} className="form-section">
                                <h3>Detalhes da Reclamação</h3>
                                <div className="form-grid">
                                    <select name="tipoReclamacao" className="form-input" value={reclamacaoFormData.tipoReclamacao} onChange={handleReclamacaoChange} required>
                                        <option value="">Selecione o Tipo de Reclamação</option>
                                        <option value="Problemas com Contrato">Problemas com Contrato</option>
                                        <option value="Produto com defeito">Produto com defeito</option>
                                        <option value="Serviço não fornecido">Serviço não fornecido</option>
                                    </select>
                                    <select name="classificacao" className="form-input" value={reclamacaoFormData.classificacao} onChange={handleReclamacaoChange} required>
                                        <option value="">Área de Atuação</option>
                                        <option value="Agua">Água, Energia e Gás</option>
                                        <option value="Alimentos">Alimentos</option>
                                        <option value="Educacao">Educação</option>
                                        <option value="Saude">Saúde</option>
                                        <option value="Servicos Financeiros">Serviços Financeiros</option>
                                        <option value="Telecomunicacoes">Telecomunicações</option>
                                        <option value="Demais Serviços">Demais Serviços</option>
                                    </select>
                                </div>

                                <input className="form-input" type="text" name="assuntoDenuncia" placeholder="Assunto da Denúncia" value={reclamacaoFormData.assuntoDenuncia} onChange={handleReclamacaoChange} required />

                                <p className="label-section">Empresa Reclamada:</p>
                                <div className="cnpj-group">
                                    <input className="form-input cnpj-input" type="text" name="cnpj" placeholder="Digite o CNPJ" value={reclamacaoFormData.cnpj} onChange={handleReclamacaoChange} required />
                                    <button className='buttonLogin btnSearchBusiness' type="button" onClick={buscarEmpresaPorCnpj} disabled={loadingCnpj || reclamacaoFormData.cnpj.replace(/\D/g, '').length !== 14}>
                                        {loadingCnpj ? 'Buscando...' : 'Buscar Empresa'}
                                    </button>
                                </div>

                                {cnpjError && <p className="error-message-inline">{cnpjError}</p>}
                                {empresaInfo && (
                                    <p className="company-info">
                                        <strong>Empresa Validada:</strong> {empresaInfo.razao_social}
                                        {empresaInfo.fantasia && ` (${empresaInfo.fantasia})`}
                                    </p>
                                )}

                                <div className="form-grid">
                                    <select name="fornecedorResolver" className="form-input" value={reclamacaoFormData.fornecedorResolver} onChange={handleReclamacaoChange} required>
                                        <option value="">Procurei o fornecedor para resolver?</option>
                                        <option value="Sim, resolveu totalmente">Sim, resolveu totalmente</option>
                                        <option value="Sim, resolveu parcialmente">Sim, resolveu parcialmente</option>
                                        <option value="Sim, mas não resolveu">Sim, mas não resolveu</option>
                                        <option value="Não procurei o fornecedor">Não procurei o fornecedor</option>
                                    </select>
                                    <select name="formaAquisicao" className="form-input" value={reclamacaoFormData.formaAquisicao} onChange={handleReclamacaoChange} required>
                                        <option value="">Forma de Aquisição</option>
                                        <option value="Loja Física">Loja Física</option>
                                        <option value="Loja Virtual">Loja Virtual</option>
                                        <option value="Telefone">Telefone</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>

                                <div className="form-grid">
                                    <select name="tipoContratacao" className="form-input" value={reclamacaoFormData.tipoContratacao} onChange={handleReclamacaoChange} required>
                                        <option value="">Tipo de Contratação</option>
                                        <option value="Novo Contrato">Novo Contrato</option>
                                        <option value="Renovação de Contrato">Renovação de Contrato</option>
                                    </select>
                                    <div>
                                        <label className="input-label">Data da contratação</label>
                                        <input className="form-input" type="date" name="dataContratacao" value={reclamacaoFormData.dataContratacao} onChange={handleReclamacaoChange} required />
                                    </div>
                                </div>

                                <div className="form-grid">
                                    <input className="form-input" type="text" name="nomeServico" placeholder="Nome do Serviço ou Plano" value={reclamacaoFormData.nomeServico} onChange={handleReclamacaoChange} required />
                                    <select name="formaPagamento" className="form-input" value={reclamacaoFormData.formaPagamento} onChange={handleReclamacaoChange} required>
                                        <option value="">Forma de Pagamento</option>
                                        <option value="Boleto Bancário">Boleto Bancário</option>
                                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                                        <option value="Cartão de Débito">Cartão de Débito</option>
                                        <option value="PIX">PIX</option>
                                        <option value="Dinheiro">Dinheiro</option>
                                    </select>
                                </div>

                                <textarea id="detalhesServico" className="form-input textarea-input" name="detalhesServico" placeholder="Detalhes do Serviço ou Produto Contratado" value={reclamacaoFormData.detalhesServico} onChange={handleReclamacaoChange} required />

                                <p className="section-title">Informações Adicionais</p>

                                <div className="form-grid three-cols">
                                    <select name="tipoDocumento" className="form-input" value={reclamacaoFormData.tipoDocumento} onChange={handleReclamacaoChange} required>
                                        <option value="">Tipo de Documento</option>
                                        <option value="Nota Fiscal">Nota Fiscal</option>
                                        <option value="Contrato">Contrato</option>
                                        <option value="Recibo">Recibo</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                    <input className="form-input" type="number" name="numeroDocumento" placeholder="Número do Documento" value={reclamacaoFormData.numeroDocumento} onChange={handleReclamacaoChange} required />
                                    <input className="form-input" type="number" name="valorCompra" placeholder="Valor da Compra (R$)" value={reclamacaoFormData.valorCompra} onChange={handleReclamacaoChange} required />
                                </div>

                                <div className="form-grid">
                                    <div>
                                        <label className="input-label">Data da ocorrência</label>
                                        <input className="form-input" type="date" name="dataOcorrencia" value={reclamacaoFormData.dataOcorrencia} onChange={handleReclamacaoChange} required />
                                    </div>
                                    <div>
                                        <label className="input-label">Data de cancelamento/negativa</label>
                                        <input className="form-input" type="date" name="dataCancelamento" value={reclamacaoFormData.dataCancelamento} onChange={handleReclamacaoChange} required />
                                    </div>
                                </div>

                                <p className="section-title">Descrição e Pedido</p>
                                <textarea id="descricao" className="form-input textarea-input large" name="descricao" placeholder="Descreva em detalhes sua reclamação (máx. 2000 caracteres)" value={reclamacaoFormData.descricao} onChange={handleReclamacaoChange} maxLength={2000} required />
                                <select name="pedidoConsumidor" className="form-input" value={reclamacaoFormData.pedidoConsumidor} onChange={handleReclamacaoChange} required>
                                    <option value="">Selecione o Pedido do Consumidor</option>
                                    <option value="Cancelamento do Contrato">Cancelamento c/ restituição</option>
                                    <option value="Conserto do Produto">Conserto do produto</option>
                                    <option value="Cumprimento da Oferta">Cumprimento da oferta</option>
                                    <option value="Devolução do Valor Pago">Devolução do valor pago</option>
                                    <option value="Entrega do Produto">Entrega do produto</option>
                                    <option value="Outro">Outro (Exceto indenização por danos morais)</option>
                                </select>

                                <div className="form-navigation-buttons">
                                    <button type="button" className="buttonLogin btnNext" onClick={handleNextTab}>Próximo</button>
                                </div>
                            </form>
                        )}

                        {/* Aba 2: Anexos e Envio */}
                        {activeTab === 2 && (
                            <form onSubmit={handleSubmit} className="form-section">
                                <h3>Anexos e Envio</h3>
                                <p className="section-title">Anexos</p>
                                <label className="file-upload-label">
                                    Selecione arquivos (máximo 2MB por arquivo, formatos: .png, .jpg, .jpeg, .pdf)
                                    <input
                                        key={fileInputKey}
                                        type="file"
                                        multiple
                                        onChange={handleFileChange}
                                        accept=".png,.jpg,.jpeg,.pdf"
                                        className='input-file-hidden'
                                    />
                                    <div className="custom-file-button">
                                        Selecionar Arquivos
                                    </div>
                                </label>

                                {fileCount > 0 && (
                                    <p className="file-count-message">
                                        ✅ {fileCount} arquivo(s) selecionado(s) pronto(s) para envio.
                                    </p>
                                )}

                                {fileErrors.map((error, index) => (
                                    <p key={index} className="error-message-inline">{error}</p>
                                ))}

                                <div className="form-navigation-buttons">
                                    <button type="button" className="buttonLogin btnPrev" onClick={handlePrevTab}>Anterior</button>
                                    <button type="submit" className="buttonLogin btnLogin" disabled={fileErrors.length > 0}>
                                        Enviar Reclamação
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


// Componente Wrapper para injetar os estilos
const ProconReclamacao = () => (
    <>
        <AddProducts />
    </>
);

export default ProconReclamacao;
