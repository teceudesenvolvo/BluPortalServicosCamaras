import express from 'express';
import admin from 'firebase-admin';
import makeWASocket, {
  BufferJSON,
  Browsers,
  DisconnectReason,
  initAuthCreds,
  normalizeMessageContent,
  downloadMediaMessage,
  proto,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID must be configured.');
if (!admin.apps.length) admin.initializeApp({projectId});

const db = admin.firestore();
const app = express();
const port = Number(process.env.PORT || 8080);
const settingsRef = db.collection('whatsappSettings').doc('config');
const statusRef = db.collection('whatsappRuntime').doc('session');
const authRef = db.collection('whatsappPrivate').doc('baileysAuth');
const authKeys = authRef.collection('keys');
const logger = pino({level: 'silent'});

let socket = null;
let connectionState = 'disconnected';
let qrDataUrl = '';
let startPromise = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let manualDisconnect = false;
let messageQueue = Promise.resolve();
let watchdogTimer = null;

app.disable('x-powered-by');
app.use(express.json({limit: '256kb'}));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function requireAdmin(req, res, next) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({error: 'Autenticação necessária.'});
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const [user, portal] = await Promise.all([
      db.collection('users').doc(decoded.uid).get(),
      db.collection('system-control').doc('portal').get(),
    ]);
    const userData = user.data() || {};
    const portalData = portal.data() || {};
    const role = String(userData.tipo || userData.role || '').trim();
    const roots = (portalData.security?.rootEmails || [])
        .map(email => String(email).trim().toLowerCase());
    const isRoot = roots.includes(String(decoded.email || '').trim().toLowerCase());
    const configuredRoleAccess = portalData.security?.rolePermissions?.[role]?.whatsapp?.admin;
    const roleCanManageWhatsApp = typeof configuredRoleAccess === 'boolean' ?
      configuredRoleAccess : ['admin', 'administrador'].includes(role.toLocaleLowerCase('pt-BR'));
    const moduleEnabled = portalData.modules?.whatsapp?.admin !== false;
    if (!moduleEnabled || (!isRoot && !roleCanManageWhatsApp)) {
      return res.status(403).json({error: 'Apenas administradores podem gerenciar o WhatsApp.'});
    }
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({error: 'A sessão do portal expirou. Entre novamente.'});
  }
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize(value) {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

function keyDocumentId(type, id) {
  return Buffer.from(`${type}:${id}`).toString('base64url');
}

async function loadAuthState() {
  const authSnapshot = await authRef.get();
  const creds = authSnapshot.exists && authSnapshot.data()?.creds ?
    deserialize(authSnapshot.data().creds) : initAuthCreds();
  return {
    creds,
    keys: {
      get: async (type, ids) => {
        if (!ids.length) return {};
        const refs = ids.map(id => authKeys.doc(keyDocumentId(type, id)));
        const snapshots = await db.getAll(...refs);
        const values = {};
        snapshots.forEach((snapshot, index) => {
          const stored = snapshot.exists ? snapshot.data()?.value : null;
          let value = stored ? deserialize(stored) : null;
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          values[ids[index]] = value;
        });
        return values;
      },
      set: async data => {
        let batch = db.batch();
        let operationCount = 0;
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries)) {
            const ref = authKeys.doc(keyDocumentId(type, id));
            if (value) batch.set(ref, {value: serialize(value)});
            else batch.delete(ref);
            operationCount += 1;
            if (operationCount === 450) {
              await batch.commit();
              batch = db.batch();
              operationCount = 0;
            }
          }
        }
        if (operationCount) await batch.commit();
      },
    },
  };
}

async function saveCreds(creds) {
  await authRef.set({creds: serialize(creds), updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
}

async function setStatus(status, extra = {}) {
  connectionState = status;
  await statusRef.set({
    status,
    qrCode: qrDataUrl || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  }, {merge: true});
}

function messageText(message) {
  const content = normalizeMessageContent(message?.message) || {};
  return content.conversation || content.extendedTextMessage?.text ||
    content.imageMessage?.caption || content.videoMessage?.caption ||
    content.documentMessage?.caption || content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title || content.templateButtonReplyMessage?.selectedDisplayText ||
    content.interactiveMessage?.body?.text || content.interactiveMessage?.header?.title || '';
}

function safeDocumentId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 900);
}

async function saveOutboundMessage(jid, text, conversationId, messageId = '') {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('whatsappMessages').add({
    conversationId,
    phone: jid,
    text,
    direction: 'outbound',
    status: 'sent',
    provider: 'Baileys',
    providerMessageId: messageId,
    createdAt: now,
  });
  await db.collection('whatsappConversations').doc(conversationId).set({
    phone: jid,
    lastMessage: text,
    updatedAt: now,
  }, {merge: true});
}

