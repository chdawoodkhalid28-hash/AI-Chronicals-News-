import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

const origin="https://preview.example";
const ASSET_ID="123e4567-e89b-42d3-a456-426614174000";
const originalFetch=globalThis.fetch;
const limiter={async limit(){return {success:true};}};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]);

function mockFetch(resolver) {
  const calls=[];
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input));
    const call={url,method:options.method||"GET",headers:options.headers||{},body:options.body};
    calls.push(call);
    const result=await resolver(call,calls.length-1);
    if(result instanceof Response) return result;
    if(result?.binary) return new Response(result.binary,{status:result.status||200,headers:{"Content-Type":result.contentType||"image/png"}});
    return new Response(JSON.stringify(result?.data??result??[]),{status:result?.status||200,headers:{"Content-Type":"application/json"}});
  };
  return calls;
}
function env() {
  return {ADMIN_PASSWORD:"admin-test",ADMIN_SESSION_SECRET:"test-secret",LOGIN_RATE_LIMITER:limiter,
    SUPABASE_URL:"https://test-project.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service-secret"};
}
async function cookie(e) {
  const r=await worker.fetch(new Request(origin+"/api/admin/access",{method:"POST",headers:{
    Origin:origin,"CF-Connecting-IP":"192.0.2.2",Authorization:"Bearer admin-test"
  }}),e);
  assert.equal(r.status,200);
  return r.headers.get("set-cookie").match(/acn_admin_session=([^;]+)/)[1];
}
async function call(e,c,method,body,path="/api/admin/graphics") {
  const r=await worker.fetch(new Request(origin+path,{method,headers:{
    Cookie:"acn_admin_session="+c,
    ...(body===undefined?{}:{"Content-Type":"application/json",Origin:origin})
  },...(body===undefined?{}:{body:JSON.stringify(body)})}),e);
  return r;
}
test.afterEach(()=>{globalThis.fetch=originalFetch;});

test("private media upload validates image signature and persists only private object metadata",async()=>{
  const calls=mockFetch((c)=>{
    if(c.url.pathname.startsWith("/storage/v1/object/")&&c.method==="POST") return {data:{ok:true}};
    if(c.url.pathname==="/rest/v1/media_assets"&&c.method==="POST") {
      const body=JSON.parse(c.body);
      assert.equal(body.rights_status,"pending_review");
      assert.equal(body.media_type,"image");
      assert.match(body.blob_pathname,/^newsroom-uploads\/[0-9a-f-]+\.png$/);
      return {data:[{id:ASSET_ID,...body}]};
    }
    throw new Error("Unexpected request "+c.method+" "+c.url);
  });
  const e=env(),c=await cookie(e);
  const r=await call(e,c,"POST",{action:"upload",mimeType:"image/png",imageData:btoa(String.fromCharCode(...png)),altText:"Test image"});
  const body=await r.json();
  assert.equal(r.status,201);
  assert.equal(body.asset.id,ASSET_ID);
  assert.equal(body.asset.rightsStatus,"pending_review");
  assert.equal(body.publication,"DISABLED");
  assert.equal(calls.length,2);
});

test("rejects spoofed MIME and oversized image before storage calls",async()=>{
  let calls=0;mockFetch(()=>{calls++;throw new Error("unexpected storage call");});
  const e=env(),c=await cookie(e);
  const wrong=await call(e,c,"POST",{action:"upload",mimeType:"image/png",imageData:btoa("not a png")});
  assert.equal(wrong.status,415);
  const huge=await call(e,c,"POST",{action:"upload",mimeType:"image/png",imageData:"A".repeat(4_200_000)});
  assert.equal(huge.status,413);
  assert.equal(calls,0);
});

test("metadata insertion failure rolls back uploaded private object",async()=>{
  const calls=mockFetch(c=>{
    if(c.url.pathname.startsWith("/storage/v1/object/")&&c.method==="POST") return [];
    if(c.url.pathname==="/rest/v1/media_assets"&&c.method==="POST") return {status:500,data:{message:"db error"}};
    if(c.method==="DELETE"&&c.url.pathname.startsWith("/storage/v1/object/")) return [];
    throw new Error("Unexpected request");
  });
  const e=env(),c=await cookie(e);
  const r=await call(e,c,"POST",{action:"upload",mimeType:"image/png",imageData:btoa(String.fromCharCode(...png))});
  assert.equal(r.status,502);
  assert.equal(calls.filter(x=>x.method==="DELETE").length,1);
});

test("private media GET returns metadata list and streams authorized object by ID",async()=>{
  const calls=mockFetch(c=>{
    if(c.url.pathname==="/rest/v1/media_assets") return {data:[{id:ASSET_ID,blob_pathname:"newsroom-uploads/example.png",media_type:"image"}]};
    if(c.url.pathname.includes("/storage/v1/object/")) return {binary:png};
    throw new Error("Unexpected request");
  });
  const e=env(),c=await cookie(e);
  const list=await call(e,c,"GET");
  assert.equal(list.status,200);
  assert.equal((await list.json()).items.length,1);
  const get=await call(e,c,"GET",undefined,"/api/admin/graphics?id="+ASSET_ID);
  assert.equal(get.status,200);
  assert.equal(get.headers.get("Content-Type"),"image/png");
  assert.deepEqual(new Uint8Array(await get.arrayBuffer()),png);
  assert.equal(calls.length,3);
});

test("private media DELETE snapshots object and removes metadata",async()=>{
  const calls=mockFetch(c=>{
    if(c.url.pathname==="/rest/v1/media_assets"&&c.method==="GET") return {data:[{id:ASSET_ID,blob_pathname:"newsroom-uploads/example.png",media_type:"image"}]};
    if(c.url.pathname.includes("/storage/v1/object/")&&c.method==="GET") return {binary:png};
    if(c.url.pathname==="/rest/v1/media_assets"&&c.method==="DELETE") return [];
    if(c.url.pathname.includes("/storage/v1/object/")&&c.method==="DELETE") return [];
    throw new Error("Unexpected request "+c.method+" "+c.url);
  });
  const e=env(),c=await cookie(e);
  const r=await call(e,c,"DELETE",{id:ASSET_ID});
  assert.equal(r.status,200);
  assert.equal((await r.json()).publication,"DISABLED");
  assert.ok(calls.some(x=>x.method==="DELETE"&&x.url.pathname.includes("/storage/v1/object/")));
});

test("media endpoints reject unauthenticated access",async()=>{
  mockFetch(()=>{throw new Error("database must not be called");});
  const r=await worker.fetch(new Request(origin+"/api/admin/graphics"),env());
  assert.equal(r.status,401);
});
