/** Browser processing safeguards, independent of the platform's accepted upload size. */
export const IMAGE_PROCESSING_MAX_BYTES = 32 * 1024 * 1024;
export const IMAGE_PROCESSING_MAX_PIXELS = 24_000_000;
export function imageDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}|null {
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const tag=(p:number)=>String.fromCharCode(...bytes.subarray(p,p+4));
 if(mime==='image/png'&&bytes.length>=24&&v.getUint32(0)===0x89504e47&&tag(12)==='IHDR')return{width:v.getUint32(16),height:v.getUint32(20)};
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){for(let p=2;p+4<bytes.length;){if(bytes[p]!==255)return null;const marker=bytes[p+1];if(marker===255){p++;continue;}if(marker===217||marker===218)break;const size=v.getUint16(p+2);if(size<2||p+2+size>bytes.length)return null;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=8)return{height:v.getUint16(p+5),width:v.getUint16(p+7)};p+=2+size;}}
 if(mime==='image/webp'&&bytes.length>=30&&tag(0)==='RIFF'&&tag(8)==='WEBP'){
  const kind=tag(12);
  if(kind==='VP8X')return{width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
  if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return{width:v.getUint16(26,true)&0x3fff,height:v.getUint16(28,true)&0x3fff};
  if(kind==='VP8L'&&bytes[20]===0x2f){const bits=v.getUint32(21,true);return{width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};}
 }
 return null;
}
export function assertImageDimensions(dimensions:{width:number;height:number}|null):void{
 if(!dimensions||!dimensions.width||!dimensions.height||dimensions.width*dimensions.height>IMAGE_PROCESSING_MAX_PIXELS)throw new Error('This image is too large or its dimensions cannot be read safely. Choose an image under 24 megapixels.');
}