async function getActiveFlow() {
  const singleton = await db.collection('whatsappFlows').doc('main').get();
  if (singleton.exists && singleton.data()?.active === true) return {id: singleton.id, data: singleton.data()};
  // Use an existing published flow until the legacy configuration is migrated
  // to the single `main` document. Publishing the singleton deactivates these.
  const legacy = await db.collection('whatsappFlows').where('active', '==', true).get();
  const selected = legacy.docs.find(item => item.id !== 'main');
  return selected ? {id: selected.id, data: selected.data()} : null;
}

function formatFlowStep(step) {
  if (!step) return '';
  const type = step.type || ((step.options || []).length ? 'menu' : 'message');
  const message = String(step.message || '').trim();
  if (type !== 'menu' || !(step.options || []).length) return message;
  const menu = step.options
    .filter(option => String(option.label || '').trim())
    .map((option, index) => `${index + 1}. ${String(option.label).trim()}`);
  return [message, ...menu].filter(Boolean).join('\n');
}

async function enterFlowStep(step, flow, flowId, conversationRef) {
  const notices = [];
  const visited = new Set();
  let current = step;
  while (current && current.type === 'informative' && !visited.has(current.id)) {
    visited.add(current.id);
    if (String(current.message || '').trim()) notices.push(String(current.message).trim());
    current = (flow.steps || []).find(item => item.id === current.nextStepId);
  }
  if (!current || current.type === 'message') {
    if (current?.message) notices.push(String(current.message).trim());
    else if (!notices.length) notices.push(flow.completionMessage || 'Atendimento concluído. Obrigado pelo contato.');
    return requestWhatsAppRating(flow, conversationRef, notices.filter(Boolean).join('\n\n'));
  }
  await conversationRef.set({activeFlowId, activeFlowStepId: current.id}, {merge: true});
  notices.push(current.type === 'menu' || (!current.type && (current.options || []).length) ? formatFlowStep(current) : String(current.message || '').trim());
  return notices.filter(Boolean).join('\n\n');
}

async function requestWhatsAppRating(flow, conversationRef, closingMessage = '') {
  await conversationRef.set({
    activeFlowId: '', activeFlowStepId: '', activeServiceRequestId: admin.firestore.FieldValue.delete(),
    status: 'closed', resolvedAt: admin.firestore.FieldValue.serverTimestamp(), whatsappRatingState: 'awaiting_score',
    whatsappRatingFlowName: String(flow?.name || 'Atendimento WhatsApp'),
  }, {merge: true});
  const invitation = 'Antes de encerrarmos, avalie seu atendimento de 1 a 5:\n1️⃣ Muito ruim\n2️⃣ Ruim\n3️⃣ Regular\n4️⃣ Bom\n5️⃣ Muito bom';
  return [closingMessage, invitation].filter(Boolean).join('\n\n');
}

function phoneSearchCandidates(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return [];
  const candidates = new Set([digits, `+${digits}`]);
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length >= 10) {
    const area = national.slice(0, 2);
    const line = national.slice(2);
    candidates.add(national);
    candidates.add(`(${area})${line}`);
    candidates.add(`(${area}) ${line}`);
    candidates.add(`${area} ${line}`);
    candidates.add(`+55 (${area}) ${line}`);
    candidates.add(`55 (${area}) ${line}`);
    if (line.length === 9) {
      candidates.add(`(${area}) ${line.slice(0, 5)}-${line.slice(5)}`);
      candidates.add(`(${area})${line.slice(0, 5)}-${line.slice(5)}`);
    }
  }
  return [...candidates].slice(0, 30);
}

async function findWhatsappUser(phone) {
  const candidates = phoneSearchCandidates(phone);
  if (!candidates.length) return null;
  const matches = new Map();
  await Promise.all(['telefone', 'phone'].map(async field => {
    try {
      const snapshot = await db.collection('users').where(field, 'in', candidates).limit(20).get();
      snapshot.docs.forEach(user => matches.set(user.id, {id: user.id, ...user.data()}));
    } catch (error) {
      console.warn(`Busca de perfil WhatsApp pelo campo ${field} não concluída:`, error.message);
    }
  }));
  return matches.size === 1 ? [...matches.values()][0] : null;
}

