import React, { useEffect, useState } from 'react';
import { LiaExclamationTriangleSolid, LiaSpinnerSolid, LiaVideoSolid } from 'react-icons/lia';
import { VideoConferenceService } from '../services/VideoConferenceService';

const jitsiDomain = String(process.env.REACT_APP_JITSI_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

export default function LegislativeVideoConference({ conference, onReady }) {
  const [join, setJoin] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!conference?.id) return undefined;
    VideoConferenceService.generateJoinToken(conference.id)
      .then(value => active && setJoin(value))
      .catch(currentError => active && setError(currentError.message || 'Não foi possível autorizar a entrada na reunião.'));
    return () => { active = false; };
  }, [conference?.id]);

  useEffect(() => {
    if (join && onReady) onReady(join);
  }, [join, onReady]);

  if (!jitsiDomain) return <section className="legislative-video-state"><LiaExclamationTriangleSolid /><div><strong>Videoconferência não configurada</strong><p>Defina REACT_APP_JITSI_DOMAIN no ambiente do Portal.</p></div></section>;
  if (error) return <section className="legislative-video-state error"><LiaExclamationTriangleSolid /><div><strong>Não foi possível entrar na sala</strong><p>{error}</p></div></section>;
  if (!join) return <section className="legislative-video-state"><LiaSpinnerSolid className="spin" /><div><strong>Preparando videoconferência</strong><p>Validando sua permissão e emitindo acesso temporário.</p></div></section>;

  return <section className="legislative-video-frame"><header><LiaVideoSolid /><span>{conference.title}</span><small>Comunicação protegida da Câmara</small></header><iframe title={conference.title} src={`https://${jitsiDomain}/${join.roomId}?jwt=${encodeURIComponent(join.token)}#config.prejoinPageEnabled=false&interfaceConfig.SHOW_JITSI_WATERMARK=false`} allow="camera; microphone; display-capture; fullscreen; autoplay" /></section>;
}
