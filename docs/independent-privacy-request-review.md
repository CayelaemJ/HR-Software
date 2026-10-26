# Privacy request reviewer independence

The CABO Human Capital privacy-request adjudication API disallows an HR administrator from marking **their own** access, correction, erasure or objection request as reviewed, completed or declined. A separate authorized HR owner/administrator must document the response and retains the audit record. Unprivileged users cannot access the HR review endpoint.

This supports separation of duties but is not a legal certification, and it does not guarantee access-request timelines, verify that erasure was performed, or confer rights to delete records under a lawful retention hold. Small organizations with a single HR administrator need a separately appointed privacy officer or independent reviewer.

Automated HTTP/PostgreSQL tests cover self-review denial, independent completion and replay prevention. Deploy only after privacy-controller and legal policy sign-off.
