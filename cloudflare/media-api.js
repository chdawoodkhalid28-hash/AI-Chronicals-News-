const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = {
  "image/png": { extension: "png", signature: bytes => bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) },
  "image/jpeg": { extension: "jpg", signature: bytes => bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 },
  "image/webp": { extension: "webp", signature: bytes => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP" }
};
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff", "referrer-policy":"no-referrer" }
});
const error = (status, message, code) => json(status, { ok:false, error:message, ...(code?{code}:{}), storage:"private", publication:"DISABLED" });

function configuration(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY1;
  if (!env.SUPABASE_URL || !key) throw Object.assign(new Error("Private Supabase media storage is not configured"), { status:503 });
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw Object.assign(new Error("SUPABASE_URL is invalid"), { status:503 }); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error("SUPABASE_URL must be a clean HTTPS project URL"), { status:503 });
  }
  return { base:url.origin, key, bucket:env.SUPABASE_MEDIA_BUCKET || "newsroom-private-media" };
}

async function storageRequest(env, method, pathname, bytes, contentType="application/octet-stream") {
  const { base,key,bucket } = configuration(env);
  const objectPath = pathname.split("/").map(encodeURIComponent).join("/");
  const headers = { apikey:key, Authorization:"Bearer "+key };
  const isDelete = method === "DELETE";
  const url = isDelete
    ? base+"/storage/v1/object/"+encodeURIComponent(bucket)
    : base+"/storage/v1/object/"+encodeURIComponent(bucket)+"/"+objectPath;
  const response = await fetch(url, {
    method,
    headers: isDelete ? {...headers,"Content-Type":"application/json"} : (method==="GET" ? headers : {...headers,"Content-Type":contentType,"x-upsert":"false"}),
    ...(isDelete ? {body:JSON.stringify({prefixes:[pathname]})} : (bytes ? {body:bytes} : {})),
    signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const detail=(await response.text()).slice(0,300);
    throw Object.assign(new Error("Private storage request failed ("+response.status+"): "+detail), {status:response.status>=500?502:503});
  }
  return response;
}

async function database(env, method, query, body, prefer="return=representation") {
  const {base,key}=configuration(env);
  const response=await fetch(base+"/rest/v1/media_assets"+(query?"?"+query:""), {
    method,
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(8000)
  });
  const raw=await response.text();
  let data=null;
  if(raw){try{data=JSON.parse(raw);}catch{data={message:raw.slice(0,300)};}}
  if(!response.ok) throw Object.assign(new Error(data?.message||"Media metadata request failed"),{status:response.status>=500?502:503});
  return data;
}

function allowedPath(path) {
  if(typeof path!=="string") return false;
  const parts=path.split("/");
  return (parts[0]==="newsroom-uploads"||parts[0]==="newsroom-graphics") &&
    parts.length===2 && /^[A-Za-z0-9._-]+$/.test(parts[1]) && !parts[1].includes("..");
}

function bytesFromBase64(input) {
  if(typeof input!=="string"||!input.trim()) throw Object.assign(new Error("Image data is required"),{status:400});
  const encoded=input.replace(/^data:image\/(?:png|jpeg|webp);base64,/i,"");
  if(encoded.length>Math.ceil(MAX_BYTES/3)*4+8) throw Object.assign(new Error("Image must not exceed 3 MB"),{status:413});
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Object.assign(new Error("Image data must be valid base64"),{status:400});
  let binary;
  try{binary=atob(encoded);}catch{throw Object.assign(new Error("Image data must be valid base64"),{status:400});}
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(!bytes.length||bytes.length>MAX_BYTES) throw Object.assign(new Error("Image must be between 1 byte and 3 MB"),{status:413});
  return bytes;
}

async function readJson(request, max=Math.ceil(MAX_BYTES/3)*4+16_384) {
  const declaredLength=Number(request.headers.get("Content-Length")||0);
  if(declaredLength>max) throw Object.assign(new Error("Request body is too large"),{status:413});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>max) throw Object.assign(new Error("Request body is too large"),{status:413});
  try{return raw?JSON.parse(raw):{};}catch{throw Object.assign(new Error("Invalid JSON body"),{status:400});}
}

