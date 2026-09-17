import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

// Importa o hook de autenticação e a instância do auth
import { useAuth } from '../contexts/FirebaseAuthContext';
import { auth } from '../firebase';
 
import Brasao from '../assets/logo-paraipaba.png'; // Logo redonda/brasão
import Logo from '../assets/logo-paraipaba-azul.png'; // Logo horizontal
import { useSystemControl } from '../contexts/SystemControlContext';

const LoginPage = () => {
    const { settings } = useSystemControl();
    const navigate = useNavigate();
    const { currentUser } = useAuth(); // Monitora o estado atual do usuário

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // Todos os perfis iniciam pelo dashboard após a autenticação.
    const redirectUser = useCallback(() => navigate('/dashboard', { replace: true }), [navigate]);

    // Efeito para redirecionar se o usuário já estiver logado.
    useEffect(() => {
        if (currentUser) {
            redirectUser();
        }
    }, [currentUser, redirectUser]);

    // Evita renderizar o formulário de login se o usuário já estiver logado e o redirecionamento estiver prestes a acontecer.
    if (currentUser) {
        return <div className="loading-full-screen">Redirecionando...</div>; // Ou null
    }

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // Apenas realiza o login. O hook `useEffect` acima será acionado
            // automaticamente quando o `currentUser` for atualizado pelo `useAuth`
            // e cuidará do redirecionamento.
            await signInWithEmailAndPassword(auth, email, password);
            // Não é preciso fazer mais nada aqui. O redirecionamento é reativo.

        } catch (err) {
            console.error("Erro de login:", err);
            setLoading(false);

            // Tratamento de erros comuns do Firebase (em Português), unificando mensagens
            // para maior segurança e simplicidade. O código 'auth/invalid-credential' é mais recente.
            if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email', 'auth/invalid-credential'].includes(err.code)) {
                setError('Credenciais inválidas. Verifique seu e-mail e senha.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Acesso temporariamente bloqueado por muitas tentativas. Tente novamente mais tarde.');
            } else {
                setError('Ocorreu um erro ao tentar logar. Tente novamente.');
            }
        }
    };

    const handlePasswordReset = async () => {
        const emailForReset = window.prompt("Por favor, digite seu e-mail para receber o link de redefinição de senha:");
        if (emailForReset) {
            try {
                await sendPasswordResetEmail(auth, emailForReset);
                alert("E-mail de redefinição enviado! Verifique sua caixa de entrada (e a pasta de spam).");
            } catch (err) {
                console.error("Erro na redefinição de senha:", err);
                setError("Falha ao enviar e-mail de redefinição. Verifique se o e-mail está correto e tente novamente.");
            }
        } else {
            alert("Operação cancelada.");
        }
    };

    return (
        <div className="login-container">
            {/* Coluna Esquerda: Informações da Câmara */}
            <div className="login-left-panel">
                <div className="logo-section">
                    {/* Substitua pela imagem real do brasão */}
                    <img
                        src={settings.branding?.loginCoverUrl || Brasao}
                        alt={settings.branding?.logoAlt || settings.tenant?.name || 'Identidade da Câmara'}
                        className="brasao"
                    />
                </div>
                <p className="developed-by">Desenvolvido por Blu Tecnologias</p>
            </div>

            {/* Coluna Direita: Formulário de Login */}
            <div className="login-right-panel">
                <div className="login-form-box">
                    <img
                        src={settings.branding?.logoUrl || Logo}
                        alt={settings.branding?.logoAlt || settings.tenant?.name || 'Logo da Câmara'}
                        className="logo-horizontal"
                        style={{ height: '50px', marginBottom: '40px' }}
                    />
                    <div className='div-portal-title'>
                        <p className="portal-title">Seja bem-vindo</p>
                        <h2 className="portal-subtitle">{settings.tenant?.portalTitle || 'Portal de Serviços'}</h2>
                    </div>

                    <form onSubmit={handleLogin}>
                        {/* Campo E-mail */}
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />

                        {/* Campo Senha */}
                        <input
                            type="password"
                            placeholder="Senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />

                        {/* Exibe erro, se houver */}
                        {error && <p className="login-error">{error}</p>}

                        {/* Botões */}
                        <div className="action-buttons">
                            <button
                                type="submit"
                                className="btn-entrar"
                                disabled={loading}
                            >
                                {loading ? 'Entrando...' : 'Entrar'}
                            </button>
                            <button
                                type="button"
                                className="btn-cadastrar"
                                onClick={() => navigate('/cadastro')}
                                disabled={loading}
                            >
                                Cadastrar
                            </button>
                        </div>
                    </form>

                    <button
                        type="button"
                        className="forgot-password"
                        onClick={handlePasswordReset}
                    >
                        Esqueceu a senha?
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
