import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import Sidebar from '../../components/Sidebar';
import { db } from '../../firebase';
import { ref, get, set } from 'firebase/database';

// Ícones
import { LiaSaveSolid, LiaArrowLeftSolid } from "react-icons/lia";

const ConfigurarPanico = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [contato, setContato] = useState({ telefone: '', email: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loggedInUserData, setLoggedInUserData] = useState(null);

    // Busca configuração existente
    const fetchConfig = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);
        const configRef = ref(db, `procuradoria-mulher-btn-panico/${currentUser.uid}`);
        try {
            const snapshot = await get(configRef);
            if (snapshot.exists()) {
                setContato(snapshot.val());
            }
        } catch (err) {
            setError("Erro ao carregar configuração existente.");
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    // Busca perfil do usuário
    const fetchUserProfile = useCallback(async () => {
        if (!currentUser) return;
        const userRef = ref(db, 'users/' + currentUser.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            setLoggedInUserData(snapshot.val());
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
        } else {
            fetchUserProfile();
            fetchConfig();
        }
    }, [currentUser, navigate, fetchUserProfile, fetchConfig]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setContato(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            setError("Você precisa estar logada para salvar.");
            return;
        }
        if (!contato.telefone) {
            setError("O campo Telefone de Confiança é obrigatório.");
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const configRef = ref(db, `procuradoria-mulher-btn-panico/${currentUser.uid}`);
            await set(configRef, contato);
            setSuccess('Contato de emergência salvo com sucesso!');
        } catch (err) {
            console.error("Erro ao salvar configuração:", err);
            setError('Ocorreu um erro ao salvar. Tente novamente.');
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
                        <p>Procuradoria da Mulher - Configurar Botão de Pânico</p>
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
                        <div className="page-title-and-icon" style={{ marginBottom: '20px' }}>
                            <h2>Contato de Emergência</h2>
                        </div>
                        <p style={{ marginBottom: '20px', color: '#555' }}>
                            Cadastre um número de telefone e um e-mail de uma pessoa de sua confiança. Ao acionar o botão de pânico, uma mensagem de ajuda com sua localização será preparada para ser enviada para este número.
                        </p>

                        <div className="form-group">
                            <label htmlFor="telefone">Telefone de Confiança (com DDD) *</label>
                            <input type="tel" id="telefone" name="telefone" value={contato.telefone} onChange={handleChange} placeholder="Ex: 85999998888" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="email">E-mail de Confiança (Opcional)</label>
                            <input type="email" id="email" name="email" value={contato.email} onChange={handleChange} />
                        </div>

                        {error && <p className="error-message">{error}</p>}
                        {success && <p className="success-message">{success}</p>}

                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => navigate('/procuradoria')}>
                                <LiaArrowLeftSolid size={18} style={{ marginRight: '8px' }} />
                                Voltar
                            </button>
                            <button type="submit" className="btn-submit" disabled={loading}>
                                <LiaSaveSolid size={18} style={{ marginRight: '8px' }} />
                                {loading ? 'Salvando...' : 'Salvar Contato'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ConfigurarPanico;