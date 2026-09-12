/* eslint-disable */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(role='Cidadão', item={userId:'owner',status:'Recebido',deadline:Date.now()+86400000}) {
  const writes=[];
  const db={doc:path=>({path,get:async()=>({data:()=>path.startsWith('users/')?{tipo:role,nome:'Pessoa'}:{}})}),collection:()=>({doc:id=>({id:id||'new',collection:()=>({doc:()=>({}),orderBy:()=>({limit:()=>({get:async()=>({docs:[]})})})}),get:async()=>({exists:true,id,data:()=>item})})}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>item}),update:(ref,value)=>writes.push(value),create:(ref,value)=>writes.push(value)})};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const sandbox={exports:{},require:name=>name==='firebase-admin'?{firestore:()=>db}:{onCall:fn=>fn,HttpsError},Buffer};
  vm.runInNewContext(fs.readFileSync(__dirname+'/esic.js','utf8'),sandbox);
  return {call:(data,uid='owner')=>sandbox.exports.esic({data,auth:uid?{uid,token:{email:'user@example.org'}}:null}),writes};
}
test('requires authentication',async()=>{await assert.rejects(setup().call({action:'list'},null),e=>e.code==='unauthenticated');});
test('cannot read another citizen request',async()=>{await assert.rejects(setup().call({action:'detail',id:'abc'},'other'),e=>e.code==='permission-denied');});
test('citizen cannot add administrative notes',async()=>{await assert.rejects(setup().call({action:'note',id:'abc',texto:'test'}));});
test('extension only once',async()=>{await assert.rejects(setup('Admin',{userId:'owner',status:'Em análise',prorrogado:true,deadline:Date.now()+86400000}).call({action:'extend',id:'abc',texto:'Justificativa'}));});
test('extension updates due date and preserves audit',async()=>{const deadline=Date.now()+86400000;const s=setup('Admin',{userId:'owner',status:'Em análise',deadline});await s.call({action:'extend',id:'abc',texto:'A área precisa localizar o documento.'});assert.equal(s.writes[0].deadline,deadline+10*86400000);assert.equal(s.writes[1].interno,false);});
test('appeal requires ownership',async()=>{await assert.rejects(setup('Admin',{userId:'owner',status:'Respondido',cienciaAt:Date.now()}).call({action:'appeal',id:'abc',texto:'Quero apresentar este recurso.'},'other'),e=>e.code==='permission-denied');});
test('expired appeal denied',async()=>{await assert.rejects(setup('Cidadão',{userId:'owner',status:'Respondido',cienciaAt:Date.now()-11*86400000}).call({action:'appeal',id:'abc',texto:'Quero apresentar este recurso.'}));});
test('author cannot decide own response appeal',async()=>{await assert.rejects(setup('Admin',{userId:'citizen',status:'Em recurso',respondidoPor:'owner'}).call({action:'decide',id:'abc',texto:'Decisão'}));});
