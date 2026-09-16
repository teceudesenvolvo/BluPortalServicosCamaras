export const LEGISLATIVE_STAGES = {
  DRAFT: 'Rascunho',
  PROTOCOLLED: 'Protocolada',
  LEGAL_REVIEW: 'Em análise jurídica',
  AUTHOR_REVISION: 'Aguardando adequação do autor',
  PRESIDENCY: 'Aguardando despacho da Presidência',
  COMMISSION: 'Aguardando distribuição à comissão',
  RAPPORTEUR: 'Em análise pelo relator',
  COMMISSION_DELIBERATION: 'Aguardando pauta da comissão',
  PRESIDENCY_DECISION: 'Aguardando decisão da Presidência',
  READY_FOR_AGENDA: 'Pronta para pauta',
  AGENDA: 'Em pauta',
  DISCUSSION: 'Em discussão',
  VOTING: 'Em votação',
  SECOND_TURN: 'Aguardando 2º turno',
  FINAL_TEXT: 'Em redação final',
  AUTOGRAPH: 'Autógrafo em elaboração',
  SENT_FOR_SANCTION: 'Enviada para sanção',
  PROMULGATED: 'Promulgada',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  ARCHIVED: 'Arquivada',
};

export const DEFAULT_LEGISLATIVE_CONFIGURATION = {
  propositionTypes: ['Projeto de lei', 'Projeto de lei complementar', 'Projeto de resolução', 'Projeto de decreto legislativo', 'Requerimento', 'Indicação', 'Moção', 'Emenda', 'Substitutivo', 'Pedido de informação'],
  votingTypes: ['Nominal', 'Simbólica', 'Secreta'],
  quorums: ['Maioria simples', 'Maioria absoluta', 'Três quintos', 'Dois terços'],
  agendaBlocks: ['Abertura', 'Expediente', 'Pequeno expediente', 'Grande expediente', 'Ordem do dia', 'Explicações pessoais', 'Encerramento'],
};

const has = (context, permission) => Boolean(context?.permissions?.includes(permission));

// O fluxo é configurável por Câmara. Esta matriz é apenas o fluxo inicial
// aplicado até que a Câmara publique regras próprias no Controle Legislativo.
export const transitionOptions = (matter, context) => {
  const rawStage = String(matter?.status || '').trim().toLowerCase();
  const stage = ['protocolada', 'protocolado', 'protocolo', 'minuta'].includes(rawStage) ? LEGISLATIVE_STAGES.PROTOCOLLED : (matter?.status || LEGISLATIVE_STAGES.DRAFT);
  const author = matter?.vereadorId === context?.userId || matter?.authorId === context?.userId;
  const president = context?.isCouncilPresident || has(context, 'legislative.presidency');
  const secretariat = has(context, 'legislative.secretariat');
  const legal = has(context, 'legislative.legalOpinion');
  const options = [];
  if (stage === LEGISLATIVE_STAGES.DRAFT && (author || secretariat)) options.push(['Submeter à análise jurídica', LEGISLATIVE_STAGES.LEGAL_REVIEW, 'Protocolo e análise jurídica']);
  if (stage === LEGISLATIVE_STAGES.PROTOCOLLED && (secretariat || legal)) options.push(['Iniciar parecer jurídico', LEGISLATIVE_STAGES.LEGAL_REVIEW, 'Análise Jurídica']);
  if (stage === LEGISLATIVE_STAGES.LEGAL_REVIEW && legal) options.push(['Solicitar adequação', LEGISLATIVE_STAGES.AUTHOR_REVISION, 'Parecer Jurídico']);
  if (stage === LEGISLATIVE_STAGES.AUTHOR_REVISION && author) options.push(['Reenviar ao Jurídico', LEGISLATIVE_STAGES.LEGAL_REVIEW, 'Nova versão do autor']);
  if (stage === LEGISLATIVE_STAGES.PRESIDENCY && president) options.push(['Encaminhar à comissão', LEGISLATIVE_STAGES.COMMISSION, 'Despacho da Presidência']);
  if (stage === LEGISLATIVE_STAGES.PRESIDENCY && president) options.push(['Encaminhar ao Plenário', LEGISLATIVE_STAGES.READY_FOR_AGENDA, 'Despacho da Presidência']);
  if (stage === LEGISLATIVE_STAGES.PRESIDENCY && president) options.push(['Arquivar matéria', LEGISLATIVE_STAGES.ARCHIVED, 'Despacho da Presidência']);
  if (stage === LEGISLATIVE_STAGES.COMMISSION && (president || has(context, 'legislative.commissionPresident'))) options.push(['Encaminhar à relatoria', LEGISLATIVE_STAGES.RAPPORTEUR, 'Comissão']);
  if (stage === LEGISLATIVE_STAGES.PRESIDENCY_DECISION && president) options.push(['Encaminhar ao Plenário', LEGISLATIVE_STAGES.READY_FOR_AGENDA, 'Despacho da Presidência']);
  if (stage === LEGISLATIVE_STAGES.PRESIDENCY_DECISION && president) options.push(['Devolver à comissão', LEGISLATIVE_STAGES.COMMISSION, 'Despacho da Presidência']);
  if (stage === LEGISLATIVE_STAGES.PRESIDENCY_DECISION && president) options.push(['Arquivar matéria', LEGISLATIVE_STAGES.ARCHIVED, 'Despacho da Presidência']);
  if (stage === LEGISLATIVE_STAGES.READY_FOR_AGENDA && (secretariat || president)) options.push(['Incluir em pauta', LEGISLATIVE_STAGES.AGENDA, 'Pauta']);
  if (stage === LEGISLATIVE_STAGES.AGENDA && president) options.push(['Colocar em discussão', LEGISLATIVE_STAGES.DISCUSSION, 'Plenário']);
  if (stage === LEGISLATIVE_STAGES.DISCUSSION && president) options.push(['Abrir votação', LEGISLATIVE_STAGES.VOTING, 'Plenário']);
  if (stage === LEGISLATIVE_STAGES.SECOND_TURN && (secretariat || president)) options.push(['Incluir no 2º turno', LEGISLATIVE_STAGES.AGENDA, 'Pauta']);
  if (stage === LEGISLATIVE_STAGES.FINAL_TEXT && secretariat) options.push(['Preparar autógrafo', LEGISLATIVE_STAGES.AUTOGRAPH, 'Secretaria Legislativa']);
  if (stage === LEGISLATIVE_STAGES.AUTOGRAPH && president) options.push(['Encaminhar para sanção', LEGISLATIVE_STAGES.SENT_FOR_SANCTION, 'Presidência']);
  if (stage === LEGISLATIVE_STAGES.AUTOGRAPH && president) options.push(['Promulgar matéria', LEGISLATIVE_STAGES.PROMULGATED, 'Presidência']);
  if (stage === LEGISLATIVE_STAGES.SENT_FOR_SANCTION && president) options.push(['Registrar promulgação', LEGISLATIVE_STAGES.PROMULGATED, 'Presidência']);
  if ([LEGISLATIVE_STAGES.REJECTED, LEGISLATIVE_STAGES.PROMULGATED].includes(stage) && (secretariat || president)) options.push(['Arquivar processo', LEGISLATIVE_STAGES.ARCHIVED, 'Arquivo Legislativo']);
  return options;
};

