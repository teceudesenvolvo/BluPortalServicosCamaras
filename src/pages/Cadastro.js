import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from "firebase/database";

// Importa o hook de autenticação e a instância do auth
import { useAuth } from '../contexts/FirebaseAuthContext';
import { auth, db } from '../firebase';
import config from '../config'; // Importa a configuração

import Brasao from '../assets/logo-paraipaba.png';
import Logo from '../assets/logo-paraipaba-azul.png';

const CadastroPage = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        surname: '',
        email: '',
        telefone: '',
        password: '',
        confirmPassword: '',
        cpf: '',
        estadoCivil: '',
        sexo: '',
        cep: '',
        address: '',
        numero: '',
        complemento: '',
        neighborhood: '',
        city: '',
        state: '',
    });

    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);

    // Efeito para redirecionar se o usuário já estiver logado.
    useEffect(() => {
        if (currentUser) {
            navigate('/dashboard', { replace: true });
        }
    }, [currentUser, navigate]);

    // Evita renderizar o formulário de cadastro se o usuário já estiver logado e o redirecionamento estiver prestes a acontecer.
    if (currentUser) {
        return <div className="loading-full-screen">Redirecionando...</div>; // Ou null
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCepLookup = async () => {
        const cep = formData.cep.replace(/\D/g, '');
        if (cep.length !== 8) {
            setError('CEP inválido. Deve conter 8 dígitos.');
            return;
        }
        setCepLoading(true);
        setError('');
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await response.json();
            if (data.erro) {
                setError('CEP não encontrado.');
            } else {
                setFormData(prev => ({
                    ...prev,
                    address: data.logradouro,
                    neighborhood: data.bairro,
                    city: data.localidade,
                    state: data.uf,
                }));
            }
        } catch (error) {
            setError('Erro ao buscar o CEP. Verifique sua conexão.');
        } finally {
            setCepLoading(false);
        }
    };

    const nextStep = () => {
        setError(null);
        if (step === 1) {
            if (!formData.name || !formData.surname || !formData.email || !formData.telefone || !formData.password || !formData.confirmPassword) {
                setError('Por favor, preencha todos os campos.');
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                setError('As senhas não coincidem.');
                return;
            }
        }
        if (step === 2) {
            if (!formData.cpf || !formData.estadoCivil || !formData.sexo) {
                setError('Por favor, preencha todos os campos.');
                return;
            }
        }
        setStep(s => s + 1);
    };

    const prevStep = () => {
        setError(null);
        setStep(s => s - 1);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.cep || !formData.address || !formData.numero || !formData.city) {
            setError('Por favor, preencha os campos de endereço obrigatórios.');
            return;
        }

        setLoading(true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            const user = userCredential.user;

            // Salva informações adicionais do usuário no Realtime Database
      await set(ref(db, `${config.cityCollection}/users/${user.uid}`), {
                name: `${formData.name} ${formData.surname}`,
                email: user.email,
                telefone: formData.telefone,
                cpf: formData.cpf,
                estadoCivil: formData.estadoCivil,
                sexo: formData.sexo,
                cep: formData.cep,
                address: formData.address,
                numero: formData.numero,
                complemento: formData.complemento,
                neighborhood: formData.neighborhood,
                city: formData.city,
                state: formData.state,
                tipo: 'Cidadão', // Define o tipo padrão do usuário
                createdAt: new Date().toISOString(),
            });

            navigate('/dashboard', { replace: true });
        } catch (err) {
            console.error("Erro de cadastro:", err);
            setLoading(false);

            if (err.code === 'auth/email-already-in-use') {
                setError('Este e-mail já está em uso.');
            } else if (err.code === 'auth/invalid-email') {
                setError('O formato do e-mail é inválido.');
            } else if (err.code === 'auth/weak-password') {
                setError('A senha deve ter no mínimo 6 caracteres.');
            } else {
                setError('Ocorreu um erro ao tentar cadastrar. Tente novamente.');
            }
        }
    };

    return (
        <div className="login-container">
            {/* Coluna Esquerda: Informações da Câmara */}
            <div className="login-left-panel">
                <div className="logo-section">
                    <img
                        src={Brasao}
                        alt="Brasão de Paraipaba"
                        className="brasao"
                        style={{ height: '300px', marginTop: '20%' }}
                    />
                </div>
                <p className="developed-by">Desenvolvido por Blu Tecnologias</p>
            </div>

            {/* Coluna Direita: Formulário de Cadastro */}
            <div className="login-right-panel">
                <div className="login-form-box">
                    <img
                        src={Logo}
                        alt="Logo Paraipaba"
                        className="logo-horizontal"
                        style={{ height: '50px', marginBottom: '40px' }}
                    />
                    <div className='div-portal-title'>
                        <p className="portal-title">Crie sua conta</p>
                        <h2 className="portal-subtitle">Portal de Serviços</h2>
                    </div>

                    <div className="step-indicator">
                        <div className={`step ${step >= 1 ? 'active' : ''}`}>1</div>
                        <div className={`step-line ${step >= 2 ? 'active' : ''}`}></div>
                        <div className={`step ${step >= 2 ? 'active' : ''}`}>2</div>
                        <div className={`step-line ${step >= 3 ? 'active' : ''}`}></div>
                        <div className={`step ${step >= 3 ? 'active' : ''}`}>3</div>
                    </div>

                    <form onSubmit={handleRegister}>
                        {step === 1 && (
                            <>
                                <div className="form-row">
                                    <input type="text" name="name" placeholder="Nome" value={formData.name} onChange={handleChange} required />
                                    <input type="text" name="surname" placeholder="Sobrenome" value={formData.surname} onChange={handleChange} required />
                                </div>
                                <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} required />
                                <input type="tel" name="telefone" placeholder="Telefone" value={formData.telefone} onChange={handleChange} required />
                                <div className="form-row">
                                    <input type="password" name="password" placeholder="Senha" value={formData.password} onChange={handleChange} required />
                                    <input type="password" name="confirmPassword" placeholder="Confirmar Senha" value={formData.confirmPassword} onChange={handleChange} required />
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <input type="text" name="cpf" placeholder="CPF" value={formData.cpf} onChange={handleChange} required />
                                <div className="form-row">
                                    <select name="estadoCivil" value={formData.estadoCivil} onChange={handleChange} required>
                                        <option value="">Estado Civil</option>
                                        <option value="solteiro">Solteiro(a)</option>
                                        <option value="casado">Casado(a)</option>
                                        <option value="divorciado">Divorciado(a)</option>
                                        <option value="viuvo">Viúvo(a)</option>
                                    </select>
                                    <select name="sexo" value={formData.sexo} onChange={handleChange} required>
                                        <option value="">Sexo</option>
                                        <option value="masculino">Masculino</option>
                                        <option value="feminino">Feminino</option>
                                        <option value="nao-binario">Não Binário</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <>
                                <div className="form-row cep-lookup">
                                    <input type="text" name="cep" placeholder="CEP" value={formData.cep} onChange={handleChange} required />
                                    <button type="button" onClick={handleCepLookup} disabled={cepLoading} className="btn-cep">{cepLoading ? '...' : 'Buscar'}</button>
                                </div>
                                <input type="text" name="address" placeholder="Endereço" value={formData.address} onChange={handleChange} required />
                                <div className="form-row">
                                    <input type="text" name="numero" placeholder="Número" value={formData.numero} onChange={handleChange} required />
                                    <input type="text" name="complemento" placeholder="Complemento" value={formData.complemento} onChange={handleChange} />
                                </div>
                                <input type="text" name="neighborhood" placeholder="Bairro" value={formData.neighborhood} onChange={handleChange} required />
                                <div className="form-row">
                                    <input type="text" name="city" placeholder="Cidade" value={formData.city} onChange={handleChange} required />
                                    <input type="text" name="state" placeholder="UF" value={formData.state} onChange={handleChange} required />
                                </div>
                            </>
                        )}

                        {error && <p className="login-error">{error}</p>}

                        <div className="action-buttons">
                            {step > 1 && (
                                <button type="button" className="btn-secondary" onClick={prevStep} disabled={loading}>
                                    Anterior
                                </button>
                            )}
                            {step < 3 ? (
                                <button type="button" className="btn-primary" onClick={nextStep}>
                                    Próximo
                                </button>
                            ) : (
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? 'Cadastrando...' : 'Finalizar Cadastro'}
                                </button>
                            )}
                        </div>
                        <div className="action-buttons" style={{ marginTop: '10px' }}>
                            <button
                                type="button"
                                className="btn-secondary-full"
                                onClick={() => navigate('/login')}
                                disabled={loading}
                            >
                                Já tenho conta
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CadastroPage;