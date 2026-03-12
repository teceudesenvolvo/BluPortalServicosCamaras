import React, { useState, useEffect } from 'react';
import { ref, onValue, update, push, remove, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaPlusSolid, LiaTimesSolid, LiaEditSolid, LiaTrashAltSolid, LiaSaveSolid } from "react-icons/lia";

// Modal para Adicionar/Editar Informativo
const InformativoModal = ({ informativo, onClose, onSave }) => {
    const [item, setItem] = useState({ title: '', content: '' });

    useEffect(() => {
        if (informativo) {
            setItem(informativo);
        } else {
            setItem({ title: '', content: '' });
        }
    }, [informativo]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setItem(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (!item.title || !item.content) {
            alert('Por favor, preencha o título e o conteúdo.');
            return;
        }
        onSave(item);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{informativo ? 'Editar' : 'Adicionar'} Informativo</h3>
                    <button onClick={onClose} className="modal-close-btn"><LiaTimesSolid /></button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Título</label>
                        <input type="text" name="title" value={item.title} onChange={handleChange} className="form-input" />
                    </div>
                    <div className="form-group">
                        <label>Conteúdo</label>
                        <textarea name="content" value={item.content} onChange={handleChange} className="form-input" rows="10"></textarea>
                    </div>
                    <div className="form-actions">
                        <button onClick={handleSave} className="btn-primary">
                            <LiaSaveSolid /> Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Componente Principal
const AdminPiel = () => {
    const [informativos, setInformativos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedInformativo, setSelectedInformativo] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const informativosRef = ref(db, `${config.cityCollection}/piel`);
        const unsubscribe = onValue(informativosRef, (snapshot) => {
            const data = snapshot.val();
            const fetchedInformativos = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setInformativos(fetchedInformativos);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleOpenModal = (informativo = null) => {
        setSelectedInformativo(informativo);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedInformativo(null);
    };

    const handleSave = async (item) => {
        if (item.id) {
            // Editar
            const itemRef = ref(db, `${config.cityCollection}/piel/${item.id}`);
            const { id, ...dataToUpdate } = item;
            await update(itemRef, dataToUpdate);
        } else {
            // Adicionar
            const informativosRef = ref(db, `${config.cityCollection}/piel`);
            const newItem = {
                ...item,
                createdAt: serverTimestamp()
            };
            await push(informativosRef, newItem);
        }
        handleCloseModal();
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este informativo?')) {
            const itemRef = ref(db, `${config.cityCollection}/piel/${id}`);
            await remove(itemRef);
        }
    };

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                <header className="page-header-container">
                    <div className="header-title-section">
                        <h1>Gerenciar Informativos PIEL</h1>
                        <p>Adicione, edite ou remova os informativos da página PIEL.</p>
                    </div>
                    <div className="page-actions-bar" style={{justifyContent: 'flex-end', padding: 0}}>
                        <button className="btn-primary" onClick={() => handleOpenModal()}>
                            <LiaPlusSolid /> Adicionar Informativo
                        </button>
                    </div>
                </header>

                <div className="data-card">
                    <div className="card-header">
                        <h3>Informativos Cadastrados</h3>
                    </div>

                    {loading && <p>Carregando...</p>}
                    {!loading && informativos.length === 0 && <p>Nenhum informativo encontrado.</p>}

                    <ul className="data-list">
                        {informativos.map(item => (
                            <li key={item.id} className="data-list-item">
                                <div className="item-main-info">
                                    <strong>{item.title}</strong>
                                </div>
                                <div className="item-actions">
                                    <button onClick={() => handleOpenModal(item)} className="btn-secondary" style={{marginRight: '10px'}}><LiaEditSolid /></button>
                                    <button onClick={() => handleDelete(item.id)} className="btn-danger"><LiaTrashAltSolid /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {isModalOpen && (
                    <InformativoModal
                        informativo={selectedInformativo}
                        onClose={handleCloseModal}
                        onSave={handleSave}
                    />
                )}
            </div>
        </div>
    );
};

export default AdminPiel;