export async function handlePrivateMedia(request, env) {
  const url=new URL(request.url);
  try {
    if(request.method==="GET") {
      const id=url.searchParams.get("id")||"";
      if(!id) {
        const query=new URLSearchParams({select:"id,media_type,alt_text,rights_status,created_at",order:"created_at.desc",limit:"50"});
        const items=await database(env,"GET",query.toString())||[];
        return json(200,{ok:true,items,storage:"private",publication:"DISABLED"});
      }
      if(!/^[0-9a-f-]{36}$/i.test(id)) return error(400,"A valid media asset ID is required");
      const query=new URLSearchParams({select:"id,blob_pathname,media_type,alt_text,rights_status",id:"eq."+id,limit:"1"});
      const rows=await database(env,"GET",query.toString());
      const asset=rows?.[0];
      if(!asset) return error(404,"Media asset not found");
      if(!allowedPath(asset.blob_pathname)) return error(409,"Stored media path is not eligible for retrieval");
      const object=await storageRequest(env,"GET",asset.blob_pathname);
      const extension=asset.blob_pathname.split(".").pop();
      const contentType=extension==="jpg"?"image/jpeg":extension==="webp"?"image/webp":"image/png";
      return new Response(object.body,{status:200,headers:{
        "Content-Type":contentType,"Content-Disposition":'inline; filename="newsroom-image.'+extension+'"',
        "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"
      }});
    }

    if(request.method==="POST") {
      const body=await readJson(request);
      if(body.action!=="upload") return error(400,"Only private image upload is supported by the Cloudflare media API");
      const type=TYPES[body.mimeType];
      if(!type) return error(415,"Only PNG, JPEG and WebP images are accepted");
      const bytes=bytesFromBase64(body.imageData);
      if(!type.signature(bytes)) return error(415,"Image content does not match the declared file type");
      const pathname="newsroom-uploads/"+crypto.randomUUID()+"."+type.extension;
      let uploaded=false;
      try {
        await storageRequest(env,"POST",pathname,bytes,body.mimeType);
        uploaded=true;
        const inserted=await database(env,"POST","",{
          blob_pathname:pathname,media_type:"image",
          alt_text:String(body.altText||"Uploaded newsroom image").slice(0,500),
          source_url:"",rights_status:"pending_review"
        });
        const asset=Array.isArray(inserted)?inserted[0]:inserted;
        if(!asset?.id) throw new Error("Supabase did not return the saved media asset ID");
        return json(201,{ok:true,asset:{id:asset.id,pathname,mediaType:"image",mimeType:body.mimeType,rightsStatus:"pending_review"},storage:"private",publication:"DISABLED"});
      } catch(err) {
        if(uploaded) {
          try { await storageRequest(env,"DELETE",pathname); }
          catch { throw Object.assign(new Error("Metadata indexing failed and private object cleanup also failed"), {status:502,code:"PRIVATE_MEDIA_ORPHAN_CLEANUP_FAILED"}); }
        }
        throw err;
      }
    }

    if(request.method==="DELETE") {
      const body=await readJson(request,100_000);
      const id=typeof body.id==="string"?body.id:url.searchParams.get("id")||"";
      if(!/^[0-9a-f-]{36}$/i.test(id)) return error(400,"A valid media asset ID is required");
      const query=new URLSearchParams({select:"id,blob_pathname,media_type",id:"eq."+id,limit:"1"});
      const rows=await database(env,"GET",query.toString());
      const asset=rows?.[0];
      if(!asset) return error(404,"Media asset not found");
      if(!allowedPath(asset.blob_pathname)) return error(409,"Stored media path is not eligible for deletion");
      const object=await storageRequest(env,"GET",asset.blob_pathname);
      const snapshot=new Uint8Array(await object.arrayBuffer());
      const extension=asset.blob_pathname.split(".").pop();
      const contentType=extension==="jpg"?"image/jpeg":extension==="webp"?"image/webp":"image/png";
      await storageRequest(env,"DELETE",asset.blob_pathname);
      try {
        await database(env,"DELETE",new URLSearchParams({id:"eq."+id}).toString(),undefined,"return=minimal");
      } catch(err) {
        try { await storageRequest(env,"PUT",asset.blob_pathname,snapshot,contentType); }
        catch { throw Object.assign(new Error("Metadata deletion failed and private object restoration also failed"), {status:502,code:"PRIVATE_MEDIA_RESTORE_FAILED"}); }
        throw err;
      }
      return json(200,{ok:true,id,storage:"private",publication:"DISABLED"});
    }

    return error(405,"Method not allowed");
  } catch(err) {
    const status=Number.isInteger(err.status)?err.status:502;
    return error(status,status===503?"Private media storage is not configured or available":"Private media operation failed",err.code||"PRIVATE_MEDIA_OPERATION_FAILED");
  }
}
