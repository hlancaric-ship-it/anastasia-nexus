// Veřejná HTTPS média; HTTP jen pro místní náhled. Žádné protocol-relative URL
// (ani `/\host` – prohlížeč zpětné lomítko čte jako `/`, takže by to bylo `//host`).
export function isMediaUrl(value){return typeof value==='string'&&!/[\x00-\x20<>"'\\]/.test(value)&&/^(?:\/(?!\/)|https:\/\/|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/)/.test(value);}
