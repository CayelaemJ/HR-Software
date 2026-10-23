import {pool} from './db.js';

// Maintenance is a narrowly scoped, privileged owner operation. Runtime HTTP
// handlers always use the restricted cabo_runtime PostgreSQL role instead.
export async function purgeExpiredCandidateDocuments():Promise<{removed:number;locked:boolean}>{
 const client=await pool.connect();
 let removed=0;
 try{
  await client.query('BEGIN');
  const lock=await client.query("SELECT pg_try_advisory_xact_lock(43812, 7701) AS acquired");
  if(lock.rows[0]?.acquired!==true){
    await client.query('ROLLBACK');
    return {removed:0,locked:true};
  }
  // Bound each pass to avoid monopolizing Neon or interrupting API requests.
  for(let batch=0;batch<20;batch++){
    const deleted=await client.query(`
      WITH targets AS (
        SELECT id FROM candidate_documents
        WHERE expires_at<=now()
        ORDER BY expires_at ASC LIMIT 500 FOR UPDATE SKIP LOCKED
      ), discarded AS (
        DELETE FROM candidate_documents
        WHERE id IN (SELECT id FROM targets)
        RETURNING tenant_id
      )
      SELECT tenant_id,count(*)::int AS removed_count
      FROM discarded GROUP BY tenant_id`);
    const groups=deleted.rows as {tenant_id:string;removed_count:number}[];
    if(groups.length===0)break;
    for(const group of groups){
      removed+=group.removed_count;
      await client.query(
       'INSERT INTO document_retention_runs(tenant_id,removed_count) VALUES($1,$2)',
       [group.tenant_id,group.removed_count]
      );
    }
  }
  await client.query('COMMIT');
  return {removed,locked:false};
 }catch(err){
  await client.query('ROLLBACK');
  throw err;
 }finally{client.release();}
}

export function startDocumentRetentionScheduler(){
  const run=async()=>{
    try{
      const result=await purgeExpiredCandidateDocuments();
      if(result.removed>0)console.info('CABO document retention purge:',result.removed,'expired documents removed');
    }catch(err){
      console.error('CABO document retention maintenance failed:',err instanceof Error?err.message:'unknown');
    }
  };
  void run();
  const timer=setInterval(()=>{void run();},6*60*60*1000);
  timer.unref();
}
