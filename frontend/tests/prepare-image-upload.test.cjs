require('tsx/cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareImageUpload}=require('../src/utils/prepareImageUpload.ts');
function pngBytes(size,w=100,h=50){const b=new Uint8Array(size);const v=new DataView(b.buffer);v.setUint32(0,0x89504e47);b.set(Buffer.from('IHDR'),12);v.setUint32(16,w);v.setUint32(20,h);return b;}
test('valid images pass through byte-for-byte without decoding or upscaling',async()=>{
  const source=new Blob([pngBytes(32)],{type:'image/png'});
  assert.equal(await prepareImageUpload(source,source.size),source);
});
test('invalid policy, empty file and unsupported oversized format fail before upload',async()=>{
  await assert.rejects(prepareImageUpload(new Blob(['x']),NaN),/limit is unavailable/);
  await assert.rejects(prepareImageUpload(new Blob(),100),/not empty/);
  await assert.rejects(prepareImageUpload(new Blob(['oversized'],{type:'image/gif'}),1),/cannot be resized safely/);
});
test('oversized animated PNG is not silently flattened',async()=>{
  const bytes=pngBytes(64);new DataView(bytes.buffer).setUint32(8,13);new DataView(bytes.buffer).setUint32(33,8);bytes.set(Buffer.from('acTL'),37);
  await assert.rejects(prepareImageUpload(new Blob([bytes],{type:'image/png'}),1),/Animated images/);
});
test('compression checks actual encoded bytes and preserves format and aspect ratio',async()=>{
  const oldBitmap=global.createImageBitmap, oldDocument=global.document;
  const draws=[];let closed=false;
  global.createImageBitmap=async()=>({width:100,height:50,close(){closed=true;}});
  const canvas={width:0,height:0,getContext(){return{drawImage(...args){draws.push(args.slice(1));}};},toBlob(resolve,mime){resolve(new Blob([new Uint8Array(this.width*this.height)],{type:mime}));}};
  global.document={createElement(){return canvas;}};
  try{
    const result=await prepareImageUpload(new Blob([pngBytes(10000)],{type:'image/png'}),1500);
    assert.ok(result.size<=1500);assert.equal(result.type,'image/png');assert.ok(draws.length>1);
    for(const [, ,w,h] of draws){assert.ok(w<=100&&h<=50);assert.ok(Math.abs(w/h-2)<0.1);}
    assert.equal(closed,true);
  }finally{global.createImageBitmap=oldBitmap;global.document=oldDocument;}
});
test('cancelled preparation never returns an uploadable blob',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(prepareImageUpload(new Blob(['x'],{type:'image/png'}),1024,controller.signal),{name:'AbortError'});
});
test('unfittable encoded output fails clearly and releases decoded resources',async()=>{
 const oldBitmap=global.createImageBitmap,oldDocument=global.document;let closed=false;
 global.createImageBitmap=async()=>({width:1,height:1,close(){closed=true;}});
 global.document={createElement(){return{getContext(){return{drawImage(){}};},toBlob(done,type){done(new Blob([new Uint8Array(2048)],{type}));}};}};
 try{await assert.rejects(prepareImageUpload(new Blob([pngBytes(4096,1,1)],{type:'image/png'}),1024),/cannot fit/);assert.equal(closed,true);}
 finally{global.createImageBitmap=oldBitmap;global.document=oldDocument;}
});
test('processing byte and header pixel bounds reject before decoder or canvas',async()=>{
 const priorBitmap=global.createImageBitmap;let decoded=false;
 global.createImageBitmap=async()=>{decoded=true;throw Error('must not decode');};
 try{
  const huge=new Blob([new Uint8Array(32*1024*1024+1)],{type:'image/png'});
  huge.arrayBuffer=()=>{throw Error('must not read full source');};
  await assert.rejects(prepareImageUpload(huge,1024),/under 32 MB/);
  await assert.rejects(prepareImageUpload(new Blob([pngBytes(2048,10000,10000)],{type:'image/png'}),1024),/24 megapixels/);
  assert.equal(decoded,false);
 }finally{global.createImageBitmap=priorBitmap;}
});
test('abort during source read stops before image decoding',async()=>{
 const controller=new AbortController(),prior=global.createImageBitmap;let decoded=false;
 global.createImageBitmap=async()=>{decoded=true;throw Error('must not decode');};
 const source=new Blob([pngBytes(2048)],{type:'image/png'});
 source.arrayBuffer=async()=>{controller.abort();return pngBytes(2048).buffer;};
 try{await assert.rejects(prepareImageUpload(source,1024,controller.signal),{name:'AbortError'});assert.equal(decoded,false);}
 finally{global.createImageBitmap=prior;}
});

test('small compressed sources still enforce pixel bounds before preview decoding',async()=>{
 const source=new Blob([pngBytes(64,10000,10000)],{type:'image/png'});
 await assert.rejects(prepareImageUpload(source,204800),/24 megapixels/);
 await assert.rejects(prepareImageUpload(new Blob(['invalid'],{type:'image/png'}),204800),/dimensions cannot be read/);
});
