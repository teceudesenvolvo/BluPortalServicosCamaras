import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { LiaArrowLeftSolid, LiaCalendarAltSolid, LiaClipboardListSolid, LiaFileAltSolid, LiaGavelSolid, LiaMicrophoneSlashSolid, LiaMicrophoneSolid, LiaMinusSolid, LiaPlusSolid, LiaUndoSolid, LiaUserPlusSolid, LiaUsersSolid, LiaVideoSolid } from 'react-icons/lia';
import { firestore } from '../../firebase';
import { LEGISLATIVE_COLLECTIONS } from '../../config/legislativeDataModel';
import { VideoConferenceService } from '../../services/VideoConferenceService';
import { LEGISLATIVE_STAGES, makeProceeding } from '../../services/LegislativeProcessService';
import { useAuth } from '../../contexts/FirebaseAuthContext';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { isSystemRootEmail } from '../../config/systemModules';
import LegislativeVideoConference from '../../components/LegislativeVideoConference';
import AdminSidebar from '../../components/AdminSidebar';

const blankMeeting = () => ({ title: '', date: '', time: '', format: 'Presencial', location: '', agenda: '', result: '' });
const blankCommission = () => ({ name: '', description: '', type: 'Permanente', startsAt: '', presidentId: '', vicePresidentId: '', memberIds: [], alternateIds: [], status: 'Ativa' });
const blankSessionVote = () => ({ matterId: '', type: 'Nominal', turn: 'Turno único', quorum: 'Maioria simples', values: {} });
const blankSessionManagement = () => ({ title: '', description: '', date: '', time: '', format: 'Presencial', location: '', agenda: '', broadcastUrl: '', status: 'Agendada', matterIds: [], managementReason: '' });

