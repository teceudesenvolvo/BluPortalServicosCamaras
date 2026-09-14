import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { LiaAngleLeftSolid, LiaBookSolid, LiaFileAltSolid, LiaNewspaperSolid, LiaPlusSolid, LiaPlayCircleSolid, LiaSearchSolid, LiaTimesSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from '../../firebase';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';

const collections = { courses: 'escola-parlamento-cursos', lessons: 'escola-parlamento-aulas', contents: 'escola-parlamento-conteudos', news: 'escola-parlamento-noticias' };
const labels = { courses: 'Cursos', lessons: 'Aulas', contents: 'Conteúdos', news: 'Notícias' };
const freshForm = () => ({ title: '', description: '', courseId: '', lessonId: '', videoUrl: '', status: 'Publicado' });

const AdminEscolaParlamento = () => {
  const [active, setActive] = useState('courses');
  const [courses, setCourses] = useState([]); const [lessons, setLessons] = useState([]); const [contents, setContents] = useState([]); const [news, setNews] = useState([]);
  const [queryText, setQueryText] = useState(''); const [status, setStatus] = useState('Todos');
  const [selectedCourseId, setSelectedCourseId] = useState(''); const [selectedLessonId, setSelectedLessonId] = useState('');
  const [form, setForm] = useState(freshForm); const [file, setFile] = useState(null); const [open, setOpen] = useState(false); const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const read = name => getDocs(query(collection(firestore, name), orderBy('createdAt', 'desc')));
      const [courseSnap, lessonSnap, contentSnap, newsSnap] = await Promise.all([read(collections.courses), read(collections.lessons), read(collections.contents), read(collections.news)]);
      setCourses(courseSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setLessons(lessonSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setContents(contentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setNews(newsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
    } finally { setLoading(false); }
  };

  useEffect(() => { load().catch(error => console.error('Erro ao carregar Escola do Parlamento:', error)); }, []);

  const selectedCourse = courses.find(item => item.id === selectedCourseId);
  const selectedLesson = lessons.find(item => item.id === selectedLessonId);
  const currentItems = active === 'courses' ? courses : active === 'lessons' ? lessons : active === 'contents' ? contents : news;
  const search = queryText.trim().toLocaleLowerCase('pt-BR');
  const visibleItems = useMemo(() => currentItems.filter(item => {
    const belongsToCourse = !['lessons', 'contents'].includes(active) || !selectedCourseId || item.courseId === selectedCourseId;
    const belongsToLesson = active !== 'contents' || !selectedLessonId || item.lessonId === selectedLessonId;
    const matchesText = !search || `${item.title || ''} ${item.description || ''}`.toLocaleLowerCase('pt-BR').includes(search);
    return belongsToCourse && belongsToLesson && matchesText && (status === 'Todos' || item.status === status);
  }), [active, currentItems, search, selectedCourseId, selectedLessonId, status]);

  const changeActive = next => { setActive(next); setQueryText(''); setStatus('Todos'); };
  const openCreate = () => { setForm({ ...freshForm(), courseId: selectedCourseId, lessonId: selectedLessonId }); setFile(null); setOpen(true); };
  const openCourse = course => { setSelectedCourseId(course.id); setSelectedLessonId(''); changeActive('lessons'); };
  const openLesson = lesson => { setSelectedCourseId(lesson.courseId || selectedCourseId); setSelectedLessonId(lesson.id); changeActive('contents'); };

  const save = async event => {
    event.preventDefault();
    try {
      const attachment = file ? await uploadFileToStorage(file, 'escola-parlamento/conteudos') : null;
      const data = { ...form, title: form.title.trim(), description: form.description.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...(attachment ? { attachment } : {}) };
      if (active === 'courses') { delete data.courseId; delete data.lessonId; delete data.videoUrl; }
      if (active === 'lessons') { delete data.lessonId; if (!data.courseId) throw new Error('Selecione o curso da aula.'); }
      if (active === 'contents') { delete data.videoUrl; if (!data.courseId || !data.lessonId) throw new Error('Selecione a aula à qual o conteúdo pertence.'); }
      if (active === 'news') { delete data.courseId; delete data.lessonId; delete data.videoUrl; }
      await addDoc(collection(firestore, collections[active]), data);
      setOpen(false); await load();
    } catch (error) { console.error('Erro ao salvar Escola do Parlamento:', error); alert(error.message || 'Não foi possível salvar.'); }
  };
  const remove = async id => { if (window.confirm('Excluir este registro?')) { await deleteDoc(doc(firestore, collections[active], id)); await load(); } };
  const heading = active === 'lessons' && selectedCourse ? `Aulas de ${selectedCourse.title}` : active === 'contents' && selectedLesson ? `Conteúdos da aula: ${selectedLesson.title}` : labels[active];
  const courseForForm = form.courseId || selectedCourseId;
  const availableLessons = lessons.filter(item => item.courseId === courseForForm);

  return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content escola-admin-page">
    <header className="page-header-container"><div className="header-title-section"><h1>Escola do Parlamento</h1><p>Organize cursos, aulas em vídeo, materiais e notícias da Escola.</p></div></header>
    <nav className="service-operations-nav escola-tabs" aria-label="Gestão da Escola do Parlamento">{Object.entries(labels).map(([id, label]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => changeActive(id)}>{id === 'courses' ? <LiaBookSolid /> : id === 'lessons' ? <LiaPlayCircleSolid /> : id === 'contents' ? <LiaFileAltSolid /> : <LiaNewspaperSolid />}{label}</button>)}</nav>
    <section className="data-card escola-admin-card">
      <div className="card-header escola-list-header"><div>{((active === 'lessons' && selectedCourse) || (active === 'contents' && selectedLesson)) && <button className="escola-back-button" onClick={() => changeActive(active === 'contents' ? 'lessons' : 'courses')}><LiaAngleLeftSolid /> Voltar</button>}<h2>{heading}</h2><p>{active === 'courses' ? 'Abra um curso para administrar suas aulas.' : active === 'lessons' ? 'Abra uma aula para administrar seus conteúdos.' : active === 'contents' ? 'Materiais vinculados à aula selecionada.' : 'Notícias exibidas na página pública da Escola.'}</p></div><button className="btn-primary escola-add-button" onClick={openCreate}><LiaPlusSolid /> Novo {labels[active].slice(0, -1)}</button></div>
      <div className="escola-filters"><label className="escola-search"><LiaSearchSolid /><input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder={`Pesquisar ${labels[active].toLocaleLowerCase('pt-BR')}...`} /></label>{['lessons', 'contents'].includes(active) && <select value={selectedCourseId} onChange={event => { setSelectedCourseId(event.target.value); setSelectedLessonId(''); }}><option value="">Todos os cursos</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select>}{active === 'contents' && <select value={selectedLessonId} onChange={event => setSelectedLessonId(event.target.value)}><option value="">Todas as aulas</option>{lessons.filter(item => !selectedCourseId || item.courseId === selectedCourseId).map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select>}<select value={status} onChange={event => setStatus(event.target.value)}><option>Todos</option><option>Publicado</option><option>Rascunho</option></select></div>
      {loading ? <p>Carregando...</p> : <div className="escola-admin-list">{visibleItems.length === 0 && <p>Nenhum registro encontrado.</p>}{visibleItems.map(item => <article key={item.id}><button className="escola-record-open" onClick={() => { if (active === 'courses') openCourse(item); if (active === 'lessons') openLesson(item); }} disabled={active === 'contents' || active === 'news'}><strong>{item.title}</strong><span>{active === 'lessons' ? courses.find(course => course.id === item.courseId)?.title || 'Curso não informado' : active === 'contents' ? lessons.find(lesson => lesson.id === item.lessonId)?.title || 'Aula não informada' : item.description || item.status}</span>{item.videoUrl && <small>Vídeo vinculado</small>}{item.attachment?.url && <a href={item.attachment.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Abrir material: {item.attachment.name}</a>}</button><button className="btn-secondary" onClick={() => remove(item.id)}>Excluir</button></article>)}</div>}
    </section>
    {open && <div className="modal-overlay" onClick={() => setOpen(false)}><form className="modal-content escola-modal" onSubmit={save} onClick={event => event.stopPropagation()}><div className="modal-header"><h2>Novo {labels[active].slice(0, -1)}</h2><button type="button" className="modal-close-btn" onClick={() => setOpen(false)}><LiaTimesSolid /></button></div><div className="modal-body escola-form"><label className="form-group"><span>Título</span><input required className="form-input" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>{['lessons', 'contents'].includes(active) && <label className="form-group"><span>Curso</span><select required className="form-input" value={form.courseId} onChange={event => setForm({ ...form, courseId: event.target.value, lessonId: '' })}><option value="">Selecione o curso</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>}{active === 'contents' && <label className="form-group"><span>Aula</span><select required className="form-input" value={form.lessonId} onChange={event => setForm({ ...form, lessonId: event.target.value })}><option value="">Selecione a aula</option>{availableLessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>}<label className="form-group"><span>{active === 'news' ? 'Resumo' : 'Descrição'}</span><textarea className="form-input" rows="5" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>{active === 'lessons' && <label className="form-group"><span>Link do vídeo</span><input required type="url" className="form-input" placeholder="YouTube, Vimeo ou outro endereço de vídeo" value={form.videoUrl} onChange={event => setForm({ ...form, videoUrl: event.target.value })} /></label>}{active === 'contents' && <label className="form-group"><span>PDF ou imagem</span><input required type="file" accept="application/pdf,image/*" onChange={event => setFile(event.target.files?.[0] || null)} /></label>}<label className="form-group"><span>Status</span><select className="form-input" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option>Publicado</option><option>Rascunho</option></select></label></div><div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary">Salvar</button></div></form></div>}
  </main></div>;
};

export default AdminEscolaParlamento;
