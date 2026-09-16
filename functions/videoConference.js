/* eslint-disable */
const crypto = require('crypto');
const admin = require('firebase-admin');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {defineSecret} = require('firebase-functions/params');

const jitsiJwtSecret = defineSecret('JITSI_JWT_SECRET');
const VIDEO_COLLECTION = 'videoconferencias';
const EVENT_COLLECTION = 'videoconferencia_eventos';
const TYPES = new Set(['PLENARY_SESSION', 'COMMISSION_MEETING', 'PUBLIC_HEARING', 'OTHER']);
const REFERENCE_COLLECTION = {
  PLENARY_SESSION: 'legislativo_sessoes',
  COMMISSION_MEETING: 'legislativo_reunioes_comissao',
};

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const signJwt = (payload, secret) => {
  const header = encode({alg: 'HS256', typ: 'JWT'});
  const body = encode(payload);
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};
const profileFor = async uid => (await admin.firestore().collection('users').doc(uid).get()).data() || {};
const isAdmin = profile => ['Admin', 'Administrador'].includes(profile.tipo);
const dateNow = () => admin.firestore.FieldValue.serverTimestamp();
const hasPermission = (profile, permission) => (profile.legislativePermissions || []).includes(permission);

const roomIdFor = councilId => {
  const councilHash = crypto.createHash('sha256').update(councilId).digest('base64url').slice(0, 12).toLowerCase();
  return `camara-${councilHash}-${crypto.randomUUID().replace(/-/g, '')}`;
};

const loadReference = async ({type, referenceId}) => {
  const collection = REFERENCE_COLLECTION[type];
  if (!collection) return null;
  const snapshot = await admin.firestore().collection(collection).doc(referenceId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Sessão ou reunião legislativa não encontrada.');
  const reference = {id: snapshot.id, collection, ...snapshot.data()};
  if (type === 'COMMISSION_MEETING' && reference.commissionId) {
    const commission = await admin.firestore().collection('legislativo_comissoes').doc(reference.commissionId).get();
    reference.commission = commission.exists ? {id: commission.id, ...commission.data()} : null;
  }
  return reference;
};

const canAccessReference = (profile, uid, reference) => {
  if (isAdmin(profile)) return true;
  if (reference.gabineteId === uid || profile.gabineteId === reference.gabineteId) return true;
  if ((reference.attendanceIds || []).includes(uid) || (reference.memberIds || []).includes(uid) || (reference.commission?.memberIds || []).includes(uid) || reference.commission?.presidentId === uid) return true;
  return hasPermission(profile, 'legislative.secretariat') || hasPermission(profile, 'legislative.presidency') || hasPermission(profile, 'legislative.commissionPresident');
};

const canModerate = (profile, uid, conference, reference) => {
  if (conference.type === 'PLENARY_SESSION') {
    return reference?.presidenteTemporario?.id === uid || profile.isCouncilPresident === true || profile.presidenteCamara === true || hasPermission(profile, 'legislative.presidency');
  }
  if (conference.type === 'COMMISSION_MEETING') {
    return reference?.commission?.presidentId === uid || reference?.presidentId === uid || hasPermission(profile, 'legislative.commissionPresident');
  }
  return isAdmin(profile) && conference.createdBy === uid;
};

const audit = async ({conferenceId, councilId, type, userId, metadata = {}}) => admin.firestore().collection(EVENT_COLLECTION).add({conferenceId, councilId, type, userId, metadata, createdAt: dateNow()});

const isRemoteFormat = (format) => ["remota", "virtual", "híbrida", "hibrida"]
    .includes(String(format || "").toLowerCase());
const createScheduledConference = async ({reference, referenceId, type}) => {
  if (!isRemoteFormat(reference.format) || !reference.camaraId) return null;
  const id = `${type}_${referenceId}`;
  const ref = admin.firestore().collection(VIDEO_COLLECTION).doc(id);
  const existing = await ref.get();
  if (existing.exists) return existing.id;
  const record = {councilId: reference.camaraId, gabineteId: reference.gabineteId || "", referenceId, type, title: String(reference.title || reference.name || "Reunião legislativa").slice(0, 180), roomId: roomIdFor(reference.camaraId), provider: "JITSI_SELF_HOSTED", status: "SCHEDULED", scheduledAt: reference.date || null, startedAt: null, endedAt: null, createdBy: reference.createdBy || "system", recordingStatus: "NOT_REQUESTED", recordingUrl: "", transcriptionStatus: "NOT_REQUESTED", transcriptionUrl: "", retention: {purpose: "Registro institucional da reunião legislativa", published: false}, createdAt: dateNow(), updatedAt: dateNow()};
  await ref.create(record);
  await audit({conferenceId: id, councilId: reference.camaraId, type: "conference.scheduled", userId: record.createdBy, metadata: {referenceId, meetingType: type}});
  return id;
};

exports.createConferenceForRemoteSession = onDocumentCreated(
    "legislativo_sessoes/{sessionId}",
    async (event) => createScheduledConference({reference: event.data.data(), referenceId: event.params.sessionId, type: "PLENARY_SESSION"}),
);

exports.createConferenceForRemoteCommissionMeeting = onDocumentCreated(
    "legislativo_reunioes_comissao/{meetingId}",
    async (event) => createScheduledConference({reference: event.data.data(), referenceId: event.params.meetingId, type: "COMMISSION_MEETING"}),
);

exports.createVideoConference = onCall({cors: true, secrets: [jitsiJwtSecret]}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.');
  const {councilId, referenceId, type, title, scheduledAt} = request.data || {};
  if (!councilId || !referenceId || !TYPES.has(type)) throw new HttpsError('invalid-argument', 'Conferência, Câmara e referência legislativa são obrigatórias.');
  const profile = await profileFor(request.auth.uid);
  const reference = await loadReference({type, referenceId});
  if (reference && reference.camaraId && reference.camaraId !== councilId) throw new HttpsError('permission-denied', 'A referência não pertence à Câmara informada.');
  if (!isAdmin(profile) && !canAccessReference(profile, request.auth.uid, reference)) throw new HttpsError('permission-denied', 'Sem permissão para criar esta conferência.');
  const conferenceRef = admin.firestore().collection(VIDEO_COLLECTION)
      .doc(`${type}_${referenceId}`);
  const existing = await conferenceRef.get();
  if (existing.exists) return {id: existing.id, ...existing.data(), reused: true};
  const record = {councilId, gabineteId: reference?.gabineteId || '', referenceId, type, title: String(title || reference?.title || reference?.name || 'Reunião legislativa').slice(0, 180), roomId: roomIdFor(councilId), provider: 'JITSI_SELF_HOSTED', status: 'SCHEDULED', scheduledAt: scheduledAt || reference?.date || null, startedAt: null, endedAt: null, createdBy: request.auth.uid, recordingStatus: 'NOT_REQUESTED', recordingUrl: '', transcriptionStatus: 'NOT_REQUESTED', transcriptionUrl: '', retention: {purpose: 'Registro institucional da reunião legislativa', published: false}, createdAt: dateNow(), updatedAt: dateNow()};
  await conferenceRef.create(record);
  await audit({conferenceId: conferenceRef.id, councilId, type: 'conference.created', userId: request.auth.uid, metadata: {referenceId, meetingType: type}});
  return {id: conferenceRef.id, ...record};
});

