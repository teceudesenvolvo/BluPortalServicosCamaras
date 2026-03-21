import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import config from '../../config';
import { ref, onValue, push, update, remove } from 'firebase/database';
import AdminSidebar from '../../components/AdminSidebar';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Ícones
import { LiaPlusSolid, LiaEditSolid, LiaTrashSolid, LiaTimesSolid, LiaSaveSolid } from "react-icons/lia";

const AdminVereadores = () => {
    const [vereadores, setVereadores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const initialFormState = {
        name: '',
        cargo: '',
        dataNascimento: '',
        partido: '',
        avatarBase64: '',
        biografia: '',
        tipo: 'Vereador' // Fixo para manter compatibilidade com queries existentes
    };

    const [formData, setFormData] = useState(initialFormState);

    useEffect(() => {
        setLoading(true);
        const vereadoresRef = ref(db, `${config.cityCollection}/vereadores`);

        const unsubscribe = onValue(vereadoresRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                })).sort((a, b) => a.name.localeCompare(b.name));
                setVereadores(list);
            } else {
                setVereadores([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleQuillChange = (value) => {
        setFormData(prev => ({ ...prev, biografia: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, avatarBase64: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleNew = () => {
        setFormData(initialFormState);
        setSelectedId(null);
        setIsEditing(false);
        setShowModal(true);
    };

    const handleEdit = (vereador) => {
        setFormData({
            name: vereador.name || '',
            cargo: vereador.cargo || 'Vereador',
            dataNascimento: vereador.dataNascimento || '',
            partido: vereador.partido || '',
            avatarBase64: vereador.avatarBase64 || '',
            biografia: vereador.biografia || '',
            tipo: 'Vereador'
        });
        setSelectedId(vereador.id);
        setIsEditing(true);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir este vereador?")) {
            try {
                await remove(ref(db, `${config.cityCollection}/vereadores/${id}`));
                alert("Vereador excluído com sucesso.");
            } catch (error) {
                console.error("Erro ao excluir:", error);
                alert("Erro ao excluir.");
            }
        }
    };

    const handleCancel = () => {
        setFormData(initialFormState);
        setIsEditing(false);
        setSelectedId(null);
        setShowModal(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            if (selectedId) {
                // Atualizar existente
                await update(ref(db, `${config.cityCollection}/vereadores/${selectedId}`), formData);
                alert("Vereador atualizado com sucesso!");
            } else {
                // Criar novo
                await push(ref(db, `${config.cityCollection}/vereadores/`), formData);
                alert("Vereador cadastrado com sucesso!");
            }
            handleCancel();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar as informações.");
        }
    };

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content">
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Administração</h1>
                        <p>Gerenciar Vereadores</p>
                    </div>
                </header>

                <div className="admin-container" style={{ padding: '20px' }}>
                    
                    {/* Ações da Página */}
                    <div className="page-actions-bar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                        <button className="btn-primary" onClick={handleNew}>
                            <LiaPlusSolid style={{ marginRight: '5px' }} /> Novo Vereador
                        </button>
                    </div>

                    {/* Lista de Vereadores */}
                    <h3 style={{ marginBottom: '15px' }}>Vereadores Cadastrados</h3>
                    {loading ? <p>Carregando...</p> : (
                        <div className="data-list-container">
                            <ul className="data-list">
                                {vereadores.map(vereador => (
                                    <li key={vereador.id} className="data-list-item" style={{ cursor: 'default' }}>
                                        <div className="item-avatar" style={{ marginRight: '15px' }}>
                                            {vereador.avatarBase64 ? (
                                                <img src={vereador.avatarBase64} alt={vereador.name} style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#eee' }}></div>
                                            )}
                                        </div>
                                        <div className="item-main-info" style={{ flex: 1 }}>
                                            <strong>{vereador.name}</strong>
                                            <span style={{ display: 'block', fontSize: '0.9em', color: '#666' }}>{vereador.cargo} - {vereador.partido}</span>
                                        </div>
                                        <div className="item-actions" style={{ display: 'flex', gap: '10px' }}>
                                            <button 
                                                onClick={() => handleEdit(vereador)} 
                                                className="btn-icon" 
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#007bff' }}
                                                title="Editar"
                                            >
                                                <LiaEditSolid size={22} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(vereador.id)} 
                                                className="btn-icon" 
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545' }}
                                                title="Excluir"
                                            >
                                                <LiaTrashSolid size={22} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Modal com Formulário */}
                    {showModal && (
                        <div className="modal-overlay" onClick={handleCancel}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
                                <div className="modal-header">
                                    <h3>
                                        {isEditing ? <LiaEditSolid /> : <LiaPlusSolid />}
                                        <span style={{ marginLeft: '10px' }}>{isEditing ? 'Editar Vereador' : 'Novo Vereador'}</span>
                                    </h3>
                                    <button onClick={handleCancel} className="modal-close-btn"><LiaTimesSolid /></button>
                                </div>
                                <div className="modal-body">
                                    <form onSubmit={handleSubmit}>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Nome Completo *</label>
                                                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Cargo *</label>
                                                <input type="text" name="cargo" value={formData.cargo} onChange={handleInputChange} placeholder="Ex: Vereador, Presidente" required className="form-input" />
                                            </div>
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Partido *</label>
                                                <input type="text" name="partido" value={formData.partido} onChange={handleInputChange} required className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Data de Nascimento</label>
                                                <input type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleInputChange} className="form-input" />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Foto (Avatar)</label>
                                            <input type="file" accept="image/*" onChange={handleImageChange} className="form-input" />
                                            {formData.avatarBase64 && (
                                                <div style={{ marginTop: '10px' }}>
                                                    <img src={formData.avatarBase64} alt="Preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '50%' }} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="form-group">
                                            <label>Biografia</label>
                                            <ReactQuill 
                                                theme="snow" 
                                                value={formData.biografia} 
                                                onChange={handleQuillChange}
                                                style={{ height: '200px', marginBottom: '50px' }}
                                            />
                                        </div>

                                        <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                                            <button type="button" className="btn-secondary" onClick={handleCancel}>
                                                Cancelar
                                            </button>
                                            <button type="submit" className="btn-submit">
                                                <LiaSaveSolid style={{ marginRight: '5px' }} />
                                                {isEditing ? 'Atualizar' : 'Salvar'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminVereadores;