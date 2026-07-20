function localDate(date:string){const[year,month,day]=date.split('-').map(Number);return new Date(year,month-1,day,12)}
export function toLocalISODate(value=new Date()){const year=value.getFullYear();const month=String(value.getMonth()+1).padStart(2,'0');const day=String(value.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
export function formatBookingDate(date:string,locale='en-EG'){return new Intl.DateTimeFormat(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(localDate(date))}
export function formatBookingDateTime(date:string,time:string,locale='en-EG'){const formatted=formatBookingDate(date,locale);if(time==='ASAP')return `${formatted}, ASAP`;const[hour,minute]=time.split(':').map(Number);const value=localDate(date);value.setHours(hour,minute,0,0);return new Intl.DateTimeFormat(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(value)}
export function formatTimestamp(value:string,locale='en-EG'){return new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))}
export function localeFor(language:'en'|'ar'){return language==='ar'?'ar-EG':'en-EG'}
export function formatNumber(value:number,language:'en'|'ar'){return new Intl.NumberFormat(localeFor(language),{maximumFractionDigits:1}).format(value)}
export function normalizeProblem(value:string){return value.replace(/\s+/g,' ').trim()}
