import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { functions, storage } from '../firebase';

// Operações que alteram o processo são centralizadas em Cloud Functions para
// preservar numeração transacional, auditoria e autorização no servidor.
const explainCallableError = error => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const missingService = code === 'functions/not-found'
    || code === 'functions/unavailable'
    || /preflight|cors|failed to fetch|\b404\b|not found/i.test(message);
  if (missingService) {
    return new Error('O serviço de protocolo não está publicado ou disponível neste projeto. Publique as Functions processCommand e publicProcessLookup na região us-central1 e tente novamente.');
  }
  if (code === 'functions/internal') {
    console.error('Erro interno em processCommand:', error);
    return new Error('O serviço de protocolo encontrou um erro interno. Consulte os logs da Function processCommand para identificar a causa.');
  }
  return error;
};

const command = (action, payload = {}) => httpsCallable(functions, 'processCommand')({ action, ...payload }).catch(error => {
  throw explainCallableError(error);
});

export const criarProcesso = payload => command('create', payload);
export const tramitarProcesso = (processId, payload) => command('move', { processId, ...payload });
export const adicionarDocumento = (processId, payload) => command('document', { processId, ...payload });
export const criarDespacho = (processId, payload) => command('dispatch', { processId, ...payload });
export const solicitarPendencia = (processId, payload) => command('pending', { processId, ...payload });
export const responderPendencia = (processId, payload) => command('answerPending', { processId, ...payload });
export const concluirProcesso = processId => command('complete', { processId });
export const arquivarProcesso = processId => command('archive', { processId });
export const reabrirProcesso = processId => command('reopen', { processId });
export const registrarEvento = (processId, payload) => command('event', { processId, ...payload });
export const receberProcesso = (processId, payload = {}) => command('receive', { processId, ...payload });
export const enviarParaAssinatura = (processId, payload) => command('signature', { processId, ...payload });
export const relacionarProcesso = (processId, payload) => command('relationship', { processId, ...payload });
export const suspenderProcesso = (processId, payload) => command('suspend', { processId, ...payload });
export const cancelarProcesso = (processId, payload) => command('cancel', { processId, ...payload });
export const atualizarProcesso = (processId, payload) => command('update', { processId, ...payload });
export const consultarProcessoPublico = payload => httpsCallable(functions, 'publicProcessLookup')(payload).catch(error => {
  throw explainCallableError(error);
});

export const anexarArquivosAoProcesso = async (processId, files, accessLevel = 'restricted') => {
  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
  const uploaded = [];
  for (const file of files) {
    if (!allowed.has(file.type)) throw new Error(`Formato não permitido: ${file.name}`);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `processes/${processId}/documents/${Date.now()}-${safeName}`;
    const target = ref(storage, storagePath);
    await uploadBytes(target, file, { contentType: file.type });
    const url = await getDownloadURL(target);
    const result = await adicionarDocumento(processId, {
      name: file.name, storagePath, url, mimeType: file.type,
      size: file.size, accessLevel, version: 1,
    });
    uploaded.push(result.data);
  }
  return uploaded;
};