export const makeProceeding = ({ matterId, chamberId, cabinetId, councilorId, authorName, from, to, sector, description }) => ({
  matterId,
  camaraId: chamberId,
  gabineteId: cabinetId,
  vereadorId: councilorId,
  fromStatus: from || null,
  status: to,
  stage: sector,
  description,
  authorName,
});

// Consolida funções simultâneas do parlamentar. Um vereador pode presidir a
// Câmara, liderar uma comissão e relatar matérias sem mudar seu perfil-base.
export const resolveLegislativeContext = ({ userId, profile = {}, commissions = [], rapporteurships = [], legislativeConfig = {} }) => {
  const assignment = (legislativeConfig.boardAssignments || []).find(item => item.userId === userId) || {};
  const commissionMemberships = commissions.filter(item => (item.memberIds || []).includes(userId));
  const commissionPresidentOf = commissions.filter(item => item.presidentId === userId).map(item => item.id);
  const rapporteurOf = rapporteurships.filter(item => item.rapporteurId === userId && item.status !== 'Concluída').map(item => item.matterId);
  const isCouncilPresident = Boolean(profile.isCouncilPresident || profile.presidenteCamara || String(profile.mesaPosition || assignment.role || '').toLowerCase() === 'presidente');
  const permissions = [...(profile.legislativePermissions || []), ...(assignment.permissions || [])];
  if (profile.tipo === 'Secretaria Legislativa') permissions.push('legislative.secretariat');
  if (profile.tipo === 'Juridico') permissions.push('legislative.legalOpinion');
  if (isCouncilPresident) permissions.push('legislative.presidency');
  if (commissionPresidentOf.length) permissions.push('legislative.commissionPresident');
  if (rapporteurOf.length) permissions.push('legislative.rapporteur');
  if (assignment.role === 'Secretária Legislativa') permissions.push('legislative.secretariat', 'legislative.minutes');
  return { userId, isCouncilPresident, boardRole: assignment.role || '', commissionMemberships, commissionPresidentOf, rapporteurOf, permissions: [...new Set(permissions)] };
};
