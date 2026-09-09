// sw.js v301 - FIX omlijnd artikel bij push click + knop naar overzicht
// Deze file wordt als service worker geregistreerd, vervangt oude sw.js en push.js logic

const SW_VERSION = 'v301-omlijnd-fix';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// FIX v301: push click moet artikel omlijnd tonen met ?highlight= link + overzicht knop
self.addEventListener('notificationclick', event => {
  console.log('[sw v301] notificationclick', event.notification.data);
  event.notification.close();
  const data = event.notification.data || {};
  const link = data.link || data.url || 'https://nieuwommen.leeuw008.nl/';
  const title = data.title || 'Nieuw artikel';
  const source = data.source || '';
  
  // Maak URL met highlight param zodat app.js weet welk artikel omlijnd moet
  // We gebruiken #highlight of ?highlight= encoded link
  const highlightUrl = link.includes('?') 
    ? link + '&highlight=' + encodeURIComponent(link) + '&fromPush=1&pushTitle=' + encodeURIComponent(title)
    : link + '?highlight=' + encodeURIComponent(link) + '&fromPush=1&pushTitle=' + encodeURIComponent(title);
  
  // Voor interne links (nieuwommen.leeuw008.nl) ga naar homepage met highlight
  // Voor externe links (destentor etc) ga direct naar artikel maar met highlight param voor terug-knop
  let targetUrl;
  if(link.includes('nieuwommen.leeuw008.nl') || link === '/' || link.includes('localhost')){
    targetUrl = 'https://nieuwommen.leeuw008.nl/?highlight=' + encodeURIComponent(link) + '&fromPush=1&pushTitle=' + encodeURIComponent(title) + '&pushSource=' + encodeURIComponent(source);
  } else {
    // Externe bron: open direct artikel met highlight param + fromPush flag voor omlijning
    // We openen artikel URL met extra params zodat als gebruiker later naar homepage gaat, highlight blijft
    targetUrl = highlightUrl;
    // Alternatief: open homepage met highlight naar externe link (beter voor omlijnd in overzicht)
    // Voor omlijnd in overzicht willen we homepage openen met highlight param:
    targetUrl = 'https://nieuwommen.leeuw008.nl/?highlight=' + encodeURIComponent(link) + '&fromPush=1&pushTitle=' + encodeURIComponent(title) + '&pushSource=' + encodeURIComponent(source) + '&externalLink=' + encodeURIComponent(link);
  }

  console.log('[sw v301] Opening', targetUrl);

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(clientList => {
      // Als er al een venster open is van nieuwommen, focus die en stuur highlight message
      for(let client of clientList){
        if(client.url.includes('nieuwommen.leeuw008.nl') && 'focus' in client){
          client.postMessage({
            type: 'PUSH_CLICKED',
            link: link,
            url: link,
            title: title,
            source: source,
            highlight: link,
            fromPush: true
          });
          return client.focus().then(c => {
            // Navigeer naar highlight URL
            return c.navigate(targetUrl);
          });
        }
      }
      // Geen venster open, open nieuwe
      if(clients.openWindow){
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('push', event => {
  console.log('[sw v301] push received', event.data ? event.data.text() : 'no data');
  let data = {};
  try{
    if(event.data){
      data = event.data.json();
    }
  }catch(e){
    try{
      data = JSON.parse(event.data.text());
    }catch{
      data = {title: 'Nieuw(s)Ommen', body: event.data.text() || 'Nieuw artikel'};
    }
  }
  
  const title = data.title || 'Nieuw(s)Ommen';
  const body = data.body || (data.source ? data.source + ': ' + title : title);
  const link = data.link || data.url || data.click_action || '/';
  const source = data.source || '';
  
  const options = {
    body: body,
    icon: 'https://nieuwommen.leeuw008.nl/icons/icon-192x192.png',
    badge: '/icons/badge-lion-96x96.png', old_badge: 'https://nieuwommen.leeuw008.nl/icons/icon-192x192.png',
    data: {
      link: link,
      url: link,
      title: title,
      source: source,
      highlight: link,
      fromPush: true
    },
    tag: data.id || link,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('message', event => {
  console.log('[sw v301] message', event.data);
  if(event.data && event.data.type === 'SET_FILTERS'){
    // Filters opslaan voor eventuele filtering in push (toekomst)
    console.log('[sw v301] SET_FILTERS', event.data.sources);
  }
  if(event.data && event.data.type === 'SYNC_UPDATED'){
    console.log('[sw v301] SYNC_UPDATED');
  }
});
