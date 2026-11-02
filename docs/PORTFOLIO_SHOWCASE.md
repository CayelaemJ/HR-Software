# CABO Human Capital — Evidence-Led People Operations

> **Status:** Active development; not approved for real HR data  
> **Technology focus:** React · TypeScript · Express · PostgreSQL · RLS  
> **Maintainer:** Cayelaem Jantjies

## At a glance

**The challenge:** Support accountable recruitment and people operations with documented evidence and audit trails.

This is a project-specific technical showcase, not a claim that every proposed capability is live. The repository's README and implementation remain the source of truth for release status.

## System journey (conceptual)

```mermaid
flowchart LR
  N0["Recruiter / HR workspace"]
  N1["Authenticated API"]
  N2["Tenant + role checks"]
  N3["PostgreSQL RLS"]
  N4["Audit + people workflows"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
```

*Diagram describes the documented workflow at a high level, not a verified live infrastructure topology.*

## Engineering deep dive

### 1. Evidence provenance and human-reviewed hiring decisions

This area illustrates a concrete engineering consideration in the project. Inspect the implementation, tests, and source contracts to establish the precise current behaviour and implementation maturity before using it in a live environment.

### 2. Tenant-aware access and audit history

This area illustrates a concrete engineering consideration in the project. Inspect the implementation, tests, and source contracts to establish the precise current behaviour and implementation maturity before using it in a live environment.

### 3. Opt-in synthetic demo data and explicit privacy gating

This area illustrates a concrete engineering consideration in the project. Inspect the implementation, tests, and source contracts to establish the precise current behaviour and implementation maturity before using it in a live environment.

## Engineering evidence checklist

| Evidence | How to evaluate |
| --- | --- |
| Architecture | Trace actual components, data flow, trust boundaries and dependencies in this repository |
| Data integrity | Verify schema, validation, migrations and failure handling against test cases |
| Reliability | Check logging, error recovery, retries and existing test outcomes |
| Security | Review auth, tenant isolation, secrets handling and data access controls |
| Product quality | Check accessible UX, responsive layouts, empty/error states and real screenshots |
| Deployment | Verify runtime variables, CI results and the currently active hosting configuration |

## Visual gallery

Real, approved screenshots, device mockups and dashboard visuals belong in a future `docs/media/` gallery. **No screenshot is displayed here until a real application view is captured, sanitised and approved.** The Mermaid flowchart above is a renderable architecture visual that works directly on GitHub.

## Known limitations and honest status

Real HR data use, enforced MFA and full POPIA readiness remain subject to further review; existing README details exact scope.

## Further reading

[Back to repository README](../README.md) · [Cayelaem's engineering profile](https://github.com/CayelaemJ)
