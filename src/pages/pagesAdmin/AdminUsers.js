import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, update, push, set, serverTimestamp } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaTimesSolid, LiaSaveSolid, LiaUserEditSolid } from "react-icons/lia";

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
                            <div className="data-item-edit"><label>Telefone:</label><input type="tel" name="phone" value={editedUser.phone || ''} onChange={handleChange} /></div>
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

// Componente Principal
const AdminUsersDashboard = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);

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

    useEffect(() => {
        if (!isAuthReady) return;

        const usersRef = ref(db, 'users');
        const unsubscribe = onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            const fetchedUsers = data ? Object.keys(data).map(key => ({ uid: key, ...data[key] })) : [];
            setUsers(fetchedUsers);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    const handleOpenModal = (user) => setSelectedUser(user);
    const handleCloseModal = () => setSelectedUser(null);

    const sendNotification = async (userData) => {
        if (!userData.uid || !userData.email) {
            console.log("Dados do usuário incompletos, notificação não enviada.");
            return;
        }

        const notificacoesRef = ref(db, 'notifications');
        const newNotificationRef = push(notificacoesRef);
        await set(newNotificationRef, {
            isRead: false,
            protocolo: userData.uid,
            targetUserId: userData.uid,
            timestamp: serverTimestamp(),
            tituloNotification: "Seu usuário foi atualizado.",
            descricaoNotification: "Abra agora mesmo o aplicativo da Câmara Municipal de Pacatuba para acompanhar.",
            userEmail: userData.email,
            userId: userData.uid
        });
    };

    const handleSaveUser = async (userId, updatedData) => {
        const userRef = ref(db, `users/${userId}`);
        try {
            await update(userRef, updatedData);
            await sendNotification({ uid: userId, email: updatedData.email });
            alert('Usuário atualizado com sucesso!');
            handleCloseModal();
        } catch (error) {
            alert('Falha ao atualizar o usuário.');
            console.error("Erro ao salvar usuário:", error);
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
            </div>
        </div>
    );
};

export default AdminUsersDashboard;