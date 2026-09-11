import React, { useContext, useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../firebase'; // Importa a instância do auth
import PreLoader from '../components/PreLoader';

// 1. Cria o Contexto
const AuthContext = React.createContext();

// 2. Cria um Hook customizado para facilitar o uso do contexto
export function useAuth() {
    return useContext(AuthContext);
}

// 3. Cria o Componente Provedor
export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [role, setRole] = useState(null);
    const [roleLoading, setRoleLoading] = useState(true);
    useEffect(() => {
        setRole(null);
        if (!currentUser) { setRoleLoading(false); return undefined; }
        setRoleLoading(true);
        return onSnapshot(doc(firestore, 'users', currentUser.uid), snapshot => { setRole(snapshot.data()?.tipo || 'Cidadão'); setRoleLoading(false); }, () => { setRole(null); setRoleLoading(false); });
    }, [currentUser]);
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
        currentUser, role, roleLoading,
        loading, // Exporta o estado de loading para os consumidores do contexto
        // Você pode adicionar funções como logout aqui
    }), [currentUser, loading, role, roleLoading]);

    if (loading) {
        return <PreLoader />;
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
