import {createHash} from 'node:crypto';
import {z} from 'zod';

const iso=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const ms=Date.parse(value+'T00:00:00.000Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
},{message:'Invalid ISO date'});
export const payrollRequest=z.object({
  kind:z.enum(['employee_roster','approved_leave']),
  periodStart:iso,
  periodEnd:iso,
  confirmed:z.literal(true)
}).superRefine((input,ctx)=>{
  const days=(Date.parse(input.periodEnd+'T00:00:00Z')-Date.parse(input.periodStart+'T00:00:00Z'))/86400000;
  if(days<0||days>366)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Period must be between 1 and 367 calendar dates',path:['periodEnd']});
});

export type PayrollKind=z.infer<typeof payrollRequest>['kind'];
export const EXPORT_MAX_ROWS=10000;
const columns={
  employee_roster:[
    ['Employee Code','employee_code'],['Employee Name','full_name'],
    ['Department','department'],['Job Title','job_title'],
    ['Employment Status','employment_status'],['Employment Start','start_date']
  ],
  approved_leave:[
    ['Employee Code','employee_code'],['Employee Name','full_name'],
    ['Leave Type','leave_type'],['Leave Start','start_date'],['Leave End','end_date'],
    ['Approval Date','decided_at']
  ]
} as const;

function field(value:unknown):string{
  const raw=value instanceof Date?value.toISOString().slice(0,10):String(value??'');
  // Guard spreadsheet formula execution even after whitespace.
  const safe=/^[\s]*[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export function makePayrollCsv(kind:PayrollKind,rows:ReadonlyArray<Record<string,unknown>>){
  if(rows.length>EXPORT_MAX_ROWS)throw Error('Payroll export row limit exceeded');
  const specs=columns[kind];
  const lines=[specs.map(([title])=>field(title)).join(',')];
  for(const row of rows)lines.push(specs.map(([,key])=>field(row[key])).join(','));
  const bytes=Buffer.from('\uFEFF'+lines.join('\r\n')+'\r\n','utf8');
  return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),recordCount:rows.length};
}
