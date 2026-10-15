import test from 'node:test';
import assert from 'node:assert/strict';
import { paintEditorialReport } from '../src/lib/reportDesign.js';
import { initializeSamples } from '../src/lib/cupping.js';

test('aggregate identity contains only ID, name and processing; primary metadata and attribution are preserved',()=>{
  const [sample]=initializeSamples(1);
  Object.assign(sample,{ositoId:'488.26',lotName:'La Esperanza',processing:'Other',processingOther:'Custom washed',country:'Country marker',sampleType:'Type marker',roastId:'Roast marker',waterActivity:'0.623',moisture:'11.7'});
  const original=JSON.stringify(sample);
  const draw=kind=>{
    const marks=[];
    const painter={measureText:(text,size)=>text.length*size*.5,fillRect(){},strokeRect(){},line(){},polygon(){},circle(){},image(){},text(value,x,y){if(y<165)marks.push(String(value));}};
    paintEditorialReport(painter,{...sample,...(kind?{reportKind:kind,reportScore:85,reportAttributesAvailable:true,reportAttribution:'Cupped by David, María'}:{})},0);
    return marks;
  };
  const excluded=['Country marker','Type marker','Roast marker','0.623','11.7%'];
  for(const kind of ['panel','shared']){
    const marks=draw(kind);
    for(const value of ['488.26','La Esperanza','Custom washed','Cupped by David, María'])assert.ok(marks.includes(value));
    excluded.forEach(value=>assert.equal(marks.includes(value),false));
  }
  const primary=draw();excluded.forEach(value=>assert.ok(primary.includes(value)));
  assert.equal(JSON.stringify(sample),original);
});

test('Panel uses the official report layout and exact mean score, with None for blank observations',()=>{
  const [sample]=initializeSamples(1);
  Object.assign(sample,{reportKind:'panel',reportScore:87.125,reportAttributesAvailable:true,reportAttribution:'Cupped by David, María',roastId:''});
  const words=[];
  const painter={measureText:(text,size)=>text.length*size*.5,fillRect(){},strokeRect(){},line(){},polygon(){},circle(){},image(){},text(value){words.push(String(value));}};
  const overflow=paintEditorialReport(painter,sample,0,{sessionStartTime:'Osito Panel Report'});
  assert.ok(words.includes('87.13'),'mean of final scores must not be recalculated from averaged attributes');
  assert.ok(words.includes('Panel observations'));assert.ok(words.includes('None.'));
  assert.ok(words.includes('Cupped by David, María'));assert.equal(overflow.length,0);
  assert.equal(words.some(word=>word.includes('Across the table')),false);
});

test('PDF legend centers both short and long keys on the wheel', () => {
  for (const tags of [['Raspberry', 'Almond', 'Peanuts', 'Molasses', 'Caramel'], ['Dried Banana', 'Phosphoric', 'Herbal', 'Terracotta', 'Brown, Roast', 'Grain', 'Cocoa']]) {
    const [sample] = initializeSamples(1);
    sample.notes.inCupTags = tags;
    const marks = [];
    const painter = {
      measureText: (text, size) => text.length * size * 0.5,
      fillRect() {}, strokeRect() {}, line() {}, polygon() {},
      text(value, x, y, options) {
        assert.ok(!(x === 768 && y === 590), 'No PDF footer page number');
        if (y === 414) marks.push([x, x + this.measureText(value, options.size)]);
      },
      circle(x, y, radius) { if (y === 412 && radius === 2.5) marks.push([x - 3, x + 3]); },
      image(name, x, y, width, height, rotation) {
        assert.equal(rotation, 90);
        assert.equal(width, 34);
        assert.equal(x + width / 2, 396);
        assert.equal(y + height / 2, 585);
      }
    };
    paintEditorialReport(painter, sample, 0, {logoImage: {name:'hands',width:200,height:100}});
    assert.ok(marks.length > 0);
    const left = Math.min(...marks.map(mark => mark[0]));
    const right = Math.max(...marks.map(mark => mark[1]));
    assert.ok(Math.abs((left + right) / 2 - 554) < 0.001);
  }
});
