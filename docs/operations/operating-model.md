# Who does what

Warsha is operated by one owner and one agent. This is the division of labour
between them, and what the admin console is therefore for.

It is written down because the alternative is a console that slowly becomes a
deployment terminal: every capability grows a button, the owner is expected to
know which order to press them in, and the one path with no validation, no
evidence and no rollback attached to it becomes the one a tired person uses at
midnight.

## Owner

- **Product decisions.** What Warsha does, what it is called, who it is for.
- **Authorisation.** Anything that needs a human to say yes: a production
  release, a credential, a legal position, a spend.
- **Business and moderation review.** Approving a professional, judging a
  dispute, suspending an account. Decisions about *people*, which need judgement
  and carry consequences for someone.
- **Monitoring.** Reading what happened.

## Claude

- **Technical configuration and activation.** Provider activation, feature
  flags, environment configuration — through the governed backend path, with the
  capability checks, fresh-auth requirements and audit rows that path enforces.
- **Validation.** Typecheck, lint, the deterministic suites, rendered evidence
  on real devices.
- **Rollout and rollback** where authorised.
- **Audit evidence.** Saying what was done, on what, with what result, including
  when the result was a failure.

Activation being the agent's job is not a reduction in control. It is the same
RPC, the same capability, the same audit row — reached by something that
validates first and reports afterwards, rather than by a button that does
neither.

## The admin console

**It is for:**

- business administration
- moderation, and the evidence behind it
- status and observability — what is enabled, in which environment, whether
  credentials are healthy, what is blocking
- audit and history
- legal decisions where human judgement is genuinely required, such as recording
  that a lawful basis has been reviewed or that a subprocessor's terms are in
  force
- bootstrap and recovery controls, where no other path exists yet — the platform
  environment binding is the example, and it appears only while a backend is
  unbound

**It is not for:**

- routine technical service activation
- switching feature flags on and off as an operational habit
- anything whose only purpose is for the owner to do by hand what the agent
  should do through the governed path

### What that removed, and what it did not

The provider console used to offer *Activate provider* and *Enable feature*, and
a request-and-second-approval pair to gate them. Those are gone.

`staff_activate_external_provider`, `staff_set_feature_flag`,
`staff_request_dual_control` and `staff_approve_dual_control` are **not** gone.
They still exist, still check their capability, still demand fresh auth where
they did, still enforce environment binding, and still write their audit rows.
`scripts/admin-console.test.mts` asserts both halves — that the console calls
none of them, and that all of them still exist — so a later change cannot delete
the authority believing the UI work made it dead.

Removing a caller is not removing an authority. That distinction is the whole
design.

## When authorisation is needed

The agent asks, in the ordinary conversation, and says what it needs, why, what
it enables, and whether it is temporary. It does not surface an *Activate*
button in the console and wait for somebody to find it.

## Related

- `docs/operations/single-owner-automation-authority.md` — why dual control here
  is across time rather than across people
- `docs/operations/engineering-automation-runbook.md` — the commands
- `docs/operations/release-management-runbook.md` — why pushing `main` publishes
  nothing
- `docs/operations/test-environment-tls-exception.md` — the shape a temporary
  machine-level exception takes, and how it is recorded and reverted
