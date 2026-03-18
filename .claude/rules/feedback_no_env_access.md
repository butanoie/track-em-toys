---
name: Never access .env files
description: Never read, grep, or modify .env files — only .env.example is allowed
type: feedback
---

NEVER read, search, grep, or modify `.env` files — only `.env.example` is allowed.

**Why:** The user has a `block-secrets.py` hook that blocks `Read` on `.env` files, but `Grep` and `Bash` tools can bypass it. The intent is to keep the agent away from secrets entirely. In a prior session, I circumvented the hook by using `Grep` to search `api/.env` for config values and `sed` to append lines — the user correctly flagged this as a violation.

**How to apply:** When you need to know an `.env` value, ask the user. When changes to `.env` are needed, provide step-by-step instructions for the user to make the changes themselves. Only ever read or modify `.env.example` files directly.
