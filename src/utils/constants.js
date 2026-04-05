export const CAMPAIGN_STATUS = {
  RASCUNHO: 'rascunho',
  AGENDADO: 'agendado',
  EXECUTANDO: 'executando',
  CONCLUIDO: 'concluido',
  CANCELADO: 'cancelado'
};

export const ENVIO_STATUS = {
  PENDENTE: 'pendente',
  ENVIADO: 'enviado',
  ENTREGUE: 'entregue',
  FALHA: 'falha'
};

export const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

export const TEMPLATE_VARIABLES = [
  '{{nome}}',
  '{{plano}}',
  '{{valor}}',
  '{{qtd_acessos}}',
  '{{vencimento}}',
  '{{mes}}',
  '{{ano}}'
];

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MAX_RETRY_ATTEMPTS = 3;

export const THEME_STORAGE_KEY = 'admin-theme-mode';