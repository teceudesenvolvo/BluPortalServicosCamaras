import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, where, query } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaCalendarAltSolid, LiaSearchSolid, LiaVideoSolid } from 'react-icons/lia';
import { firestore } from '../../firebase';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { LEGISLATIVE_COLLECTIONS } from '../../config/legislativeDataModel';
import { LEGISLATIVE_STAGES } from '../../services/LegislativeProcessService';
import { VideoConferenceService } from '../../services/VideoConferenceService';
import AdminSidebar from '../../components/AdminSidebar';

const remoteFormats = new Set(['Remota', 'Virtual', 'Híbrida']);
const sessionEligibleStatuses = new Set([LEGISLATIVE_STAGES.READY_FOR_AGENDA, LEGISLATIVE_STAGES.AGENDA, LEGISLATIVE_STAGES.SECOND_TURN]);
const commissionEligibleStatuses = new Set([LEGISLATIVE_STAGES.COMMISSION, LEGISLATIVE_STAGES.RAPPORTEUR, LEGISLATIVE_STAGES.COMMISSION_DELIBERATION]);

const initialForm = mode => ({
  title: '',
  type: mode === 'session' ? 'Ordinária' : 'Reunião ordinária',
  format: 'Presencial',
  date: '',
  time: '',
  location: '',
  broadcastUrl: '',
  agenda: '',
  result: '',
  matterIds: [],
  attendanceIds: [],
});

const matchesMatter = (matter, term) => {
  const needle = String(term || '').trim().toLocaleLowerCase('pt-BR');
  if (!needle) return true;
  return [matter.type, matter.number, matter.year, matter.title, matter.summary, matter.subject, matter.authorName]
    .join(' ').toLocaleLowerCase('pt-BR').includes(needle);
};

