import React, { useEffect, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { firestore } from '../firebase';
import { uploadFileToStorage } from '../utils/firebaseStorageUtils';
import CabinetOverlay from './CabinetOverlay';

const INITIAL_FORM = {
  titulo: '',
  subtitulo: '',
  conteudo: '',
  status: 'Rascunho',
  capaUrl: '',
};

const isBlankRichText = (value) => !value || value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

export default function CabinetNews({ gabineteId, authorName, canOperate }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gabineteId) return undefined;
    return onSnapshot(
      query(collection(firestore, 'noticias'), where('gabineteId', '==', gabineteId)),
      snapshot => setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      () => setError('Não foi possível carregar as notícias deste gabinete.')
    );
  }, [gabineteId]);

  const close = () => {
    setOpen(false);
    setForm(INITIAL_FORM);
    setCoverFile(null);
    setCoverPreview('');
    setError('');
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem válida para a capa.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const image = new Image();
      image.onload = () => {
        if (image.width !== 1440 || image.height !== 720) {
          setError(`A imagem de capa deve ter 1440×720 pixels. A imagem selecionada tem ${image.width}×${image.height} pixels.`);
          setCoverFile(null);
          setCoverPreview('');
          event.target.value = '';
          return;
        }
        setError('');
        setCoverFile(file);
        setCoverPreview(loadEvent.target?.result || '');
      };
      image.onerror = () => setError('Não foi possível ler a imagem selecionada.');
      image.src = loadEvent.target?.result || '';
    };
    reader.readAsDataURL(file);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.titulo.trim() || isBlankRichText(form.conteudo)) {
      setError('Informe o título e o conteúdo da notícia.');
      return;
    }
    if (!coverFile) {
      setError('Envie a imagem de capa no formato 1440×720 pixels.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const upload = await uploadFileToStorage(coverFile, `gabinetes/${gabineteId}/noticias`);
      await addDoc(collection(firestore, 'noticias'), {
        ...form,
        titulo: form.titulo.trim(),
        subtitulo: form.subtitulo.trim(),
        resumo: form.subtitulo.trim(),
        autor: authorName || 'Vereador',
        conteudo: form.conteudo.trim(),
        capaUrl: upload.url,
        gabineteId,
        vereadorId: gabineteId,
        camaraId: 'atual',
        criadoEm: serverTimestamp(),
        createdAt: serverTimestamp(),
        autorId: gabineteId,
      });
      close();
    } catch (saveError) {
      setError(saveError.code === 'storage/unauthorized'
        ? 'Não há permissão para enviar a imagem de capa ao Storage.'
        : 'Não foi possível salvar a notícia. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="data-card cabinet-news">
      <div className="cabinet-section-heading">
        <div>
          <h2>Notícias do vereador</h2>
          <p>Conteúdo institucional publicado na página pública do gabinete.</p>
        </div>
        {canOperate && <button className="btn-primary cabinet-small-button" onClick={() => setOpen(true)}>Nova notícia</button>}
      </div>

      <div className="cabinet-list cabinet-news-list">
        {items.map(item => (
          <article className="cabinet-event-row cabinet-news-row" key={item.id}>
            {item.capaUrl ? <img className="cabinet-news-thumb" src={item.capaUrl} alt="" /> : <div className="cabinet-news-thumb cabinet-news-thumb-empty">Sem capa</div>}
            <div>
              <strong>{item.titulo}</strong>
              <p>{item.subtitulo || item.resumo}</p>
            </div>
            <small>{item.status}</small>
          </article>
        ))}
        {!items.length && <p>Nenhuma notícia cadastrada.</p>}
      </div>

      {open && (
        <CabinetOverlay>
          <div className="modal-content cabinet-action-modal cabinet-news-modal">
            <div className="modal-header">
              <h3>Nova notícia</h3>
              <button type="button" className="modal-close-btn" onClick={close} aria-label="Fechar">×</button>
            </div>
            <form className="cabinet-modal-form" onSubmit={save}>
              <label>Título
                <input required placeholder="Título chamativo" value={form.titulo} onChange={event => setForm({ ...form, titulo: event.target.value })} />
              </label>
              <label>Subtítulo / resumo
                <input placeholder="Uma breve descrição" value={form.subtitulo} onChange={event => setForm({ ...form, subtitulo: event.target.value })} />
              </label>
              <p className="cabinet-news-author">Autor: <strong>{authorName || 'Vereador autenticado'}</strong></p>
              <div className="cabinet-news-cover-field">
                <div>
                  <strong>Imagem de capa</strong>
                  <span>Obrigatória · 1440×720 pixels</span>
                </div>
                <label className="btn-secondary cabinet-upload-button">
                  Selecionar imagem
                  <input type="file" accept="image/*" onChange={handleImageChange} />
                </label>
              </div>
              {coverPreview && <img className="cabinet-news-cover-preview" src={coverPreview} alt="Prévia da capa da notícia" />}
              <label>Conteúdo da notícia
                <ReactQuill theme="snow" value={form.conteudo} onChange={value => setForm({ ...form, conteudo: value })} placeholder="Escreva a notícia aqui..." />
              </label>
              <label>Status
                <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>
                  <option value="Rascunho">Rascunho</option>
                  <option value="Agendada">Agendada</option>
                  <option value="Publicado">Publicada</option>
                  <option value="Arquivada">Arquivada</option>
                </select>
              </label>
              {error && <p className="cabinet-form-error" role="alert">{error}</p>}
              <button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar notícia'}</button>
            </form>
          </div>
        </CabinetOverlay>
      )}
    </section>
  );
}
