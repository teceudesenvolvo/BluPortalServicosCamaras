import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
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
                    limit(4)
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
                        .slice(0, 4);
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

    return (
        <div className="noticias-cards-container" style={{ marginBottom: '40px' }}>
            <h2 className="section-title">Últimas Notícias</h2>
            <div className="noticias-cards-grid">
                {noticias.map((noticia) => (
                    <article
                        key={noticia.id}
                        className="noticia-card-home"
                        onClick={() => navigate(`/noticia/${noticia.id}`)}
                    >
                        <div className="noticia-card-image">
                            {noticia.capaUrl ? (
                                <img src={noticia.capaUrl} alt={noticia.titulo} />
                            ) : (
                                <div className="noticia-card-placeholder">
                                    <LiaImageSolid size={44} />
                                </div>
                            )}
                        </div>

                        <div className="noticia-card-content">
                            <span className="noticia-card-date">
                                <LiaCalendarSolid />
                                {noticia.createdAt?.toMillis ? new Date(noticia.createdAt.toMillis()).toLocaleDateString('pt-BR') : 'Notícia'}
                            </span>
                            <h3>{noticia.titulo}</h3>
                            {noticia.subtitulo && (
                                <p>{noticia.subtitulo}</p>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};

export default NoticiasSlider;