async function routeWhatsappRequestToOuvidoria(requestRef) {
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) throw new Error('Solicitação WhatsApp não encontrada.');
  const request = requestSnapshot.data() || {};
  if (request.moduleId !== 'ouvidoria') throw new Error('A solicitação não está vinculada ao módulo Ouvidoria.');
  if (request.ouvidoriaId) return {id: request.ouvidoriaId, protocolo: request.ouvidoriaProtocol || ''};

  const phone = String(request.phone || '').replace(/@(s\.whatsapp\.net|lid)$/, '');
  const linkedUser = await findWhatsappUser(phone);
  const name = request.contactName || linkedUser?.name || linkedUser?.nome || 'Contato WhatsApp';
  const manifestationRef = db.collection('ouvidoria').doc();
  const protocol = `OUV-${new Date().getFullYear()}-${manifestationRef.id}`;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const manifestation = {
    protocolo: protocol,
    userId: linkedUser?.id || 'anonimo',
    dadosUsuario: {
      identificacao: 'WhatsApp',
      ...(linkedUser?.id ? {id: linkedUser.id} : {}),
      name,
      // WhatsApp does not provide an email address. Never copy the logged-in
      // administrator's email into a citizen manifestation.
      email: '',
      phone,
      source: 'whatsapp',
    },
    dadosManifestacao: {
      tipoManifestacao: 'Solicitação',
      identificacao: 'whatsapp',
      assunto: String(request.description || 'Manifestação recebida pelo WhatsApp').trim().split(/\r?\n/)[0].slice(0, 140),
      descricao: String(request.description || '').slice(0, 8000),
      localFato: '',
      dataFato: '',
      envolvidos: '',
      anexos: (request.attachments || []).map(file => ({name: file.name || '', type: file.mimeType || '', path: file.path || '', size: file.size || 0})),
    },
    status: 'Recebida',
    etapaAtual: 'Recebimento',
    origem: 'whatsapp',
    whatsappPhone: phone,
    whatsappConversationId: request.conversationId || '',
    whatsappContactName: request.contactName || '',
    dataManifestacao: now,
    ultimaAtualizacao: now,
  };

  return db.runTransaction(async transaction => {
    const latest = await transaction.get(requestRef);
    if (!latest.exists) throw new Error('Solicitação WhatsApp não encontrada.');
    const latestData = latest.data() || {};
    if (latestData.ouvidoriaId) return {id: latestData.ouvidoriaId, protocolo: latestData.ouvidoriaProtocol || ''};
    transaction.create(manifestationRef, manifestation);
    transaction.update(requestRef, {
      routedToCollection: 'ouvidoria',
      ouvidoriaId: manifestationRef.id,
      ouvidoriaProtocol: protocol,
      updatedAt: now,
    });
    return {id: manifestationRef.id, protocolo: protocol};
  });
}

