export function createRequireAuthenticatedUser(supabase) {
  return async function requireAuthenticatedUser(request, response, next) {
    const authorization = request.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return response.status(401).json({ error: 'Autenticação obrigatória.' });

    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data.user) return response.status(401).json({ error: 'Sessão inválida ou expirada.' });
    request.horizonsUser = data.user;
    return next();
  };
}

// Restringe a rota ao proprietário do Horizons. Usado em tudo que consome
// crédito em painel externo ou mexe em segredos de integração.
export function createRequireHorizonsOwner(ownerUserId, message = 'Ação restrita ao proprietário do Horizons.') {
  return function requireHorizonsOwner(request, response, next) {
    if (!ownerUserId || request.horizonsUser?.id !== ownerUserId) {
      return response.status(403).json({ error: message });
    }
    return next();
  };
}

// Autenticação + proprietário num único middleware, para módulos de rota que
// recebem apenas um guard (ex.: registerWplayRoutes).
export function createRequireOwnerUser(requireAuthenticatedUser, requireHorizonsOwner) {
  return function requireOwnerUser(request, response, next) {
    return requireAuthenticatedUser(request, response, () => requireHorizonsOwner(request, response, next));
  };
}
