import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, update, push, set, serverTimestamp } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaTimesSolid, LiaSaveSolid, LiaUserEditSolid, LiaEnvelopeSolid } from "react-icons/lia";

// Modal para Edição de Usuário
const UserEditModal = ({ user, onClose, onSave }) => {
    const [editedUser, setEditedUser] = useState(null);

    useEffect(() => {
        if (user) {
            setEditedUser({ ...user });
        }
    }, [user]);

    if (!user || !editedUser) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEditedUser(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        onSave(user.uid, editedUser);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Editar Usuário: {user.name || user.email}</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="data-sections-grid">
                        <div className="data-card">
                            <div className="card-header"><h3>Dados Pessoais</h3></div>
                            <div className="data-item-edit"><label>Nome:</label><input type="text" name="name" value={editedUser.name || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Email:</label><input type="email" name="email" value={editedUser.email || ''} onChange={handleChange} disabled /></div>
                            <div className="data-item-edit"><label>Telefone:</label><input type="tel" name="phone" value={editedUser.telefone || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>CPF:</label><input type="text" name="cpf" value={editedUser.cpf || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Sexo:</label><input type="text" name="sexo" value={editedUser.sexo || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Estado Civil:</label><input type="text" name="estadoCivil" value={editedUser.estadoCivil || ''} onChange={handleChange} /></div>
                        </div>
                        <div className="data-card">
                            <div className="card-header"><h3>Endereço</h3></div>
                            <div className="data-item-edit"><label>CEP:</label><input type="text" name="cep" value={editedUser.cep || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Endereço:</label><input type="text" name="address" value={editedUser.address || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Número:</label><input type="text" name="numero" value={editedUser.numero || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Complemento:</label><input type="text" name="complemento" value={editedUser.complemento || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Bairro:</label><input type="text" name="neighborhood" value={editedUser.neighborhood || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Cidade:</label><input type="text" name="city" value={editedUser.city || ''} onChange={handleChange} /></div>
                            <div className="data-item-edit"><label>Estado:</label><input type="text" name="state" value={editedUser.state || ''} onChange={handleChange} /></div>
                        </div>
                    </div>
                    <div className="data-card" style={{ marginTop: '20px' }}>
                        <div className="card-header"><h3>Permissões</h3></div>
                        <div className="data-item-edit">
                            <label>Tipo de Usuário:</label>
                            <select name="tipo" value={editedUser.tipo || 'Cidadão'} onChange={handleChange}>
                                <option value="Admin">Admin</option>
                                <option value="Vereador">Vereador</option>
                                <option value="Juridico">Juridico</option>
                                <option value="Procuradoria">Procuradoria</option>
                                <option value="Procon">Procon</option>
                                <option value="Ouvidoria">Ouvidoria</option>
                                <option value="Balcão">Balcão</option>
                                <option value="Cidadão">Cidadão</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-actions" style={{ marginTop: '20px' }}>
                        <button onClick={handleSave} className="btn-primary">
                            <LiaSaveSolid /> Salvar Alterações
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Novo Modal para Envio de Email em Massa
const SendEmailModal = ({ onClose, onSend, loading, currentBatchStartIndex, totalUsers, batchSize }) => {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    const currentBatchEndIndex = Math.min(currentBatchStartIndex + batchSize, totalUsers);
    const isLastBatch = currentBatchEndIndex >= totalUsers;

    const handleSendClick = () => {
        if (!subject.trim() || !body.trim()) {
            alert('Por favor, preencha o assunto e o corpo do e-mail.');
            return;
        }
        onSend(subject, body);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                <div className="modal-header">
                    <h3>Enviar E-mail para Todos os Usuários</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    {totalUsers > 0 && (
                        <p style={{ marginBottom: '15px', fontSize: '0.9rem', color: '#666' }}>
                            Enviando para usuários {currentBatchStartIndex + 1} a {currentBatchEndIndex} de {totalUsers}.
                        </p>
                    )}
                    <div className="form-group">
                        <label>Assunto:</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="form-input"
                            placeholder="Assunto do e-mail"
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <label>Corpo do E-mail:</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className="form-input"
                            rows="10"
                            placeholder="Digite o conteúdo do e-mail aqui..."
                        ></textarea>
                    </div>
                    <div className="form-actions" style={{ marginTop: '20px' }}>
                        <button onClick={handleSendClick} className="btn-primary" disabled={loading}>
                            <LiaEnvelopeSolid style={{ marginRight: '8px' }} />
                            {loading ? 'Enviando Lote...' : (isLastBatch ? 'Finalizar Envio' : 'Enviar Próximo Lote')}
                        </button>
                        <button onClick={onClose} className="btn-secondary" disabled={loading} style={{ marginLeft: '10px' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};



// Componente Principal
const AdminUsersDashboard = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    
    const BATCH_SIZE = 20; // Define o tamanho do lote
    const [currentBatchStartIndex, setCurrentBatchStartIndex] = useState(200); // Começa em 20, pois os primeiros 20 já foram enviados
    const [showEmailModal, setShowEmailModal] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setIsAuthReady(true);
            } else {
                navigate('/');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    // Leitura única (economiza downloads)
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const usersRef = ref(db, `${config.cityCollection}/users`);
            const snapshot = await get(usersRef);
            const data = snapshot.val();
            const fetchedUsers = data ? Object.keys(data).map(key => ({ uid: key, ...data[key] })) : [];
            setUsers(fetchedUsers);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady) return;
        fetchUsers();
    }, [isAuthReady, fetchUsers]);

    const handleOpenModal = (user) => setSelectedUser(user);
    const handleCloseModal = () => setSelectedUser(null);

    // Função auxiliar para enviar notificação (mantida como estava)
    const sendNotification = useCallback(async (userData) => {
        if (!userData.uid || !userData.email) {
            console.log("Dados do usuário incompletos, notificação não enviada.");
            return;
        }

        const cityName = config.cityCollection.charAt(0).toUpperCase() + config.cityCollection.slice(1);
        const notificationTitle = `Seu perfil de usuário foi atualizado.`;
        const notificationDescription = `Suas permissões ou dados foram atualizados no Portal de Serviços da Câmara Municipal de ${cityName}.`;

        // 1. Salva a notificação no app
        const notificacoesRef = ref(db, `${config.cityCollection}/notifications`);
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            isRead: false,
            protocolo: userData.uid,
            targetUserId: userData.uid,
            timestamp: serverTimestamp(),
            tituloNotification: notificationTitle,
            descricaoNotification: notificationDescription,
            userEmail: userData.email,
            userId: userData.uid
        });

        // 2. Adiciona a um nó 'mail' para ser processado por um serviço de e-mail
        const mailRef = ref(db, `${config.cityCollection}/mail`);
        const newMailRef = push(mailRef);
        await set(newMailRef, {
            to: userData.email,
            message: {
                subject: notificationTitle,
                html: `<p>${notificationTitle}</p><p>${notificationDescription}</p>`,
            },
        });
    }, []);

    const handleSaveUser = async (userId, updatedData) => {
        const userRef = ref(db, `${config.cityCollection}/users/${userId}`);
        try {
            await update(userRef, updatedData);
            await sendNotification({ uid: userId, email: updatedData.email });
            alert('Usuário atualizado com sucesso!');
            handleCloseModal();
            fetchUsers(); // Atualiza a lista
        } catch (error) {
            alert('Falha ao atualizar o usuário.');
            console.error("Erro ao salvar usuário:", error);
        }
    };

    const handleOpenEmailModal = () => setShowEmailModal(true);
    const handleCloseEmailModal = () => setShowEmailModal(false);

    const handleSendEmailBatch = async (subject, body) => {
        const usersToSend = filteredUsers.slice(currentBatchStartIndex, currentBatchStartIndex + BATCH_SIZE);

        if (usersToSend.length === 0) {
            alert('Todos os usuários já receberam o e-mail ou não há mais usuários para enviar.');
            handleCloseEmailModal();
            setCurrentBatchStartIndex(0); // Reset for future mass emails
            return;
        }

        const confirmMessage = `Tem certeza que deseja enviar este e-mail para ${usersToSend.length} usuários (do total de ${filteredUsers.length})?`;
        if (!window.confirm(confirmMessage)) {
            return;
        }

        setLoading(true); // Usar o loading principal para desabilitar o botão de abrir o modal
        try {
            const mailRef = ref(db, `${config.cityCollection}/mail`);
            const sendPromises = usersToSend.map(user => {
                if (user.email) {
                    return set(push(mailRef), {
                        to: user.email,
                        message: {
                            subject: subject,
                            html: `<p>${body}</p>`,
                        },
                    });
                }
                return Promise.resolve(); // Resolve para usuários sem e-mail
            });
            await Promise.all(sendPromises);

            const nextStartIndex = currentBatchStartIndex + BATCH_SIZE;
            setCurrentBatchStartIndex(nextStartIndex);

            if (nextStartIndex >= filteredUsers.length) {
                alert(`Lote enviado com sucesso! Todos os ${filteredUsers.length} usuários receberam o e-mail.`);
                handleCloseEmailModal();
                setCurrentBatchStartIndex(0); // Reset for future mass emails
            } else {
                alert(`Lote de ${usersToSend.length} e-mails enviado com sucesso! Próximo lote: usuários ${nextStartIndex + 1} a ${Math.min(nextStartIndex + BATCH_SIZE, filteredUsers.length)}.`);
            }
        } catch (error) {
            alert('Erro ao enviar e-mails em massa.');
            console.error('Erro ao enviar e-mails em massa:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(user =>
        (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!isAuthReady) {
        return <div className="loading-screen">Carregando...</div>;
    }

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Gerenciamento de Usuários</h1>
                        <p>Visualize e edite os perfis dos usuários do portal</p>
                        <button onClick={fetchUsers} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                            ↻ Atualizar dados
                        </button>
                        <button onClick={handleOpenEmailModal} className="btn-primary" disabled={loading} style={{ marginTop: '8px', marginLeft: '10px' }}>
                            <LiaEnvelopeSolid style={{ marginRight: '8px' }} /> Enviar E-mail para Todos
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

                <div className="data-card">
                    <div className="card-header">
                        <div className="form-group" style={{ flexGrow: 1 }}>
                            <input
                                type="text"
                                placeholder="Buscar por nome ou e-mail..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="form-input"
                            />
                        </div>
                    </div>

                    {loading && <p>Carregando usuários...</p>}
                    {!loading && filteredUsers.length === 0 && <p>Nenhum usuário encontrado.</p>}

                    <ul className="data-list">
                        {filteredUsers.map(user => (
                            <li key={user.uid} className="data-list-item" onClick={() => handleOpenModal(user)}>
                                <div className="item-main-info">
                                    <strong>{user.name || 'Nome não informado'}</strong>
                                    <span>{user.email}</span>
                                </div>
                                <div className="item-status">
                                    <span className={`status-badge status-${user.tipo?.toLowerCase() || 'cidadao'}`}>
                                        {user.tipo || 'Cidadão'}
                                    </span>
                                    <LiaUserEditSolid size={20} style={{ marginLeft: '15px', color: '#6b7280' }} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <UserEditModal
                    user={selectedUser}
                    onClose={handleCloseModal}
                    onSave={handleSaveUser}
                />

                {showEmailModal && <SendEmailModal
                    onClose={handleCloseEmailModal}
                    onSend={handleSendEmailBatch}
                    loading={loading} // Use o loading principal para desabilitar o botão de envio enquanto a requisição está em andamento
                    currentBatchStartIndex={currentBatchStartIndex}
                    totalUsers={filteredUsers.length}
                    batchSize={BATCH_SIZE}
                />}
            </div>
        </div>
    );
};

export default AdminUsersDashboard;