import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';

// Ícones
import {
    LiaPlusSolid, LiaEditSolid, LiaTrashSolid, LiaTimesSolid,
    LiaSaveSolid, LiaUploadSolid, LiaImageSolid, LiaMagicSolid
} from "react-icons/lia";

const AdminNoticiasSite = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [noticias, setNoticias] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [generatingAI, setGeneratingAI] = useState(false);

    const initialFormState = {
        titulo: '',
        subtitulo: '',
        conteudo: '',
        capaUrl: '',
        autor: '',
        status: 'Publicado', // 'Rascunho' ou 'Publicado'
    };

    const [formData, setFormData] = useState(initialFormState);
    const [selectedCapaFile, setSelectedCapaFile] = useState(null);
    const [capaPreview, setCapaPreview] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const fetchNoticias = useCallback(async () => {
        setLoading(true);
        try {
            const noticiasRef = collection(firestore, 'noticias');
            const q = query(noticiasRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setNoticias(list);
        } catch (error) {
            console.error('Erro ao buscar notícias:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthReady) fetchNoticias();
    }, [isAuthReady, fetchNoticias]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleQuillChange = (value) => {
        setFormData(prev => ({ ...prev, conteudo: value }));
    };

    const handleImageChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const img = new Image();
                img.onload = () => {
                    if (img.width === 1440 && img.height === 720) {
                        setSelectedCapaFile(file);
                        setCapaPreview(readerEvent.target.result);
                    } else {
                        alert(`A imagem de capa deve ter exatamente 1440x720 pixels. A imagem selecionada tem ${img.width}x${img.height} pixels.`);
                        setSelectedCapaFile(null);
                        setCapaPreview(null);
                        // Limpa o input para permitir que o usuário selecione outra imagem
                        event.target.value = null; 
                    }
                };
                img.src = readerEvent.target.result;
            };
            reader.readAsDataURL(file);
        }
    };
    const handleNew = () => {
        setFormData(initialFormState);
        setSelectedId(null);
        setSelectedCapaFile(null);
        setCapaPreview(null);
        setIsEditing(false);
        setShowModal(true);
    };

    const handleGenerateAI = async () => {
        if (!formData.titulo) {
            alert("Por favor, insira ao menos um título para que a IA possa gerar o conteúdo.");
            return;
        }

        setGeneratingAI(true);
        const FUNCTIONS_BASE_URL = process.env.REACT_APP_FUNCTIONS_BASE_URL?.replace(/\/$/, "") ||
            "https://us-central1-blu-app-camara.cloudfunctions.net";
        const endpoint = `${FUNCTIONS_BASE_URL}/generateNews`;
        const prompt = `Escreva uma notícia profissional e detalhada para o portal de uma Câmara Municipal. 
        Título: ${formData.titulo}
        Subtítulo: ${formData.subtitulo}
        
        Instruções de formatação:
        1. Use uma linguagem formal, clara e jornalística.
        2. Retorne o texto EXCLUSIVAMENTE formatado em HTML (use apenas as tags <p>, <h2>, <ul>, <li>, <strong>).
        3. Não inclua as tags <html>, <head> ou <body>.
        4. O texto deve ser completo, com introdução, desenvolvimento e conclusão.
        5. A Câmara sempre será Câmara Municipal de Paraipaba, então use isso como referência.
        6. O conteúdo deve ser relevante para os cidadãos, informando sobre eventos, decisões ou avisos importantes relacionados à Câmara.
        7. Evite jargões técnicos e seja acessível para o público geral.
        `;

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = {error: text || `HTTP ${response.status}`};
            }

            if (!response.ok) {
                throw new Error(data.error || data.message || `Erro ${response.status}: Falha na requisição`);
            }

            const generatedText = data.text || '';
            if (!generatedText) {
                throw new Error("A IA não retornou nenhum conteúdo. Verifique seu prompt ou permissões da chave.");
            }

            const cleanedText = generatedText.replace(/```html|```/g, '').trim();
            setFormData(prev => ({ ...prev, conteudo: cleanedText }));
        } catch (error) {
            console.error("Erro ao gerar texto com IA:", error);
            alert(`Erro na IA: ${error.message}`);
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleEdit = (noticia) => {
        setFormData({
            titulo: noticia.titulo || '',
            subtitulo: noticia.subtitulo || '',
            conteudo: noticia.conteudo || '',
            capaUrl: noticia.capaUrl || '',
            autor: noticia.autor || '',
            status: noticia.status || 'Publicado',
        });
        setSelectedId(noticia.id);
        setCapaPreview(noticia.capaUrl);
        setSelectedCapaFile(null);
        setIsEditing(true);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta notícia?")) {
            try {
                await deleteDoc(doc(firestore, 'noticias', id));
                alert("Notícia excluída com sucesso.");
                fetchNoticias();
            } catch (error) {
                console.error("Erro ao excluir:", error);
                alert("Erro ao excluir.");
            }
        }
    };

    const handleSubmit = async (statusToSet) => {
        setLoading(true);
        try {
            let dataToSave = { 
                ...formData,
                updatedAt: serverTimestamp()
            };
            // Define o status: se vier do clique no botão usamos o argumento, 
            // se vier de um submit acidental do form usamos 'Publicado' por padrão.
            dataToSave.status = typeof statusToSet === 'string' ? statusToSet : 'Publicado';

            if (selectedCapaFile) {
                const folderPath = `${config.cityCollection}/noticias`;
                try {
                    const uploadResult = await uploadFileToStorage(selectedCapaFile, folderPath);
                    dataToSave.capaUrl = uploadResult.url;
                } catch (uploadError) {
                    if (uploadError.code === 'storage/unauthorized') {
                        alert("Erro de permissão: Você precisa configurar as regras de escrita para a pasta 'noticias' no Firebase Storage.");
                        setLoading(false);
                        return;
                    }
                    throw uploadError;
                }
            }

            if (isEditing && selectedId) {
                await updateDoc(doc(firestore, 'noticias', selectedId), dataToSave);
                alert("Notícia atualizada com sucesso!");
            } else {
                dataToSave.createdAt = serverTimestamp();
                await addDoc(collection(firestore, 'noticias'), dataToSave);
                alert("Notícia publicada com sucesso!");
            }
            setShowModal(false);
            fetchNoticias();
        } catch (error) {
            console.error("Erro ao salvar notícia:", error);
            alert("Erro ao salvar.");
        } finally {
            setLoading(false);
        }
    };

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Gerenciamento de Notícias (Blog)</h1>
                        <p>Publique novidades e avisos para os cidadãos no site e aplicativo.</p>
                        <button onClick={fetchNoticias} className="btn-secondary" disabled={loading} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                            ↻ Atualizar lista
                        </button>
                    </div>
                </header>

                <div className="page-actions-bar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                    <button className="btn-primary" onClick={handleNew}>
                        <LiaPlusSolid style={{ marginRight: '5px' }} /> Nova Notícia
                    </button>
                </div>

                <div className="data-card">
                    <div className="card-header">
                        <h3>Últimas Publicações ({noticias.length})</h3>
                    </div>

                    {loading && <p style={{ padding: '20px' }}>Carregando...</p>}
                    {!loading && noticias.length === 0 && <p style={{ padding: '20px' }}>Nenhuma notícia encontrada.</p>}

                    <ul className="data-list">
                        {noticias.map(noticia => (
                            <li key={noticia.id} className="data-list-item" style={{ cursor: 'default' }}>
                                <div className="item-avatar" style={{ marginRight: '15px' }}>
                                    {noticia.capaUrl ? (
                                        <img src={noticia.capaUrl} alt={noticia.titulo} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '60px', height: '60px', borderRadius: '8px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <LiaImageSolid size={24} color="#ccc" />
                                        </div>
                                    )}
                                </div>
                                <div className="item-main-info" style={{ flex: 1 }}>
                                    <strong>{noticia.titulo}</strong>
                                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280' }}>
                                        {noticia.autor ? `Por: ${noticia.autor} | ` : ''}
                                        Status: <span style={{ color: noticia.status === 'Publicado' ? '#10b981' : '#f59e0b' }}>{noticia.status}</span>
                                    </span>
                                </div>
                                <div className="item-actions">
                                    <button onClick={() => handleEdit(noticia)} className="btn-secondary" style={{ marginRight: '8px', marginBottom: '5px', textAlign: 'center !important'  }}><LiaEditSolid size={20} /></button>
                                    <button onClick={() => handleDelete(noticia.id)} className="btn-danger"><LiaTrashSolid size={20} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
                            <div className="modal-header">
                                <h3>{isEditing ? 'Editar Notícia' : 'Criar Nova Notícia'}</h3>
                                <button onClick={() => setShowModal(false)} className="modal-close-btn"><LiaTimesSolid /></button>
                            </div>
                            <div className="modal-body">
                                <form onSubmit={handleSubmit}>
                                    <div className="form-group">
                                        <input type="text" name="titulo" value={formData.titulo} onChange={handleInputChange} required className="form-input" placeholder="Título chamativo..." />
                                    </div>
                                    <div className="form-group" style={{ marginTop: '15px' }}>
                                        <label>Subtítulo / Resumo</label>
                                        <input type="text" name="subtitulo" value={formData.subtitulo} onChange={handleInputChange} className="form-input" placeholder="Uma breve descrição..." />
                                    </div>
                                    
                                    <div className="form-row" style={{ marginTop: '15px' }}>
                                        <div className="form-group">
                                            <label>Autor</label>
                                            <input type="text" name="autor" value={formData.autor} onChange={handleInputChange} className="form-input" placeholder="Nome do autor ou setor" />
                                        </div>
                                        {/* O select de status foi removido, o status será definido pelos botões de ação */}
                                    </div>

                                    <div className="form-group" style={{ marginTop: '15px' }}>
                                        <label>
                                            Imagem de Capa <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>(Recomendado: 1440x720px)</span>
                                            *
                                        </label>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <a 
                                                href="https://canva.link/b9w91b1mkurncmw" 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="btn-secondary"
                                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                            >
                                                <LiaImageSolid /> Criar imagem no Canva
                                            </a>
                                            <label className="btn-secondary" style={{ cursor: 'pointer', color: '#ffffff !important' }}>
                                                <LiaUploadSolid /> Enviar Imagem
                                                <input type="file" hidden accept="image/*" onChange={handleImageChange} style={{color: '#ffffff !important'}} />
                                            </label>
                                            {capaPreview && (
                                                <img src={capaPreview} alt="Preview" style={{ width: '100px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                                            )}
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ marginTop: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                            <label style={{ marginBottom: 0 }}>Conteúdo da Notícia *</label>
                                            <button type="button" onClick={handleGenerateAI} disabled={generatingAI} className="btn-primary" style={{ padding: '20px 10px', fontSize: '0.75rem', gap: '5px', maxWidth: '300px' }}>
                                                {generatingAI ? 'Gerando...' : <><LiaMagicSolid /> Escrever com IA</>}
                                            </button>
                                        </div>
                                        <div style={{ height: '350px', marginBottom: '50px' }}>
                                            <ReactQuill 
                                                theme="snow" 
                                                value={formData.conteudo} 
                                                onChange={handleQuillChange}
                                                style={{ height: '300px' }}
                                                placeholder="Escreva sua notícia aqui..."
                                            />
                                        </div>
                                    </div>

                                    <div className="form-actions" style={{ marginTop: '40px', justifyContent: 'flex-end' }}>
                                        <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                        <button type="button" className="btn-secondary" onClick={() => handleSubmit('Rascunho')} disabled={loading}>
                                            {loading ? 'Salvando...' : <><LiaSaveSolid /> Salvar Rascunho</>}
                                        </button>
                                        <button type="button" className="btn-primary" onClick={() => handleSubmit('Publicado')} disabled={loading}>
                                            {loading ? 'Publicando...' : <><LiaSaveSolid /> Publicar Notícia</>}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminNoticiasSite;