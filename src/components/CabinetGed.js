import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { firestore } from '../firebase';
import { uploadFileToStorage } from '../utils/firebaseStorageUtils';
import CabinetOverlay from './CabinetOverlay';

const INITIAL_DOCUMENT = { title: '', visibility: 'EQUIPE', relationType: '', relationId: '', folderId: '', tags: '' };
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const formatSize = size => !size ? '' : size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = value => value?.toDate ? value.toDate().toLocaleDateString('pt-BR') : 'Agora';

export default function CabinetGed({ gabineteId, canOperate }) {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('recentes');
  const [modal, setModal] = useState('');
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(INITIAL_DOCUMENT);
  const [folderName, setFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gabineteId) return undefined;
    const stopDocuments = onSnapshot(
      query(collection(firestore, 'gabinetes-documentos'), where('gabineteId', '==', gabineteId)),
      snapshot => setDocuments(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      () => setError('Não foi possível carregar os documentos do gabinete.')
    );
    const stopFolders = onSnapshot(
      query(collection(firestore, 'gabinetes-pastas'), where('gabineteId', '==', gabineteId)),
      snapshot => setFolders(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      () => setError('Não foi possível carregar as pastas do gabinete.')
    );
    return () => { stopDocuments(); stopFolders(); };
  }, [gabineteId]);

  const close = () => {
    setModal('');
    setFile(null);
    setForm(INITIAL_DOCUMENT);
    setFolderName('');
    setError('');
  };

  const activeDocuments = useMemo(() => documents
    .filter(item => item.status !== 'Arquivado')
    .filter(item => {
      if (filter === 'recentes' || filter === 'todos') return true;
      if (filter === 'sem-pasta') return !item.folderId;
      return item.folderId === filter;
    })
    .filter(item => `${item.titulo || item.title || ''} ${item.relationId || item.demandaId || ''} ${item.tags || ''} ${item.tipo || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0)), [documents, filter, search]);

  const chooseFile = event => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError('Envie PDF, JPG, PNG ou WEBP.');
      event.target.value = '';
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError('O arquivo deve ter no máximo 15 MB.');
      event.target.value = '';
      return;
    }
    setError('');
    setFile(selected);
  };

  const saveDocument = async event => {
    event.preventDefault();
    if (!file || !form.title.trim()) {
      setError('Informe o título e selecione o arquivo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const upload = await uploadFileToStorage(file, `gabinetes/${gabineteId}/ged`);
      const folder = folders.find(item => item.id === form.folderId);
      await addDoc(collection(firestore, 'gabinetes-documentos'), {
        gabineteId,
        titulo: form.title.trim(),
        visibility: form.visibility,
        relationType: form.relationType,
        relationId: form.relationId.trim(),
        folderId: form.folderId,
        folderName: folder?.nome || '',
        tags: form.tags.trim(),
        storagePath: `gabinetes/${gabineteId}/ged`,
        url: upload.url,
        arquivoNome: upload.name,
        mimeType: upload.type,
        tamanho: file.size,
        versao: 1,
        status: 'Ativo',
        origem: 'GED',
        criadoEm: serverTimestamp(),
      });
      close();
    } catch (saveError) {
      setError(saveError.code === 'storage/unauthorized'
        ? 'Não há permissão para enviar arquivos ao Storage.'
        : 'Não foi possível salvar o documento no GED.');
    } finally {
      setSaving(false);
    }
  };

  const saveFolder = async event => {
    event.preventDefault();
    if (!folderName.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(firestore, 'gabinetes-pastas'), {
        gabineteId,
        nome: folderName.trim(),
        criadoEm: serverTimestamp(),
      });
      close();
    } catch {
      setError('Não foi possível criar a pasta.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async item => {
    if (!canOperate || !window.confirm(`Arquivar “${item.titulo || item.title}”?`)) return;
    try {
      await updateDoc(doc(firestore, 'gabinetes-documentos', item.id), { status: 'Arquivado', arquivadoEm: serverTimestamp() });
    } catch {
      setError('Não foi possível arquivar o documento.');
    }
  };

  if (!gabineteId) return <section className="data-card"><h2>GED</h2><p>Selecione um gabinete para consultar os documentos.</p></section>;

  return (
    <section className="data-card cabinet-ged">
      <div className="cabinet-section-heading">
        <div><h2>GED — Documentos</h2><p>Centralize arquivos, ofícios e documentos relacionados ao gabinete.</p></div>
        {canOperate && <div><button type="button" className="btn-secondary cabinet-small-button" onClick={() => setModal('folder')}>Nova pasta</button><button type="button" className="btn-primary cabinet-small-button" onClick={() => setModal('document')}>Novo documento</button></div>}
      </div>

      <div className="cabinet-ged-toolbar">
        <input placeholder="Pesquisar nome, protocolo, tipo ou tag" value={search} onChange={event => setSearch(event.target.value)} />
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="recentes">Recentes</option><option value="todos">Todos os documentos</option><option value="sem-pasta">Sem pasta</option>
          {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.nome}</option>)}
        </select>
      </div>

      <div className="cabinet-ged-shortcuts">
        <span>{documents.filter(item => item.status !== 'Arquivado').length} documento(s) ativo(s)</span>
        <span>{folders.length} pasta(s)</span>
        <span>{documents.filter(item => item.url).length} arquivo(s) enviado(s)</span>
      </div>

      <div className="cabinet-list cabinet-ged-list">
        {activeDocuments.map(item => (
          <article className="cabinet-event-row cabinet-ged-row" key={item.id}>
            <div>
              <strong>{item.titulo || item.title}</strong>
              <p>{item.folderName || 'Sem pasta'} · {item.relationType || item.tipo || 'Documento geral'}{item.relationId || item.demandaId ? ` · ${item.relationId || item.demandaId}` : ''}</p>
              <small>{item.visibility || 'EQUIPE'} · v{item.versao || 1} · {formatSize(item.tamanho)} · {formatDate(item.criadoEm)}</small>
            </div>
            <div className="cabinet-ged-actions">
              {item.url && <a className="btn-secondary cabinet-small-button" href={item.url} target="_blank" rel="noreferrer">Abrir</a>}
              {!item.url && item.conteudo && <button type="button" className="btn-secondary cabinet-small-button" onClick={() => setModal(item.id)}>Ver minuta</button>}
              {canOperate && <button type="button" className="btn-secondary cabinet-small-button" onClick={() => archive(item)}>Arquivar</button>}
            </div>
          </article>
        ))}
        {!activeDocuments.length && <p>Nenhum documento encontrado para este filtro.</p>}
      </div>

      {modal === 'document' && <CabinetOverlay><div className="modal-content cabinet-action-modal cabinet-ged-modal"><div className="modal-header"><h3>Novo documento</h3><button type="button" className="modal-close-btn" onClick={close}>×</button></div><form className="cabinet-modal-form" onSubmit={saveDocument}><label>Título<input required placeholder="Título do documento" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label>Pasta<select value={form.folderId} onChange={event => setForm({ ...form, folderId: event.target.value })}><option value="">Sem pasta</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.nome}</option>)}</select></label><label>Visibilidade<select value={form.visibility} onChange={event => setForm({ ...form, visibility: event.target.value })}><option>PRIVADO</option><option>EQUIPE</option><option>CIDADÃO RELACIONADO</option><option>PÚBLICO</option></select></label><label>Relacionar a<select value={form.relationType} onChange={event => setForm({ ...form, relationType: event.target.value })}><option value="">Sem relação</option><option value="Demanda">Demanda</option><option value="Cidadão">Cidadão</option><option value="Visitante">Visitante</option><option value="Ofício">Ofício</option><option value="Encaminhamento">Encaminhamento</option><option value="Evento">Evento</option></select></label><label>Protocolo ou ID relacionado<input placeholder="Opcional" value={form.relationId} onChange={event => setForm({ ...form, relationId: event.target.value })} /></label><label>Tags<input placeholder="Ex.: iluminação, Patacas" value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} /></label><label>Arquivo <small>PDF, JPG, PNG ou WEBP · máximo de 15 MB</small><input type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" onChange={chooseFile} /></label>{file && <small>{file.name} · {formatSize(file.size)}</small>}{error && <p className="cabinet-form-error" role="alert">{error}</p>}<button className="btn-primary" disabled={saving}>{saving ? 'Enviando...' : 'Salvar no GED'}</button></form></div></CabinetOverlay>}
      {modal === 'folder' && <CabinetOverlay><div className="modal-content cabinet-action-modal"><div className="modal-header"><h3>Nova pasta</h3><button type="button" className="modal-close-btn" onClick={close}>×</button></div><form className="cabinet-modal-form" onSubmit={saveFolder}><label>Nome da pasta<input autoFocus required placeholder="Ex.: Ofícios recebidos 2026" value={folderName} onChange={event => setFolderName(event.target.value)} /></label>{error && <p className="cabinet-form-error" role="alert">{error}</p>}<button className="btn-primary" disabled={saving}>{saving ? 'Criando...' : 'Criar pasta'}</button></form></div></CabinetOverlay>}
      {documents.find(item => item.id === modal)?.conteudo && <CabinetOverlay><div className="modal-content cabinet-action-modal cabinet-ged-preview"><div className="modal-header"><h3>{documents.find(item => item.id === modal)?.titulo}</h3><button type="button" className="modal-close-btn" onClick={close}>×</button></div><pre>{documents.find(item => item.id === modal)?.conteudo}</pre></div></CabinetOverlay>}
    </section>
  );
}
