import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { LiaCalendarSolid, LiaUserSolid } from 'react-icons/lia';
import Footer from '../components/Footer';
import Logo from '../assets/logo-paraipaba.png';
import HeroBackground from '../assets/fachada2-cm.jpg';

const NoticiaDetalhe = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [noticia, setNoticia] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNoticia = async () => {
            try {
                const docRef = doc(firestore, 'noticias', id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setNoticia(snap.data());
                } else {
                    navigate('/');
                }
            } catch (error) {
                console.error("Erro ao carregar notícia:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchNoticia();
        window.scrollTo(0, 0);
    }, [id, navigate]);

    if (loading) return <div className="loading-screen">Carregando notícia...</div>;
    if (!noticia) return null;

    return (
        <div className="noticia-detalhe-page">
            <header className="home-header-modern" style={{ backgroundImage: `url(${HeroBackground})` }}>
                <div className="header-blur-overlay"></div>
                <div className="nav-container">
                    <nav className="home-nav">
                        <div className="nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                            <img src={Logo} alt="Logo Câmara Municipal de Paraipaba" />
                            <span>Portal de Serviços</span>
                        </div>
                        <div className="nav-actions">
                            <button className="btn-nav-login" onClick={() => navigate('/login')}>Entrar</button>
                            <button className="btn-nav-signup" onClick={() => navigate('/cadastro')}>Cadastrar</button>
                        </div>
                    </nav>
                </div>
               
            </header>

            <main className="container" style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', minHeight: '60vh' }}>
                
                <header className="noticia-header" style={{ marginBottom: '30px' }}>
                    <h1 style={{ fontSize: '2.5rem', color: '#111827', marginBottom: '15px', lineHeight: '1.2' }}>{noticia.titulo}</h1>
                    <p style={{ fontSize: '1.2rem', color: '#4b5563', marginBottom: '20px' }}>{noticia.subtitulo}</p>
                    
                    <div className="noticia-meta" style={{ display: 'flex', gap: '20px', color: '#6b7280', fontSize: '0.9rem', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <LiaCalendarSolid /> {noticia.createdAt?.toMillis ? new Date(noticia.createdAt.toMillis()).toLocaleDateString('pt-BR') : 'N/A'}
                        </span>
                        {noticia.autor && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <LiaUserSolid /> {noticia.autor}
                            </span>
                        )}
                    </div>
                </header>

                {noticia.capaUrl && (
                    <div className="noticia-capa" style={{ marginBottom: '40px' }}>
                        <img 
                            src={noticia.capaUrl} 
                            alt={noticia.titulo} 
                            style={{ width: '100%', borderRadius: '15px', maxHeight: '500px', objectFit: 'cover' }} 
                        />
                    </div>
                )}

                <div 
                    className="noticia-conteudo ql-editor" // ql-editor aplica os estilos do Quill
                    style={{ fontSize: '1.1rem', lineHeight: '1.8', color: '#374151', padding: 0 }}
                    dangerouslySetInnerHTML={{ __html: noticia.conteudo }}
                />
            </main>

            <Footer />
            
            <style>{`
                .noticia-conteudo img { max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0; }
                .noticia-conteudo iframe { width: 100%; aspect-ratio: 16/9; border-radius: 8px; margin: 20px 0; }
            `}</style>
        </div>
    );
};

export default NoticiaDetalhe;