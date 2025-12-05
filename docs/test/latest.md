# Test Report

- Timestamp (UTC): 2025-12-04T23:52:13.981Z
- Command: `node --test --test-reporter tap`
- Outcome: ✅ Pass (exit code 0)
- Duration: 440 ms

## Output (last lines)

```
ok 36 - DELETE /edition/:edition removes edition and cards
  ---
  duration_ms: 1.481166
  type: 'test'
  ...
# Subtest: POST /login authenticates via passport and logs the user in
ok 37 - POST /login authenticates via passport and logs the user in
  ---
  duration_ms: 25.785625
  type: 'test'
  ...
# Subtest: POST /login returns 401 when passport rejects credentials
ok 38 - POST /login returns 401 when passport rejects credentials
  ---
  duration_ms: 0.224583
  type: 'test'
  ...
# Subtest: POST /login propagates logIn errors
ok 39 - POST /login propagates logIn errors
  ---
  duration_ms: 2.365375
  type: 'test'
  ...
# Subtest: POST /logout destroys the session when present
ok 40 - POST /logout destroys the session when present
  ---
  duration_ms: 1.493292
  type: 'test'
  ...
# Subtest: POST /logout passes through logout errors
ok 41 - POST /logout passes through logout errors
  ---
  duration_ms: 2.963
  type: 'test'
  ...
# Subtest: POST /register creates a new API key via service cache
ok 42 - POST /register creates a new API key via service cache
  ---
  duration_ms: 23.5795
  type: 'test'
  ...
# Subtest: POST /register returns existing API key and updates metadata
ok 43 - POST /register returns existing API key and updates metadata
  ---
  duration_ms: 2.428167
  type: 'test'
  ...
# Subtest: GET /stats aggregates cards and editions from caches
ok 44 - GET /stats aggregates cards and editions from caches
  ---
  duration_ms: 16.504083
  type: 'test'
  ...
# Subtest: documentation requires method and path and fills description
ok 45 - documentation requires method and path and fills description
  ---
  duration_ms: 0.841
  type: 'test'
  ...
# Subtest: message enforces docs/message and merges data
ok 46 - message enforces docs/message and merges data
  ---
  duration_ms: 0.274417
  type: 'test'
  ...
# Subtest: error enforces docs/error and carries details
ok 47 - error enforces docs/error and carries details
  ---
  duration_ms: 0.125084
  type: 'test'
  ...
1..47
# tests 47
# suites 0
# pass 47
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 354.761125
```