export default function AdminLegislativeEventForm({ mode }) {
  const { currentUser } = useAuth();
  const { settings } = useSystemControl();
  const { commissionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isSession = mode === 'session';
  const [profile, setProfile] = useState({});
  const [commission, setCommission] = useState(null);
  const [matters, setMatters] = useState([]);
  const [form, setForm] = useState(() => initialForm(mode));
  const [term, setTerm] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const gabineteId = isSession ? searchParams.get('gabineteId') || profile.gabineteId || profile.vereadorId || currentUser?.uid || '' : commission?.gabineteId || '';
  const vereadorId = isSession ? searchParams.get('vereadorId') || profile.vereadorId || gabineteId : commission?.vereadorId || profile.vereadorId || gabineteId;
  const camaraId = isSession ? searchParams.get('camaraId') || profile.camaraId || settings?.tenant?.id || settings?.tenant?.slug || '' : commission?.camaraId || profile.camaraId || settings?.tenant?.id || settings?.tenant?.slug || '';
  const returnPath = isSession ? '/admin-legislativo' : `/admin-legislativo/comissao/${commissionId}`;

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    let active = true;
    getDoc(doc(firestore, 'users', currentUser.uid))
      .then(snapshot => active && setProfile(snapshot.data() || {}))
      .catch(error => active && setFeedback(error.message || 'Não foi possível identificar o usuário.'));
    return () => { active = false; };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (isSession || !commissionId) return undefined;
    return onSnapshot(doc(firestore, LEGISLATIVE_COLLECTIONS.commissions, commissionId), snapshot => {
      setCommission(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, error => setFeedback(error.message || 'Não foi possível carregar a comissão.'));
  }, [commissionId, isSession]);

  useEffect(() => {
    if (!gabineteId) return undefined;
    return onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.matters), where('gabineteId', '==', gabineteId)), snapshot => {
      setMatters(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, error => setFeedback(error.message || 'Não foi possível carregar as matérias.'));
  }, [gabineteId]);

  const eligibleMatters = useMemo(() => matters.filter(matter => {
    const eligible = isSession ? sessionEligibleStatuses.has(matter.status) : commissionEligibleStatuses.has(matter.status);
    if (!eligible) return false;
    if (!isSession && matter.commissionId && matter.commissionId !== commissionId) return false;
    return matchesMatter(matter, term);
  }), [commissionId, isSession, matters, term]);

  const toggleMatter = id => setForm(current => ({
    ...current,
    matterIds: current.matterIds.includes(id) ? current.matterIds.filter(item => item !== id) : [...current.matterIds, id],
  }));

  const createEvent = async event => {
    event.preventDefault();
    if (!form.title.trim() || !gabineteId || !camaraId || saving || (!isSession && !commission)) {
      setFeedback('Informe os dados obrigatórios e aguarde o carregamento da comissão.');
      return;
    }
    setSaving(true);
    setFeedback('');
    const remote = remoteFormats.has(form.format);
    try {
      const collectionName = isSession ? LEGISLATIVE_COLLECTIONS.sessions : LEGISLATIVE_COLLECTIONS.commissionMeetings;
      const record = {
        ...form,
        title: form.title.trim(),
        gabineteId,
        vereadorId,
        camaraId,
        status: isSession ? 'Em elaboração' : 'Convocada',
        createdBy: currentUser?.uid || '',
        virtualRoomStatus: remote ? 'Solicitada' : 'Não aplicável',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(isSession ? {} : { commissionId: commission.id, commissionName: commission.name || 'Comissão' }),
      };
      const created = await addDoc(collection(firestore, collectionName), record);

      if (isSession && form.matterIds.length) {
        await Promise.all(form.matterIds.map(matterId => updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.matters, matterId), {
          status: LEGISLATIVE_STAGES.AGENDA,
          agendaSessionId: created.id,
          updatedAt: serverTimestamp(),
        })));
      }
      if (!isSession && form.matterIds.length) {
        await Promise.all(form.matterIds.map(matterId => updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.matters, matterId), {
          commissionId: commission.id,
          commissionName: commission.name || 'Comissão',
          commissionAgendaMeetingId: created.id,
          commissionAgendaMeetingTitle: record.title,
          updatedAt: serverTimestamp(),
        })));
      }

      if (remote) {
        try {
          const conference = await VideoConferenceService.createRoom({
            councilId: camaraId,
            referenceId: created.id,
            type: isSession ? 'PLENARY_SESSION' : 'COMMISSION_MEETING',
            title: form.title.trim(),
            scheduledAt: form.date || null,
          });
          await updateDoc(created, { conferenceId: conference.id, virtualRoomStatus: 'Preparada', virtualRoomRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } catch (conferenceError) {
          await updateDoc(created, { virtualRoomStatus: 'Solicitada', virtualRoomRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
      }
      navigate(isSession ? `/admin-legislativo/sessao/${created.id}` : `/admin-legislativo/reuniao/${created.id}`);
    } catch (error) {
      setFeedback(error.message || `Não foi possível criar ${isSession ? 'a sessão' : 'a reunião'}.`);
      setSaving(false);
    }
  };

  const title = isSession ? 'Nova sessão plenária' : 'Nova reunião da comissão';
  const remote = remoteFormats.has(form.format);
  const subtitle = isSession
    ? 'Defina a pauta a partir das matérias aptas para discussão e votação no Plenário.'
    : `Convocação e pauta da ${commission?.name || 'comissão'} com matérias aptas para análise.`;

  return <div className="dashboard-layout">
    <AdminSidebar />
    <main className="dashboard-content cabinet-page-content legislative-page">
      <header className="page-header-container legislative-matter-page-header">
        <Link className="legislative-back-link" to={returnPath}><LiaArrowLeftSolid /> Voltar</Link>
        <div><span className="escola-kicker">{isSession ? 'SESSÃO PLENÁRIA' : 'REUNIÃO DE COMISSÃO'}</span><h1>{title}</h1><p>{subtitle}</p></div>
      </header>
      {feedback && <p className="cabinet-feedback">{feedback}</p>}
      <form className="legislative-event-form" onSubmit={createEvent}>
        <section className="legislative-event-card">
          <div className="cabinet-section-heading"><div><h2><LiaCalendarAltSolid /> Dados da convocação</h2><p>As informações serão exibidas na pauta e no histórico institucional.</p></div>{remote && <span className="legislative-remote-badge"><LiaVideoSolid /> Sala automática</span>}</div>
          <label>Título<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder={isSession ? 'Ex.: 10ª Sessão Ordinária' : 'Ex.: Reunião ordinária da comissão'} /></label>
          <div className="form-row"><label>{isSession ? 'Tipo' : 'Natureza'}<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>{(isSession ? ['Ordinária', 'Extraordinária', 'Especial', 'Solene', 'Audiência pública'] : ['Reunião ordinária', 'Reunião extraordinária', 'Audiência pública']).map(value => <option key={value}>{value}</option>)}</select></label><label>Formato<select value={form.format} onChange={event => setForm({ ...form, format: event.target.value })}>{['Presencial', 'Remota', 'Híbrida'].map(value => <option key={value}>{value}</option>)}</select></label></div>
          <div className="form-row"><label>Data<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>Horário<input type="time" value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label></div>
          <label>Local{remote ? ' de apoio' : ''}<input value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} placeholder={remote ? 'Ex.: Plenário da Câmara' : 'Ex.: Plenário da Câmara'} /></label>
          {isSession && <label>URL de transmissão pública<input type="url" value={form.broadcastUrl} onChange={event => setForm({ ...form, broadcastUrl: event.target.value })} placeholder="https://..." /></label>}
          <label>Pauta e orientações<textarea value={form.agenda} onChange={event => setForm({ ...form, agenda: event.target.value })} placeholder="Ordem dos trabalhos, informes e orientações aos participantes." /></label>
        </section>
        <section className="legislative-event-card legislative-event-matters">
          <div className="cabinet-section-heading"><div><h2>Matérias aptas para {isSession ? 'discussão e votação' : 'análise da comissão'}</h2><p>{form.matterIds.length} matéria(s) selecionada(s) para a pauta.</p></div></div>
          <label className="legislative-event-search"><LiaSearchSolid /><input value={term} onChange={event => setTerm(event.target.value)} placeholder="Pesquisar por número, tipo, ementa, autor ou assunto" /></label>
          <div className="legislative-event-matter-list">
            {eligibleMatters.map(matter => <label className={`legislative-event-matter ${form.matterIds.includes(matter.id) ? 'selected' : ''}`} key={matter.id}><input type="checkbox" checked={form.matterIds.includes(matter.id)} onChange={() => toggleMatter(matter.id)} /><div><strong>{matter.type} nº {matter.number}/{matter.year}</strong><p>{matter.title || matter.summary || matter.subject || 'Sem ementa cadastrada.'}</p><small>{matter.authorName || 'Autor não informado'} · {matter.status}</small></div></label>)}
            {!eligibleMatters.length && <p className="cabinet-empty-state">Nenhuma matéria apta foi encontrada com os filtros atuais.</p>}
          </div>
        </section>
        <div className="legislative-event-actions"><Link className="btn-secondary" to={returnPath}>Cancelar</Link><button className="btn-primary" disabled={saving}>{saving ? 'Criando…' : remote ? `Criar ${isSession ? 'sessão' : 'reunião'} e gerar sala` : `Criar ${isSession ? 'sessão e pauta' : 'reunião e pauta'}`}</button></div>
      </form>
    </main>
  </div>;
}