export default function AdminLegislativeUnit() {
  const { role, currentUser } = useAuth();
  const { settings } = useSystemControl();
  const { unitType, unitId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isCommission = unitType === 'comissao';
  const isMeeting = unitType === 'reuniao';
  const isCommissionWorkspace = isCommission && location.pathname.endsWith('/trabalho');
  const isSessionControls = !isCommission && !isMeeting && location.pathname.endsWith('/controles');
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
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersForm, setMembersForm] = useState({ memberIds: [], alternateIds: [] });
  const [membersSubmitting, setMembersSubmitting] = useState(false);
  const [commissionWorkspaceTab, setCommissionWorkspaceTab] = useState('agenda');
  const [sessionVoteOpen, setSessionVoteOpen] = useState(false);
  const [sessionVoteForm, setSessionVoteForm] = useState(blankSessionVote);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionVotes, setSessionVotes] = useState([]);
  const [sessionMinutes, setSessionMinutes] = useState([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const [sessionManagementOpen, setSessionManagementOpen] = useState(false);
  const [sessionManagementForm, setSessionManagementForm] = useState(blankSessionManagement);
  const [sessionManagementSaving, setSessionManagementSaving] = useState(false);
  const [sessionOverviewOpen, setSessionOverviewOpen] = useState(false);
  const [sessionMatterDetail, setSessionMatterDetail] = useState(null);
  const isAdmin = ['Admin', 'Administrador'].includes(role) || isSystemRootEmail(settings, currentUser?.email);
  const isCommissionPresident = isCommission && unit?.presidentId === currentUser?.uid;
  const canManageCommissionMembers = isAdmin || isCommissionPresident;
  const canManageSession = isAdmin || currentUser?.legislativePermissions?.includes('legislative.presidency');
  const isCurrentUserCouncilor = councilors.some(person => person.id === currentUser?.uid);
  const canRegisterAttendanceFor = councilorId => canManageSession || (isCurrentUserCouncilor && councilorId === currentUser?.uid);

  useEffect(() => onSnapshot(
    doc(firestore, collectionName, unitId),
    snapshot => setUnit(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    currentError => setError(currentError.message),
  ), [collectionName, unitId]);
  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(''), 20000);
    return () => window.clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (!isSessionControls || !unit?.activeSpeakerId || !unit?.speakerTimerRunning) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isSessionControls, unit?.activeSpeakerId, unit?.speakerTimerRunning]);

  useEffect(() => onSnapshot(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')), snapshot => setCouncilors(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setCouncilors([])), []);
  useEffect(() => { if (isCommission && unit) setCommissionForm({ ...blankCommission(), ...unit, memberIds: unit.memberIds || [], alternateIds: unit.alternateIds || [] }); }, [isCommission, unit]);
  useEffect(() => { if (isCommission && unit) setMembersForm({ memberIds: unit.memberIds || [], alternateIds: unit.alternateIds || [] }); }, [isCommission, unit]);

  useEffect(() => {
    if (!isCommission || !unit?.id) return undefined;
    return onSnapshot(
      query(collection(firestore, LEGISLATIVE_COLLECTIONS.commissionMeetings), where('commissionId', '==', unit.id)),
      snapshot => setMeetings(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      currentError => setError(currentError.message),
    );
  }, [isCommission, unit]);

  useEffect(() => {
    if (isCommission || isMeeting || !unit?.gabineteId) return undefined;
    return onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.votes), where('gabineteId', '==', unit.gabineteId)), snapshot => setSessionVotes(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.sessionId === unit.id)), currentError => setError(currentError.message));
  }, [isCommission, isMeeting, unit]);
  useEffect(() => {
    if (isCommission || isMeeting || !unit?.gabineteId) return undefined;
    return onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.minutes), where('gabineteId', '==', unit.gabineteId)), snapshot => setSessionMinutes(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.sessionId === unit.id)), currentError => setError(currentError.message));
  }, [isCommission, isMeeting, unit]);

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
  const activeVotingMatter = useMemo(() => unit?.currentMatterPhase === 'voting' ? linkedMatters.find(item => item.id === unit.currentMatterId) : null, [linkedMatters, unit?.currentMatterId, unit?.currentMatterPhase]);
  const commissionMatters = useMemo(() => matters.filter(item => item.commissionId === unit?.id
    || item.assignedCommissionId === unit?.id
    || (unit?.matterIds || []).includes(item.id)), [matters, unit?.id, unit?.matterIds]);
  const agendaMatters = useMemo(() => linkedMatters.filter(item => ['Em análise pelo relator', 'Aguardando pauta da comissão'].includes(item.status) || item.commissionAgendaMeetingId), [linkedMatters]);
  const myRapporteurships = useMemo(() => linkedMatters.filter(item => item.rapporteurId === currentUser?.uid), [linkedMatters, currentUser?.uid]);

  const kicker = isCommissionWorkspace ? 'TRABALHO DA COMISSÃO' : isCommission ? 'COMISSÃO LEGISLATIVA' : isMeeting ? 'REUNIÃO DE COMISSÃO' : isSessionControls ? 'CONTROLES DA SESSÃO' : 'SESSÃO PLENÁRIA';
  const title = isCommissionWorkspace ? `Trabalho · ${unit?.name || 'Comissão legislativa'}` : isSessionControls ? `Controles · ${unit?.title || 'Sessão legislativa'}` : unit?.name || unit?.title || 'Carregando…';
  const description = isCommissionWorkspace ? 'Pautas, reuniões, relatorias e votações da comissão.' : isCommission
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

  const updateSessionStatus = async status => {
    if (!unit || isCommission || isMeeting || !canManageSession || sessionBusy) return;
    setSessionBusy(true);
    try {
      await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { status, publicPanel: status === 'Aberta', ...(status === 'Aberta' ? { startedAt: serverTimestamp() } : { endedAt: serverTimestamp() }), updatedAt: serverTimestamp() });
      setError(status === 'Aberta' ? 'Sessão aberta. O painel do plenário já pode acompanhar a operação.' : 'Sessão encerrada. A ata poderá ser registrada pela Secretaria.');
    } catch (currentError) { setError(currentError.message || 'Não foi possível atualizar o status da sessão.'); } finally { setSessionBusy(false); }
  };
  const toggleAttendance = async councilorId => {
    if (!unit || isCommission || isMeeting || !canRegisterAttendanceFor(councilorId) || sessionBusy) return;
    const attendanceIds = (unit.attendanceIds || []).includes(councilorId) ? unit.attendanceIds.filter(id => id !== councilorId) : [...(unit.attendanceIds || []), councilorId];
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { attendanceIds, updatedAt: serverTimestamp() }); } catch (currentError) { setError(currentError.message || 'Não foi possível registrar a presença.'); } finally { setSessionBusy(false); }
  };
  const addSpeakerToQueue = async councilorId => {
    if (!unit || isCommission || isMeeting || !canManageSession || sessionBusy || (unit.speakerQueue || []).includes(councilorId)) return;
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { speakerQueue: [...(unit.speakerQueue || []), councilorId], updatedAt: serverTimestamp() }); } catch (currentError) { setError(currentError.message || 'Não foi possível incluir o parlamentar na fila.'); } finally { setSessionBusy(false); }
  };
  const callNextSpeaker = async () => {
    if (!unit || isCommission || isMeeting || !canManageSession || sessionBusy || !(unit.speakerQueue || []).length) return;
    const [nextSpeakerId, ...speakerQueue] = unit.speakerQueue;
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { activeSpeakerId: nextSpeakerId, speakerQueue, speakerMicrophoneCut: false, speakerTimerStartedAt: new Date().toISOString(), speakerTimerRunning: true, speakerElapsedSeconds: 0, speakerDurationSeconds: unit.speakerDurationSeconds || 300, updatedAt: serverTimestamp() }); } catch (currentError) { setError(currentError.message || 'Não foi possível chamar o próximo orador.'); } finally { setSessionBusy(false); }
  };
  const finishSpeaker = async () => {
    if (!unit || isCommission || isMeeting || !canManageSession || sessionBusy || !unit.activeSpeakerId) return;
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { activeSpeakerId: '', speakerMicrophoneCut: false, speakerTimerRunning: false, speakerElapsedSeconds: 0, speakerTimerStartedAt: '', updatedAt: serverTimestamp() }); } catch (currentError) { setError(currentError.message || 'Não foi possível encerrar a fala.'); } finally { setSessionBusy(false); }
  };
  const timerStartMs = unit?.speakerTimerStartedAt?.toDate ? unit.speakerTimerStartedAt.toDate().getTime() : unit?.speakerTimerStartedAt ? new Date(unit.speakerTimerStartedAt).getTime() : 0;
  const timerElapsed = (unit?.speakerElapsedSeconds || 0) + (unit?.speakerTimerRunning && timerStartMs ? Math.max(0, Math.floor((clockNow - timerStartMs) / 1000)) : 0);
  const speakerConcessionSeconds = Object.values(unit?.speakerTimeConcessions || {}).filter(item => item?.speakerId === unit?.activeSpeakerId && item?.matterId === unit?.currentMatterId).reduce((total, item) => total + (item.seconds || 0), 0);
  const baseTimerDuration = unit?.speakerDurationSeconds || 300;
  const timerDuration = baseTimerDuration + speakerConcessionSeconds;
  const timerRemaining = Math.max(0, timerDuration - timerElapsed);
  const formatSpeechTimer = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const adjustSpeechDuration = async seconds => {
    if (!unit || !canManageSession || sessionBusy) return;
    setSessionBusy(true);
    const nextDuration = Math.max(60, Math.min(3600, baseTimerDuration + Number(seconds)));
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { speakerDurationSeconds: nextDuration, updatedAt: serverTimestamp() }); } catch (currentError) { setError(currentError.message || 'Não foi possível ajustar o tempo de fala.'); } finally { setSessionBusy(false); }
  };
  const canGrantSpeakerTime = Boolean(unit?.currentMatterPhase === 'discussion' && unit?.currentMatterId && unit?.activeSpeakerId && isCurrentUserCouncilor && currentUser?.uid !== unit.activeSpeakerId && (unit.attendanceIds || []).includes(currentUser?.uid) && !unit?.speakerTimeConcessions?.[currentUser?.uid]);
  const grantSpeakerTime = async () => {
    if (!unit || !canGrantSpeakerTime || sessionBusy) return;
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { speakerTimeConcessions: { ...(unit.speakerTimeConcessions || {}), [currentUser.uid]: { speakerId: unit.activeSpeakerId, matterId: unit.currentMatterId, seconds: 60, grantedBy: currentUser.uid, grantedByName: personName(currentUser.uid), grantedAt: new Date().toISOString() } }, updatedAt: serverTimestamp() }); setError('Um minuto de aparte foi concedido ao orador.'); } catch (currentError) { setError(currentError.message || 'Não foi possível conceder o aparte.'); } finally { setSessionBusy(false); }
  };
  const cutSpeakerMicrophone = async () => {
    if (!unit || !canManageSession || sessionBusy || !unit.activeSpeakerId) return;
    setSessionBusy(true);
    const elapsedAtPause = (unit.speakerElapsedSeconds || 0) + (unit.speakerTimerRunning && timerStartMs ? Math.max(0, Math.floor((Date.now() - timerStartMs) / 1000)) : 0);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { speakerMicrophoneCut: true, speakerTimerRunning: false, speakerElapsedSeconds: elapsedAtPause, speakerTimerStartedAt: '', updatedAt: serverTimestamp() }); setError('Microfone do orador bloqueado e tempo de fala pausado.'); } catch (currentError) { setError(currentError.message || 'Não foi possível bloquear o microfone.'); } finally { setSessionBusy(false); }
  };
  const resetSpeakerTimer = async () => {
    if (!unit || !canManageSession || sessionBusy) return;
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { activeSpeakerId: '', speakerMicrophoneCut: false, speakerElapsedSeconds: 0, speakerTimerStartedAt: '', speakerTimerRunning: false, updatedAt: serverTimestamp() }); setError('Fala encerrada. A tribuna está pronta para chamar o próximo orador.'); } catch (currentError) { setError(currentError.message || 'Não foi possível encerrar a fala.'); } finally { setSessionBusy(false); }
  };
  const openSessionManagement = () => {
    if (!unit) return;
    setSessionManagementForm({ ...blankSessionManagement(), ...unit, matterIds: unit.matterIds || [], managementReason: unit.managementReason || unit.cancellationReason || '' });
    setSessionManagementOpen(true);
  };
  const toggleSessionMatter = matterId => setSessionManagementForm(current => ({ ...current, matterIds: current.matterIds.includes(matterId) ? current.matterIds.filter(id => id !== matterId) : [...current.matterIds, matterId] }));
  const saveSessionManagement = async event => {
    event.preventDefault();
    if (!unit || !canManageSession || !sessionManagementForm.title.trim() || sessionManagementSaving) return;
    setSessionManagementSaving(true);
    try {
      const { managementReason, ...details } = sessionManagementForm;
      const actionLabel = details.status === 'Cancelada' ? 'cancelou' : details.status === 'Adiada' ? 'adiou' : 'atualizou';
      await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), {
        ...details,
        managementReason: managementReason.trim(),
        cancellationReason: details.status === 'Cancelada' ? managementReason.trim() : '',
        updatedAt: serverTimestamp(),
        editHistory: arrayUnion({ editedAt: new Date().toISOString(), editedBy: currentUser?.uid || '', editedByName: currentUser?.displayName || currentUser?.email || 'Presidência', action: actionLabel, status: details.status, reason: managementReason.trim() }),
      });
      setSessionManagementOpen(false);
      setError('Gestão da sessão atualizada.');
    } catch (currentError) { setError(currentError.message || 'Não foi possível atualizar a sessão.'); } finally { setSessionManagementSaving(false); }
  };
  const saveSessionVote = async event => {
    event.preventDefault(); if (!unit || !sessionVoteForm.matterId || !canManageSession || sessionBusy) return;
    const matter = linkedMatters.find(item => item.id === sessionVoteForm.matterId); const individualValues = Object.fromEntries(Object.entries(unit.liveVotes || {}).map(([id, vote]) => [id, vote?.value])); const values = { ...individualValues, ...sessionVoteForm.values }; const votes = councilors.map(person => ({ userId: person.id, name: person.name || person.nome || person.email || 'Vereador(a)', value: values[person.id] || 'Abstenção' })); const totals = votes.reduce((accumulator, vote) => ({ ...accumulator, [vote.value]: (accumulator[vote.value] || 0) + 1 }), { Sim: 0, Não: 0, Abstenção: 0, Ausente: 0 }); const present = votes.filter(vote => vote.value !== 'Ausente').length; const minimum = sessionVoteForm.quorum === 'Maioria absoluta' ? Math.floor(councilors.length / 2) + 1 : sessionVoteForm.quorum === 'Dois terços' ? Math.ceil(councilors.length * 2 / 3) : Math.floor(present / 2) + 1; const approved = totals.Sim >= minimum;
    setSessionBusy(true);
    try { await addDoc(collection(firestore, LEGISLATIVE_COLLECTIONS.votes), { gabineteId: unit.gabineteId, camaraId: unit.camaraId, sessionId: unit.id, matterId: matter.id, matterTitle: matter.title || matter.summary || '', type: sessionVoteForm.type, turn: sessionVoteForm.turn, quorum: sessionVoteForm.quorum, votes, totals, minimum, outcome: approved ? 'Aprovada' : 'Rejeitada', publicPanel: true, recordedBy: currentUser?.uid || '', createdAt: serverTimestamp() }); const nextStatus = approved ? LEGISLATIVE_STAGES.FINAL_TEXT : LEGISLATIVE_STAGES.REJECTED; await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.matters, matter.id), { status: nextStatus, updatedAt: serverTimestamp() }); await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { currentMatterPhase: 'completed', liveVotes: {}, updatedAt: serverTimestamp() }); await addDoc(collection(firestore, LEGISLATIVE_COLLECTIONS.proceedings), { ...makeProceeding({ matterId: matter.id, chamberId: unit.camaraId, cabinetId: unit.gabineteId, councilorId: matter.vereadorId, authorName: currentUser?.displayName || currentUser?.email || 'Presidência', from: matter.status, to: nextStatus, sector: 'Plenário', description: `Votação ${sessionVoteForm.turn.toLowerCase()} registrada como ${approved ? 'aprovada' : 'rejeitada'}.` }), createdAt: serverTimestamp() }); setSessionVoteOpen(false); setSessionVoteForm(blankSessionVote()); setError(`Votação registrada: matéria ${approved ? 'aprovada' : 'rejeitada'}.`); } catch (currentError) { setError(currentError.message || 'Não foi possível registrar a votação.'); } finally { setSessionBusy(false); }
  };
  const startSessionMatterPhase = async (matter, phase) => {
    if (!unit || !matter || !canManageSession || sessionBusy) return;
    const status = phase === 'discussion' ? 'Em discussão no plenário' : 'Em votação no plenário';
    setSessionBusy(true);
    try {
      await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { currentMatterId: matter.id, currentMatterPhase: phase, ...(phase === 'voting' ? { liveVotes: {} } : {}), updatedAt: serverTimestamp() });
      await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.matters, matter.id), { status, updatedAt: serverTimestamp() });
      await addDoc(collection(firestore, LEGISLATIVE_COLLECTIONS.proceedings), { ...makeProceeding({ matterId: matter.id, chamberId: unit.camaraId, cabinetId: unit.gabineteId, councilorId: matter.vereadorId, authorName: currentUser?.displayName || currentUser?.email || 'Presidência', from: matter.status, to: status, sector: 'Plenário', description: phase === 'discussion' ? 'Matéria colocada em discussão pela Presidência.' : 'Matéria colocada em votação pela Presidência.' }), createdAt: serverTimestamp() });
      if (phase === 'voting') { setSessionVoteForm(current => ({ ...current, matterId: matter.id })); setSessionVoteOpen(true); }
      setError(phase === 'discussion' ? 'Matéria colocada em discussão.' : 'Matéria pronta para registro da votação.');
    } catch (currentError) { setError(currentError.message || 'Não foi possível atualizar a matéria na sessão.'); } finally { setSessionBusy(false); }
  };
  const registerIndividualVote = async value => {
    if (!unit || !activeVotingMatter || !isCurrentUserCouncilor || sessionBusy) return;
    setSessionBusy(true);
    try { await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, unit.id), { liveVotes: { ...(unit.liveVotes || {}), [currentUser.uid]: { value, name: personName(currentUser.uid), registeredAt: new Date().toISOString() } }, updatedAt: serverTimestamp() }); setError(`Seu voto foi registrado como “${value}”.`); } catch (currentError) { setError(currentError.message || 'Não foi possível registrar seu voto.'); } finally { setSessionBusy(false); }
  };
  const generateSessionMinute = async () => {
    if (!unit || isCommission || isMeeting || !canManageSession || sessionBusy || sessionMinutes.length) return;
    const presentNames = (unit.attendanceIds || []).map(personName).join(', ') || 'não registrada';
    const deliberations = sessionVotes.map(vote => `${vote.matterTitle || 'Matéria'}: ${vote.outcome || 'resultado não informado'} (${vote.totals?.Sim || 0} sim, ${vote.totals?.Não || 0} não e ${vote.totals?.Abstenção || 0} abstenções)`).join('; ') || 'não houve votação registrada';
    setSessionBusy(true);
    try { await addDoc(collection(firestore, LEGISLATIVE_COLLECTIONS.minutes), { gabineteId: unit.gabineteId, camaraId: unit.camaraId, sessionId: unit.id, sessionTitle: unit.title, title: `Minuta da ata — ${unit.title}`, summary: `Aos ${unit.date || 'dias registrados'}, realizou-se ${unit.title}. Presenças: ${presentNames}. Deliberações: ${deliberations}.`, status: 'Aguardando revisão', public: false, generatedFrom: 'session-data', createdBy: currentUser?.uid || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); setError('Minuta da ata gerada com os dados oficiais. A Secretaria pode revisá-la antes da publicação.'); } catch (currentError) { setError(currentError.message || 'Não foi possível gerar a minuta da ata.'); } finally { setSessionBusy(false); }
  };
  const youtubeEmbedUrl = value => {
    if (!value) return ''; try { const url = new URL(value); const videoId = url.searchParams.get('v') || (url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.pathname.split('/').filter(Boolean).pop()); return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : ''; } catch { return ''; }
  };

  const canRemoveCommission = isCommission && isAdmin && !meetings.length && !commissionMatters.length;
  const personName = id => { const person = councilors.find(item => item.id === id); return person?.name || person?.nome || person?.email || (id === currentUser?.uid ? currentUser?.displayName || currentUser?.email : '') || 'Vereador(a)'; };
  const personAvatar = id => {
    const person = councilors.find(item => item.id === id);
    return person?.photoURL || person?.photoUrl || person?.fotoUrl || person?.foto || person?.avatarUrl || '';
  };
  const initialsFor = id => personName(id).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  const sessionAgendaEntries = linkedMatters.length ? linkedMatters : unit?.agenda ? [{ id: 'session-agenda', title: unit.agenda, type: 'Pauta da sessão' }] : [];
  const presentAttendance = (unit?.attendanceIds || []).map(id => ({ id, name: personName(id), avatar: personAvatar(id) }));
  const toggleCommissionMember = (field, id) => setMembersForm(current => ({
    ...current,
    [field]: current[field].includes(id) ? current[field].filter(item => item !== id) : [...current[field], id],
  }));
  const saveCommissionMembers = async event => {
    event.preventDefault();
    if (!isCommission || !canManageCommissionMembers || !unit || membersSubmitting) return;
    setMembersSubmitting(true);
    try {
      const changedFields = ['memberIds', 'alternateIds'].filter(key => JSON.stringify(unit[key] || []) !== JSON.stringify(membersForm[key]));
      await updateDoc(doc(firestore, LEGISLATIVE_COLLECTIONS.commissions, unit.id), {
        memberIds: membersForm.memberIds,
        alternateIds: membersForm.alternateIds,
        updatedAt: serverTimestamp(),
        editHistory: arrayUnion({ changedFields, editedAt: new Date().toISOString(), editedBy: currentUser?.uid || '', editedByName: currentUser?.displayName || currentUser?.email || 'Presidência da comissão' }),
      });
      setMembersOpen(false);
      setError('');
    } catch (currentError) {
      setError(currentError.message || 'Não foi possível atualizar os membros da comissão.');
    } finally {
      setMembersSubmitting(false);
    }
  };
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

  const membersModal = isCommission && membersOpen && createPortal(
    <div className="cabinet-inline-modal" role="dialog" aria-modal="true" onMouseDown={() => setMembersOpen(false)}>
      <form className="cabinet-modal-form legislative-matter-detail commission-members-modal" onSubmit={saveCommissionMembers} onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h3>Composição da comissão</h3><p>Selecione os vereadores titulares e suplentes. A alteração ficará registrada no histórico.</p></div><button type="button" className="modal-close-btn" aria-label="Fechar" onClick={() => setMembersOpen(false)}>×</button></div>
        <fieldset><legend>Membros titulares</legend><div className="commission-member-picker">{councilors.map(person => <label className={`commission-member-option ${membersForm.memberIds.includes(person.id) ? 'selected' : ''}`} key={`member-${person.id}`}><input type="checkbox" checked={membersForm.memberIds.includes(person.id)} onChange={() => toggleCommissionMember('memberIds', person.id)} /><span className="commission-member-avatar">{personAvatar(person.id) ? <img src={personAvatar(person.id)} alt="" /> : initialsFor(person.id)}</span><span>{personName(person.id)}</span></label>)}</div></fieldset>
        <fieldset><legend>Membros suplentes</legend><div className="commission-member-picker">{councilors.map(person => <label className={`commission-member-option ${membersForm.alternateIds.includes(person.id) ? 'selected' : ''}`} key={`alternate-${person.id}`}><input type="checkbox" checked={membersForm.alternateIds.includes(person.id)} onChange={() => toggleCommissionMember('alternateIds', person.id)} /><span className="commission-member-avatar">{personAvatar(person.id) ? <img src={personAvatar(person.id)} alt="" /> : initialsFor(person.id)}</span><span>{personName(person.id)}</span></label>)}</div></fieldset>
        {!councilors.length && <p>Nenhum vereador cadastrado está disponível para seleção.</p>}
        <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setMembersOpen(false)}>Cancelar</button><button className="btn-primary" disabled={membersSubmitting}>{membersSubmitting ? 'Salvando…' : 'Salvar composição'}</button></div>
      </form>
    </div>, document.body,
  );
  const sessionVoteModal = !isCommission && !isMeeting && sessionVoteOpen && createPortal(
    <div className="modal-overlay" role="presentation" onMouseDown={() => !sessionBusy && setSessionVoteOpen(false)}>
      <form className="modal-content legislative-session-vote-modal" onSubmit={saveSessionVote} onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h2>Registrar votação</h2><p>Acompanhe o resultado também no painel público do plenário.</p></div><button type="button" className="modal-close-btn" disabled={sessionBusy} onClick={() => setSessionVoteOpen(false)}>×</button></div>
        <div className="form-row"><label>Matéria<select required value={sessionVoteForm.matterId} onChange={event => setSessionVoteForm({ ...sessionVoteForm, matterId: event.target.value })}><option value="">Selecione a matéria da pauta</option>{linkedMatters.map(item => <option key={item.id} value={item.id}>{item.type} nº {item.number}/{item.year} — {item.title}</option>)}</select></label><label>Turno<select value={sessionVoteForm.turn} onChange={event => setSessionVoteForm({ ...sessionVoteForm, turn: event.target.value })}>{['1º turno', '2º turno', 'Turno único'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <label>Quórum<select value={sessionVoteForm.quorum} onChange={event => setSessionVoteForm({ ...sessionVoteForm, quorum: event.target.value })}>{['Maioria simples', 'Maioria absoluta', 'Dois terços'].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="commission-vote-members">{councilors.map(person => <label key={person.id}>{person.name || person.nome || person.email}<select value={sessionVoteForm.values[person.id] || 'Abstenção'} onChange={event => setSessionVoteForm({ ...sessionVoteForm, values: { ...sessionVoteForm.values, [person.id]: event.target.value } })}>{['Sim', 'Não', 'Abstenção', 'Ausente'].map(value => <option key={value}>{value}</option>)}</select></label>)}</div>
        <div className="form-actions"><button type="button" className="btn-secondary" disabled={sessionBusy} onClick={() => setSessionVoteOpen(false)}>Cancelar</button><button className="btn-primary" disabled={sessionBusy || !linkedMatters.length}>{sessionBusy ? 'Registrando…' : 'Confirmar votação'}</button></div>
      </form>
    </div>, document.body,
  );
  const sessionManagementModal = !isCommission && !isMeeting && sessionManagementOpen && createPortal(
    <div className="cabinet-inline-modal" role="dialog" aria-modal="true" onMouseDown={() => !sessionManagementSaving && setSessionManagementOpen(false)}>
      <form className="cabinet-modal-form legislative-matter-detail session-management-modal" onSubmit={saveSessionManagement} onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h3>Gestão da sessão</h3><p>Edite a programação, a pauta e as matérias. Adiamentos e cancelamentos ficam registrados no histórico.</p></div><button type="button" className="modal-close-btn" disabled={sessionManagementSaving} aria-label="Fechar" onClick={() => setSessionManagementOpen(false)}>×</button></div>
        <label>Título da sessão<input required value={sessionManagementForm.title} onChange={event => setSessionManagementForm({ ...sessionManagementForm, title: event.target.value })} /></label>
        <label>Descrição<textarea value={sessionManagementForm.description} onChange={event => setSessionManagementForm({ ...sessionManagementForm, description: event.target.value })} placeholder="Descrição ou observações institucionais" /></label>
        <div className="form-row"><label>Data<input type="date" value={sessionManagementForm.date} onChange={event => setSessionManagementForm({ ...sessionManagementForm, date: event.target.value })} /></label><label>Horário<input type="time" value={sessionManagementForm.time} onChange={event => setSessionManagementForm({ ...sessionManagementForm, time: event.target.value })} /></label></div>
        <div className="form-row"><label>Formato<select value={sessionManagementForm.format} onChange={event => setSessionManagementForm({ ...sessionManagementForm, format: event.target.value })}>{['Presencial', 'Remota', 'Híbrida'].map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={sessionManagementForm.status} onChange={event => setSessionManagementForm({ ...sessionManagementForm, status: event.target.value })}>{['Agendada', 'Adiada', 'Cancelada', 'Aberta', 'Encerrada'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="form-row"><label>Local ou sala virtual<input value={sessionManagementForm.location} onChange={event => setSessionManagementForm({ ...sessionManagementForm, location: event.target.value })} /></label><label>Transmissão pública<input type="url" value={sessionManagementForm.broadcastUrl} onChange={event => setSessionManagementForm({ ...sessionManagementForm, broadcastUrl: event.target.value })} placeholder="https://..." /></label></div>
        <label>Pauta<textarea value={sessionManagementForm.agenda} onChange={event => setSessionManagementForm({ ...sessionManagementForm, agenda: event.target.value })} placeholder="Ordem do dia e itens da sessão" /></label>
        <fieldset><legend>Matérias da pauta</legend><div className="session-management-matters">{matters.map(item => <label key={item.id}><input type="checkbox" checked={sessionManagementForm.matterIds.includes(item.id)} onChange={() => toggleSessionMatter(item.id)} /><span><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><small>{item.title || item.subject || 'Sem ementa informada.'}</small></span></label>)}{!matters.length && <p>Nenhuma matéria disponível para inclusão.</p>}</div></fieldset>
        <label>Motivo do adiamento ou cancelamento<textarea value={sessionManagementForm.managementReason} onChange={event => setSessionManagementForm({ ...sessionManagementForm, managementReason: event.target.value })} placeholder="Informe o motivo quando aplicável" /></label>
        <div className="form-actions"><button type="button" className="btn-secondary" disabled={sessionManagementSaving} onClick={() => setSessionManagementOpen(false)}>Cancelar</button><button className="btn-primary" disabled={sessionManagementSaving}>{sessionManagementSaving ? 'Salvando…' : 'Salvar gestão da sessão'}</button></div>
      </form>
    </div>, document.body,
  );
  const sessionOverviewModal = !isCommission && !isMeeting && sessionOverviewOpen && createPortal(
    <div className="cabinet-inline-modal" role="dialog" aria-modal="true" onMouseDown={() => setSessionOverviewOpen(false)}>
      <section className="cabinet-modal-form legislative-matter-detail session-overview-modal" onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h3>Pauta e participação</h3><p>Matérias vinculadas e vereadores com presença registrada.</p></div><button type="button" className="modal-close-btn" aria-label="Fechar" onClick={() => setSessionOverviewOpen(false)}>×</button></div>
        <section><h4>Pauta completa</h4><div className="session-overview-list">{sessionAgendaEntries.map(item => <article key={item.id}><strong>{item.type || 'Matéria'}{item.number ? ` nº ${item.number}/${item.year}` : ''}</strong><p>{item.title || item.subject || 'Sem descrição informada.'}</p><small>{item.status || 'Em pauta'}</small></article>)}{!sessionAgendaEntries.length && <p>Nenhuma pauta registrada para esta sessão.</p>}</div></section>
        <section><h4>Vereadores presentes ({presentAttendance.length})</h4><div className="commission-members-list">{presentAttendance.map(person => <span className="commission-member-chip" key={person.id}><span className="commission-member-avatar">{person.avatar ? <img src={person.avatar} alt="" /> : initialsFor(person.id)}</span>{person.name}</span>)}{!presentAttendance.length && <p>Nenhuma presença registrada.</p>}</div></section>
      </section>
    </div>, document.body,
  );
  const sessionMatterDetailModal = !isCommission && !isMeeting && sessionMatterDetail && createPortal(
    <div className="cabinet-inline-modal" role="dialog" aria-modal="true" onMouseDown={() => setSessionMatterDetail(null)}>
      <section className="cabinet-modal-form legislative-matter-detail session-matter-detail-modal" onMouseDown={event => event.stopPropagation()}>
        <div className="cabinet-section-heading"><div><h3>{sessionMatterDetail.type || 'Matéria'} nº {sessionMatterDetail.number}/{sessionMatterDetail.year}</h3><p>{sessionMatterDetail.status || 'Em pauta'}</p></div><button type="button" className="modal-close-btn" aria-label="Fechar" onClick={() => setSessionMatterDetail(null)}>×</button></div>
        <dl className="legislative-data-grid"><div><dt>Tipo</dt><dd>{sessionMatterDetail.type || 'Não informado'}</dd></div><div><dt>Número</dt><dd>{sessionMatterDetail.number ? `${sessionMatterDetail.number}/${sessionMatterDetail.year}` : 'Não informado'}</dd></div><div><dt>Autor</dt><dd>{sessionMatterDetail.authorName || sessionMatterDetail.autorNome || 'Não informado'}</dd></div><div><dt>Tramitação</dt><dd>{sessionMatterDetail.tramitation || sessionMatterDetail.tramitacao || 'Ordinária'}</dd></div></dl>
        <section><h4>Ementa</h4><p>{sessionMatterDetail.summary || sessionMatterDetail.subject || sessionMatterDetail.title || 'Sem ementa informada.'}</p></section>
        {sessionMatterDetail.text && <section><h4>Texto da proposição</h4><p className="legislative-matter-text">{sessionMatterDetail.text}</p></section>}
        <Link className="btn-secondary" to={`/admin-legislativo/materia/${sessionMatterDetail.id}`}>Abrir ficha completa</Link>
      </section>
    </div>, document.body,
  );
  const voteBalloon = isSessionControls && activeVotingMatter && isCurrentUserCouncilor && !unit.liveVotes?.[currentUser.uid] && <aside className="session-vote-balloon" role="dialog" aria-label="Votação em andamento"><span>VOTAÇÃO ABERTA</span><strong>{activeVotingMatter.type || 'Matéria'} nº {activeVotingMatter.number}/{activeVotingMatter.year}</strong><p>{activeVotingMatter.title || activeVotingMatter.subject || 'Matéria da pauta'}</p><div><button type="button" className="yes" disabled={sessionBusy} onClick={() => registerIndividualVote('Sim')}>SIM</button><button type="button" className="no" disabled={sessionBusy} onClick={() => registerIndividualVote('Não')}>NÃO</button><button type="button" className="abstention" disabled={sessionBusy} onClick={() => registerIndividualVote('Abstenção')}>ABSTER-SE</button></div></aside>;

  return <div className="dashboard-layout">
    <AdminSidebar />
    <main className={`dashboard-content cabinet-page-content legislative-page ${isCommission ? 'legislative-commission-page' : ''} ${!isCommission && !isMeeting ? 'legislative-session-page' : ''} ${isSessionControls ? 'legislative-session-controls' : ''} ${isCommissionWorkspace ? 'commission-workspace-page' : ''}`}>
      <header className="page-header-container legislative-matter-page-header">
        <Link className="legislative-back-link" to={isSessionControls ? `/admin-legislativo/sessao/${unitId}` : isCommissionWorkspace ? `/admin-legislativo/comissao/${unitId}` : '/admin-legislativo'}><LiaArrowLeftSolid /> {isSessionControls ? 'Voltar para a sessão' : isCommissionWorkspace ? 'Voltar para a comissão' : 'Gestão legislativa'}</Link>
        <div><span className="escola-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div>
        {isCommission && !isCommissionWorkspace && <div className="commission-header-actions"><Link className="commission-header-action workspace" to={`/admin-legislativo/comissao/${unitId}/trabalho`}><LiaClipboardListSolid /> Abrir trabalho da comissão</Link>{canManageCommissionMembers && <><button type="button" className="commission-header-action members" onClick={() => setMembersOpen(true)}><LiaUserPlusSolid /> Membros</button><button type="button" className="commission-header-action meeting" onClick={() => navigate(`/admin-legislativo/comissao/${unitId}/reuniao/nova`)}><LiaCalendarAltSolid /> Nova reunião</button></>}{isAdmin && <button type="button" className="commission-header-action edit" onClick={() => setCommissionOpen(true)}><LiaFileAltSolid /> Editar</button>}{canRemoveCommission && <button type="button" className="commission-header-action delete" onClick={removeCommission} disabled={deleting}><LiaGavelSolid /> {deleting ? 'Excluindo…' : 'Excluir'}</button>}</div>}
      </header>
      {error && <div className="cabinet-feedback legislative-feedback-toast" role="status"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Fechar aviso" title="Fechar aviso">×</button></div>}
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
              <div className="cabinet-section-heading"><div><h2><LiaUsersSolid /> Composição e atribuições</h2><p>{unit.description || 'Sem descrição cadastrada.'}</p></div></div>
              <dl className="legislative-data-grid">
                <div><dt>Presidente</dt><dd>{personName(unit.presidentId)}</dd></div>
                <div><dt>Vice-presidente</dt><dd>{personName(unit.vicePresidentId)}</dd></div>
                <div className="commission-members-data"><dt>Membros titulares</dt><dd>{(unit.memberIds || []).length ? <span className="commission-members-list">{unit.memberIds.map(id => <span className="commission-member-chip" key={id}><span className="commission-member-avatar">{personAvatar(id) ? <img src={personAvatar(id)} alt="" /> : initialsFor(id)}</span>{personName(id)}</span>)}</span> : 'Não definidos'}</dd></div>
                <div className="commission-members-data"><dt>Membros suplentes</dt><dd>{(unit.alternateIds || []).length ? <span className="commission-members-list">{unit.alternateIds.map(id => <span className="commission-member-chip" key={id}><span className="commission-member-avatar">{personAvatar(id) ? <img src={personAvatar(id)} alt="" /> : initialsFor(id)}</span>{personName(id)}</span>)}</span> : 'Não definidos'}</dd></div>
              </dl>
            </section>
            <section className="legislative-matter-section">
              <h2><LiaClipboardListSolid /> Histórico de edições</h2>
              <div className="cabinet-list">
                {(unit.editHistory || []).slice().reverse().map((item, index) => <article className="cabinet-event-row" key={`${item.editedAt}-${index}`}><div><strong>{item.editedByName || 'Administrador'}</strong><p>{item.changedFields?.length ? `Alterou: ${item.changedFields.join(', ')}.` : 'Atualizou os dados da comissão.'}</p><small>{item.editedAt ? new Date(item.editedAt).toLocaleString('pt-BR') : 'Data não registrada'}</small></div></article>)}
                {!(unit.editHistory || []).length && <p>Nenhuma edição registrada.</p>}
              </div>
            </section>
            {isCommissionWorkspace && <section className="legislative-matter-section commission-workspace">
              <div className="cabinet-section-heading"><div><h2><LiaClipboardListSolid /> Trabalho da comissão</h2><p>Organize a pauta, as relatorias e as votações sem sair da área da comissão.</p></div>{canManageCommissionMembers && <button className="btn-primary cabinet-small-button" onClick={() => navigate(`/admin-legislativo/comissao/${unit.id}/reuniao/nova`)}>Nova reunião</button>}</div>
              <div className="commission-workspace-tabs" role="tablist"><button type="button" className={commissionWorkspaceTab === 'agenda' ? 'active' : ''} onClick={() => setCommissionWorkspaceTab('agenda')}>Pautas para deliberação</button><button type="button" className={commissionWorkspaceTab === 'meetings' ? 'active' : ''} onClick={() => setCommissionWorkspaceTab('meetings')}>Reuniões agendadas</button><button type="button" className={commissionWorkspaceTab === 'rapporteur' ? 'active' : ''} onClick={() => setCommissionWorkspaceTab('rapporteur')}>Minha relatoria</button><button type="button" className={commissionWorkspaceTab === 'votes' ? 'active' : ''} onClick={() => setCommissionWorkspaceTab('votes')}>Votação</button></div>
              <div className="commission-workspace-panel">
                {commissionWorkspaceTab === 'agenda' && <><h3>Pautas para deliberação</h3><div className="legislative-unit-card-grid">{agendaMatters.map(item => <Link className="legislative-unit-card" key={item.id} to={`/admin-legislativo/comissao/${unit.id}/materia/${item.id}`}><div><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><p>{item.title || item.subject || 'Sem ementa informada.'}</p><small>Relator: {item.rapporteurName || 'A definir'}</small><span className="commission-card-action">{item.status === 'Em análise pelo relator' ? 'Abrir relatoria' : 'Abrir pauta'}</span></div><small>{item.commissionAgendaMeetingTitle || item.status}</small></Link>)}{!agendaMatters.length && <p>Nenhuma matéria aguardando análise ou deliberação.</p>}</div></>}
                {commissionWorkspaceTab === 'meetings' && <><h3>Reuniões agendadas</h3><div className="legislative-unit-card-grid">{meetings.map(item => <Link className="legislative-unit-card" key={item.id} to={`/admin-legislativo/reuniao/${item.id}`}><div><strong>{item.title}</strong><p>{item.date || 'Data a definir'}{item.time ? ` às ${item.time}` : ''} · {item.format || 'Presencial'}</p><small>{item.result || item.agenda || 'Pauta e deliberações a registrar.'}</small><span className="commission-card-action">Abrir reunião</span></div><small>{item.status || 'Convocada'}</small></Link>)}{!meetings.length && <p>Nenhuma reunião cadastrada.</p>}</div></>}
                {commissionWorkspaceTab === 'rapporteur' && <><h3>Minha relatoria</h3><div className="legislative-unit-card-grid">{myRapporteurships.map(item => <Link className="legislative-unit-card" key={item.id} to={`/admin-legislativo/comissao/${unit.id}/materia/${item.id}`}><div><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><p>{item.title || item.subject || 'Sem ementa informada.'}</p><small>{item.status === 'Em análise pelo relator' ? 'A matéria aguarda seu relatório.' : 'Relatório já encaminhado para deliberação.'}</small><span className="commission-card-action">{item.status === 'Em análise pelo relator' ? 'Redigir parecer' : 'Consultar relatório'}</span></div><small>{item.status || 'Em análise'}</small></Link>)}{!myRapporteurships.length && <p>Nenhuma relatoria atribuída a você.</p>}</div></>}
                {commissionWorkspaceTab === 'votes' && <><h3>Votação de pareceres</h3><div className="legislative-unit-card-grid">{agendaMatters.filter(item => item.commissionAgendaMeetingId).map(item => <Link className="legislative-unit-card" key={item.id} to={`/admin-legislativo/comissao/${unit.id}/materia/${item.id}`}><div><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><p>{item.title || item.subject || 'Sem ementa informada.'}</p><small>Reunião: {item.commissionAgendaMeetingTitle || 'Pauta da comissão'}</small><span className="commission-card-action">Registrar votação</span></div><small>Em pauta</small></Link>)}{!agendaMatters.some(item => item.commissionAgendaMeetingId) && <p>Nenhum parecer aguardando votação em reunião.</p>}</div></>}
              </div>
            </section>}
          </> : isSessionControls ? <>
            <section className="session-controls-workspace">
              <header className="session-controls-header"><div><h2>{unit.title || 'Sessão legislativa'}</h2><p><strong>Data:</strong> {unit.date || 'A definir'} {unit.time ? `· ${unit.time}` : ''} <span>│</span> <strong>Formato:</strong> {unit.format || 'Presencial'} <span>│</span> <strong>Status:</strong> {unit.status || 'Em elaboração'}</p></div><div className="session-controls-header-actions"><span className="session-live-status live">{unit.status === 'Aberta' ? 'AO VIVO' : unit.status || 'AGENDADA'}</span><button type="button" className="btn-secondary cabinet-small-button" onClick={() => window.open(`/painel-votacao/${unit.id}`, '_blank', 'noopener,noreferrer')}>Abrir painel de votação</button></div></header>
              <div className="session-controls-layout">
                <aside className="session-controls-card session-controls-parliamentarians"><h2><LiaUsersSolid /> Parlamentares ({(unit.attendanceIds || []).length}/{councilors.length})</h2><div>{councilors.map(person => { const present = (unit.attendanceIds || []).includes(person.id); return <article key={person.id} className={present ? 'present' : ''}><button type="button" disabled={!canRegisterAttendanceFor(person.id) || sessionBusy} onClick={() => toggleAttendance(person.id)}><span className="commission-member-avatar">{personAvatar(person.id) ? <img src={personAvatar(person.id)} alt="" /> : initialsFor(person.id)}</span><span>{personName(person.id)}</span><small>{present ? 'Presente' : 'Ausente'}</small></button>{present && <button type="button" className="session-queue-add" disabled={!canManageSession || sessionBusy || (unit.speakerQueue || []).includes(person.id)} onClick={() => addSpeakerToQueue(person.id)}>Fila</button>}</article>; })}{!councilors.length && <p className="session-muted">Nenhum parlamentar disponível.</p>}</div>{isCurrentUserCouncilor ? <button type="button" className="btn-primary session-presence-action" disabled={sessionBusy} onClick={() => toggleAttendance(currentUser.uid)}>{(unit.attendanceIds || []).includes(currentUser.uid) ? 'Minha presença registrada' : 'Registrar minha presença'}</button> : <p className="session-muted">A Presidência pode registrar as presenças nesta lista.</p>}</aside>
                <section className="session-controls-video"><div className="session-controls-command-bar">{canManageSession && unit.status !== 'Aberta' && <button type="button" className="btn-primary" disabled={sessionBusy} onClick={() => updateSessionStatus('Aberta')}>Abrir sessão</button>}{canManageSession && unit.status === 'Aberta' && <><button type="button" className="btn-secondary" disabled={sessionBusy} onClick={() => setSessionVoteOpen(true)}>Registrar votação</button><button type="button" className="btn-danger" disabled={sessionBusy} onClick={() => updateSessionStatus('Encerrada')}>Encerrar sessão</button></>}</div>{['Remota', 'Virtual', 'Híbrida'].includes(unit.format) ? <>{conference ? <LegislativeVideoConference conference={conference} /> : <section className="legislative-video-state"><LiaVideoSolid /><div><strong>Sala virtual ainda não está pronta</strong><p>Prepare a videoconferência para iniciar o áudio e vídeo da sessão.</p>{canManageSession && <button type="button" className="btn-primary cabinet-small-button" onClick={createConference} disabled={conferenceBusy}>{conferenceBusy ? 'Preparando…' : 'Preparar sala segura'}</button>}</div></section>}</> : <section className="session-controls-presential"><LiaVideoSolid /><strong>Sessão presencial</strong><p>Os controles de presença, pauta, oradores e votação permanecem disponíveis nesta tela.</p></section>}</section>
                <aside className="session-controls-right"><section className="session-controls-card session-controls-agenda"><h2><LiaClipboardListSolid /> Pauta e matérias</h2>{linkedMatters.map(item => <article className="session-controls-matter" key={item.id}><Link to={`/admin-legislativo/materia/${item.id}`}><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><span>{item.title || item.subject || 'Sem ementa informada.'}</span><small>{item.status || 'Em pauta'}</small></Link>{canManageSession && <div className="session-controls-matter-actions"><button type="button" disabled={sessionBusy} onClick={() => startSessionMatterPhase(item, 'discussion')}>Discutir</button><button type="button" disabled={sessionBusy} onClick={() => startSessionMatterPhase(item, 'voting')}>Votar</button></div>}</article>)}{!linkedMatters.length && <p className="session-muted">Nenhuma matéria inserida na pauta.</p>}</section><section className="session-controls-card session-controls-votes"><h2><LiaGavelSolid /> Painel de votos</h2>{sessionVotes[0] ? <><strong>{sessionVotes[0].matterTitle || 'Última votação'}</strong><p>Sim: {sessionVotes[0].totals?.Sim || 0} · Não: {sessionVotes[0].totals?.Não || 0} · Abs.: {sessionVotes[0].totals?.Abstenção || 0}</p></> : <p>Aguardando início de votação.</p>}</section></aside>
                <section className="session-controls-card session-controls-speakers"><div className="cabinet-section-heading"><div><h2><LiaMicrophoneSolid /> Fila de oradores</h2><p>{unit.activeSpeakerId ? `Na tribuna: ${personName(unit.activeSpeakerId)}` : 'Nenhum orador na tribuna.'}</p></div><div className="session-speaker-actions">{unit.activeSpeakerId && <button type="button" className="btn-secondary" disabled={!canManageSession || sessionBusy} onClick={finishSpeaker}>Encerrar fala</button>}<button type="button" className="btn-primary" disabled={!canManageSession || sessionBusy || !(unit.speakerQueue || []).length} onClick={callNextSpeaker}>Chamar próximo</button></div></div><ol>{(unit.speakerQueue || []).map((id, index) => <li key={id}><span>{index + 1}</span>{personName(id)}</li>)}{!(unit.speakerQueue || []).length && <li className="session-muted">A fila está vazia. Use o botão “Fila” ao lado de um parlamentar presente.</li>}</ol></section>
                <section className="session-controls-card session-controls-tribune"><div className={`session-tribune-heading ${timerRemaining === 0 && unit.activeSpeakerId ? 'finished' : ''}`}><h2><LiaMicrophoneSolid /> Orador na tribuna</h2><div className="session-tribune-time"><small>Tempo de fala</small><b>{formatSpeechTimer(unit.activeSpeakerId ? timerRemaining : timerDuration)}</b></div><span className={`session-tribune-status ${unit.activeSpeakerId ? (unit.speakerMicrophoneCut || timerRemaining === 0 ? 'red' : 'green') : 'yellow'}`} aria-label={unit.activeSpeakerId ? (unit.speakerMicrophoneCut ? 'Microfone bloqueado' : 'Tribuna ocupada') : 'Tribuna disponível'} title={unit.activeSpeakerId ? (unit.speakerMicrophoneCut ? 'Microfone bloqueado' : 'Tribuna ocupada') : 'Tribuna disponível'} /></div>{canGrantSpeakerTime && <button type="button" className="session-grant-time" disabled={sessionBusy} onClick={grantSpeakerTime}>Conceder aparte · +1 min</button>}{canManageSession && <div className="session-speech-controls"><button type="button" className="btn-secondary" disabled={sessionBusy || baseTimerDuration <= 60} onClick={() => adjustSpeechDuration(-60)} aria-label="Diminuir um minuto" title="Diminuir um minuto"><LiaMinusSolid /></button><button type="button" className="btn-secondary" disabled={sessionBusy || baseTimerDuration >= 3600} onClick={() => adjustSpeechDuration(60)} aria-label="Acrescentar um minuto" title="Acrescentar um minuto"><LiaPlusSolid /></button><button type="button" className="btn-secondary" disabled={sessionBusy} onClick={resetSpeakerTimer} aria-label="Zerar tempo" title="Zerar tempo"><LiaUndoSolid /></button><button type="button" className="btn-danger" disabled={sessionBusy || !unit.activeSpeakerId} onClick={cutSpeakerMicrophone} aria-label="Cortar microfone" title="Cortar microfone"><LiaMicrophoneSlashSolid /></button></div>}</section>
              </div>
            </section>
          </> : <>
            <section className="legislative-matter-section">
              <div className="cabinet-section-heading session-overview-heading"><h2><LiaCalendarAltSolid /> Pauta e participação</h2><button type="button" className="btn-secondary cabinet-small-button" onClick={() => setSessionOverviewOpen(true)}>Ver detalhes</button></div>
              <dl className="legislative-data-grid">
                <div><dt>Formato</dt><dd>{unit.format || 'Presencial'}</dd></div>
                <div><dt>Local ou sala virtual</dt><dd>{unit.location || unit.virtualRoomUrl || 'Não informado'}</dd></div>
                <div><dt>Transmissão</dt><dd>{unit.broadcastUrl || 'Não informada'}</dd></div>
                <div><dt>Presenças</dt><dd>{presentAttendance.length ? `${presentAttendance.length} vereador(es) presente(s)` : 'Ainda não registradas'}</dd></div>
              </dl>
              <article className="session-agenda-card"><span>Pauta</span><strong>{sessionAgendaEntries[0]?.type || 'Ordem do dia'}</strong><p>{sessionAgendaEntries[0]?.title || sessionAgendaEntries[0]?.subject || 'Nenhuma pauta detalhada foi registrada.'}</p>{sessionAgendaEntries[0]?.status && <small>{sessionAgendaEntries[0].status}</small>}</article>
            </section>
            <section className="legislative-matter-section">
              <h2><LiaClipboardListSolid /> Matérias e deliberações</h2>
              <div className="cabinet-list">
                {linkedMatters.map(item => <button type="button" className="session-matter-card" key={item.id} onClick={() => setSessionMatterDetail(item)}><span>{item.type || 'Matéria'} nº {item.number}/{item.year}</span><strong>{item.title || item.subject || 'Sem ementa informada.'}</strong><small>{item.status || 'Em pauta'} · Ver dados</small></button>)}
                {!linkedMatters.length && <p>Nenhuma matéria vinculada à pauta.</p>}
              </div>
              <h3>Resultado e encaminhamentos</h3><p>{unit.result || 'Deliberações ainda não registradas.'}</p>
            </section>
            {['Remota', 'Virtual', 'Híbrida'].includes(unit.format) && <section className="legislative-matter-section">
              <div className="cabinet-section-heading"><div><h2><LiaVideoSolid /> Videoconferência Câmara AI</h2><p>Áudio, vídeo e compartilhamento integrados. Pauta, presença e votação continuam no Plenário Digital.</p></div>{!conference && <button className="btn-primary cabinet-small-button" onClick={createConference} disabled={conferenceBusy}>{conferenceBusy ? 'Preparando…' : 'Preparar sala segura'}</button>}</div>
              {conference && <LegislativeVideoConference conference={conference} />}
            </section>}
            {!isMeeting && unit.status === 'Encerrada' && <section className="legislative-matter-section session-final-summary">
              <div className="cabinet-section-heading"><div><h2><LiaClipboardListSolid /> Histórico e ata da sessão</h2><p>Resumo consolidado a partir da presença, pauta e votações oficiais.</p></div>{canManageSession && !sessionMinutes.length && <button type="button" className="btn-primary cabinet-small-button" disabled={sessionBusy} onClick={generateSessionMinute}>{sessionBusy ? 'Gerando…' : 'Gerar minuta da ata'}</button>}</div>
              <div className="session-final-grid"><article className="session-recording-card">{youtubeEmbedUrl(unit.broadcastUrl) ? <iframe title={`Gravação de ${unit.title}`} src={youtubeEmbedUrl(unit.broadcastUrl)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="session-recording-empty"><LiaVideoSolid /><strong>Gravação não vinculada</strong><p>Adicione a URL da transmissão ou da gravação à sessão para exibi-la aqui.</p></div>}</article><article className="session-timeline-card"><h3>Registro oficial</h3><ol><li><time>{unit.startedAt?.toDate ? unit.startedAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</time><span>Sessão aberta</span></li>{sessionVotes.map(vote => <li key={vote.id}><time>{vote.createdAt?.toDate ? vote.createdAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</time><span>{vote.matterTitle || 'Matéria'} — {vote.outcome}</span></li>)}<li><time>{unit.endedAt?.toDate ? unit.endedAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</time><span>Sessão encerrada</span></li></ol>{unit.transcriptionText && <p className="session-transcription-preview">{unit.transcriptionText}</p>}{!unit.transcriptionText && <p className="session-muted">A transcrição será exibida aqui quando a gravação for processada.</p>}</article></div>
              <div className="session-final-grid"><article className="session-presence-card"><h3><LiaUsersSolid /> Lista de presença</h3><div>{(unit.attendanceIds || []).map(id => <span className="commission-member-chip" key={id}><span className="commission-member-avatar">{personAvatar(id) ? <img src={personAvatar(id)} alt="" /> : initialsFor(id)}</span>{personName(id)}</span>)}{!(unit.attendanceIds || []).length && <p className="session-muted">Nenhuma presença registrada.</p>}</div></article><article className="session-deliberations-card"><h3><LiaFileAltSolid /> Matérias deliberadas</h3>{sessionVotes.map(vote => <div className="session-deliberation-row" key={vote.id}><strong>{vote.matterTitle || 'Matéria da pauta'}</strong><b className={vote.outcome === 'Aprovada' ? 'approved' : 'rejected'}>{vote.outcome}</b><small>Sim: {vote.totals?.Sim || 0} · Não: {vote.totals?.Não || 0} · Abs.: {vote.totals?.Abstenção || 0}</small></div>)}{!sessionVotes.length && <p className="session-muted">Nenhuma matéria deliberada.</p>}</article></div>
              {sessionMinutes.map(minute => <article className="session-minute-card" key={minute.id}><strong>{minute.title}</strong><p>{minute.summary}</p><small>{minute.status}</small></article>)}
            </section>}
          </>}
          <aside className="legislative-matter-aside">
            <LiaFileAltSolid /><strong>{isCommission ? 'Gestão da comissão' : isMeeting ? 'Ficha da reunião' : 'Gestão da sessão'}</strong>
            <p>{isCommission ? 'Acompanhe a composição, as matérias distribuídas, as relatorias e o histórico de reuniões.' : 'Consulte pauta, presença, formato, matérias e as deliberações registradas.'}</p>
            {isMeeting && unit.commissionId && <Link to={`/admin-legislativo/comissao/${unit.commissionId}`}>Abrir comissão</Link>}
            {!isCommission && !isMeeting && canManageSession && <button type="button" className="btn-secondary" onClick={openSessionManagement}>Gerenciar sessão</button>}
            {!isCommission && !isMeeting && <Link className="btn-primary legislative-session-controls-link" to={`/admin-legislativo/sessao/${unit.id}/controles`}>Abrir controles da sessão</Link>}
            {canRemoveMeeting && <button type="button" className="btn-danger legislative-delete-button" onClick={removeMeeting} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir reunião'}</button>}
          </aside>
        </div>
      </section>}
      {commissionModal}{meetingModal}{membersModal}{sessionVoteModal}{sessionManagementModal}{sessionOverviewModal}{sessionMatterDetailModal}{voteBalloon}
    </main>
  </div>;
}
