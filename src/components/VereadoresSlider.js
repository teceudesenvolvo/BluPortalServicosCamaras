import React, { useState, useEffect } from 'react';
import { Splide, SplideSlide } from '@splidejs/react-splide';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { firestore } from '../firebase';
import { LiaArrowRightSolid, LiaUser, LiaUsersSolid } from 'react-icons/lia';

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
            <span className="vereador-kicker">Mandato legislativo</span>
            <h4 className="vereador-nome">{nome}</h4>
            <p className="vereador-titulo">{nomeParlamentar || 'Vereador(a)'}</p>
        </div>
        <span className="vereador-card-mark" aria-hidden="true">
            <LiaArrowRightSolid />
        </span>
    </div>
);

// Função para garantir que o avatar seja uma Data URL válida
const getAvatarSrc = (src) => {
    if (!src) return null;
    if (src.startsWith('http')) return src;
    if (src.startsWith('data:image')) return src;
    // Assume um formato padrão se o prefixo estiver faltando
    return `data:image/jpeg;base64,${src}`;
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

            try {
                const vereadoresRef = collection(firestore, 'vereadores');
                const q = query(vereadoresRef, orderBy('name', 'asc'));
                const snapshot = await getDocs(q);
                
                if (!snapshot.empty) {
                    const list = snapshot.docs.map(docSnap => ({
                        id: docSnap.id,
                        ...docSnap.data()
                    }));
                    setVereadores(list);
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
        perPage: 3,
        gap: '1rem',
        padding: { left: '0.25rem', right: '0.25rem' },
        arrows: true,
        pagination: false,
        drag: true,
        speed: 650,
        breakpoints: {
            1180: { perPage: 3 },
            980: { perPage: 2 },
            768: { perPage: 2, gap: '1rem' },
            480: { perPage: 1 },
        },
    };

    return (
        <div className="vereadores-section">
            <div className="vereadores-section-header">
                <span className="vereadores-eyebrow">
                    <LiaUsersSolid />
                    Legislativo municipal
                </span>
                <h3 className="section-title">Nossos Vereadores</h3>
                <p>Conheça os representantes que compõem a Câmara Municipal de Paraipaba.</p>
            </div>
            {vereadores && Array.isArray(vereadores) && vereadores.length > 0 && (
            <Splide options={splideOptions} className="vereadores-splide">  
                {vereadores.map((v, index) => (
                    <SplideSlide key={index}>
                        <VereadorCard
                            nome={v.name} // Campo 'name' do Firebase
                            nomeParlamentar={v.cargo} // Campo 'tipo' (será 'Vereador')
                            foto={getAvatarSrc(v.avatarUrl || v.avatarBase64)} // Prioriza a URL do Storage
                        />
                    </SplideSlide>
                ))}
            </Splide>
            )}
        </div>
    );
};

export default VereadoresSlider;
