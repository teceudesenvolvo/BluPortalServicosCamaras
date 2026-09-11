export const DEMAND_STATUSES = [
  'RECEBIDA',
  'EM ANÁLISE',
  'EM ATENDIMENTO',
  'ENCAMINHADA',
  'AGUARDANDO RESPOSTA DO ÓRGÃO',
  'RESPONDIDA',
  'RESOLVIDA',
  'CANCELADA',
  'ARQUIVADA',
  'NÃO RESOLVIDA',
];

export const DEMAND_PRIORITIES = ['Baixa', 'Normal', 'Alta', 'Urgente'];
export const DEMAND_CATEGORIES = [
  'Saúde', 'Infraestrutura', 'Iluminação', 'Transporte', 'Educação',
  'Segurança', 'Assistência Social', 'Meio Ambiente', 'Limpeza Urbana',
  'Mobilidade', 'Outros',
];

export const statusLabel = status => {
  const labels = {
    RECEBIDA: 'Solicitação recebida',
    'EM ANÁLISE': 'Em análise pelo gabinete',
    'EM ATENDIMENTO': 'Em atendimento',
    ENCAMINHADA: 'Encaminhada ao órgão responsável',
    'AGUARDANDO RESPOSTA DO ÓRGÃO': 'Aguardando resposta',
    RESPONDIDA: 'Resposta recebida',
    RESOLVIDA: 'Demanda resolvida',
    CANCELADA: 'Solicitação cancelada',
    ARQUIVADA: 'Solicitação arquivada',
    'NÃO RESOLVIDA': 'Não resolvida',
  };
  return labels[status] || status || 'Recebida';
};
