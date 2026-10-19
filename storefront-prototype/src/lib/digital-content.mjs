// Presentation only: headings are extracted from the product's actual server description.
export function digitalTopics(product){
 const text=String(product.longDescription||product.description||'');
 const audio=[...text.matchAll(/^Audio\s+(\d+)\s*[–—-]\s*(.+)$/gmi)].map(m=>({number:m[1],title:m[2].trim(),detail:''}));
 if(audio.length)return audio.filter(item=>Number(item.number)>0);
 return [...text.matchAll(/^([A-ZÁÄČĎÉÍĽĹŇÓÔŔŠŤÚÝŽ][^\n–—]{1,50})\s+[–—]\s+([^\n]+)$/gm)].map((m,i)=>({number:String(i+1),title:m[1].trim(),detail:m[2].trim()}));
}
