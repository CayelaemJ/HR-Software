# Source-grounded, human-reviewed CV evidence — pilot

This phase adds an optional recruiter-led semantic analysis of **malware-cleared CV documents** already attached to a specific candidate application and vacancy.

Workflow: authorized recruiter selects a vacancy and stored CV, confirms the lawful external processing of candidate information, then the backend verifies the tenant, verifies the application-to-document relationship, requires a clean malware scan, rechecks SHA-256, extracts text in a bounded worker, redacts several direct identifiers and asks Groq to produce role-specific evidence and missing-information questions.

No candidate ranking, match percentage, rejection, offer, or promotion decision is produced. If the AI quotes an excerpt not found in the submitted text, the response is rejected. Candidate information remains **unverified**; reviewers must examine the original source and provide an opportunity to correct mistakes. AI is not required for ordinary recruiter workflows.

Limitations: direct identifier redaction is incomplete and may not remove names or all special-category information. Scanned CVs need a separate approved OCR pipeline. Layout-sensitive CVs can be imperfectly extracted. This workflow is not production-approved until privacy/legal assessment, processor agreement, penetration tests, malware scan infrastructure, accessible alternatives, fairness and multilingual evaluation sets, model drift monitoring, human override/appeal procedures and live integrations are validated. Treat candidate documents as untrusted prompt input.

## Release controls

External candidate CV AI processing is disabled by default (`HR_CV_AI_EXTERNAL_ENABLED=false`). Enable it only after the organization/controller has approved its lawful processing basis, candidate notices, data minimization, vendor data-processing terms and cross-border transfer requirements, verified malware scanning and tested human review. The per-request explicit authorization remains mandatory. This global switch is a release gate, **not** a substitute for tenant-specific governance or a production-compliance certification.
