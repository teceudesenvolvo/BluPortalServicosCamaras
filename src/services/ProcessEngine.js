import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// Operações que alteram o processo são centralizadas em Cloud Functions para
// preservar numeração transacional, auditoria e autorização no servidor.
const command = (action, payload = {}) => httpsCallable(functions, 'processCommand')({ action, ...payload });

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
