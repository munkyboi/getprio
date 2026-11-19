const {localPoolDemoConfiguration,readLocalPoolDemoScope}=require('./localPoolDemoScope');
function loopbackRequest(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req?.socket?.remoteAddress);}
// The canonical marker verifies this disposable tenant, never labels the target
// location as a fixture and never changes command/runtime scope elsewhere.
async function read(client,scope){
  const config=localPoolDemoConfiguration();if(!config)return null;
  const identity=(await client.query("SELECT current_database() AS database_name,host(inet_server_addr()) AS server_address,to_regclass('public.local_pool_demo_scopes') IS NOT NULL AS has_marker")).rows[0];
  if(!identity||identity.database_name!==config.databaseName||!['127.0.0.1','::1'].includes(identity.server_address)||!identity.has_marker)return null;
  const anchors=(await client.query("SELECT tenant_id::text,location_id::text FROM public.local_pool_demo_scopes WHERE tenant_id=$1 AND fixture_key='four-court-v1'",[scope.tenantId])).rows;
  if(anchors.length!==1||String(anchors[0].tenant_id)!==String(scope.tenantId))return null;
  if(!await readLocalPoolDemoScope(client,{tenantId:String(anchors[0].tenant_id),locationId:String(anchors[0].location_id)}))return null;
  const target=(await client.query('SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2',[scope.tenantId,scope.locationId])).rows;
  return target.length===1?{tenantId:String(scope.tenantId),locationId:String(scope.locationId),anchorLocationId:String(anchors[0].location_id)}:null;
}
module.exports={read,loopbackRequest};
