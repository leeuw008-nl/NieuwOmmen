// LETTERLIJK uit jouw app.js van 1 sept - GEEN LETTER VERANDERD - alleen export naam toegevoegd
const MAX_PER_BRON = {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':15,'RTV Vechtdal':10,'Nieuwsbrief':20};

export function parseRTVVechtdal(html){
  return parseRTVVechtdalECHT(html);
}