async function chooseReplyForConversation(text, conversation, conversationRef, settings, incomingMessage = null) {
  const normalized = text.trim().toLocaleLowerCase('pt-BR');
  const conversationData = conversation.data() || {};
  if (conversationData.whatsappRatingState === 'awaiting_score') {
    const score = Number(normalized);
    if (!Number.isInteger(score) || score < 1 || score > 5) return 'Por favor, responda com uma nota de 1 a 5 para avaliar o atendimento.';
    const reviewRef = db.collection('atendimento-avaliacoes').doc(`whatsapp_${conversation.id}`);
    await reviewRef.set({
      protocolo: conversation.id, userId: `whatsapp:${conversationData.phone || conversation.id}`,
      nota: score, notaAtendimento: score, notaServico: score, comentario: '',
      setor: `WhatsApp · ${conversationData.whatsappRatingFlowName || 'Atendimento'}`,
      assunto: 'Avaliação de atendimento via WhatsApp', source: 'whatsapp',
      atendenteUid: 'whatsapp', atendenteNome: 'Atendimento WhatsApp',
      whatsappPhone: conversationData.phone || '', contactName: conversationData.name || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    await conversationRef.set({whatsappRatingState: 'awaiting_comment', whatsappRatingScore: score}, {merge: true});
    return 'Obrigado pela avaliação! Se quiser, envie um comentário sobre o atendimento. Para finalizar sem comentário, digite 0.';
  }
  if (conversationData.whatsappRatingState === 'awaiting_comment') {
    const comment = normalized === '0' ? '' : text.trim().slice(0, 2000);
    await db.collection('atendimento-avaliacoes').doc(`whatsapp_${conversation.id}`).set({comentario: comment, updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    await conversationRef.set({whatsappRatingState: admin.firestore.FieldValue.delete(), whatsappRatingScore: admin.firestore.FieldValue.delete(), status: 'closed', resolvedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    return 'Agradecemos por avaliar o atendimento. Sua opinião foi encaminhada ao módulo de Avaliações. 💙';
  }
  if (conversationData.status === 'waiting_human') return '';
  const activeFlowId = String(conversationData.activeFlowId || '');
  if (activeFlowId) {
    const flowSnapshot = await db.collection('whatsappFlows').doc(activeFlowId).get();
    const flow = flowSnapshot.exists ? flowSnapshot.data() : null;
    const step = (flow?.steps || []).find(item => item.id === conversationData.activeFlowStepId);
    if (flow?.active !== false && step) {
      const stepType = step.type || ((step.options || []).length ? 'menu' : 'message');
      if (stepType === 'informative') return enterFlowStep(step, flow, activeFlowId, conversationRef);
      if (stepType === 'service') {
        if (!String(step.moduleId || '').trim()) return 'Este serviço ainda não está configurado. Tente novamente mais tarde.';
        const portalSettings = await db.collection('system-control').doc('portal').get();
        const moduleSettings = portalSettings.data()?.modules?.[step.moduleId] || {};
        if (moduleSettings.admin !== true && moduleSettings.portal !== true && moduleSettings.app !== true) {
          await conversationRef.set({activeFlowId: '', activeFlowStepId: ''}, {merge: true});
          return 'Este serviço está temporariamente indisponível. Escolha outra opção.';
        }
        const requestRef = db.collection('whatsappServiceRequests').doc();
        await requestRef.set({
          moduleId: step.moduleId,
          moduleName: step.moduleName || step.moduleId,
          conversationId: conversation.id,
          phone: conversation.data()?.phone || '',
          contactName: conversation.data()?.name || '',
          description: text.slice(0, 4000),
          status: 'received',
          source: 'whatsapp',
          flowId: activeFlowId,
          flowStepId: step.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        if (step.moduleId === 'ouvidoria') {
          try {
            const manifestation = await routeWhatsappRequestToOuvidoria(requestRef);
            console.info('Solicitação WhatsApp encaminhada à Ouvidoria.', {protocol: manifestation.protocolo, conversationId: conversation.id});
          } catch (error) {
            console.error('Falha ao encaminhar solicitação WhatsApp à Ouvidoria:', error.message);
            return 'Recebi seu relato, mas não consegui registrá-lo na Ouvidoria agora. Tente novamente mais tarde ou fale com um atendente.';
          }
        }
      const next = (flow.steps || []).find(item => item.id === step.nextStepId);
      if (next?.type === 'informative') {
        await conversationRef.set({activeServiceRequestId: requestRef.id}, {merge: true});
        return enterFlowStep(next, flow, activeFlowId, conversationRef);
      }
        if (next?.type === 'file') {
          await conversationRef.set({activeFlowId, activeFlowStepId: next.id, activeServiceRequestId: requestRef.id}, {merge: true});
          return next.message || (next.type === 'file' ? 'Envie os arquivos solicitados como documento ou foto.' : flow.completionMessage || 'Solicitação registrada.');
        }
        if (next?.type && next.type !== 'message' && next.type !== 'menu') {
          await conversationRef.set({activeFlowId, activeFlowStepId: next.id, activeServiceRequestId: requestRef.id}, {merge: true});
          return next.message || '';
        }
        await conversationRef.set({activeFlowId: '', activeFlowStepId: '', activeServiceRequestId: admin.firestore.FieldValue.delete()}, {merge: true});
        return requestWhatsAppRating(flow, conversationRef, flow.completionMessage || 'Solicitação registrada. Obrigado pelo contato.');
      }
      if (stepType === 'file') {
        const nextStep = (flow.steps || []).find(item => item.id === step.nextStepId);
        if (normalized === '0') {
          if (nextStep?.type === 'informative') return enterFlowStep(nextStep, flow, activeFlowId, conversationRef);
          if (nextStep && nextStep.type !== 'message') await conversationRef.set({activeFlowStepId: nextStep.id}, {merge: true});
          else return requestWhatsAppRating(flow, conversationRef, nextStep?.message || flow.completionMessage || 'Arquivos recebidos. Solicitação registrada.');
          return nextStep?.message || flow.completionMessage || 'Arquivos recebidos. Solicitação registrada.';
        }
        const content = normalizeMessageContent(incomingMessage?.message) || {};
        const mediaType = content.imageMessage ? 'image' : content.documentMessage ? 'document' : content.videoMessage ? 'video' : content.audioMessage ? 'audio' : '';
        if (!mediaType) return step.fallbackMessage || 'Envie um arquivo ou foto para continuar.';
        let requestId = conversation.data()?.activeServiceRequestId;
        if (!requestId && step.moduleId) {
          const requestRef = db.collection('whatsappServiceRequests').doc();
          await requestRef.set({moduleId: step.moduleId, moduleName: step.moduleName || step.moduleId, conversationId: conversation.id, phone: conversation.data()?.phone || '', contactName: conversation.data()?.name || '', description: '', status: 'received', source: 'whatsapp', createdAt: admin.firestore.FieldValue.serverTimestamp()});
          requestId = requestRef.id;
          await conversationRef.set({activeServiceRequestId: requestId}, {merge: true});
        }
        if (!requestId) return 'Associe este bloco a um serviço no painel antes de receber arquivos.';
        try {
          const mimeType = String(content.imageMessage?.mimetype || content.documentMessage?.mimetype || content.videoMessage?.mimetype || 'application/octet-stream');
          if (Array.isArray(step.allowedMimeTypes) && step.allowedMimeTypes.length && !step.allowedMimeTypes.includes(mimeType)) return 'Esse formato de arquivo não está habilitado nesta etapa. Envie um formato permitido.';
          const existingRequest = await db.collection('whatsappServiceRequests').doc(requestId).get();
          const attachments = existingRequest.data()?.attachments || [];
          if (attachments.length >= Number(step.maxFiles || 3)) return `Esta solicitação já recebeu o limite de ${step.maxFiles || 3} arquivo(s).`;
          const maxBytes = Number(step.maxFileSizeMB || 10) * 1024 * 1024;
          const declaredBytes = Number(content.imageMessage?.fileLength || content.documentMessage?.fileLength || content.videoMessage?.fileLength || 0);
          if (declaredBytes > maxBytes) return 'O arquivo excede o limite desta etapa. Envie um arquivo menor.';
          const fileBuffer = await downloadMediaMessage(incomingMessage, 'buffer', {}, {logger, reuploadRequest: socket?.updateMediaMessage});
          if (fileBuffer.length > maxBytes) return 'O arquivo excede o limite desta etapa. Envie um arquivo menor.';
          const originalName = String(content.documentMessage?.fileName || `${mediaType}-${Date.now()}`).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120);
          const filePath = `whatsapp-service-requests/${requestId}/${Date.now()}-${originalName}`;
          const file = admin.storage().bucket().file(filePath);
          await file.save(fileBuffer, {metadata: {contentType: mimeType, metadata: {conversationId: conversation.id || ''}}});
          const attachment = {name: originalName, path: filePath, mimeType, size: fileBuffer.length, receivedAt: admin.firestore.FieldValue.serverTimestamp()};
          await db.collection('whatsappServiceRequests').doc(requestId).set({attachments: admin.firestore.FieldValue.arrayUnion(attachment), updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
          if (existingRequest.data()?.ouvidoriaId) {
            await db.collection('ouvidoria').doc(existingRequest.data().ouvidoriaId).update({
              'dadosManifestacao.anexos': admin.firestore.FieldValue.arrayUnion({name: originalName, type: mimeType, path: filePath, size: fileBuffer.length}),
              ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          const total = attachments.length + 1;
          if (total < Number(step.maxFiles || 3)) return `Arquivo ${total} de ${step.maxFiles || 3} recebido. Envie outro arquivo ou digite 0 para concluir.`;
          if (nextStep?.type === 'informative') return enterFlowStep(nextStep, flow, activeFlowId, conversationRef);
          if (nextStep && nextStep.type !== 'message') await conversationRef.set({activeFlowStepId: nextStep.id}, {merge: true});
          else return requestWhatsAppRating(flow, conversationRef, nextStep?.message || flow.completionMessage || 'Arquivos recebidos. Solicitação registrada.');
          return nextStep?.message || flow.completionMessage || 'Arquivos recebidos. Solicitação registrada.';
        } catch (error) {
          console.error('Falha ao armazenar arquivo recebido pelo WhatsApp:', error.message);
          return 'Não consegui armazenar esse arquivo. Tente enviá-lo novamente.';
        }
      }
      const options = stepType === 'menu' ? (step.options || []) : [];
      const selectedIndex = /^\d{1,2}$/.test(normalized) ? Number(normalized) - 1 : -1;
      const selected = options.find((option, index) => {
        const label = String(option.label || '').trim().toLocaleLowerCase('pt-BR');
        return label && (normalized === label || normalized.includes(label) || index === selectedIndex);
      });
      if (!selected) return step.fallbackMessage || settings.fallbackMessage || 'Não entendi sua resposta. Escolha uma das opções disponíveis.';
      if (selected.action === 'handoff') {
        await conversationRef.set({activeFlowId: '', activeFlowStepId: '', status: 'waiting_human', handoffRequestedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
        return flow.handoffMessage || settings.handoffMessage || 'Vou encaminhar você para um atendente.';
      }
      const nextStep = (flow.steps || []).find(item => item.id === selected.nextStepId);
      if (!nextStep) {
        return requestWhatsAppRating(flow, conversationRef, flow.completionMessage || 'Atendimento concluído. Obrigado pelo contato.');
      }
      if (nextStep.type === 'informative') return enterFlowStep(nextStep, flow, activeFlowId, conversationRef);
      if (!['menu'].includes(nextStep.type || ((nextStep.options || []).length ? 'menu' : 'message'))) {
        if (['service','file'].includes(nextStep.type)) {
          await conversationRef.set({activeFlowId, activeFlowStepId: nextStep.id}, {merge: true});
          return nextStep.message || '';
        }
        return requestWhatsAppRating(flow, conversationRef, nextStep.message || flow.completionMessage || 'Atendimento concluído. Obrigado pelo contato.');
      }
      await conversationRef.set({activeFlowId, activeFlowStepId: nextStep.id}, {merge: true});
      return formatFlowStep(nextStep) || settings.fallbackMessage || '';
    }
    await conversationRef.set({activeFlowId: '', activeFlowStepId: ''}, {merge: true});
  }

  if (!conversation.exists) {
    const flowDoc = await getActiveFlow();
    if (flowDoc) {
      const flow = flowDoc.data;
      const firstStep = (flow.steps || []).find(step => step.message);
      if (firstStep?.type === 'informative') return [settings.greetingMessage, await enterFlowStep(firstStep, flow, flowDoc.id, conversationRef)].filter(Boolean).join('\n\n');
      if (firstStep.type !== 'message' || (firstStep.options || []).length) {
        await conversationRef.set({activeFlowId: flowDoc.id, activeFlowStepId: firstStep.id}, {merge: true});
      }
      return [settings.greetingMessage, formatFlowStep(firstStep)].filter(Boolean).join('\n\n');
    }
    if (settings.greetingMessage) return settings.greetingMessage;
  }

  const automatic = await db.collection('whatsappAutomaticMessages').where('active', '==', true).get();
  const matchingRule = automatic.docs.map(doc => doc.data()).find(item =>
    item.trigger && normalized.includes(String(item.trigger).toLocaleLowerCase('pt-BR')));
  if (matchingRule?.text) return matchingRule.text;
  const flowDoc = await getActiveFlow();
  if (flowDoc) {
    const flow = flowDoc.data;
    const firstStep = (flow.steps || []).find(step => step.message);
    if (firstStep?.type === 'informative') return await enterFlowStep(firstStep, flow, flowDoc.id, conversationRef);
    if (firstStep.type !== 'message' || (firstStep.options || []).length) {
      await conversationRef.set({activeFlowId: flowDoc.id, activeFlowStepId: firstStep.id}, {merge: true});
    }
    return formatFlowStep(firstStep) || settings.fallbackMessage || '';
  }
  return settings.fallbackMessage || '';
}

async function processIncomingMessage(message, allowAutomaticReply = false) {
  if (!message?.message || message.key?.fromMe) return;
  const remoteJid = String(message.key?.remoteJid || '');
  const remoteJidAlt = String(message.key?.remoteJidAlt || '');
  const jid = remoteJid.endsWith('@s.whatsapp.net') ? remoteJid :
    remoteJidAlt.endsWith('@s.whatsapp.net') ? remoteJidAlt : remoteJid;
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) {
    console.info('Mensagem WhatsApp ignorada por tipo de conversa não suportado.', {
      jidType: remoteJid.split('@').pop() || 'unknown',
    });
    return;
  }
  const normalizedContent = normalizeMessageContent(message.message) || {};
  const hasMedia = Boolean(normalizedContent.imageMessage || normalizedContent.documentMessage || normalizedContent.videoMessage || normalizedContent.audioMessage);
  const text = messageText(message).trim() || (hasMedia ? '[Arquivo recebido]' : '');
  if (!text) {
    console.info('Mensagem WhatsApp sem texto legível recebida.', {
      jidType: remoteJid.split('@').pop() || 'unknown',
      messageType: Object.keys(normalizeMessageContent(message.message) || {})[0] || 'unknown',
    });
    return;
  }
  const id = safeDocumentId(`baileys_${message.key?.id || ''}`);
  const messageRef = db.collection('whatsappMessages').doc(id);
  if ((await messageRef.get()).exists) return;
  const conversationId = safeDocumentId(jid);
  const conversationRef = db.collection('whatsappConversations').doc(conversationId);
  const [conversation, settingsSnapshot] = await Promise.all([
    conversationRef.get(),
    settingsRef.get(),
  ]);
  const settings = settingsSnapshot.data() || {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  await messageRef.set({
    conversationId,
    phone: jid,
    name: message.pushName || '',
    text,
    direction: 'inbound',
    status: 'received',
    provider: 'Baileys',
    providerMessageId: String(message.key?.id || ''),
    createdAt: now,
  });
  await conversationRef.set({
    phone: jid,
    name: message.pushName || conversation.data()?.name || jid.split('@')[0],
    lastMessage: text,
    updatedAt: now,
    unreadCount: admin.firestore.FieldValue.increment(1),
    status: conversation.data()?.status === 'waiting_human' ? 'waiting_human' : 'open',
  }, {merge: true});
  console.info('Mensagem WhatsApp recebida e salva.', {
    jidType: jid.split('@').pop(),
    messageId: String(message.key?.id || ''),
  });

  if (!allowAutomaticReply || !settings.enabled || connectionState !== 'connected' || !socket) return;
  const answer = await chooseReplyForConversation(text, conversation, conversationRef, settings, message);
  if (!answer) return;
  const sent = await socket.sendMessage(jid, {text: answer});
  await saveOutboundMessage(jid, answer, conversationId, sent?.key?.id || '');
}

async function handleIncomingBatch(batch) {
  console.info('Evento messages.upsert recebido.', {
    type: batch.type,
    count: (batch.messages || []).length,
  });
  for (const message of batch.messages || []) {
    messageQueue = messageQueue
        .then(() => processIncomingMessage(message, batch.type === 'notify'))
        .catch(error => console.error('Falha ao processar mensagem WhatsApp:', error.message));
  }
}

async function startSocket() {
  if (connectionState === 'connected' && socket) return;
  if (startPromise) return startPromise;
  manualDisconnect = false;
  startPromise = (async () => {
    console.info('Iniciando socket Baileys.');
    await setStatus('connecting', {lastError: ''});
    const auth = await loadAuthState();
    socket = makeWASocket({
      auth,
      browser: Browsers.macOS('BluPortal'),
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    socket.ev.on('creds.update', () => {
      saveCreds(auth.creds).catch(error =>
        console.error('Falha ao salvar as credenciais da sessão:', error.message));
    });
    socket.ev.on('messages.upsert', handleIncomingBatch);
    socket.ev.on('connection.update', async update => {
      try {
        console.info('Estado da conexão Baileys atualizado.', {
          connection: update.connection || 'pending',
          hasQr: Boolean(update.qr),
          hasError: Boolean(update.lastDisconnect?.error),
          statusCode: update.lastDisconnect?.error?.output?.statusCode || 0,
        });
        if (update.qr) {
          qrDataUrl = await QRCode.toDataURL(update.qr, {width: 280, margin: 1});
          await setStatus('qr_required');
        }
        if (update.connection === 'open') {
          reconnectAttempt = 0;
          qrDataUrl = '';
          await setStatus('connected', {
            phone: auth.creds.me?.id?.split(':')[0] || '',
            lastError: '',
          });
        }
        if (update.connection === 'close') {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode || 0;
          socket = null;
          qrDataUrl = '';
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          await setStatus(loggedOut ? 'logged_out' : 'disconnected', {
            lastError: loggedOut ? 'WhatsApp encerrou a sessão. Gere um novo QR Code.' : '',
          });
          if (!manualDisconnect && !loggedOut) scheduleReconnect();
        }
      } catch (error) {
        console.error('Falha ao atualizar o estado WhatsApp:', error.message);
      }
    });
  })().finally(() => {
    startPromise = null;
  });
  return startPromise;
}

async function clearAuthState() {
  await authRef.delete().catch(() => {});
  while (true) {
    const snapshot = await authKeys.limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

function scheduleReconnect() {
  if (manualDisconnect || reconnectTimer || connectionState === 'logged_out') return;
  const delay = Math.min(30000, 1000 * (2 ** Math.min(reconnectAttempt++, 5)));
  console.info(`Nova tentativa de conexão WhatsApp em ${Math.ceil(delay / 1000)}s.`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const snapshot = await authRef.get();
      if (!snapshot.data()?.creds?.registered || manualDisconnect) return;
      await startSocket();
    } catch (error) {
      console.error('Reconexão Baileys falhou:', error.message);
      scheduleReconnect();
    }
  }, delay);
}

async function superviseSocket() {
  if (manualDisconnect || startPromise || reconnectTimer || socket || connectionState === 'connected') return;
  try {
    const snapshot = await authRef.get();
    if (!snapshot.data()?.creds?.registered) {
      if (!['qr_required', 'logged_out'].includes(connectionState)) {
        await setStatus('disconnected', {phone: '', lastError: 'Sessão WhatsApp ainda não pareada.'});
      }
      return;
    }
    console.warn('Sessão pareada sem socket ativo; iniciando recuperação automática.');
    await startSocket();
  } catch (error) {
    console.error('Supervisor não conseguiu iniciar Baileys:', error.message);
    scheduleReconnect();
  }
}

app.get('/health', (_req, res) => res.json({ok: true, status: connectionState}));

app.get('/api/session/status', requireAdmin, async (_req, res) => {
  const snapshot = await statusRef.get();
  return res.json(snapshot.data() || {status: connectionState, qrCode: qrDataUrl});
});

app.post('/api/session/start', requireAdmin, async (_req, res) => {
  try {
    const [statusSnapshot, authSnapshot] = await Promise.all([statusRef.get(), authRef.get()]);
    if (statusSnapshot.data()?.status === 'logged_out' && authSnapshot.data()?.creds?.registered) {
      await clearAuthState();
      connectionState = 'disconnected';
      qrDataUrl = '';
    }
    await startSocket();
    return res.json({status: connectionState});
  } catch (error) {
    console.error('Falha ao iniciar Baileys:', error.message);
    await setStatus('error', {lastError: 'Não foi possível iniciar a conexão WhatsApp.'});
    return res.status(503).json({error: 'Não foi possível iniciar a conexão WhatsApp.'});
  }
});

app.post('/api/session/logout', requireAdmin, async (_req, res) => {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  const current = socket;
  socket = null;
  try {
    if (current?.user) await current.logout();
    else current?.end(undefined);
  } catch (error) {
    console.warn('Logout WhatsApp finalizado com aviso:', error.message);
  }
  await clearAuthState();
  qrDataUrl = '';
  await setStatus('logged_out', {phone: '', lastError: ''});
  return res.json({status: 'logged_out'});
});

app.post('/api/files/signed-url', requireAdmin, async (req, res) => {
  const requestId = safeDocumentId(req.body?.requestId);
  const objectPath = String(req.body?.path || '');
  if (!requestId || !objectPath.startsWith(`whatsapp-service-requests/${requestId}/`)) {
    return res.status(400).json({error: 'Arquivo inválido.'});
  }
  const requestSnapshot = await db.collection('whatsappServiceRequests').doc(requestId).get();
  const attachment = (requestSnapshot.data()?.attachments || []).find(item => item.path === objectPath);
  if (!attachment) return res.status(404).json({error: 'Arquivo não encontrado nesta solicitação.'});
  try {
    const [url] = await admin.storage().bucket().file(objectPath).getSignedUrl({action: 'read', expires: Date.now() + 10 * 60 * 1000});
    return res.json({url});
  } catch (error) {
    console.error('Falha ao gerar link temporário para arquivo WhatsApp:', error.message);
    return res.status(500).json({error: 'Não foi possível gerar o link do arquivo.'});
  }
});

app.post('/api/conversations/delete', requireAdmin, async (req, res) => {
  const conversationId = safeDocumentId(req.body?.conversationId);
  if (!conversationId) return res.status(400).json({error: 'Conversa inválida.'});
  try {
    const messages = db.collection('whatsappMessages').where('conversationId', '==', conversationId);
    let deletedMessages = 0;
    while (true) {
      const snapshot = await messages.limit(400).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach(message => batch.delete(message.ref));
      await batch.commit();
      deletedMessages += snapshot.size;
    }
    await db.collection('whatsappConversations').doc(conversationId).delete();
    return res.json({deleted: true, deletedMessages});
  } catch (error) {
    console.error('Falha ao excluir conversa WhatsApp:', error.message);
    return res.status(500).json({error: 'Não foi possível excluir a conversa e suas mensagens.'});
  }
});

app.post('/api/service-requests/route-ouvidoria', requireAdmin, async (req, res) => {
  const requestId = safeDocumentId(req.body?.requestId);
  if (!requestId) return res.status(400).json({error: 'Solicitação inválida.'});
  try {
    const result = await routeWhatsappRequestToOuvidoria(db.collection('whatsappServiceRequests').doc(requestId));
    return res.json({routed: true, ...result});
  } catch (error) {
    console.error('Falha ao encaminhar solicitação para a Ouvidoria:', error.message);
    return res.status(400).json({error: error.message || 'Não foi possível encaminhar a solicitação para a Ouvidoria.'});
  }
});

app.post('/api/conversations/finish', requireAdmin, async (req, res) => {
  const conversationId = safeDocumentId(req.body?.conversationId);
  if (!conversationId) return res.status(400).json({error: 'Conversa inválida.'});
  if (connectionState !== 'connected' || !socket) return res.status(409).json({error: 'Conecte o WhatsApp antes de concluir o atendimento.'});
  try {
    const conversationRef = db.collection('whatsappConversations').doc(conversationId);
    const snapshot = await conversationRef.get();
    if (!snapshot.exists) return res.status(404).json({error: 'Conversa não encontrada.'});
    const data = snapshot.data() || {};
    const phone = String(data.phone || conversationId);
    const jid = /@(s\.whatsapp\.net|lid)$/.test(phone) ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    const text = await requestWhatsAppRating({name: 'Atendimento humano'}, conversationRef, 'Agradecemos por conversar com nossa equipe.');
    const sent = await socket.sendMessage(jid, {text});
    await saveOutboundMessage(jid, text, conversationId, sent?.key?.id || '');
    await conversationRef.set({assignedTo: admin.firestore.FieldValue.delete(), assignedToName: admin.firestore.FieldValue.delete(), claimedAt: admin.firestore.FieldValue.delete(), handoffRequestedAt: admin.firestore.FieldValue.delete()}, {merge: true});
    return res.json({finished: true, ratingRequested: true});
  } catch (error) {
    console.error('Falha ao concluir atendimento WhatsApp:', error.message);
    return res.status(500).json({error: 'Não foi possível concluir o atendimento e enviar a avaliação.'});
  }
});

app.post('/api/messages/send', requireAdmin, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const suppliedJid = String(req.body?.phone || '').trim();
  const jid = /@(s\.whatsapp\.net|lid)$/.test(suppliedJid) ? suppliedJid :
    `${suppliedJid.replace(/\D/g, '')}@s.whatsapp.net`;
  const phone = jid.split('@')[0];
  const conversationId = safeDocumentId(req.body?.conversationId || `${phone}@s.whatsapp.net`);
  if (connectionState !== 'connected' || !socket) {
    return res.status(409).json({error: 'Conecte o WhatsApp antes de enviar mensagens.'});
  }
  if ((!/^\d{10,15}$/.test(phone) && !jid.endsWith('@lid')) || !text || text.length > 4000) {
    return res.status(400).json({error: 'Informe um número com DDI e uma mensagem de até 4000 caracteres.'});
  }
  try {
    const sent = await socket.sendMessage(jid, {text});
    await saveOutboundMessage(jid, text, conversationId, sent?.key?.id || '');
    return res.json({sent: true});
  } catch (error) {
    console.error('Falha ao enviar mensagem WhatsApp:', error.message);
    return res.status(502).json({error: 'O WhatsApp não aceitou o envio da mensagem.'});
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`BluPortal Baileys bridge listening on ${port}`);
  superviseSocket().catch(error => console.error('Inicialização Baileys falhou:', error.message));
  watchdogTimer = setInterval(() => superviseSocket().catch(error => console.error('Supervisor Baileys falhou:', error.message)), 30000);
});

process.on('SIGTERM', () => {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  clearInterval(watchdogTimer);
  socket?.end(undefined);
  process.exit(0);
});
