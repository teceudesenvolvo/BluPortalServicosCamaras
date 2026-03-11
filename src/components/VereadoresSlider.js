import React, { useState, useEffect } from 'react';
import { Splide, SplideSlide } from '@splidejs/react-splide';
import { db } from '../firebase'; // Importa a configuração do DB
import { ref, query, orderByChild, equalTo, get } from 'firebase/database'; // Importa funções do Realtime Database
import { LiaUser } from 'react-icons/lia'; // Ícone de usuário padrão

// Componente: Card do Vereador (agora parte deste módulo)
const VereadorCard = ({ nome, nomeParlamentar, foto }) => (
    <div className="vereador-card">
        <div className="vereador-foto-container">
            {foto ? (
                <img src={foto} alt={`Foto de ${nome}`} className="vereador-foto" />
            ) : (
                <div className="vereador-foto-placeholder"><LiaUser size={40} /></div>
            )}
        </div>
        <div className="vereador-info">
            <p className="vereador-nome">{nome}</p>
            <p className="vereador-titulo">{nomeParlamentar}</p>
        </div>
    </div>
);

// Função para garantir que o avatar seja uma Data URL válida
const getAvatarSrc = (avatarBase64) => {
    if (!avatarBase64) return null;
    if (avatarBase64.startsWith('data:image')) return avatarBase64;
    // Assume um formato padrão se o prefixo estiver faltando
    return `data:image/jpeg;base64,${avatarBase64}`;
};

// Componente: Slider dos Vereadores
const VereadoresSlider = () => {
    const [vereadores, setVereadores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchVereadores = async () => {
            setLoading(true);
            setError(null);
            const usersRef = ref(db, 'users');
            // Cria uma query para buscar usuários onde o campo 'tipo' é igual a 'Vereador'
            const vereadoresQuery = query(usersRef, orderByChild('tipo'), equalTo('Vereador'));

            try {
                const snapshot = await get(vereadoresQuery);
                if (snapshot.exists()) {
                    const vereadoresData = [];
                    // O snapshot retorna um objeto, então iteramos para criar um array
                    snapshot.forEach(childSnapshot => {
                        vereadoresData.push({
                            id: childSnapshot.key,
                            ...childSnapshot.val()
                        });
                    });
                    setVereadores(vereadoresData);
                } else {
                    setVereadores([]); // Nenhum vereador encontrado
                }
            } catch (err) {
                setError('Falha ao carregar os dados dos vereadores.');
                console.error("Erro ao buscar vereadores no Firebase:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchVereadores();
    }, []); // O array vazio garante que a busca ocorra apenas uma vez

    if (loading) {
        return <div className="loading-text">Carregando vereadores...</div>;
    }

    if (error) {
        return <div className="error-text">{error}</div>;
    }

    const splideOptions = {
        type: 'slide',
        perPage: 5,
        gap: '0.5%',
        padding: '2rem',
        arrows: true,
        pagination: false,
        breakpoints: {
            1024: { perPage: 3 },
            768: { perPage: 2, gap: '1rem' },
            480: { perPage: 1 },
        },
    };

    return (
        <div className="vereadores-section">
            <h3 className="section-title">Nossos Vereadores</h3>
            {vereadores && Array.isArray(vereadores) && vereadores.length > 0 && (
            <Splide options={splideOptions}>  
                {vereadores.map((v, index) => (
                    <SplideSlide key={index}>
                        <VereadorCard
                            nome={v.name} // Campo 'name' do Firebase
                            nomeParlamentar={v.tipo} // Campo 'tipo' (será 'Vereador')
                            foto={getAvatarSrc(v.avatarBase64)} // Campo 'avatarBase64' para a foto
                        />
                    </SplideSlide>
                ))}
            </Splide>
            )}
        </div>
    );
};

export default VereadoresSlider;