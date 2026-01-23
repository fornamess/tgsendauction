---
name: code-review-fullstack
description: Review full-stack code for security, performance, and testing expectations with senior-level rigor. Use when reviewing pull requests, examining code changes, or when the user asks for a code review.
---

# Full-Stack Code Review

## Quick Start

When reviewing changes:

1. Validate correctness and edge cases first.
2. Check security risks (auth, data exposure, injection, secrets).
3. Evaluate performance and scalability (hot paths, I/O, queries).
4. Assess test coverage and confidence.
5. Call out maintainability risks and unclear behavior.

Assume the audience is a senior full-stack developer: be direct, skip basics, and prioritize impact.

## Review Checklist

**Correctness**
- Logic handles expected and edge cases.
- Error handling is explicit and actionable.
- Idempotency and retries are safe where needed.

**Security**
- Authn/authz checks are enforced server-side.
- Input validation and output encoding are present.
- No injection vectors (SQL/NoSQL/command/template).
- Secrets and tokens are not logged or exposed.
- Sensitive data is masked or minimized.

**Performance**
- Avoids N+1 queries and excessive round trips.
- Uses caches appropriately and invalidates safely.
- Handles large payloads and pagination.
- Avoids blocking work on request paths.

**Testing**
- Tests cover new behavior and key edge cases.
- Failure modes are tested (timeouts, nulls, invalid input).
- Test names explain intent and expected behavior.

**Maintainability**
- Clear boundaries between layers (controller/service/data).
- Naming and structure reflect domain intent.
- No dead code or unused paths.

## Feedback Style

- Prioritize findings by severity and risk.
- Explain impact briefly and suggest a concrete fix.
- If no issues, state that explicitly and mention any testing gaps.
