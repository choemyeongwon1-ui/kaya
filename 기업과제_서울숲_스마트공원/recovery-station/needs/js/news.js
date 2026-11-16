// 서울숲 소식: ① 서울시 공공서비스예약에서 가져온 프로그램(data/programs.json) ② 관리자가 올린 정원·프로그램·공지 소식
// 관리자가 올린 소식은 지금은 이 브라우저(localStorage)에만 저장됩니다. 실제 운영에서는 서버 한 곳에 저장해 모든 시민 화면에 같이 보이게 합니다.

export const NEWS_KEY = 'sf-needs-news';
export const NEWS_KINDS = [
  { key: 'garden',  label: '정원',     icon: 'leaf' },
  { key: 'program', label: '프로그램', icon: 'users' },
  { key: 'notice',  label: '공지',     icon: 'info' },
];
// 소식을 누구에게 먼저 보여 줄지 (같이 온 사람과 맞으면 위로)
export const NEWS_FOR = [
  { key: 'all',    label: '모두' },
  { key: 'kids',   label: '아이와' },
  { key: 'couple', label: '연인·친구' },
  { key: 'alone',  label: '혼자' },
  { key: 'elders', label: '어르신' },
  { key: 'pet',    label: '반려견' },
];

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 저장된 소식 읽기 (형식이 틀린 것은 버림) */
export function loadNews(store) {
  try {
    const v = JSON.parse(store.get(NEWS_KEY, '[]'));
    return Array.isArray(v) ? v.filter(n => n && typeof n.title === 'string' && n.title.trim() && NEWS_KINDS.some(k => k.key === n.kind)) : [];
  } catch { return []; }
}

/** 공공서비스예약 프로그램을 소식 모양으로 바꿈. 접수 중이거나 오늘이 이용 기간 안인 것만 */
function fromPrograms(programs, today) {
  return (programs?.items ?? []).filter(p => (p.status === '접수중' || p.status === '안내중') || (p.useFrom && p.useTo && p.useFrom <= today && today <= p.useTo))
    .map(p => ({ id: `yeyak-${p.id}`, kind: 'program', title: p.title, place: p.place, from: p.useFrom, to: p.useTo, text: [p.target, p.fee, p.status].filter(Boolean).join(' · '),
      url: p.url, for: /가족|어린이|유아|초등|아동/.test(`${p.target} ${p.title}`) ? 'kids' : 'all', source: 'yeyak' }));
}

/** 오늘 보여 줄 소식: 기간이 지난 것은 빼고, 같이 온 사람에게 맞는 것을 위로 */
export function activeNews(own, programs, date, company) {
  const today = iso(date);
  const mine = own.filter(n => (!n.from || n.from <= today) && (!n.to || today <= n.to)).map(n => ({ ...n, source: 'admin' }));
  const all = [...mine, ...fromPrograms(programs, today)];
  const fit = n => n.for === company || (n.for === 'couple' && company === 'friends') ? 0 : n.for === 'all' || !n.for ? 1 : 2;
  return all.map(n => ({ ...n, fit: fit(n) })).sort((a, b) => a.fit - b.fit || (a.source === 'admin' ? -1 : 1) - (b.source === 'admin' ? -1 : 1));
}

export const todayIso = iso;
