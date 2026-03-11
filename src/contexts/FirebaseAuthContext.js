import React, { useContext, useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase'; // Importa a instância do auth

// 1. Cria o Contexto
const AuthContext = React.createContext();

// 2. Cria um Hook customizado para facilitar o uso do contexto
export function useAuth() {
    return useContext(AuthContext);
}

// 3. Cria o Componente Provedor
export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // O onAuthStateChanged retorna uma função "unsubscribe"
        const unsubscribe = onAuthStateChanged(auth, user => {
            setCurrentUser(user);
            setLoading(false);
        });

        // Limpa o listener quando o componente é desmontado
        return unsubscribe;
    }, []);

    const value = useMemo(() => ({
        currentUser,
        loading, // Exporta o estado de loading para os consumidores do contexto
        // Você pode adicionar funções como logout aqui
    }), [currentUser, loading]);

    if (loading) {
        return <div className="loading-full-screen">Carregando...</div>;
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}