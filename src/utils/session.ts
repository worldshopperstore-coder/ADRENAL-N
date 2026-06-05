export function getUserSession() {
  try {
    return JSON.parse(localStorage.getItem('userSession') || '{}');
  } catch {
    return {};
  }
}

export function getKasaId(fallback = '') {
  return getUserSession()?.kasa?.id || fallback;
}

export function getPersonnelId() {
  return getUserSession()?.personnel?.id || '';
}

export function getPersonnelName() {
  return getUserSession()?.personnel?.fullName || '';
}

export function getPersonnelUsername() {
  return getUserSession()?.personnel?.username || getUserSession()?.personnel?.fullName || '';
}
