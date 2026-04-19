import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '../../firebase';
import Footer from '../../components/Footer';
import Logo from '../../assets/logo-paraipaba.png';
import HeroBackground from '../../assets/fachada2-cm.jpg';

const Piel = () => {
    const navigate = useNavigate();
    const [informativos, setInformativos] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInformativos = async () => {
            try {
                const informativosRef = collection(firestore, 'piel');
                // Carregamos a coleção completa e ordenamos localmente.
                // Isso evita que documentos migrados sem o campo 'createdAt' sejam ignorados pelo Firestore.
                const snapshot = await getDocs(informativosRef);
                
                const fetchedInformativos = snapshot.docs.map(docSnap => {
                    const data = docSnap.data();
                    // Normalização de data: prioriza Timestamp do Firestore, depois strings de data, 
                    // e por fim o campo 'migratedAt' gerado pela ferramenta de migração.
                    const timestamp = data.createdAt?.toMillis 
                        ? data.createdAt.toMillis() 
                        : (data.createdAt ? new Date(data.createdAt).getTime() : (data.migratedAt ? new Date(data.migratedAt).getTime() : 0));
                    
                    return { 
                        id: docSnap.id, 
                        ...data,
                        timestamp
                    };
                }).sort((a, b) => b.timestamp - a.timestamp);

                setInformativos(fetchedInformativos);
            } catch (error) {
                console.error('Erro ao buscar informativos:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInformativos();
    }, []);

    return (
        <div className="home-page-modern">
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
                <div className="hero-section">
                    <h1>Ponto de Inclusão Eleitoral (PIEL)</h1>
                    <p>Consulte informativos sobre seu título de eleitor, local de votação e mais.</p>
                </div>
            </header>

            <main className="home-main-content">
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    {loading && <p>Carregando informativos...</p>}
                    {!loading && informativos.length === 0 && (
                        <div className="data-card" style={{textAlign: 'center', padding: '40px'}}><p>Nenhum informativo disponível no momento.</p></div>
                    )}
                    {!loading && informativos.map(item => (
                        <div key={item.id} className="data-card" style={{marginBottom: '30px', background: '#fff', padding: '40px', borderRadius: '18px', border: '1px solid #e5e5e5', boxShadow: '0 4px 10px rgba(0,0,0,0.05)'}}>
                            <div className="card-header" style={{borderBottom: '1px solid #e5e5e5', paddingBottom: '15px', marginBottom: '25px'}}>
                                <h3 style={{fontSize: '1.6rem', fontWeight: 600, margin: 0, color: '#1d1d1f'}}>{item.title}</h3>
                            </div>
                            <div className="card-body" style={{whiteSpace: 'pre-wrap', color: '#333', lineHeight: 1.7, fontSize: '1.1rem'}}>
                                {item.content}
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default Piel;