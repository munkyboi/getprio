import { IMAGE_PROCESSING_MAX_BYTES, imageDimensions, assertImageDimensions } from "./imageDimensions";
/** Keep the original format and alpha channel; never flatten animated images. */
export async function prepareImageUpload(source: Blob, maxBytes: number, signal?: AbortSignal): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("The image upload limit is unavailable. Try again later.");
  if (!source.size) throw new Error("Choose an image that is not empty.");
  signal?.throwIfAborted();
  const mime=source.type.toLowerCase();
  if (!["image/jpeg","image/png","image/webp"].includes(mime)) throw new Error("This image cannot be resized safely. Choose a smaller JPEG, PNG, or static WebP image.");
  if(source.size>IMAGE_PROCESSING_MAX_BYTES)throw new Error("This image is too large to resize safely. Choose an image under 32 MB.");
  const bytes=new Uint8Array(await source.arrayBuffer());
  signal?.throwIfAborted();
  assertImageDimensions(imageDimensions(bytes,mime));
  if (source.size <= maxBytes) return source;
  const view=new DataView(bytes.buffer);
  const tag=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  // Walk format chunks rather than matching arbitrary compressed pixel bytes.
  if(mime==="image/png")for(let p=8;p+12<=bytes.length;){const length=view.getUint32(p);if(tag(p+4)==="acTL")throw new Error("Animated images cannot be resized without losing animation. Choose a smaller image.");if(length>bytes.length-p-12)break;p+=12+length;}
  if(mime==="image/webp")for(let p=12;p+8<=bytes.length;){const length=view.getUint32(p+4,true);if(tag(p)==="ANIM"||tag(p)==="ANMF")throw new Error("Animated images cannot be resized without losing animation. Choose a smaller image.");if(length>bytes.length-p-8)break;p+=8+length+(length%2);}
  signal?.throwIfAborted();
  let image:ImageBitmap;
  try{image=await createImageBitmap(source,{imageOrientation:"from-image"});}catch{throw new Error("This image could not be read. Choose another JPEG, PNG, or WebP image.");}
  try{
    assertImageDimensions(image);
    const canvas=document.createElement("canvas");
    const context=canvas.getContext("2d");
    if(!context)throw new Error("Your browser cannot resize this image. Choose a smaller image.");
    let width=image.width,height=image.height;
    for(let step=0;step<32;step++){
      signal?.throwIfAborted();
      canvas.width=width;canvas.height=height;
      context.drawImage(image,0,0,width,height);
      for(const quality of mime==="image/png"?[undefined]:[0.9,0.75,0.6,0.45,0.3]){
        const encoded=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,mime,quality));
        signal?.throwIfAborted();
        if(!encoded || encoded.type!==mime)throw new Error("Your browser cannot preserve this image format. Choose a smaller image.");
        if(encoded.size>0 && encoded.size<=maxBytes)return encoded;
      }
      if(width===1 && height===1)break;
      width=Math.max(1,Math.floor(image.width*0.75**(step+1)));height=Math.max(1,Math.floor(image.height*0.75**(step+1)));
    }
    throw new Error(`This image cannot fit the current ${Math.floor(maxBytes/1024)} KB limit. Choose a simpler or smaller image.`);
  }finally{image.close();}
}
