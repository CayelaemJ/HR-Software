import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makePayrollCsv,payrollRequest} from './payroll-csv.js';

test('payroll handoff requires explicit confirmation and a valid bounded period',()=>{
 const input={kind:'approved_leave',periodStart:'2026-10-01',periodEnd:'2026-10-31',confirmed:true};
 assert.equal(payrollRequest.parse(input).kind,'approved_leave');
 assert.equal(payrollRequest.safeParse({...input,confirmed:false}).success,false);
 assert.equal(payrollRequest.safeParse({...input,periodEnd:'2026-09-30'}).success,false);
 assert.equal(payrollRequest.safeParse({...input,periodEnd:'2028-01-01'}).success,false);
 assert.equal(payrollRequest.safeParse({...input,periodEnd:'2026-02-30'}).success,false);
});

test('payroll CSV neutralizes spreadsheet formulas and does not include unapproved fields',()=>{
 const row={
  employee_code:'=SUM(1+1)',full_name:'  @inject',
  department:'-cmd',job_title:'Chief "Tester"',
  employment_status:'active',start_date:'2026-01-01',bank_account:'should NEVER export',
  salary:1234.56,medical_note:'should NEVER export'
 };
 const csv=makePayrollCsv('employee_roster',[row]);
 const content=csv.bytes.toString('utf8');
 assert.ok(content.startsWith('\uFEFF'));
 assert.ok(content.includes('"\'=SUM(1+1)"'));
 assert.ok(content.includes('"\'  @inject"'));
 assert.ok(content.includes('"\'-cmd"'));
 assert.ok(content.includes('"Chief ""Tester"""'));
 assert.equal(content.includes('should NEVER export'),false);
 assert.equal(content.includes('1234.56'),false);
 assert.equal(csv.sha256,createHash('sha256').update(csv.bytes).digest('hex'));
 assert.equal(csv.recordCount,1);
});
test('leave handoff only exports approved-period mapping columns, no employee notes',()=>{
 const output=makePayrollCsv('approved_leave',[{
  employee_code:'E-1',full_name:'Demo Example',leave_type:'annual',
  start_date:'2026-10-05',end_date:'2026-10-09',decided_at:'2026-10-02',
  employee_note:'Confidential information',decision_reason:'Confidential detail'
 }]).bytes.toString();
 assert.ok(output.includes('Leave Type'));
 assert.equal(output.includes('Confidential'),false);
 assert.equal(output.includes('Email'),false);
 assert.equal(output.includes('Salary'),false);
});
