import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const call = name => httpsCallable(functions, name);

const withFriendlyError = action => async (...args) => {
  try {
    return await action(...args);
  } catch (error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'functions/internal' || /cors|failed to fetch|network request failed/i.test(message)) {
      throw new Error('O serviço de videoconferência está indisponível. A reunião foi salva e a sala será criada automaticamente quando o serviço estiver ativo.');
    }
    throw error;
  }
};

/**
 * Fachada do domínio de videoconferência. Nenhuma tela legislativa precisa
 * conhecer Jitsi, URLs de sala ou o formato do JWT do provedor.
 */
export const VideoConferenceService = {
  createRoom: withFriendlyError(payload => call('createVideoConference')(payload).then(result => result.data)),
  generateJoinToken: withFriendlyError(conferenceId => call('getVideoConferenceJoinToken')({ conferenceId }).then(result => result.data)),
  startRecording: withFriendlyError(conferenceId => call('changeVideoConferenceStatus')({ conferenceId, action: 'startRecording' }).then(result => result.data)),
  stopRecording: withFriendlyError(conferenceId => call('changeVideoConferenceStatus')({ conferenceId, action: 'stopRecording' }).then(result => result.data)),
  closeRoom: withFriendlyError(conferenceId => call('changeVideoConferenceStatus')({ conferenceId, action: 'closeRoom' }).then(result => result.data)),
  startTranscription: withFriendlyError(conferenceId => call('changeVideoConferenceStatus')({ conferenceId, action: 'startTranscription' }).then(result => result.data)),
};

export const VIDEO_CONFERENCE_STATUS = {
  SCHEDULED: 'SCHEDULED',
  WAITING: 'WAITING',
  LIVE: 'LIVE',
  FINISHED: 'FINISHED',
  PROCESSING_RECORDING: 'PROCESSING_RECORDING',
  TRANSCRIBING: 'TRANSCRIBING',
  GENERATING_MINUTES: 'GENERATING_MINUTES',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};
