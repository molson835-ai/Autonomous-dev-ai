# Provider execution preflight

## Purpose

This milestone composes the existing execution-plan, provider-readiness, and verified-usage policies into one deterministic preflight result. It reduces the risk that a future caller checks only one gate and overlooks a missing provider eligibility or usage-control check.

## Required gates

A request passes preflight only when:

1. The provider and bounded execution profile produce a valid execution plan.
2. The selected provider has fresh evidence for plan eligibility, commercial use, usage limits, billing controls, and isolation controls, plus explicit owner approval for a separate activation review.
3. A verified usage snapshot exists for the same provider and period, with currency and at least one complete usage/limit pair.
4. The highest reported utilization remains below the 90% optional-work stop threshold.

Missing, malformed, stale, mismatched, or threshold-exceeding evidence blocks the preflight.

## Critical boundary

A successful result is `preflight_passed_not_executed`. Both `activationAllowed` and `executionAllowed` remain false. The result only identifies a later, separate owner activation approval as the next step. This module does not call a provider, read billing, create or delete a sandbox, transfer files, execute commands, install packages, access the network, or mutate the task queue.

## Validation

Tests cover successful assessment, missing and mismatched readiness evidence, missing/unverified/mismatched usage, 90% and 100% thresholds, invalid requests, unknown fields, and the invariant that preflight never grants execution or activation.
