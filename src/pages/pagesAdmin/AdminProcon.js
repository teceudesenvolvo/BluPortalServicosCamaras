import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, query, orderByKey, limitToLast, update, push, set, serverTimestamp, get } from 'firebase/database';
import Chart from 'chart.js/auto'; // Importa Chart.js
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase'; // Importa as instâncias corretas do Firebase
import config from '../../config'; // Importa a configuração
import AdminSidebar from '../../components/AdminSidebar'; // Importa o novo Sidebar de Admin
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { LiaTimesSolid, LiaPaperclipSolid, LiaUploadSolid, LiaPaperPlane } from "react-icons/lia";

// =============================================================
// Componente Modal de Detalhes da Denúncia
// =============================================================
const ComplaintDetailsModal = ({ denuncia, onClose, onStatusChange, onSendMessage, onFileUpload }) => {
    const [newStatus, setNewStatus] = useState(denuncia ? denuncia.status || '' : '');
    const [message, setMessage] = useState('');
    const [consumerProfile, setConsumerProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    useEffect(() => {
        if (denuncia) {
            setNewStatus(denuncia.status || '');
            const fetchConsumerProfile = async () => {
                // 1. Extrai o userId dos dados salvos na reclamação.
                const userId = denuncia.userId;
                console.log("UserID da denúncia:", userId);

                // 2. Se não houver um userId, usa os dados do momento da reclamação como fallback.
                if (!userId) {
                    setConsumerProfile(denuncia.userDataAtTimeOfComplaint || {});
                    setLoadingProfile(false);
                    return;
                }

                setLoadingProfile(true);
                // 3. Busca o perfil mais recente do usuário na coleção 'users' usando o userId.
        const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
                console.log(userRef);
                try {
                    const snapshot = await get(userRef);
                    // Se o perfil atual existir, use-o. Senão, use os dados do momento da reclamação.
                    setConsumerProfile(snapshot.exists() ? snapshot.val() : denuncia.userDataAtTimeOfComplaint);
                } catch (error) {
                    console.error("Erro ao buscar perfil atual do consumidor:", error);
                    setConsumerProfile(denuncia.userDataAtTimeOfComplaint); // Em caso de erro, também usa o fallback.
                } finally {
                    setLoadingProfile(false);
                }
            };
            fetchConsumerProfile();
        }
    }, [denuncia]);

    if (!denuncia) return null;

    const formatDate = (dateStringOrTimestamp) => {
        if (!dateStringOrTimestamp) return 'N/A';
        const date = new Date(dateStringOrTimestamp);
        return date.toLocaleDateString('pt-BR');
    };

    const handleStatusSave = () => {
        onStatusChange(denuncia.id, newStatus);
    };

    const handleMigrateFile = async (file, index) => {
        if (!file.data || !file.data.startsWith('data:')) return;
        try {
            const response = await fetch(file.data);
            const blob = await response.blob();
            const convertedFile = new File([blob], file.name, { type: file.type });
            
            const folderPath = `denuncias-procon/migrated/${denuncia.id}`;
            const uploadResult = await uploadFileToStorage(convertedFile, folderPath);
            
            const itemRef = ref(db, `${config.cityCollection}/denuncias-procon/${denuncia.id}/arquivos/${index}`);
            
            await update(itemRef, {
                url: uploadResult.url,
                data: uploadResult.url
            });
            
            file.url = uploadResult.url;
            file.data = uploadResult.url;
            alert("Arquivo migrado com sucesso!");
        } catch (error) {
            console.error("Erro na migração:", error);
            alert("Falha ao migrar arquivo.");
        }
    };

    const handleFileUpload = (e) => {
        // Lógica para upload de arquivo pelo admin (a ser implementada)
        onFileUpload(denuncia.id, e.target.files[0]);
    };

    const handleSendMessage = () => {
        if (message.trim() === '') {
            alert('A mensagem não pode estar vazia.');
            return;
        }
        onSendMessage(denuncia.id, message);
        setMessage(''); // Limpa o campo após o envio
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalhes da Denúncia: {denuncia.protocolo}</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="data-sections-grid">
                        <div className="data-card">
                            <div className="card-header"><h3>Dados do Consumidor</h3></div>
                            {loadingProfile ? <p>Carregando dados do consumidor...</p> : (
                                <>
                                    <div className="detail-item"><strong>Nome:</strong> {consumerProfile?.name || 'N/A'}</div>
                                    <div className="detail-item"><strong>Email:</strong> {consumerProfile?.email || 'N/A'}</div>
                                    <div className="detail-item"><strong>Telefone:</strong> {consumerProfile?.phone || 'N/A'}</div>
                                </>
                            )}
                        </div>
                        <div className="data-card">
                            <div className="card-header"><h3>Dados da Empresa</h3></div>
                            <div className="detail-item"><strong>Nome:</strong> {denuncia.companyName || 'N/A'}</div>
                            <div className="detail-item"><strong>CNPJ:</strong> {denuncia.cnpjEmpresaReclamada || 'N/A'}</div>
                        </div>
                    </div>

                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Detalhes da Reclamação</h3></div>
                        <div className="detail-item"><strong>Protocolo:</strong> {denuncia.protocolo || 'N/A'}</div>
                        <div className="detail-item"><strong>Assunto:</strong> {denuncia.assuntoDenuncia || 'N/A'}</div>
                        <div className="detail-item"><strong>Tipo:</strong> {denuncia.tipoReclamacao || 'N/A'}</div>
                        <div className="detail-item"><strong>Classificação:</strong> {denuncia.classificacao || 'N/A'}</div>
                        <div className="detail-item"><strong>Descrição:</strong><p className="detail-description">{denuncia.descricao || 'N/A'}</p></div>
                        <div className="detail-item"><strong>Pedido do Consumidor:</strong> {denuncia.pedidoConsumidor || 'N/A'}</div>
                        <div className="detail-item"><strong>Data da Ocorrência:</strong> {formatDate(denuncia.dataOcorrencia)}</div>
                        <div className="detail-item"><strong>Data da Contratação:</strong> {formatDate(denuncia.dataContratacao)}</div>
                        <div className="detail-item"><strong>Data do Cancelamento:</strong> {formatDate(denuncia.dataCancelamento)}</div>
                        <div className="detail-item"><strong>Valor da Compra:</strong> R$ {denuncia.valorCompra || '0,00'}</div>
                    </div>

                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Informações Adicionais</h3></div>
                        <div className="detail-item"><strong>Forma de Aquisição:</strong> {denuncia.formaAquisicao || 'N/A'}</div>
                        <div className="detail-item"><strong>Forma de Pagamento:</strong> {denuncia.formaPagamento || 'N/A'}</div>
                        <div className="detail-item"><strong>Tipo de Contratação:</strong> {denuncia.tipoContratacao || 'N/A'}</div>
                        <div className="detail-item"><strong>Nome do Serviço/Produto:</strong> {denuncia.nomeServico || 'N/A'}</div>
                        <div className="detail-item"><strong>Detalhes do Serviço:</strong> {denuncia.detalhesServico || 'N/A'}</div>
                        <div className="detail-item"><strong>Tipo de Documento:</strong> {denuncia.tipoDocumento || 'N/A'}</div>
                        <div className="detail-item"><strong>Número do Documento:</strong> {denuncia.numeroDocumento || 'N/A'}</div>
                        <div className="detail-item"><strong>Procurou Fornecedor?:</strong> {denuncia.fornecedorResolver || 'N/A'}</div>
                    </div>

                    <hr />
                    <h4>Gerenciamento</h4>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Alterar Status</label>
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="form-input">
                                <option value="aberta">Aberta</option>
                                <option value="Em Análise">Em Análise</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Em Negociação">Em Negociação</option>
                                <option value="Finalizada">Finalizada</option>
                                <option value="Documentação Reprovada">Documentação Reprovada</option>
                                <option value="Documentação Reenviada">Documentação Reenviada</option>
                            </select>
                        </div>
                        <button onClick={handleStatusSave} className="btn-primary" style={{ alignSelf: 'flex-end', height: '45px' }}>Salvar Status</button>
                    </div>
                    <div className="detail-item" style={{ marginTop: '10px' }}><strong>Arquivos do Usuário:</strong></div>
                    {denuncia.arquivos?.length > 0 ? (
                        <ul className="file-list" style={{ marginTop: '5px', paddingLeft: '20px' }}>
                            {denuncia.arquivos.map((file, index) => (
                                <li key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                    <a href={file.url || file.data} target="_blank" rel="noopener noreferrer" className="file-link">
                                        <LiaPaperclipSolid /> {file.name}
                                    </a>
                                    {file.data?.startsWith('data:') && (
                                        <button onClick={() => handleMigrateFile(file, index)} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                                            <LiaUploadSolid /> Migrar para Storage
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="detail-description">Nenhum arquivo enviado.</p>
                    )}

                    <hr />
                    <h4>Mensagens</h4>
                    <div className="message-history">
                        {denuncia.messages && Object.values(denuncia.messages).map((msg, index) => (
                            <div key={index} className={`message-bubble ${msg.sender === 'admin' ? 'admin' : 'user'}`}>
                                <p>{msg.text}</p>
                                <small>{new Date(msg.timestamp).toLocaleString('pt-BR')}</small>
                            </div>
                        ))}
                    </div>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem para o usuário..." rows="3" className="form-input"></textarea>
                    </div>
                    <button onClick={handleSendMessage} className="btn-primary" style={{ width: '100%' }}>
                        <LiaPaperPlane /> Enviar Mensagem
                    </button>

                    <div className="form-actions" style={{ marginTop: '20px' }}>
                        <label className="btn-secondary"><LiaUploadSolid /> Enviar Arquivo ao Usuário<input type="file" hidden onChange={handleFileUpload} /></label>
                    </div>
                </div>
            </div>
        </div>
    );
};

// =============================================================
// Componente principal do Dashboard
// =============================================================
const AdminProconDashboard = () => {
    const navigate = useNavigate();
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [denuncias, setDenuncias] = useState([]);
    const [currentTab, setCurrentTab] = useState('Todas'); // Status da tab ativa
    const [statusCounts, setStatusCounts] = useState({});
    const [selectedDenuncia, setSelectedDenuncia] = useState(null);

    // 1. Hook de Autenticação e Inicialização do Firebase
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // Aqui você faria a checagem se o usuário é Administrador
                // Por simplicidade, vamos permitir acesso a qualquer usuário logado
                setUserId(user.uid);
            } else {
                // Se não houver usuário, redireciona para o login (ou rota inicial)
                navigate('/');
            }
            setIsAuthReady(true);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [navigate]);

    // Leitura única com limite (economiza downloads)
    const fetchDenuncias = useCallback(async () => {
        setLoading(true);
        try {
            const denunciasRef = ref(db, `${config.cityCollection}/denuncias-procon`);
            const q = query(denunciasRef, orderByKey(), limitToLast(200));
            const snapshot = await get(q);
            const data = snapshot.val();
            const fetchedDenuncias = data 
                ? Object.keys(data)
                    .map(key => ({ id: key, ...data[key] }))
                    .sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0))
                : [];
            
            setDenuncias(fetchedDenuncias);
            
            // Recalcula as contagens para o gráfico
            const counts = fetchedDenuncias.reduce((acc, denuncia) => {
                const status = denuncia.status || 'Não Classificado';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});

            const fixedStatuses = ['Em Análise', 'Pendente', 'Finalizada', 'Em Negociação', 'Documentação Reprovada', 'Documentação Reenviada', 'Não Classificado'];
            
            const orderedCounts = {};
            fixedStatuses.forEach(status => {
                orderedCounts[status] = counts[status] || 0;
            });

            setStatusCounts(orderedCounts);
        } catch (error) {
            console.error('Erro ao buscar denúncias:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady || !userId) return;
        fetchDenuncias();
    }, [isAuthReady, userId, fetchDenuncias]);

    // 3. Efeito para renderizar/atualizar o Chart.js
    useEffect(() => {
        if (!chartRef.current || Object.keys(statusCounts).length === 0) return;

        // Destrói a instância anterior se existir
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }
        
        const ctx = chartRef.current.getContext('2d');
        const labels = Object.keys(statusCounts);
        const dataValues = Object.values(statusCounts);
        
        // Cria a nova instância do gráfico (Gráfico de Linha, conforme a imagem)
        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total de Reclamações',
                    data: dataValues,
                    borderColor: '#007bff', // Cor da linha azul
                    backgroundColor: 'rgba(0, 123, 255, 0.1)', // Fundo suave abaixo da linha
                    tension: 0.4, // Curvatura da linha
                    fill: true,
                    pointRadius: 5,
                    pointBackgroundColor: '#0d1e57',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Permite que o CSS controle o tamanho
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Número de Reclamações'
                        }
                    },
                    x: {
                        grid: {
                            display: false // Remove linhas verticais
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Reclamações por Status',
                        font: {
                            size: 16,
                            weight: '600'
                        }
                    }
                }
            }
        });

        // Limpeza: destrói o gráfico ao desmontar o componente
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };

    }, [statusCounts]);

    // Filtra as denúncias baseadas na tab ativa
    const filteredDenuncias = currentTab === 'Todas' 
        ? denuncias 
        : denuncias.filter(d => d.status === currentTab);

    const handleOpenModal = (denuncia) => {
        setSelectedDenuncia(denuncia);
    };

    const handleCloseModal = () => {
        setSelectedDenuncia(null);
    };

    const sendNotification = async (denuncia, customMessage) => {
        if (!denuncia.userId || denuncia.userId === 'anonimo') {
            console.log("Usuário anônimo, notificação não enviada.");
            return;
        }

        // Busca o perfil do usuário para garantir que os dados estão atualizados
    const userRef = ref(db, `${config.cityCollection}/users/${denuncia.userId}`);
        let userProfile = denuncia.userDataAtTimeOfComplaint; // Fallback

        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                userProfile = snapshot.val();
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário para notificação:", error);
        }

        if (!userProfile || !userProfile.email) {
            console.log("Usuário sem e-mail, notificação não enviada.");
            return;
        };

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = customMessage?.title || `Sua reclamação no Procon foi atualizada.`;
        const notificationDescription = customMessage?.body || `Abra o aplicativo da Câmara Municipal de ${cityName} para acompanhar os detalhes. Protocolo: ${denuncia.id}.`;

        // 1. Salva a notificação no app
        const notificacoesRef = ref(db, `${config.cityCollection}/notifications`);
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            isRead: false,
            protocolo: denuncia.id,
            targetUserId: denuncia.userId,
            timestamp: serverTimestamp(),
            tituloNotification: notificationTitle,
            descricaoNotification: notificationDescription,
            userEmail: userProfile.email,
            userId: denuncia.userId
        });

        // 2. Adiciona a um nó 'mail' para ser processado por um serviço de e-mail
        const mailRef = ref(db, `${config.cityCollection}/mail`);
        const newMailRef = push(mailRef);
        await set(newMailRef, {
            to: userProfile.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
            },
        });
    };

    const handleStatusChange = async (denunciaId, newStatus) => {
    const denunciaRef = ref(db, `${config.cityCollection}/denuncias-procon/${denunciaId}`);
        let updateData = { status: newStatus };
        if (newStatus === 'Finalizada') {
            updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
        } else if (newStatus === 'Documentação Reprovada') {
            updateData.deletionTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1000;
        } else {
            updateData.deletionTimestamp = null;
        }
        await update(denunciaRef, updateData);
        await sendNotification(
            { ...selectedDenuncia, id: denunciaId, status: newStatus },
            { title: "Alteração de Status Procon", body: `Sua reclamação teve o status alterado para: ${newStatus}.` }
        );
        alert('Status atualizado com sucesso!');
        handleCloseModal();
        fetchDenuncias(); // Atualiza a lista
    };

    const handleSendMessage = async (denunciaId, messageText) => {
    const messagesRef = ref(db, `${config.cityCollection}/denuncias-procon/${denunciaId}/messages`);
        const newMessageRef = push(messagesRef);
        await set(newMessageRef, {
            text: messageText,
            sender: 'admin',
            timestamp: serverTimestamp(),
        });
        await sendNotification(
            { ...selectedDenuncia, id: denunciaId },
            { title: "Resposta do Procon disponível", body: `O Procon enviou uma nova mensagem: "${messageText}"` }
        );
        alert('Mensagem enviada com sucesso!');
    };

    const handleAdminFileUpload = async (denunciaId, file) => {
        if (!file) return;

        // Validação simples de arquivo
        if (file.size > 5 * 1024 * 1024) { // Limite de 5MB
            alert("O arquivo excede o limite de 5MB.");
            return;
        }
        
        try {
            const folderPath = `denuncias-procon/admin-uploads/${denunciaId}`;
            const uploadResult = await uploadFileToStorage(file, folderPath);

            const fileData = {
                name: file.name,
                type: file.type,
                url: uploadResult.url,
                data: uploadResult.url,
                sender: 'admin',
                timestamp: serverTimestamp(),
            };

            const denunciaRef = ref(db, `${config.cityCollection}/denuncias-procon/${denunciaId}`);
            const snapshot = await get(denunciaRef);
            const denunciaAtual = snapshot.val();
            const arquivosAtuais = denunciaAtual.arquivos || [];
            await update(denunciaRef, { arquivos: [...arquivosAtuais, fileData] });
            alert("Arquivo enviado com sucesso!");
        } catch (err) {
            console.error("Erro no upload admin:", err);
            alert("Falha ao enviar o arquivo.");
        }
    };

    // Mapeamento de status para rótulos de tab
    const statusTabs = ['Todas', 'Em Análise', 'Pendente', 'Finalizada', 'Em Negociação', 'Documentação Reprovada', 'Documentação Reenviada'];

    if (!isAuthReady) {
        return <div className="loading-screen">Carregando autenticação...</div>;
    }

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                
                {/* Header */}
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Administração Procon</h1>
                        <p>Visão geral e atividades das denúncias</p>
                        <button onClick={fetchDenuncias} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                            ↻ Atualizar dados
                        </button>
                    </div>

                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{auth.currentUser?.email || 'Admin'}</p>
                            <p className="user-type-display">Administrador</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>
                
                {/* Seção Principal do Dashboard */}
                <div className="data-sections-grid">
                    
                    {/* Card de Atividades/Gráfico */}
                    <div className="data-card">
                        <div className="card-header"><h3>Atividades Recentes</h3></div>

                        {/* Tabs de Filtro de Status */}
                        <div className="tabs-header" style={{ marginBottom: '20px' }}>
                            {statusTabs.map(tab => (
                                <button
                                    key={tab}
                                    className={`tab-button ${currentTab === tab ? 'active' : ''}`}
                                    onClick={() => setCurrentTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Gráfico */}
                        <div className="chart-container">
                            <div style={{ height: '350px', width: '100%' }}>
                                {loading ? (
                                    <p style={{ textAlign: 'center', marginTop: '100px' }}>Carregando dados do gráfico...</p>
                                ) : (
                                    <canvas ref={chartRef}></canvas>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Card de Lista de Denúncias (Opcional, para demonstrar o filtro) */}
                    <div className="data-card">
                        <div className="card-header"><h3>Últimas Denúncias ({currentTab})</h3></div>

                        {loading && <p>Carregando lista...</p>}
                        {!loading && filteredDenuncias.length === 0 && <p>Nenhuma denúncia encontrada com o status "{currentTab}".</p>}
                        
                        <ul className="data-list">
                            {filteredDenuncias.slice(0, 5).map(denuncia => (
                                <li key={denuncia.id} className="data-list-item" onClick={() => handleOpenModal(denuncia)}>
                                    <div className="item-main-info">
                                        <strong>{denuncia.assuntoDenuncia || 'Sem assunto'}</strong>
                                        <span>Protocolo: {denuncia.protocolo}</span>
                                    </div>
                                    <div className="item-status"><span className={`status-badge status-${denuncia.status?.toLowerCase().replace(/\s/g, '-') || 'pending'}`}>{denuncia.status || 'Pendente'}</span></div>
                                </li>
                            ))}
                        </ul>
                        {filteredDenuncias.length > 5 && <p style={{marginTop: '15px', fontSize: '0.9rem', color: '#6b7280', textAlign: 'center'}}>e mais {filteredDenuncias.length - 5} reclamações...</p>}
                    </div>
                </div>

                <ComplaintDetailsModal 
                    denuncia={selectedDenuncia}
                    onClose={handleCloseModal}
                    onStatusChange={handleStatusChange}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleAdminFileUpload}
                />

            </div>
        </div>
    );
};

export default AdminProconDashboard;
