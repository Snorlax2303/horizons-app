// Catálogo de IDs aceitos pela API do painel WPlay (wwpanel.link).
//
// Fonte: https://docs.wplay.com.br — estes são os valores válidos informados
// pela documentação oficial. Não inventar IDs: valores fora deste catálogo
// devem ser recusados em vez de enviados ao painel.
//
// Cada entrada é [id, nome]. `id` é número ou string conforme o painel exige.

export const WWPANEL_PLANS = [
  [2, 'Essencial 2 IPTV + 1 P2P'],
  [5, 'Premium 1 IPTV + 2 Nexus'],
  [10, 'Whot'],
  [11, 'Ultra 1 Krator+'],
];

export const WWPANEL_ADDONS = [
  [7, 'Nexus'],
  [8, 'IPTV e P2P'],
  [9, 'Whot'],
  [12, 'Krator'],
];

// ENUM_IPTV_PACKAGES — id do pacote IPTV principal.
export const WWPANEL_IPTV_PACKAGES = [
  [30, '1. Brasil'],
  [70, '2. Brasil (+18)'],
  [101, '101. Brasil s/ 4K'],
  [102, '102. Brasil s/ 4K (+18)'],
  [104, '103. Brasil s/ Cinema'],
  [105, '104. Brasil s/ Cinema (+18)'],
  [108, '996. Brasil (s/ jogos e s/ adultos)'],
  [97, '29. Brasil + Canais Inter'],
  [96, '30. Brasil + Canais Inter (+18)'],
  [98, '33. Portugal'],
  [99, '34. Portugal (+18)'],
  [33, '3. Portugal + Brasil'],
  [84, '4. Portugal + Brasil (+18)'],
  [48, '5. Uruguai'],
  [73, '6. Uruguai (+18)'],
  [36, '7. República Dominicana'],
  [78, '8. República Dominicana (+18)'],
  [42, '9. Argentina'],
  [79, '10. Argentina (+18)'],
  [53, '11. Venezuela'],
  [75, '12. Venezuela (+18)'],
  [56, '13. Colômbia'],
  [81, '14. Colômbia (+18)'],
  [106, '15. Bolivia'],
  [107, '16. Bolivia (+18)'],
  [47, '17. Paraguai'],
  [77, '18. Paraguai (+18)'],
  [92, '19. Peru'],
  [93, '20. Peru (+18)'],
  [41, '21. México'],
  [76, '22. México (+18)'],
  [62, '23. Espanha'],
  [80, '24. Espanha (+18)'],
  [65, '25. Estados Unidos'],
  [83, '26. Estados Unidos (+18)'],
  [87, '27. Cuba'],
  [94, '28. Cuba (+18)'],
  [68, '🌎 31. Latinos'],
  [74, '🌎 32. Latinos (+18)'],
  [109, '🌍 Internacional - Reestream'],
  [69, '⭐ 99. Completo'],
  [95, '⭐ 100. Completo (+18)'],
  [111, '💡 1001. Lite'],
  [71, '📹 999. Câmeras (Play Store)'],
  [103, '📭 1000. Sem Conteúdo'],
];

// ENUM_P2P_PACKAGES — id do pacote P2P (ObjectId).
export const WWPANEL_P2P_PACKAGES = [
  ['64399dca5ea59e8a1de2b083', '1. Brasil'],
  ['646d1492db22a7b1bc518941', '2. Brasil (+18)'],
  ['64399ddfc8f60489be2e8fc5', '3. Portugal'],
  ['646d14bc06e850b151d4675e', '4. Portugal (+18)'],
  // ATENÇÃO: id como veio na documentação (23 caracteres). ObjectIds têm 24;
  // confirmar com o painel antes de usar esta variante.
  ['69d5f7fdfd4fa0024094975', '5. Brasil + Portugal'],
  ['64399df0871a4e89f97b8d81', '6. Uruguai'],
  ['646d14d85c2df2b15f760cd0', '7. Uruguai (+18)'],
  ['64399dfde006f08959c23d8b', '8. República Dominicana'],
  ['646d1539621370b23498049d', '9. República Dominicana (+18)'],
  ['646d2b7b15c9b7b11598baef', '10. Argentina'],
  ['646d1561529e92b20a646458', '11. Argentina (+18)'],
  ['6462a77d75d585b1541c8bdf', '12. Venezuela'],
  ['646d1551200bf0b16dba50d3', '13. Venezuela (+18)'],
  ['646d2e2d9f6176b1d5674101', '14. Colômbia'],
  ['64810270c89ed6a620de78fe', '15. Colômbia (+18)'],
  ['6480cee6556b165b7f3f7670', '16. Paraguai'],
  ['6480e279c03bd7a57debca30', '17. Paraguai (+18)'],
  ['647fc3ce3537090f240bc36b', '18. Peru'],
  ['6480dd39aad4065c2030c726', '19. Peru (+18)'],
  ['646d2e0615c9b7b11598baf0', '20. México'],
  ['648102b26e5c04a5b4bdae06', '21. México (+18)'],
  ['646d2dd8c89a82b2081d51fe', '22. Espanha'],
  ['648102cc21c828a59049927b', '23. Espanha (+18)'],
  ['646d2ce9d6c8ecb174517ec6', '24. Estados Unidos'],
  ['646d156d200bf0b16dba50d4', '25. Estados Unidos (+18)'],
  ['667a0f479ab1ca5452bf15ad', '26. Pacote Completo'],
  ['5da17892133a1d61888029aa', '27. Pacote Completo (+18)'],
  ['64681d659455040ee6ff4c52', '28. Câmeras (Play Store)'],
  ['64b9ce3689aaac1f86acb99b', '29. Vazio'],
];

// ENUM_KRATOR_PACKAGE / ENUM_NEXUS_PACKAGE — id textual.
export const WWPANEL_KRATOR_PACKAGES = [['1', 'Pacote Completo']];
export const WWPANEL_NEXUS_PACKAGES = [[1, 'Pacote Completo']];

// ENUM_APPS / ENUM_APPS_XSTREAM — apps licenciados.
//
// ATENÇÃO: lista real, extraída do painel (bundle oficial + spec em /api-json).
// Não inferir nomes: o painel aceita exatamente estes valores e decide a rota
// pelo nome — WTV Player/Wapp, XCloud e Kplay vão por /lines/active/app/xstream;
// todos os demais por /lines/active/app.
export const WWPANEL_XSTREAM_APPS = ['WTV Player/Wapp', 'XCloud', 'Kplay'];
export const WWPANEL_APPS = [
  'BrasilIPTV',
  'EasyPlayer',
  'IPTVPlus',
  'IPTVNextPlayer',
  'IPTVPlayerio',
  'IPTVProPlayer',
  'IPTVStarPlayer',
  'IPlayer',
  'OttPlayer',
  'TVVision',
  'TiviPlayerIPTV',
  'IPTV4K',
];

// ENUM_COUNTRIES — país do cliente (ISO alpha-2, minúsculo).
export const WWPANEL_COUNTRIES = ['br', 'us', 'pt'];

/** Valida um par (lista, id) e devolve o id quando conhecido, senão lança. */
export function assertKnownValue(list, value, label) {
  const found = list.find(([id]) => String(id) === String(value));
  if (!found) throw new Error(`Valor não reconhecido do catálogo WPlay para ${label}: ${value}`);
  return found[0];
}
