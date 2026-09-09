import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { LiaArrowLeftSolid, LiaBuildingSolid, LiaCalendarAltSolid, LiaClipboardListSolid, LiaFileAltSolid, LiaPlusSolid, LiaTimesSolid } from 'react-icons/lia';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { firestore } from '../../firebase';

const toDate = value => value?.toDate ? value.toDate() : new Date(value);
const formatDate = value => {
    const date = toDate(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : 'Não informada';
};
const getStatus = item => item.status || item.situacao || 'Em Análise';

const ComplaintDetails = ({ item, onClose }) => item && <div className="modal-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal-content procon-citizen-modal"><div className="modal-header"><div><small>Protocolo</small><h2>{item.protocolo || item.id}</h2></div><button className="modal-close-btn" onClick={onClose}><LiaTimesSolid /></button></div><span className="procon-status-pill">{getStatus(item)}</span><div className="procon-detail-grid"><article><LiaBuildingSolid /><div><span>Fornecedor</span><strong>{item.companyName || item.fornecedorNome || 'Não informado'}</strong></div></article><article><LiaCalendarAltSolid /><div><span>Registrado em</span><strong>{formatDate(item.createdAt)}</strong></div></article><article><LiaFileAltSolid /><div><span>Tipo</span><strong>{item.tipoReclamacao || 'Reclamação'}</strong></div></article></div><section><h3>Descrição</h3><p>{item.descricao || 'Descrição não fornecida.'}</p></section><section><h3>Pedido do consumidor</h3><p>{item.pedidoConsumidor || 'Não informado.'}</p></section>{item.arquivos?.length > 0 && <section><h3>Anexos</h3><div className="procon-file-links">{item.arquivos.map((file,index) => <a key={`${file.name}-${index}`} href={file.url || file.data} target="_blank" rel="noreferrer">{file.name}</a>)}</div></section>}</div></div>;

const ProconAtendimentos = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { settings } = useSystemControl();
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return undefined;
        return onSnapshot(query(collection(firestore,'procon-atendimentos'), where('userId','==',currentUser.uid)), snapshot => {
            setItems(snapshot.docs.map(item => ({ id:item.id, ...item.data() })).sort((a,b) => toDate(b.createdAt) - toDate(a.createdAt)));
            setLoading(false);
        }, () => setLoading(false));
    }, [currentUser]);

    return <div className="dashboard-layout"><Sidebar onItemClick={navigate} /><main className="dashboard-content procon-citizen-page">
        <header className="procon-citizen-hero compact"><div><span><LiaClipboardListSolid /> Área do consumidor</span><h1>Meus atendimentos</h1><p>Acompanhe as reclamações registradas no PROCON da {settings.tenant?.shortName}.</p></div><div className="procon-citizen-header-actions"><button className="secondary" onClick={() => navigate('/procon')}><LiaArrowLeftSolid /> Voltar</button><button onClick={() => navigate('/procon/reclamacao')}><LiaPlusSolid /> Nova reclamação</button></div></header>
        <section className="data-card procon-citizen-list-card"><div className="card-header"><div><h2>Protocolos</h2><p>{items.length} atendimento(s) encontrado(s)</p></div></div>{loading ? <p className="queue-empty">Carregando atendimentos...</p> : <div className="procon-citizen-records">{items.map(item => <button key={item.id} onClick={() => setSelected(item)}><div className="procon-record-icon"><LiaFileAltSolid /></div><div><strong>{item.assuntoDenuncia || item.tipoReclamacao || 'Reclamação de consumo'}</strong><span>{item.companyName || item.fornecedorNome || 'Fornecedor não informado'}</span><small>Protocolo {item.protocolo || item.id} · {formatDate(item.createdAt)}</small></div><b>{getStatus(item)}</b></button>)}{items.length === 0 && <div className="procon-empty-state"><LiaClipboardListSolid /><h3>Nenhuma reclamação registrada</h3><p>Quando você registrar uma reclamação, poderá acompanhar todas as atualizações aqui.</p><button onClick={() => navigate('/procon/reclamacao')}><LiaPlusSolid /> Registrar reclamação</button></div>}</div>}</section>
        <ComplaintDetails item={selected} onClose={() => setSelected(null)} />
    </main></div>;
};
export default ProconAtendimentos;
