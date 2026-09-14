import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { LiaAngleLeftSolid, LiaBookSolid, LiaNewspaperSolid, LiaPlusSolid, LiaSearchSolid, LiaTimesSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { firestore } from '../../firebase';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const collections = { courses: 'escola-parlamento-cursos', lessons: 'escola-parlamento-aulas', contents: 'escola-parlamento-conteudos', news: 'escola-parlamento-noticias' };
const labels = { courses: 'Cursos', lessons: 'Aulas', contents: 'Conteúdos', news: 'Notícias' };
const freshForm = () => ({ title: '', description: '', courseId: '', lessonId: '', videoUrl: '', contentType: 'material', questions: [], status: 'Publicado' });

const QuestionnaireCreator = ({ courseId, lessonId, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState(''); const [passingScore, setPassingScore] = useState(70); const [attemptsAllowed, setAttemptsAllowed] = useState(1); const [showFeedback, setShowFeedback] = useState(true);
  const blankQuestion = () => ({ text: '', type: 'multiple', options: ['', ''], correctOptionIndex: 0, points: 1, required: true, explanation: '' });
  const [questions, setQuestions] = useState([blankQuestion()]);
  const update = (index, changes) => setQuestions(questions.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const addOption = index => update(index, { options: [...questions[index].options, ''] });
  const removeOption = (index, optionIndex) => { const options = questions[index].options.filter((_, itemIndex) => itemIndex !== optionIndex); update(index, { options, correctOptionIndex: Math.min(questions[index].correctOptionIndex, options.length - 1) }); };
  const save = async event => {
    event.preventDefault();
    const valid = questions.filter(item => item.text.trim()).map(item => { const options = item.type === 'multiple' ? item.options.filter(option => option.trim()) : []; return { ...item, text: item.text.trim(), options, correctOptionIndex: item.type === 'multiple' ? Math.min(item.correctOptionIndex, options.length - 1) : null }; });
    if (!title.trim() || !valid.length) return;
    if (valid.some(item => item.type === 'multiple' && item.options.length < 2)) return alert('Cada questão de múltipla escolha precisa de pelo menos duas alternativas.');
    await addDoc(collection(firestore, collections.contents), { title: title.trim(), description: instructions.trim() || 'Questionário da aula', contentType: 'questionnaire', courseId, lessonId, questions: valid, passingScore: Number(passingScore), attemptsAllowed: Number(attemptsAllowed), showFeedback, status: 'Publicado', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    setOpen(false); setTitle(''); setInstructions(''); setPassingScore(70); setAttemptsAllowed(1); setShowFeedback(true); setQuestions([blankQuestion()]); onSaved();
  };
  const modal = open && <div className="modal-overlay escola-global-overlay" onClick={() => setOpen(false)}><form className="modal-content escola-modal" onSubmit={save} onClick={event => event.stopPropagation()}><div className="modal-header"><h2>Novo questionário</h2><button type="button" aria-label="Fechar" className="modal-close-btn" onClick={() => setOpen(false)}><LiaTimesSolid /></button></div><div className="modal-body escola-questionnaire-form"><label className="form-group"><span>Título</span><input required value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Revisão da aula" /></label><label className="form-group"><span>Orientações para o aluno</span><textarea value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Explique como o questionário deve ser respondido" /></label><div className="escola-quiz-settings"><label><span>Nota mínima (%)</span><input type="number" min="0" max="100" value={passingScore} onChange={event => setPassingScore(event.target.value)} /></label><label><span>Tentativas permitidas</span><input type="number" min="1" value={attemptsAllowed} onChange={event => setAttemptsAllowed(event.target.value)} /></label><label className="escola-checkbox"><input type="checkbox" checked={showFeedback} onChange={event => setShowFeedback(event.target.checked)} /> Mostrar feedback ao concluir</label></div>{questions.map((question, index) => <article key={index}><div className="escola-question-heading"><strong>Pergunta {index + 1}</strong>{questions.length > 1 && <button type="button" className="escola-delete-button" onClick={() => setQuestions(questions.filter((_, itemIndex) => itemIndex !== index))}>Remover</button>}</div><textarea required value={question.text} onChange={event => update(index, { text: event.target.value })} placeholder="Digite a pergunta" /><div className="escola-question-settings"><select value={question.type} onChange={event => update(index, { type: event.target.value, correctOptionIndex: 0 })}><option value="multiple">Múltipla escolha</option><option value="written">Resposta escrita</option></select><label><span>Pontos</span><input type="number" min="1" value={question.points} onChange={event => update(index, { points: Number(event.target.value) })} /></label><label className="escola-checkbox"><input type="checkbox" checked={question.required} onChange={event => update(index, { required: event.target.checked })} /> Obrigatória</label></div>{question.type === 'multiple' && <div className="escola-question-options"><small>Marque a alternativa correta.</small>{question.options.map((option, optionIndex) => <div key={optionIndex}><input type="radio" checked={question.correctOptionIndex === optionIndex} onChange={() => update(index, { correctOptionIndex: optionIndex })} aria-label={`Alternativa ${optionIndex + 1} correta`} /><input required value={option} onChange={event => update(index, { options: question.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) })} placeholder={`Alternativa ${optionIndex + 1}`} />{question.options.length > 2 && <button type="button" className="escola-delete-button" onClick={() => removeOption(index, optionIndex)}>Remover</button>}</div>)}<button type="button" className="escola-add-option" onClick={() => addOption(index)}><LiaPlusSolid /> Adicionar alternativa</button></div>}<label><span>Feedback / explicação da resposta</span><textarea value={question.explanation} onChange={event => update(index, { explanation: event.target.value })} placeholder="Opcional" /></label></article>)}<button type="button" className="btn-secondary" onClick={() => setQuestions([...questions, blankQuestion()])}><LiaPlusSolid /> Adicionar pergunta</button></div><div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary">Salvar questionário</button></div></form></div>;
  return <>{<button className="btn-secondary escola-questionnaire-button" onClick={() => setOpen(true)}><LiaPlusSolid /> Novo questionário</button>}{modal && createPortal(modal, document.body)}</>;
};

const CoursePresentationEditor = ({ course, onSaved }) => {
  const [url, setUrl] = useState(course.presentationVideoUrl || '');
  const save = async event => { event.preventDefault(); await updateDoc(doc(firestore, collections.courses, course.id), { presentationVideoUrl: url.trim(), updatedAt: serverTimestamp() }); onSaved(); };
  return <form className="escola-presentation-editor" onSubmit={save}><label><span>Vídeo de apresentação do curso</span><input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="Link do YouTube, Vimeo ou outro vídeo" /></label><button className="btn-secondary">Salvar vídeo</button></form>;
};

const SchoolNewsEditor = ({ onSaved }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(''); const [summary, setSummary] = useState(''); const [content, setContent] = useState(''); const [status, setStatus] = useState('Publicado'); const [cover, setCover] = useState(null); const [preview, setPreview] = useState(''); const [saving, setSaving] = useState(false);
  const selectCover = event => { const image = event.target.files?.[0]; if (!image) return; setCover(image); setPreview(URL.createObjectURL(image)); };
  const save = async event => { event.preventDefault(); if (!title.trim() || !content.replace(/<[^>]*>/g, '').trim() || !cover) return alert('Informe título, conteúdo e imagem de capa.'); setSaving(true); try { const image = await uploadFileToStorage(cover, 'escola-parlamento/noticias'); await addDoc(collection(firestore, collections.news), { title: title.trim(), description: summary.trim(), summary: summary.trim(), content, coverUrl: image.url, coverName: image.name, status, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); setOpen(false); setTitle(''); setSummary(''); setContent(''); setCover(null); setPreview(''); onSaved(); } finally { setSaving(false); } };
  return <section className="escola-news-editor-launch"><div><strong>Publicação editorial</strong><span>Use imagem de capa e editor profissional, no mesmo padrão das notícias do portal.</span></div><button className="btn-primary" onClick={() => setOpen(true)}><LiaPlusSolid /> Nova notícia completa</button>{open && createPortal(<div className="modal-overlay escola-global-overlay" onClick={() => setOpen(false)}><form className="modal-content escola-news-modal" onSubmit={save} onClick={event => event.stopPropagation()}><div className="modal-header"><h2>Nova notícia da Escola</h2><button type="button" aria-label="Fechar" className="modal-close-btn" onClick={() => setOpen(false)}><LiaTimesSolid /></button></div><div className="modal-body escola-news-form"><label className="form-group"><span>Título</span><input required value={title} onChange={event => setTitle(event.target.value)} placeholder="Título chamativo" /></label><label className="form-group"><span>Subtítulo / resumo</span><input value={summary} onChange={event => setSummary(event.target.value)} placeholder="Uma breve descrição" /></label><label className="escola-cover-upload"><span>Imagem de capa</span><small>Recomendado: 1440 × 720 px</small><input required type="file" accept="image/*" onChange={selectCover} /></label>{preview && <img className="escola-news-cover-preview" src={preview} alt="Prévia da capa" />}<label><span>Conteúdo da notícia</span><ReactQuill theme="snow" value={content} onChange={setContent} placeholder="Escreva a notícia aqui..." /></label><label className="form-group"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="Rascunho">Rascunho</option><option value="Publicado">Publicado</option></select></label></div><div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Publicar notícia'}</button></div></form></div>, document.body)}</section>;
};

const AdminEscolaParlamento = () => {
  const [active, setActive] = useState('courses');
  const [courses, setCourses] = useState([]); const [lessons, setLessons] = useState([]); const [contents, setContents] = useState([]); const [news, setNews] = useState([]);
  const [enrollments, setEnrollments] = useState([]); const [progress, setProgress] = useState([]); const [downloads, setDownloads] = useState([]);
  const [queryText, setQueryText] = useState(''); const [status, setStatus] = useState('Todos');
  const [selectedCourseId, setSelectedCourseId] = useState(''); const [selectedLessonId, setSelectedLessonId] = useState('');
  const [form, setForm] = useState(freshForm); const [file, setFile] = useState(null); const [open, setOpen] = useState(false); const [editingItem, setEditingItem] = useState(null); const [loading, setLoading] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false); const [participantSearch, setParticipantSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const read = name => getDocs(query(collection(firestore, name), orderBy('createdAt', 'desc')));
      const [courseSnap, lessonSnap, contentSnap, newsSnap, enrollmentSnap, progressSnap, downloadSnap] = await Promise.all([read(collections.courses), read(collections.lessons), read(collections.contents), read(collections.news), read('escola-parlamento-matriculas'), read('escola-parlamento-progresso'), read('escola-parlamento-downloads')]);
      setCourses(courseSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setLessons(lessonSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setContents(contentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setNews(newsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setEnrollments(enrollmentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setProgress(progressSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setDownloads(downloadSnap.docs.map(item => ({ id: item.id, ...item.data() })));
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
  const openCreate = () => { setEditingItem(null); setForm({ ...freshForm(), courseId: selectedCourseId, lessonId: selectedLessonId }); setFile(null); setOpen(true); };
  const openEdit = item => { setEditingItem(item); setForm({ ...freshForm(), ...item }); setFile(null); setOpen(true); };
  const openCourse = course => { setSelectedCourseId(course.id); setSelectedLessonId(''); changeActive('lessons'); };
  const openLesson = lesson => { setSelectedCourseId(lesson.courseId || selectedCourseId); setSelectedLessonId(lesson.id); changeActive('contents'); };

  const save = async event => {
    event.preventDefault();
    try {
      const attachment = file ? await uploadFileToStorage(file, 'escola-parlamento/conteudos') : null;
      const data = { ...form, title: form.title.trim(), description: form.description.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...(attachment ? { attachment } : {}) };
      delete data.id;
      const isEditingCourse = editingItem?.id === selectedCourseId;
      const targetCollection = isEditingCourse ? collections.courses : collections[active];
      if (active === 'courses' || isEditingCourse) { delete data.courseId; delete data.lessonId; delete data.videoUrl; delete data.contentType; delete data.questions; }
      if (active === 'lessons' && !isEditingCourse) { delete data.lessonId; delete data.contentType; delete data.questions; if (!data.courseId) throw new Error('Selecione o curso da aula.'); }
      if (active === 'contents') { delete data.videoUrl; if (data.contentType !== 'questionnaire') delete data.questions; if (!data.courseId || !data.lessonId) throw new Error('Selecione a aula à qual o conteúdo pertence.'); if (data.contentType === 'questionnaire' && !(data.questions || []).some(question => question.text.trim())) throw new Error('Adicione ao menos uma pergunta ao questionário.'); }
      if (active === 'news') { delete data.courseId; delete data.lessonId; delete data.videoUrl; delete data.contentType; delete data.questions; }
      if (editingItem) {
        delete data.createdAt;
        await updateDoc(doc(firestore, targetCollection, editingItem.id), data);
      } else {
        await addDoc(collection(firestore, collections[active]), data);
      }
      setOpen(false); await load();
    } catch (error) { console.error('Erro ao salvar Escola do Parlamento:', error); alert(error.message || 'Não foi possível salvar.'); }
  };
  const remove = async id => {
    const isCourse = editingItem?.id === selectedCourseId;
    const label = (isCourse ? 'Curso' : labels[active].slice(0, -1)).toLocaleLowerCase('pt-BR');
    if (!window.confirm(`Excluir este ${label}? Esta ação não poderá ser desfeita.`)) return;
    await deleteDoc(doc(firestore, isCourse ? collections.courses : collections[active], id));
    setOpen(false);
    setEditingItem(null);
    await load();
  };
  const heading = active === 'lessons' && selectedCourse ? `Aulas de ${selectedCourse.title}` : active === 'contents' && selectedLesson ? `Conteúdos da aula: ${selectedLesson.title}` : labels[active];
  const editingLabel = editingItem?.id === selectedCourseId ? 'Curso' : labels[active].slice(0, -1);
  const courseForForm = form.courseId || selectedCourseId;
  const availableLessons = lessons.filter(item => item.courseId === courseForForm);
  const courseParticipants = enrollments.filter(item => item.courseId === selectedCourseId);
  const visibleParticipants = courseParticipants.filter(item => `${item.userName || ''} ${item.userEmail || ''}`.toLocaleLowerCase('pt-BR').includes(participantSearch.trim().toLocaleLowerCase('pt-BR')));
  const courseStats = course => ({
    lessons: lessons.filter(item => item.courseId === course.id).length,
    participants: enrollments.filter(item => item.courseId === course.id).length,
    contents: contents.filter(item => item.courseId === course.id).length
  });

  return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content escola-admin-page">
    <header className="page-header-container"><div className="header-title-section"><h1>Escola do Parlamento</h1><p>Organize cursos, aulas em vídeo, materiais e notícias da Escola.</p></div></header>
    <nav className="service-operations-nav escola-tabs" aria-label="Gestão da Escola do Parlamento"><button className={active !== 'news' ? 'active' : ''} onClick={() => { setSelectedCourseId(''); setSelectedLessonId(''); changeActive('courses'); }}><LiaBookSolid /> Cursos</button><button className={active === 'news' ? 'active' : ''} onClick={() => changeActive('news')}><LiaNewspaperSolid /> Notícias</button></nav>
    <section className="data-card escola-admin-card">
      <div className="card-header escola-list-header"><div>{((active === 'lessons' && selectedCourse) || (active === 'contents' && selectedLesson)) && <button className="escola-back-button" onClick={() => changeActive(active === 'contents' ? 'lessons' : 'courses')}><LiaAngleLeftSolid /> Voltar</button>}<div className="escola-title-actions"><div><h2>{heading}</h2><p>{active === 'courses' ? 'Abra um curso para administrar suas aulas, participantes e atividades.' : active === 'lessons' ? 'Abra uma aula para administrar seus conteúdos.' : active === 'contents' ? 'Materiais vinculados à aula selecionada.' : 'Notícias exibidas na página pública da Escola.'}</p></div><div className="escola-header-actions">{active === 'lessons' && selectedCourse && <><button className="btn-secondary" onClick={() => openEdit(selectedCourse)}>Editar curso</button><button className="btn-secondary" onClick={() => { setParticipantSearch(''); setShowParticipants(true); }}>Participantes ({courseParticipants.length})</button></>}{active === 'contents' && selectedCourseId && selectedLessonId && <QuestionnaireCreator courseId={selectedCourseId} lessonId={selectedLessonId} onSaved={load} />}<button className="btn-primary escola-add-button" onClick={openCreate}><LiaPlusSolid /> Novo {labels[active].slice(0, -1)}</button></div></div></div></div>
      {active === 'lessons' && selectedCourse && <><section className="escola-course-manager"><div><strong>{courseParticipants.length}</strong><span>participantes</span></div><div><strong>{progress.filter(item => item.courseId === selectedCourseId).length}</strong><span>aulas assistidas</span></div><div><strong>{downloads.filter(item => item.courseId === selectedCourseId).length}</strong><span>materiais baixados</span></div></section><CoursePresentationEditor course={selectedCourse} onSaved={load} /></>}
      {active === 'news' && <SchoolNewsEditor onSaved={load} />}
      <div className="escola-filters"><label className="escola-search"><LiaSearchSolid /><input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder={`Pesquisar ${labels[active].toLocaleLowerCase('pt-BR')}...`} /></label>{['lessons', 'contents'].includes(active) && <select value={selectedCourseId} onChange={event => { setSelectedCourseId(event.target.value); setSelectedLessonId(''); }}><option value="">Todos os cursos</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select>}{active === 'contents' && <select value={selectedLessonId} onChange={event => setSelectedLessonId(event.target.value)}><option value="">Todas as aulas</option>{lessons.filter(item => !selectedCourseId || item.courseId === selectedCourseId).map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select>}<select value={status} onChange={event => setStatus(event.target.value)}><option>Todos</option><option>Publicado</option><option>Rascunho</option></select></div>
      {loading ? <p>Carregando...</p> : <div className={`escola-admin-list ${active === 'courses' || active === 'lessons' ? 'escola-card-list' : ''}`}>{visibleItems.length === 0 && <p>Nenhum registro encontrado.</p>}{visibleItems.map(item => <article key={item.id}><button className="escola-record-open" onClick={() => { if (active === 'courses') openCourse(item); if (active === 'lessons') openLesson(item); }} disabled={active === 'contents' || active === 'news'}><strong>{item.title}</strong><span>{active === 'lessons' ? courses.find(course => course.id === item.courseId)?.title || 'Curso não informado' : active === 'contents' ? lessons.find(lesson => lesson.id === item.lessonId)?.title || 'Aula não informada' : item.description || item.status}</span>{active === 'courses' && <small>{courseStats(item).lessons} aulas · {courseStats(item).contents} conteúdos · {courseStats(item).participants} participantes</small>}{item.videoUrl && <small>Vídeo vinculado</small>}{item.attachment?.url && <a href={item.attachment.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Abrir material: {item.attachment.name}</a>}</button><div className="escola-record-actions"><button className="btn-secondary" onClick={() => active === 'courses' ? openCourse(item) : openEdit(item)}>{active === 'courses' ? 'Gerenciar' : 'Editar'}</button></div></article>)}</div>}
    </section>
    {open && <div className="modal-overlay" onClick={() => setOpen(false)}><form className="modal-content escola-modal" onSubmit={save} onClick={event => event.stopPropagation()}><div className="modal-header"><h2>{editingItem ? 'Editar' : 'Novo'} {editingItem ? editingLabel : labels[active].slice(0, -1)}</h2><button type="button" className="modal-close-btn" onClick={() => setOpen(false)}><LiaTimesSolid /></button></div><div className="modal-body escola-form"><label className="form-group"><span>Título</span><input required className="form-input" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>{['lessons', 'contents'].includes(active) && editingItem?.id !== selectedCourseId && <label className="form-group"><span>Curso</span><select required className="form-input" value={form.courseId} onChange={event => setForm({ ...form, courseId: event.target.value, lessonId: '' })}><option value="">Selecione o curso</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>}{active === 'contents' && <label className="form-group"><span>Aula</span><select required className="form-input" value={form.lessonId} onChange={event => setForm({ ...form, lessonId: event.target.value })}><option value="">Selecione a aula</option>{availableLessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>}<label className="form-group"><span>{active === 'news' ? 'Resumo' : 'Descrição'}</span><textarea className="form-input" rows="5" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>{active === 'lessons' && editingItem?.id !== selectedCourseId && <label className="form-group"><span>Link do vídeo</span><input required type="url" className="form-input" placeholder="YouTube, Vimeo ou outro endereço de vídeo" value={form.videoUrl} onChange={event => setForm({ ...form, videoUrl: event.target.value })} /></label>}{active === 'contents' && <label className="form-group"><span>PDF ou imagem</span><input required={!editingItem} type="file" accept="application/pdf,image/*" onChange={event => setFile(event.target.files?.[0] || null)} /></label>}<label className="form-group"><span>Status</span><select className="form-input" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option>Publicado</option><option>Rascunho</option></select></label></div><div className="form-actions">{editingItem && <button type="button" className="escola-delete-button" onClick={() => remove(editingItem.id)}>Excluir</button>}<span className="escola-form-spacer" /><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary">Salvar</button></div></form></div>}
    {showParticipants && <div className="modal-overlay" onClick={() => setShowParticipants(false)}><section className="modal-content escola-participants-modal" onClick={event => event.stopPropagation()}><div className="modal-header"><div><h2>Participantes do curso</h2><p>{selectedCourse?.title}</p></div><button className="modal-close-btn" onClick={() => setShowParticipants(false)}><LiaTimesSolid /></button></div><label className="escola-search"><LiaSearchSolid /><input autoFocus value={participantSearch} onChange={event => setParticipantSearch(event.target.value)} placeholder="Pesquisar por nome ou e-mail..." /></label><div className="escola-participants-list">{visibleParticipants.length ? visibleParticipants.map(item => <article key={item.id}><div><strong>{item.userName || 'Usuário identificado'}</strong><span>{item.userEmail || 'E-mail não informado'}</span></div><small>{progress.filter(row => row.courseId === selectedCourseId && row.userId === item.userId).length} aulas assistidas · {downloads.filter(row => row.courseId === selectedCourseId && row.userId === item.userId).length} downloads</small></article>) : <p>Nenhum participante encontrado.</p>}</div></section></div>}
  </main></div>;
};

export default AdminEscolaParlamento;
