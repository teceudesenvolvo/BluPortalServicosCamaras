import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Importações do Firebase
import { ref, get, update } from 'firebase/database';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../contexts/FirebaseAuthContext';
import { auth, db } from '../firebase';
import Sidebar from '../components/Sidebar'; // Sidebar do Cidadão
import AdminSidebar from '../components/AdminSidebar'; // Sidebar do Admin

// Ícones
import {
    LiaUser, LiaLongArrowAltUpSolid, LiaLockSolid
} from "react-icons/lia";

// *******************
// Componente Principal: Perfil
// *******************
const Perfil = () => {
    const navigate = useNavigate();
    const { currentUser: userAuth, loading: loadingAuth } = useAuth();

    // ESTADOS LOCAIS
    const [profileData, setProfileData] = useState(null); // Dados do Perfil
    const [editableProfileData, setEditableProfileData] = useState(null); // Dados para edição
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [error, setError] = useState(null);

    // 2. BUSCA E OBSERVAÇÃO DE DADOS DO PERFIL
    const fetchProfileData = useCallback(async () => {
        if (loadingAuth || !userAuth) {
            if (!loadingAuth && !userAuth) navigate('/login');
            return;
        }

        setLoadingProfile(true);
        setError(null);
        
        const userId = userAuth.uid;
        const userRef = ref(db, 'users/' + userId);
        
        try {
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
                // Se os dados existirem, carregue-os
                const userData = snapshot.val();
                setProfileData({
                    uid: userId,
                    name: userData.name || userAuth.displayName || 'Usuário',
                    email: userAuth.email,
                    tipo: userData.tipo || 'Cidadão',
                    ...userData // Adiciona outros campos do perfil
                });
            } else {
                // Caso contrário, use dados básicos do Auth
                setProfileData({ uid: userId, name: userAuth.displayName || 'Usuário', email: userAuth.email, tipo: 'Cidadão' });
                console.warn("Documento de perfil não encontrado no Realtime Database.");
            }
        } catch (error) {
            console.error("Erro ao buscar/criar dados do perfil:", error);
            setError("Erro ao carregar os dados do perfil. Verifique as permissões.");
        } finally {
            setLoadingProfile(false);
        }
    }, [userAuth, loadingAuth, navigate]);

    // Dispara a busca quando db e userAuth estiverem prontos
    useEffect(() => {
        fetchProfileData();
    }, [fetchProfileData]);


    // Funções de Ação (Apenas logs no mock)
    const handleEdit = () => { 
        setEditableProfileData({ ...profileData });
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditableProfileData(null);
    };

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setEditableProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditableProfileData(prev => ({ ...prev, avatar: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!userAuth) return;
        setLoadingProfile(true);
        const userRef = ref(db, 'users/' + userAuth.uid);
        try {
            await update(userRef, editableProfileData);
            setProfileData(editableProfileData); // Atualiza o estado principal
            setIsEditing(false);
            alert("Perfil atualizado com sucesso!");
        } catch (err) {
            console.error("Erro ao salvar perfil:", err);
            setError("Não foi possível salvar as alterações.");
        } finally {
            setLoadingProfile(false);
        }
    };

    const handlePasswordChange = async () => {
        if (!userAuth?.email) {
            alert("E-mail do usuário não encontrado para redefinir a senha.");
            return;
        }
        if (window.confirm("Um e-mail para redefinição de senha será enviado para " + userAuth.email + ". Deseja continuar?")) {
            try {
                await sendPasswordResetEmail(auth, userAuth.email);
                alert("E-mail enviado! Verifique sua caixa de entrada (e spam) para redefinir sua senha.");
            } catch (err) {
                console.error("Erro ao enviar e-mail de redefinição de senha:", err);
                alert("Ocorreu um erro ao tentar enviar o e-mail. Tente novamente mais tarde.");
            }
        }
    };

    const handleSignOut = async () => {
        try {
            if (window.confirm("Tem certeza que deseja sair da conta?")) {
                await signOut(auth);
                navigate('/login');
            }
        } catch (e) {
            console.error("Erro ao sair:", e);
            alert("Erro ao tentar sair da conta.");
        }
    };

    // Navegação Sidebar
    const handleNavigation = (path) => {
        navigate(path);
    };

    // Função para garantir que o avatar seja uma Data URL válida
    const getAvatarSrc = (avatarBase64) => {
        if (!avatarBase64) return null;
        if (avatarBase64.startsWith('data:image')) return avatarBase64;
        return `data:image/jpeg;base64,${avatarBase64}`; // Assume um formato padrão se o prefixo estiver faltando
    };

    // *******************
    // Renderização Condicional
    // *******************

    // Renderização do Perfil
    return (
        <div className="dashboard-layout">
            {['Admin', 'Vereador', 'Juridico', 'Procuradoria', 'Procon', 'Ouvidoria', 'Balcão'].includes(profileData?.tipo) ? (
                <AdminSidebar />
            ) : (
                <Sidebar onItemClick={handleNavigation} />
            )}
            <div className="dashboard-content">
                
                <header className="content-header">
                    <div className="header-title-section">
                        {/* Aqui pode ir a logo da Pacatuba */}
                        <h1>Câmara Municipal de Pacatuba</h1>
                        <p>Portal de Serviços</p>
                    </div>
                </header>

                {loadingAuth || loadingProfile ? (
                    <div className="loading-full-screen" style={{ minHeight: '300px', background: 'transparent' }}>Carregando perfil...</div>
                ) : error || !profileData ? (
                    <div className="error-message">
                        <h1>Erro ao Carregar Perfil</h1>
                        <p>{error || "Dados de perfil não disponíveis."}</p>
                    </div>
                ) : isEditing ? (
                    // MODO DE EDIÇÃO
                    <div className="profile-container">
                        <div className="profile-summary">
                            <div className="profile-info">
                                <div className="profile-avatar">
                                    {getAvatarSrc(editableProfileData.avatarBase64) ? (
                                        <img src={getAvatarSrc(editableProfileData.avatarBase64)} alt="Avatar" className="profile-image" />
                                    ) : (
                                        <LiaUser />
                                    )}
                                    <label htmlFor="avatar-upload" className="btn-edit-avatar">Alterar</label>
                                    <input id="avatar-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                                </div>
                                <div className="profile-text">
                                    <input type="text" name="name" value={editableProfileData.name || ''} onChange={handleProfileChange} className="form-input-edit" />
                                    <p>{editableProfileData.email}</p>
                                </div>
                            </div>
                        </div>
                        <div className="data-sections-grid">
                            <div className="data-card">
                                <div className="card-header"><h3>Dados Pessoais</h3></div>
                                <div className="data-item-edit"><label>Nome:</label><input type="text" name="name" value={editableProfileData.name || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Telefone:</label><input type="tel" name="phone" value={editableProfileData.phone || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>CPF:</label><input type="text" name="cpf" value={editableProfileData.cpf || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Estado Civil:</label><input type="text" name="estadoCivil" value={editableProfileData.estadoCivil || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Sexo:</label><input type="text" name="sexo" value={editableProfileData.sexo || ''} onChange={handleProfileChange} /></div>
                            </div>
                            <div className="data-card">
                                <div className="card-header"><h3>Endereço</h3></div>
                                <div className="data-item-edit"><label>CEP:</label><input type="text" name="cep" value={editableProfileData.cep || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Endereço:</label><input type="text" name="address" value={editableProfileData.address || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Número:</label><input type="text" name="numero" value={editableProfileData.numero || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Complemento:</label><input type="text" name="complemento" value={editableProfileData.complemento || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Bairro:</label><input type="text" name="neighborhood" value={editableProfileData.neighborhood || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>Cidade:</label><input type="text" name="city" value={editableProfileData.city || ''} onChange={handleProfileChange} /></div>
                                <div className="data-item-edit"><label>UF:</label><input type="text" name="state" value={editableProfileData.state || ''} onChange={handleProfileChange} /></div>
                            </div>
                        </div>
                        <div className="profile-actions">
                            <button className="btn-secondary" onClick={handleCancelEdit}>Cancelar</button>
                            <button className="btn-primary" onClick={handleSave}>Salvar Alterações</button>
                        </div>
                    </div>
                ) : (
                    // MODO DE VISUALIZAÇÃO
                    <div className="profile-container">
                        {/* Sumário do Perfil */}
                        <div className="profile-summary">
                            <div className="profile-info">
                                <div className="profile-avatar">
                                    {getAvatarSrc(profileData.avatarBase64) ? (
                                        <img src={getAvatarSrc(profileData.avatarBase64)} alt="Avatar" className="profile-image" />
                                    ) : (
                                        <LiaUser />
                                    )}
                                </div>
                                <div className="profile-text">
                                    <h2>{profileData.name}</h2>
                                    <p>{profileData.tipo}</p>
                                </div>
                            </div>
                            <button className="btn-edit" onClick={handleEdit}>
                                Editar
                            </button>
                        </div>

                        {/* Dados Detalhados */}
                        <div className="data-sections-grid">
                            {/* Seção Dados Pessoais */}
                            <div className="data-card">
                                <div className="card-header">
                                    <h3>Dados Pessoais</h3>
                                </div>
                                <div className="data-item"><strong>Nome:</strong><span>{profileData.name || 'N/A'}</span></div>
                                <div className="data-item"><strong>Email:</strong><span>{profileData.email || 'N/A'}</span></div>
                                <div className="data-item"><strong>Telefone:</strong><span>{profileData.phone || 'N/A'}</span></div>
                                <div className="data-item"><strong>CPF:</strong><span>{profileData.cpf || 'N/A'}</span></div>
                                <div className="data-item"><strong>Estado Civil:</strong><span>{profileData.estadoCivil || 'N/A'}</span></div>
                                <div className="data-item"><strong>Sexo:</strong><span>{profileData.sexo || 'N/A'}</span></div>
                            </div>

                            {/* Seção Endereço */}
                            <div className="data-card">
                                <div className="card-header">
                                    <h3>Endereço</h3>
                                </div>
                                <div className="data-item"><strong>CEP:</strong><span>{profileData.cep || 'N/A'}</span></div>
                                <div className="data-item"><strong>Endereço:</strong><span>{profileData.address || 'N/A'}</span></div>
                                <div className="data-item"><strong>Número:</strong><span>{profileData.numero || 'N/A'}</span></div>
                                <div className="data-item"><strong>Complemento:</strong><span>{profileData.complemento || 'N/A'}</span></div>
                                <div className="data-item"><strong>Bairro:</strong><span>{profileData.neighborhood || 'N/A'}</span></div>
                                <div className="data-item"><strong>Cidade:</strong><span>{profileData.city || 'N/A'}</span></div>
                                <div className="data-item"><strong>UF:</strong><span>{profileData.state || 'N/A'}</span></div>
                            </div>
                        </div>

                        {/* Ações do Perfil */}
                        <div className="profile-actions">
                            <button className="btn-alter-pass" onClick={handlePasswordChange}>
                                <LiaLockSolid size={18} style={{ marginRight: '8px' }} />
                                Alterar Senha
                            </button>
                            <button className="btn-danger" onClick={handleSignOut}>
                                <LiaLongArrowAltUpSolid size={18} style={{ marginRight: '8px' }} />
                                Sair da conta
                            </button>
                        </div>
                    </div>
                )}

                <footer style={{ marginTop: '50px', textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af' }}>
                    Desenvolvido por Blu Tecnologias
                </footer>
            </div>
        </div>
    );
};

export default Perfil;
