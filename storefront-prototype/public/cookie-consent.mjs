// Súhlas s cookies.
//
// Web používa len ne-nezbytné údaje (sessionStorage pre košík), preto sa súhlas
// neukazuje. Lišta sa objaví až vtedy, keď pribudne analytika alebo marketing
// (teda keď sa začnú používať ne-nezbytné cookies) – vtedy musí byť súhlas
// vypnuteľný a zobraziť sa pred ich načítaním.
export const NON_ESSENTIAL_COOKIES = [];

export function needsCookieBanner() {
  return NON_ESSENTIAL_COOKIES.length > 0;
}
