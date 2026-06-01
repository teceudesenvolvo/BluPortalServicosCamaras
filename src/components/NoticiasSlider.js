import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Splide, SplideSlide } from '@splidejs/react-splide';
// Importação obrigatória para o Splide funcionar visualmente
import '@splidejs/react-splide/css'; 
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import config from '../config';
import { firestore } from '../firebase';
import { LiaImageSolid, LiaCalendarSolid } from 'react-icons/lia';

const NoticiasSlider = () => {
    const [noticias, setNoticias] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchNoticias = async () => {
            const noticiasRef = collection(firestore, 'noticias');
            try {
                const q = query(
                    noticiasRef,
                    where('status', '==', 'Publicado'),
                    orderBy('createdAt', 'desc'),
                    limit(6)
                );
                const snapshot = await getDocs(q);
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setNoticias(list);
            } catch (error) {
                console.warn("Índice status+createdAt não disponível ainda. Tentando fallback sem índice composto...", error);
                try {
                    const fallbackQuery = query(noticiasRef, orderBy('createdAt', 'desc'), limit(50));
                    const snapshot = await getDocs(fallbackQuery);
                    const list = snapshot.docs
                        .map(doc => ({ id: doc.id, ...doc.data() }))
                        .filter(noticia => noticia.status === 'Publicado')
                        .slice(0, 6);
                    setNoticias(list);
                } catch (fallbackError) {
                    console.error("Falha ao buscar notícias com fallback:", fallbackError);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchNoticias();
    }, []);

    if (loading) return <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando notícias...</div>;
    if (noticias.length === 0) return null;

    const splideOptions = {
        type: 'loop',
        perPage: 1,
        autoplay: true,
        interval: 5000,
        arrows: true,
        pagination: true,
        pauseOnHover: true,
    };

    return (
        <div className="noticias-slider-container" style={{ marginBottom: '40px' }}>
            <h2 className="section-title">Últimas Notícias</h2>
            <Splide options={splideOptions}>
                {noticias.map((noticia) => (
                    <SplideSlide key={noticia.id}>
                        <div 
                            className="noticia-slide-card" 
                            onClick={() => navigate(`/noticia/${noticia.id}`)}
                            style={{ cursor: 'pointer', position: 'relative', borderRadius: '15px', overflow: 'hidden', height: '400px' }}
                        >
                            {noticia.capaUrl ? (
                                <img src={noticia.capaUrl} alt={noticia.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <LiaImageSolid size={60} color="#ccc" />
                                </div>
                            )}
                            <div className="noticia-slide-overlay" style={{ 
                                position: 'absolute', bottom: 0, left: 0, right: 0, 
                                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', 
                                padding: '30px', color: '#fff' 
                            }}>
                                <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px', opacity: 0.9 }}>
                                    <LiaCalendarSolid /> {noticia.createdAt?.toMillis ? new Date(noticia.createdAt.toMillis()).toLocaleDateString('pt-BR') : ''}
                                </span>
                                <h3 style={{ fontSize: '1.8rem', margin: 0, fontWeight: 'bold' }}>{noticia.titulo}</h3>
                                <p style={{ fontSize: '1rem', marginTop: '10px', opacity: 0.9, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{noticia.subtitulo}</p>
                            </div>
                        </div>
                    </SplideSlide>
                ))}
            </Splide>
        </div>
    );
};

export default NoticiasSlider;