exports.getVideoConferenceJoinToken = onCall({cors: true, secrets: [jitsiJwtSecret]}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.');
  const conferenceId = String(request.data?.conferenceId || '');
  const snapshot = await admin.firestore().collection(VIDEO_COLLECTION).doc(conferenceId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Videoconferência não encontrada.');
  const conference = {id: snapshot.id, ...snapshot.data()};
  if (['FINISHED', 'COMPLETED', 'ERROR'].includes(conference.status)) throw new HttpsError('failed-precondition', 'Esta videoconferência não está disponível para entrada.');
  const profile = await profileFor(request.auth.uid);
  const reference = await loadReference(conference);
  if (!canAccessReference(profile, request.auth.uid, reference)) throw new HttpsError('permission-denied', 'Sem permissão para entrar nesta reunião.');
  const secret = jitsiJwtSecret.value();
  if (!secret) throw new HttpsError('failed-precondition', 'JWT do Jitsi não configurado.');
  const now = Math.floor(Date.now() / 1000);
  const moderator = canModerate(profile, request.auth.uid, conference, reference);
  const token = signJwt({aud: 'jitsi', iss: process.env.JITSI_APP_ID || 'camara-ai', sub: process.env.JITSI_DOMAIN || '', room: conference.roomId, exp: now + 15 * 60, nbf: now - 10, context: {user: {id: request.auth.uid, name: profile.nome || profile.name || request.auth.token.name || 'Participante', email: request.auth.token.email || '', moderator}}}, secret);
  await audit({conferenceId, councilId: conference.councilId, type: 'conference.join_token_issued', userId: request.auth.uid, metadata: {moderator}});
  return {roomId: conference.roomId, token, expiresAt: (now + 15 * 60) * 1000, moderator};
});

exports.changeVideoConferenceStatus = onCall({cors: true}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.');
  const conferenceId = String(request.data?.conferenceId || '');
  const action = String(request.data?.action || '');
  const snapshot = await admin.firestore().collection(VIDEO_COLLECTION).doc(conferenceId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Videoconferência não encontrada.');
  const conference = {id: snapshot.id, ...snapshot.data()}; const profile = await profileFor(request.auth.uid); const reference = await loadReference(conference);
  if (!canModerate(profile, request.auth.uid, conference, reference)) throw new HttpsError('permission-denied', 'Apenas a presidência responsável pode executar esta ação.');
  const actionMap = {startRecording: {recordingStatus: 'REQUESTED'}, stopRecording: {recordingStatus: 'PROCESSING', status: 'PROCESSING_RECORDING'}, startTranscription: {transcriptionStatus: 'QUEUED', status: 'TRANSCRIBING'}, closeRoom: {status: 'FINISHED', endedAt: new Date().toISOString()}};
  if (!actionMap[action]) throw new HttpsError('invalid-argument', 'Ação de videoconferência inválida.');
  await snapshot.ref.update({...actionMap[action], updatedAt: dateNow()});
  await audit({conferenceId, councilId: conference.councilId, type: `conference.${action}`, userId: request.auth.uid});
  return {ok: true, action};
});
