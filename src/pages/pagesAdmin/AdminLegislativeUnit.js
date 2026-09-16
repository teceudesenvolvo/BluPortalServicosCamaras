import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaCalendarAltSolid, LiaClipboardListSolid, LiaFileAltSolid, LiaUsersSolid, LiaVideoSolid } from 'react-icons/lia';
import { firestore } from '../../firebase';
import { LEGISLATIVE_COLLECTIONS } from '../../config/legislativeDataModel';
import { VideoConferenceService } from '../../services/VideoConferenceService';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { isSystemRootEmail } from '../../config/systemModules';
import LegislativeVideoConference from '../../components/LegislativeVideoConference';
import AdminSidebar from '../../components/AdminSidebar';

const blankMeeting = () => ({ title: '', date: '', time: '', format: 'Presencial', location: '', agenda: '', result: '' });
const blankCommission = () => ({ name: '', description: '', type: 'Permanente', startsAt: '', presidentId: '', vicePresidentId: '', memberIds: [], alternateIds: [], status: 'Ativa' });

export default function AdminLegislativeUnit() {
  const { role, currentUser } = useAuth();
  const { settings } = useSystemControl();
  const { unitType, unitId } = useParams();
  const navigate = useNavigate();
  const isCommission = unitType === 'comissao';
  const isMeeting = unitType === 'reuniao';
  const collectionName = isCommission
    ? LEGISLATIVE_COLLECTIONS.commissions
    : isMeeting ? LEGISLATIVE_COLLECTIONS.commissionMeetings : LEGISLATIVE_COLLECTIONS.sessions;
  const [unit, setUnit] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [matters, setMatters] = useState([]);
  const [error, setError] = useState('');
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState(blankMeeting);
  const [meetingSubmitting, setMeetingSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conference, setConference] = useState(null);
  const [conferenceBusy, setConferenceBusy] = useState(false);
  const [councilors, setCouncilors] = useState([]);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionForm, setCommissionForm] = useState(blankCommission);
  const [commissionSubmitting, setCommissionSubmitting] = useState(false);
  const isAdmin = ['Admin', 'Administrador'].includes(role) || isSystemRootEmail(settings, currentUser?.email);

  useEffect(() => onSnapshot(
    doc(firestore, collectionName, unitId),
    snapshot => setUnit(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    currentError => setError(currentError.message),
  ), [collectionName, unitId]);

  useEffect(() => onSnapshot(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')), snapshot => setCouncilors(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setCouncilors([])), []);
  useEffect(() => { if (isCommission && unit) setCommissionForm({ ...blankCommission(), ...unit, memberIds: unit.memberIds || [], alternateIds: unit.alternateIds || [] }); }, [isCommission, unit]);

  useEffect(() => {
    if (!isCommission || !unit?.id) return undefined;
    return onSnapshot(
      query(collection(firestore, LEGISLATIVE_COLLECTIONS.commissionMeetings), where('commissionId', '==', unit.id)),
      snapshot => setMeetings(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      currentError => setError(currentError.message),
    );
  }, [isCommission, unit]);

  useEffect(() => {
    const scopeField = isCommission && unit?.camaraId ? 'camaraId' : 'gabineteId';
    const scopeId = unit?.[scopeField];
    if (!scopeId) return undefined;
    return onSnapshot(
      query(collection(firestore, LEGISLATIVE_COLLECTIONS.matters), where(scopeField, '==', scopeId)),
      snapshot => setMatters(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      currentError => setError(currentError.message),
    );
  }, [isCommission, unit]);

  useEffect(() => {
    if (!unit?.gabineteId || isCommission) return undefined;
    return onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.videoConferences), where('gabineteId', '==', unit.gabineteId), where('referenceId', '==', unit.id)), snapshot => setConference(snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null), currentError => setError(currentError.message));
  }, [isCommission, unit]);

  const linkedMatters = useMemo(() => {
    const ids = unit?.matterIds || [];
    if (isCommission) {
      return matters.filter(item => ids.includes(item.id)
        || item.commissionId === unit?.id
        || item.assignedCommissionId === unit?.id);
    }
    return matters.filter(item => ids.includes(item.id));
  }, [isCommission, matters, unit]);
  const commissionMatters = useMemo(() => matters.filter(item => item.commissionId === unit?.id
    || item.assignedCommissionId === unit?.id
    || (unit?.matterIds || []).includes(item.id)), [matters, unit?.id, unit?.matterIds]);

  const kicker = isCommission ? 'COMISSÃO LEGISLATIVA' : isMeeting ? 'REUNIÃO DE COMISSÃO' : 'SESSÃO PLENÁRIA';
  const title = unit?.name || unit?.title || 'Carregando…';
  const description = isCommission
    ? unit?.description || 'Composição, competências, reuniões, matérias e relatorias.'
    : `${unit?.type || (isMeeting ? 'Reunião de comissão' : 'Sessão')} · ${unit?.date || 'Data a definir'}${unit?.time ? ` às ${unit.time}` : ''}`;

  const createMeeting = async event => {
    event.preventDefault();
    if (!unit || !meetingForm.title.trim() || meetingSubmitting) return;
    setMeetingSubmitting(true);
    try {
      const snapshot = { ...meetingForm };
      const created = await addDoc(collection(firestore, LEGISLATIVE_COLLECTIONS.commissionMeetings), {
        ...snapshot,
        commissionId: unit.id,
        commissionName: unit.name || 'Comissão',
        gabineteId: unit.gabineteId,
        camaraId: unit.camaraId || '',
        vereadorId: unit.vereadorId || '',
        matterIds: [],
        attendanceIds: [],
        status: 'Convocada',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMeetingForm(blankMeeting());
      setMeetingOpen(false);
      if (['Remota', 'Virtual', 'Híbrida'].includes(snapshot.format)) {
        setError('');
        VideoConferenceService.createRoom({ councilId: unit.camaraId, referenceId: created.id, type: 'COMMISSION_MEETING', title: snapshot.title, scheduledAt: snapshot.date || null })
          .catch(() => setError('Reunião criada. A sala segura será preparada automaticamente pelo serviço de videoconferência.'));
      }
    } catch (currentError) {
      setError(currentError.message || 'Não foi possível criar a reunião.');
    } finally {
      setMeetingSubmitting(false);
    }
  };

  const createConference = async () => {
    if (!unit || isCommission) return;
    setConferenceBusy(true); setError('');
    try {
      const created = await VideoConferenceService.createRoom({
        councilId: unit.camaraId,
        referenceId: unit.id,
        type: isMeeting ? 'COMMISSION_MEETING' : 'PLENARY_SESSION',
        title: unit.title || unit.name,
        scheduledAt: unit.date || null,
      });
      setConference(created);
    } catch (currentError) {
      setError(currentError.message || 'Não foi possível preparar a videoconferência.');
    } finally { setConferenceBusy(false); }
  };

  const canRemoveCommission = isCommission && isAdmin && !meetings.length && !commissionMatters.length;
  const personName = id => { const person = councilors.find(item => item.id === id); return person?.name || person?.nome || person?.email || id || 'Não definido'; };
  const saveCommission = async event => {
    event.preventDefault();
    if (!isCommission || !isAdmin || !unit || !commissionForm.name.trim() || commissionSubmitting) return;
    setCommissionSubmitting(true);
    try {
      const previous = { name: unit.name || '', description: unit.description || '', type: unit.type || '', startsAt: unit.startsAt || '', presidentId: unit.presidentId || '', vicePresidentId: unit.vicePresidentId || '', memberIds: unit.memberIds || [], alternateIds: unit.alternateIds || [], status: unit.status || '' };
      const changed = Object.keys(previous).filter(key => JSON.stringify(previous[key]) !== JSON.stringify(commissionForm[key]));
      await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.commissions, unit.id), { ...commissionForm, updatedAt: serverTimestamp(), editHistory: arrayUnion({ changedFields: changed, editedAt: new Date().toISOString(), editedBy: currentUser?.uid || '', editedByName: currentUser?.displayName || currentUser?.email || 'Administrador' }) });
      setCommissionOpen(false);
      setError('');
    } catch (currentError) {
      setError(currentError.message || 'Não foi possível salvar a comissão.');
    } finally {
      setCommissionSubmitting(false);
    }
  };
  const removeCommission = async () => {
    if (!canRemoveCommission || !unit || deleting) return;
    if (meetings.length) {
      setError('Não é possível excluir uma comissão que possui reuniões registradas.');
      return;
    }
    if (commissionMatters.length) {
      setError('Não é possível excluir uma comissão que possui matérias vinculadas.');
      return;
    }
    if (!window.confirm(`Excluir definitivamente a comissão “${unit.name}”?`)) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.commissions, unit.id));
      navigate('/admin-legislativo');
    } catch (currentError) {
      setError(currentError.message || 'Não foi possível excluir a comissão.');
    } finally {
      setDeleting(false);
    }
  };

  const canRemoveMeeting = isMeeting && isAdmin && ['convocada', 'em elaboração', 'cancelada', 'cancelado']
    .includes(String(unit?.status || '').trim().toLowerCase());
  const removeMeeting = async () => {
    if (!canRemoveMeeting || !unit || deleting) return;
    if (!window.confirm(`Excluir a reunião “${unit.title || unit.name}”? Esta ação não poderá ser desfeita.`)) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.commissionMeetings, unit.id));
      navigate(unit.commissionId ? `/admin-legislativo/comissao/${unit.commissionId}` : '/admin-legislativo');
    } catch (currentError) {
      setError(currentError.message || 'Não foi possível excluir a reunião.');
    } finally {
      setDeleting(false);
    }
  };

  const commissionModal = isCommission && commissionOpen && createPortal(
    <div className="cabinet-inline-modal" role="dialog" aria-modal="true" onMouseDown={() => setCommissionOpen(false)}>
      <form className="cabinet-modal-form legislative-matter-detail" onSubmit={saveCommission} onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h3>Editar comissão</h3><p>As alterações ficam registradas no histórico da comissão.</p></div><button type="button" className="modal-close-btn" aria-label="Fechar" onClick={() => setCommissionOpen(false)}>×</button></div>
        <label>Nome<input required value={commissionForm.name} onChange={event => setCommissionForm({ ...commissionForm, name: event.target.value })} /></label>
        <label>Descrição<textarea value={commissionForm.description} onChange={event => setCommissionForm({ ...commissionForm, description: event.target.value })} /></label>
        <div className="form-row"><label>Tipo<select value={commissionForm.type} onChange={event => setCommissionForm({ ...commissionForm, type: event.target.value })}>{['Permanente', 'Temporária', 'Especial', 'CPI'].map(value => <option key={value}>{value}</option>)}</select></label><label>Início da vigência<input type="date" value={commissionForm.startsAt} onChange={event => setCommissionForm({ ...commissionForm, startsAt: event.target.value })} /></label></div>
        <div className="form-row"><label>Presidente<select value={commissionForm.presidentId} onChange={event => setCommissionForm({ ...commissionForm, presidentId: event.target.value })}><option value="">Selecione</option>{councilors.map(item => <option key={item.id} value={item.id}>{item.name || item.nome || item.email}</option>)}</select></label><label>Vice-presidente<select value={commissionForm.vicePresidentId} onChange={event => setCommissionForm({ ...commissionForm, vicePresidentId: event.target.value })}><option value="">Selecione</option>{councilors.map(item => <option key={item.id} value={item.id}>{item.name || item.nome || item.email}</option>)}</select></label></div>
        <label>Membros titulares<select multiple value={commissionForm.memberIds} onChange={event => setCommissionForm({ ...commissionForm, memberIds: [...event.target.selectedOptions].map(option => option.value) })}>{councilors.map(item => <option key={item.id} value={item.id}>{item.name || item.nome || item.email}</option>)}</select></label>
        <label>Membros suplentes<select multiple value={commissionForm.alternateIds} onChange={event => setCommissionForm({ ...commissionForm, alternateIds: [...event.target.selectedOptions].map(option => option.value) })}>{councilors.map(item => <option key={item.id} value={item.id}>{item.name || item.nome || item.email}</option>)}</select></label>
        <label>Situação<select value={commissionForm.status} onChange={event => setCommissionForm({ ...commissionForm, status: event.target.value })}>{['Ativa', 'Inativa'].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setCommissionOpen(false)}>Cancelar</button><button className="btn-primary" disabled={commissionSubmitting}>{commissionSubmitting ? 'Salvando…' : 'Salvar alterações'}</button></div>
      </form>
    </div>, document.body,
  );

  const meetingModal = isCommission && meetingOpen && createPortal(
    <div className="cabinet-inline-modal" role="dialog" aria-modal="true" onMouseDown={() => setMeetingOpen(false)}>
      <form className="cabinet-modal-form legislative-matter-detail" onSubmit={createMeeting} onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h3>Nova reunião da comissão</h3><p>A reunião será vinculada exclusivamente a {unit?.name}.</p></div><button type="button" className="modal-close-btn" aria-label="Fechar" onClick={() => setMeetingOpen(false)}>×</button></div>
        <label>Título<input required value={meetingForm.title} onChange={event => setMeetingForm({ ...meetingForm, title: event.target.value })} placeholder="Ex.: Reunião ordinária" /></label>
        <div className="form-row"><label>Data<input type="date" value={meetingForm.date} onChange={event => setMeetingForm({ ...meetingForm, date: event.target.value })} /></label><label>Horário<input type="time" value={meetingForm.time} onChange={event => setMeetingForm({ ...meetingForm, time: event.target.value })} /></label></div>
        <div className="form-row"><label>Formato<select value={meetingForm.format} onChange={event => setMeetingForm({ ...meetingForm, format: event.target.value })}>{['Presencial', 'Remota', 'Híbrida'].map(value => <option key={value}>{value}</option>)}</select></label><label>Local ou sala virtual<input value={meetingForm.location} onChange={event => setMeetingForm({ ...meetingForm, location: event.target.value })} /></label></div>
        <label>Pauta<textarea value={meetingForm.agenda} onChange={event => setMeetingForm({ ...meetingForm, agenda: event.target.value })} placeholder="Itens e matérias que serão apreciados" /></label>
        <button className="btn-primary" disabled={meetingSubmitting}>{meetingSubmitting ? 'Criando reunião…' : 'Criar reunião'}</button>
      </form>
    </div>, document.body,
  );

  return <div className="dashboard-layout">
    <AdminSidebar />
    <main className="dashboard-content cabinet-page-content legislative-page">
      <header className="page-header-container legislative-matter-page-header">
        <Link className="legislative-back-link" to="/admin-legislativo"><LiaArrowLeftSolid /> Gestão legislativa</Link>
        <div><span className="escola-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div>
      </header>
      {error && <p className="cabinet-feedback">{error}</p>}
      {unit && <section className="legislative-matter-page">
        <section className="legislative-matter-summary">
          <div>
            <span className="escola-kicker">SITUAÇÃO</span><h2>{unit.status || 'Em elaboração'}</h2>
            <p>{isCommission ? `${unit.type || 'Comissão'} · vigência iniciada em ${unit.startsAt || 'data não informada'}` : `${unit.format || 'Presencial'} · ${unit.location || 'Local a definir'}`}</p>
          </div>
          <dl>
            {isCommission ? <>
              <div><dt>Titulares</dt><dd>{(unit.memberIds || []).length}</dd></div>
              <div><dt>Reuniões</dt><dd>{meetings.length}</dd></div>
              <div><dt>Matérias em análise</dt><dd>{linkedMatters.length}</dd></div>
            </> : <>
              <div><dt>Matérias na pauta</dt><dd>{linkedMatters.length}</dd></div>
              <div><dt>Participantes</dt><dd>{(unit.attendanceIds || []).length}</dd></div>
              <div><dt>Formato</dt><dd>{unit.format || 'Presencial'}</dd></div>
            </>}
          </dl>
        </section>

        <div className="legislative-matter-page-grid">
          {isCommission ? <>
            <section className="legislative-matter-section">
              <h2><LiaUsersSolid /> Composição e atribuições</h2>
              <p>{unit.description || 'Sem descrição cadastrada.'}</p>
              <dl className="legislative-data-grid">
                <div><dt>Presidente</dt><dd>{personName(unit.presidentId)}</dd></div>
                <div><dt>Vice-presidente</dt><dd>{personName(unit.vicePresidentId)}</dd></div>
                <div><dt>Membros titulares</dt><dd>{(unit.memberIds || []).map(personName).join(', ') || 'Não definidos'}</dd></div>
                <div><dt>Membros suplentes</dt><dd>{(unit.alternateIds || []).map(personName).join(', ') || 'Não definidos'}</dd></div>
              </dl>
            </section>
            <section className="legislative-matter-section">
              <h2><LiaClipboardListSolid /> Histórico de edições</h2>
              <div className="cabinet-list">
                {(unit.editHistory || []).slice().reverse().map((item, index) => <article className="cabinet-event-row" key={`${item.editedAt}-${index}`}><div><strong>{item.editedByName || 'Administrador'}</strong><p>{item.changedFields?.length ? `Alterou: ${item.changedFields.join(', ')}.` : 'Atualizou os dados da comissão.'}</p><small>{item.editedAt ? new Date(item.editedAt).toLocaleString('pt-BR') : 'Data não registrada'}</small></div></article>)}
                {!(unit.editHistory || []).length && <p>Nenhuma edição registrada.</p>}
              </div>
            </section>
            <section className="legislative-matter-section">
              <h2><LiaClipboardListSolid /> Matérias e relatorias</h2>
              <div className="legislative-unit-card-grid">
                {linkedMatters.map(item => <Link className="legislative-unit-card" key={item.id} to={`/admin-legislativo/comissao/${unit.id}/materia/${item.id}`}>
                  <div><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><p>{item.title || item.subject || 'Sem ementa informada.'}</p><small>Relatoria: {item.rapporteurName || item.rapporteurId || 'A definir'}</small></div><small>{item.status || 'Em análise'}</small>
                </Link>)}
                {!linkedMatters.length && <p>Nenhuma matéria distribuída para análise.</p>}
              </div>
            </section>
            <section className="legislative-matter-section">
              <div className="cabinet-section-heading"><h2><LiaCalendarAltSolid /> Reuniões e deliberações</h2><button className="btn-primary cabinet-small-button" onClick={() => navigate(`/admin-legislativo/comissao/${unit.id}/reuniao/nova`)}>Nova reunião</button></div>
              <div className="legislative-unit-card-grid">
                {meetings.map(item => <Link className="legislative-unit-card" key={item.id} to={`/admin-legislativo/reuniao/${item.id}`}>
                  <div><strong>{item.title}</strong><p>{item.date || 'Data a definir'}{item.time ? ` às ${item.time}` : ''} · {item.format || 'Presencial'}</p><small>{item.result || item.agenda || 'Pauta e deliberações a registrar.'}</small></div><small>{item.status || 'Convocada'}</small>
                </Link>)}
                {!meetings.length && <p>Nenhuma reunião cadastrada.</p>}
              </div>
            </section>
          </> : <>
            <section className="legislative-matter-section">
              <h2><LiaCalendarAltSolid /> Pauta e participação</h2>
              <dl className="legislative-data-grid">
                <div><dt>Formato</dt><dd>{unit.format || 'Presencial'}</dd></div>
                <div><dt>Local ou sala virtual</dt><dd>{unit.location || unit.virtualRoomUrl || 'Não informado'}</dd></div>
                <div><dt>Transmissão</dt><dd>{unit.broadcastUrl || 'Não informada'}</dd></div>
                <div><dt>Presenças</dt><dd>{(unit.attendanceIds || []).join(', ') || 'Ainda não registradas'}</dd></div>
              </dl>
              <h3>Pauta</h3><p>{unit.agenda || 'Nenhuma pauta detalhada foi registrada.'}</p>
            </section>
            <section className="legislative-matter-section">
              <h2><LiaClipboardListSolid /> Matérias e deliberações</h2>
              <div className="cabinet-list">
                {linkedMatters.map(item => <Link className="cabinet-event-row" key={item.id} to={`/admin-legislativo/materia/${item.id}`}><div><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><p>{item.title || item.subject || 'Sem ementa informada.'}</p></div><small>{item.status || 'Em pauta'}</small></Link>)}
                {!linkedMatters.length && <p>Nenhuma matéria vinculada à pauta.</p>}
              </div>
              <h3>Resultado e encaminhamentos</h3><p>{unit.result || 'Deliberações ainda não registradas.'}</p>
            </section>
            {['Remota', 'Virtual', 'Híbrida'].includes(unit.format) && <section className="legislative-matter-section">
              <div className="cabinet-section-heading"><div><h2><LiaVideoSolid /> Videoconferência Câmara AI</h2><p>Áudio, vídeo e compartilhamento integrados. Pauta, presença e votação continuam no Plenário Digital.</p></div>{!conference && <button className="btn-primary cabinet-small-button" onClick={createConference} disabled={conferenceBusy}>{conferenceBusy ? 'Preparando…' : 'Preparar sala segura'}</button>}</div>
              {conference && <LegislativeVideoConference conference={conference} />}
            </section>}
          </>}
          <aside className="legislative-matter-aside">
            <LiaFileAltSolid /><strong>{isCommission ? 'Gestão da comissão' : isMeeting ? 'Ficha da reunião' : 'Gestão da sessão'}</strong>
            <p>{isCommission ? 'Acompanhe a composição, as matérias distribuídas, as relatorias e o histórico de reuniões.' : 'Consulte pauta, presença, formato, matérias e as deliberações registradas.'}</p>
            {isMeeting && unit.commissionId && <Link to={`/admin-legislativo/comissao/${unit.commissionId}`}>Abrir comissão</Link>}
            {isCommission && isAdmin && <button type="button" className="btn-secondary" onClick={() => setCommissionOpen(true)}>Editar comissão</button>}
            {canRemoveCommission && <button type="button" className="btn-danger legislative-delete-button" onClick={removeCommission} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir comissão'}</button>}
            {canRemoveMeeting && <button type="button" className="btn-danger legislative-delete-button" onClick={removeMeeting} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir reunião'}</button>}
            <Link to="/admin-legislativo">Voltar à gestão legislativa</Link>
          </aside>
        </div>
      </section>}
      {commissionModal}{meetingModal}
    </main>
  </div>;
}
