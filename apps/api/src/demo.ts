import type {PoolClient} from 'pg';
import {inTenant} from './db.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,actor:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type SeedCounts={alreadySeeded:boolean; jobs:number;candidates:number;applications:number;interviews:number;evidence:number};

const jobs=[
 {title:'Demo | Junior Data Analyst',department:'Technology',location:'Sandton, Gauteng',description:'Sample vacancy for a junior analyst supporting dashboard quality and reliable reporting. This is demonstration data, not a real job advertisement.',criteria:'Evidence of working with SQL, spreadsheets, careful data validation and communicating findings.'},
 {title:'Demo | HR Coordinator',department:'Human Resources',location:'Pretoria, Gauteng',description:'Sample vacancy for coordinating onboarding records and supporting recruitment teams. This is demonstration data, not a real job advertisement.',criteria:'Experience communicating with staff, following HR workflows and handling records confidentially.'},
 {title:'Demo | Customer Support Associate',department:'Operations',location:'Johannesburg, Gauteng',description:'Sample vacancy for resolving customer issues and improving service processes. This is demonstration data, not a real job advertisement.',criteria:'Evidence of written communication, customer problem solving and incident follow-up.'}
];
const people=[
 {name:'Demo Candidate A',email:'candidate-a@example.test',headline:'SQL reporting and data validation'},
 {name:'Demo Candidate B',email:'candidate-b@example.test',headline:'Recruitment coordination and employee support'},
 {name:'Demo Candidate C',email:'candidate-c@example.test',headline:'Customer service and operational improvement'},
 {name:'Demo Candidate D',email:'candidate-d@example.test',headline:'Technical documentation and quality assurance'}
];

export async function seedDemoWorkspace(actor:Actor,audit:Audit):Promise<SeedCounts>{
 return inTenant(actor.tenantId,actor.userId,async db=>{
   const first=await db.query('INSERT INTO demo_seed_runs(tenant_id,seeded_by) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING tenant_id',[actor.tenantId,actor.userId]);
   if(!first.rowCount)return {alreadySeeded:true,jobs:0,candidates:0,applications:0,interviews:0,evidence:0};
   const jobIds:string[]=[];
   for(const j of jobs){
     const r=await db.query(`INSERT INTO jobs(tenant_id,title,department,location,description,criteria,status,created_by,is_demo,published_at)
         VALUES($1,$2,$3,$4,$5,$6,'published',$7,true,now()) RETURNING id`,
         [actor.tenantId,j.title,j.department,j.location,j.description,j.criteria,actor.userId]);
     jobIds.push(r.rows[0].id);
   }
   const candidateIds:string[]=[];
   for(const person of people){
     const r=await db.query(`INSERT INTO candidates(tenant_id,full_name,email,headline,created_at,is_demo)
       VALUES($1,$2,$3,$4,now(),true) RETURNING id`,
       [actor.tenantId,person.name,person.email,person.headline]);
     candidateIds.push(r.rows[0].id);
   }
   const appInputs=[{j:0,c:0,s:'interview'},{j:1,c:1,s:'human_review'},{j:2,c:2,s:'offer'},{j:0,c:3,s:'applied'}];
   const applications:string[]=[];
   for(const v of appInputs){
     const r=await db.query(`INSERT INTO applications(tenant_id,job_id,candidate_id,stage,is_demo)
         VALUES($1,$2,$3,$4,true) RETURNING id`,[actor.tenantId,jobIds[v.j],candidateIds[v.c],v.s]);
     applications.push(r.rows[0].id);
   }
   const evidenceInputs=[
     {candidate:0,type:'skill',claim:'Example candidate reports building SQL queries for monthly reports.',source:'candidate_statement'},
     {candidate:0,type:'project',claim:'Example CV excerpt describes a dashboard cleanup project; authenticity is not independently checked.',source:'document_excerpt'},
     {candidate:1,type:'experience',claim:'Example candidate reports coordinating employee onboarding checklists.',source:'candidate_statement'},
     {candidate:2,type:'skill',claim:'Example candidate reports resolving escalated customer tickets.',source:'candidate_statement'}
   ];
   for(const item of evidenceInputs){
     await db.query(`INSERT INTO candidate_evidence(tenant_id,candidate_id,claim_type,claim_text,source_kind,source_note,created_by,is_demo)
       VALUES($1,$2,$3,$4,$5,'Synthetic demonstration record; not verified',$6,true)`,
       [actor.tenantId,candidateIds[item.candidate],item.type,item.claim,item.source,actor.userId]);
   }
   const interview=await db.query(`INSERT INTO interviews(tenant_id,application_id,scheduled_at,location,interviewer_id,created_by,is_demo)
      VALUES($1,$2,now()+interval '7 days','Demo meeting room (not a real appointment)',$3,$3,true) RETURNING id`,
      [actor.tenantId,applications[0],actor.userId]);
   await db.query(`INSERT INTO interview_scorecards(tenant_id,interview_id,criterion,observation,finding,reviewer_id,is_demo)
     VALUES($1,$2,'SQL and data quality','Synthetic scorecard: ask for a practical example of checking conflicting data. No real candidate was assessed.','follow_up_required',$3,true)`,
     [actor.tenantId,interview.rows[0].id,actor.userId]);
   await audit(db,actor,'demo.workspace_seeded','organization',actor.tenantId,{synthetic:true,jobs:jobs.length,candidates:people.length});
   return {alreadySeeded:false,jobs:jobs.length,candidates:people.length,applications:applications.length,interviews:1,evidence:evidenceInputs.length};
 });
}
