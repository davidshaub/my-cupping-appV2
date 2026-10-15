import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import interUrl from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import serifUrl from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff?url';
import { layoutFlavorWheel, ringPoints, wheelColor, wheelProvenance } from './flavorWheel.js';
import { aggregateEvaluations, evaluationScore, notesFields } from './collaboration.js';

const color = hex => { const n=parseInt(hex.slice(1),16);return rgb((n>>16)/255,((n>>8)&255)/255,(n&255)/255); };
const ink=color('#20251f'), muted=color('#62685d'), line=color('#d8dcd0');
export async function buildCollaborationPdf({ title, name='', coffees, panel=false }) {
  if(!coffees.length)throw new Error('Add at least one coffee before exporting.');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const load=async url=>{const response=await fetch(url);if(!response.ok)throw new Error('Unable to load PDF fonts. Please reconnect and retry.');return response.arrayBuffer();};
  const [sans,serif]=await Promise.all([load(interUrl).then(bytes=>pdf.embedFont(bytes,{subset:true})),load(serifUrl).then(bytes=>pdf.embedFont(bytes,{subset:true}))]);
  let page,y=0,currentCoffee='';
  const text=(value,x,top,size=10,font=sans,tone=ink)=>page.drawText(String(value),{x,y:792-top-size,size,font,color:tone});
  const newPage=()=>{page=pdf.addPage([612,792]);text('OSITO / CUPPING LAB',38,26,10);text(panel?'PANEL REPORT':'SHARED CUPPING REPORT',350,26,9,sans,muted);page.drawLine({start:{x:38,y:738},end:{x:574,y:738},thickness:.7,color:line});y=75;if(currentCoffee){text(currentCoffee+' · continued',38,y,12,serif);y+=28;}};
  const ensure=height=>{if(y+height>740)newPage();};
  const wrap=(value,width,size=10,font=sans)=>{
    const output=[];String(value||'').split('\n').forEach(paragraph=>{let row='';for(const word of paragraph.split(/\s+/)){if(!word)continue;let part=word;while(font.widthOfTextAtSize(part,size)>width){if(row){output.push(row);row='';}let n=1;while(n<part.length&&font.widthOfTextAtSize(part.slice(0,n+1),size)<=width)n++;output.push(part.slice(0,n));part=part.slice(n);}const next=row?row+' '+part:part;if(font.widthOfTextAtSize(next,size)>width){output.push(row);row=part;}else row=next;}output.push(row);});return output;
  };
  const paragraph=(value,size=10,font=sans,tone=ink)=>{for(const row of wrap(value,536,size,font)){ensure(size+8);text(row,38,y,size,font,tone);y+=size+6;}};
  const heading=value=>{ensure(50);y+=12;paragraph(value,15,serif);y+=5;};
  coffees.forEach((item,index)=>{
    currentCoffee='';newPage();const sample=item.sample,result=aggregateEvaluations(item.evaluations);paragraph(title,11,sans,muted);if(name)paragraph(name,10,sans,muted);y+=10;currentCoffee=item.name||sample.lotName||'Coffee '+(index+1);
    paragraph(currentCoffee,25,serif);paragraph([sample.ositoId&&'Lot '+sample.ositoId,sample.country,sample.processing==='Other'?sample.processingOther:sample.processing, sample.roastId&&'Roast '+sample.roastId].filter(v=>v&&v!=='Select One').join(' · '),10,sans,muted);
    heading(result.score==null?'No final scores':result.score.toFixed(2)+' / 100');paragraph(`${result.scoreCount} scores · ${result.contributorCount} evaluations`,10,sans,muted);
    heading('Flavor profile');
    const wheel=layoutFlavorWheel(result.notes,{width:536,language:'en'});
    if(!wheel.descriptors.length)paragraph('No flavor descriptors provided.',10,sans,muted);
    else{
      const scale=Math.min(1,390/wheel.height);const height=wheel.height*scale;ensure(height+20);const top=y,offset=38+(536-536*scale)/2;
      const drawRing=(inner,outer,start,end,fill)=>{const points=ringPoints(wheel.centerX,wheel.centerY,inner,outer,start,end);const path=points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')+' Z';page.drawSvgPath(path,{x:offset,y:792-top,scale,color:color(fill),borderColor:rgb(1,1,1),borderWidth:.8});};
      wheel.groups.forEach(g=>drawRing(wheel.radius*.27,wheel.radius*.68,g.start,g.end,wheelColor(g.category)));
      wheel.descriptors.forEach((d,i)=>drawRing(wheel.radius*.68,wheel.radius,d.start,d.end,wheelColor(d.category,true,i)));
      wheel.labels.forEach(label=>{
        const points=[label.anchor,label.elbow,{x:label.x-label.side*4,y:label.connectorY}];
        for(let i=1;i<points.length;i++)page.drawLine({start:{x:offset+points[i-1].x*scale,y:792-top-points[i-1].y*scale},end:{x:offset+points[i].x*scale,y:792-top-points[i].y*scale},thickness:.6,color:muted});
        const size=wheel.fontSize*scale;label.lines.forEach((row,i)=>{const x=offset+label.x*scale-(label.side<0?sans.widthOfTextAtSize(row,size):0);text(row,x,top+(label.y+wheel.fontSize+i*(wheel.fontSize+2))*scale-size,size);});
        const provenance=wheelProvenance(label,'en'),ps=8*scale;const x=offset+label.x*scale-(label.side<0?sans.widthOfTextAtSize(provenance,ps):0);text(provenance,x,top+(label.y+label.lines.length*(wheel.fontSize+2)+11)*scale-ps,ps,sans,muted);
      });
      y+=height+12;
      // Always include the color key, matching the on-screen report.
      let x=38;wheel.groups.forEach(g=>{const label=g.name,w=sans.widthOfTextAtSize(label,9)+24;if(x+w>574){x=38;y+=19;}ensure(20);page.drawRectangle({x,y:792-y-9,width:8,height:8,color:color(wheelColor(g.category))});text(label,x+13,y,9);x+=w;});y+=26;
    }
    notesFields.forEach(([key,label])=>{heading(label);paragraph(result.counts[key].map(({tag,count})=>`${tag} (${count})`).join(' · ')||'No observations provided.');});
    if(panel){heading('Panel observations');paragraph(item.summary||'No panel summary provided.');paragraph('Cupped by '+[...new Set(item.evaluations.map(e=>e.cupper||'Unnamed cupper'))].join(', '),10,sans,muted);
      if(result.attributes){heading('Attribute Map');const a=result.attributes;const labels=[['Frag/Aroma',(a.fragrance+a.aroma)/2],['Clean Cup',a.cleanCup],['Sweetness',a.sweetness],['Acidity',a.acidity],['Body',a.body],['Flavor',a.flavor],['Aftertaste',a.aftertaste],['Balance',a.balance],['Uniformity',a.consistency],['Overall',a.overall]];ensure(280);const cy=y+130,cx=306,r=95,point=(i,v)=>({x:cx+Math.cos(i*Math.PI/5-Math.PI/2)*r*v/10,y:cy+Math.sin(i*Math.PI/5-Math.PI/2)*r*v/10});[5,7.5,10].forEach(level=>labels.forEach((_,i)=>{const p=point(i,level),q=point((i+1)%10,level);page.drawLine({start:{x:p.x,y:792-p.y},end:{x:q.x,y:792-q.y},color:line,thickness:.6});}));labels.forEach(([label,v],i)=>{const p=point(i,v),q=point((i+1)%10,labels[(i+1)%10][1]),l=point(i,12.2);page.drawLine({start:{x:p.x,y:792-p.y},end:{x:q.x,y:792-q.y},color:ink,thickness:1.5});const labelText=label+' '+v.toFixed(2);text(labelText,l.x-sans.widthOfTextAtSize(labelText,8)/2,l.y-4,8);});y+=275;}
    }else{heading('Each cupper’s perspective');item.evaluations.forEach(e=>{heading((e.cupper||'Unnamed cupper')+' · '+(evaluationScore(e)==null?'No score':evaluationScore(e).toFixed(2)));notesFields.forEach(([key,label])=>paragraph(label+': '+((e.notes?.[key]||[]).join(', ')||'Not provided.')));const levels=[[e.notes?.sweetnessLevel,'sweetness'],[e.notes?.acidityLevel,'acidity']].filter(([level])=>level).map(([level,label])=>level+' '+label).join(' · ');if(levels)paragraph(levels,10,sans,muted);if(e.notes?.otherText)paragraph(e.notes.otherText);});}
    heading('Source evaluations');item.evaluations.forEach(e=>paragraph((e.cupper||'Unnamed cupper')+' · '+(e.date||e.updatedAt||'')+' · '+(e.id||'Host evaluation'),8,sans,muted));
  });
  pdf.getPages().forEach((p,i)=>{p.drawText(`${i+1} / ${pdf.getPageCount()} · ${panel?'Osito Panel Report':'Shared Cupping Report'}`,{x:38,y:24,size:8,font:sans,color:muted});});
  return pdf.save();
}
export async function downloadCollaborationPdf(options){const bytes=await buildCollaborationPdf(options);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=(options.title||'Osito Report').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100)+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
