# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Cross-platform parity is required

A defect found on one Warsha surface is a defect on every surface that shares
the behaviour, until checked. Before closing any bug, UX issue, validation
rule, localization gap, visual inconsistency or authentication change, audit
the other applicable surfaces — public/customer/worker/admin web, Android, iOS,
English and Arabic, light/dark/system — and fix it everywhere it applies.
Report what you checked even when it finds nothing.

This does not mean identical layouts. It means product rules, identity,
localization, validation and brand behaviour do not disagree with themselves.

Before inventing a colour, mark, icon, preference key or copy string, search
for the existing authority — Warsha already has one for each.

**Read `docs/constitution/cross-platform-parity.md` before starting work that
touches more than one surface.**

# Engineering automation and release boundaries

Use `docs/operations/engineering-automation-runbook.md` for recovery, impact,
validation, release classification and handoff commands. Generated handoffs
are advisory: verify them against Git, preserve dirty work, and capture the
underlying command's real exit code directly.

Administration is web-only. Search existing backend authority before adding
an RPC. OTA cannot carry a native dependency/configuration change. Releases
require a clean exact validated source state; Preview automation never grants
Production backend authority. A human-only boundary stops that action, not
safe independent work. Put substantial final reports in one fenced Markdown
block.
