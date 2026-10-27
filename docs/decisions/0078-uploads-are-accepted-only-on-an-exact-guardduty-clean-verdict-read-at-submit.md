# 0078 — Uploads are accepted only on an exact GuardDuty clean verdict, read at submit

## Context

GuardDuty Malware Protection scans every object in the forms uploads bucket and
writes its verdict as the `GuardDutyMalwareScanStatus` tag, about 2s after the
PUT (median 1.77s, slowest 2.88s for files up to 10MB; #2839). Until #2938/#2939
nothing read that tag. Submit only checked that each key existed, so a caller
could `POST /submissions` with the key of an infected file, and it would be
emailed to a ministry and copied into CaMS.

Reading the tag needs `s3:GetObjectTagging` on the API task role (alpha-infra#747,
confirmed applied in sandbox, staging and prod on #3322). Sandbox has no
`s3:DeleteObject` by design (alpha-infra#208).

## Decision

- **One policy, exact allowlist.** `apps/api/src/files/malware-scan-status.ts`
  maps the tag to a verdict: `clean` only for the byte-exact value
  `NO_THREATS_FOUND`; `infected` for `THREATS_FOUND`; `pending` for no tag; and
  `unscannable` for everything else, including values AWS adds later. This
  mirrors CaMS's `isCleanScanStatus`. An S3 `AccessDenied` on the read also gives
  `unscannable` (fail closed).
- **Submit is the security control and has no switch.** `verifySubmissionFiles`
  reads each file's tag from S3 at submit, and never trusts a verdict from
  confirm-upload or form state. A file that isn't clean gets a field error and
  the submission gets a 422. Turning this off takes a reviewed code change. If
  GuardDuty stops tagging, forms with a required upload are blocked until it is
  back. We accept that rather than send unscanned files.
- **A scan still in progress is waited for, not trusted.** At confirm-upload, and
  for a file still `pending` at submit, the API re-reads every 400ms for up to 4s.
  A file still untagged after that is refused. (#2939 said "no wait" at submit,
  but people and the deploy smokes can submit within the scan time.)
- **The upload-time verdict is UX and is switched.** `UPLOAD_MALWARE_SCAN_ENABLED`
  (default off, turned on per environment by infra) makes confirm-upload return
  `scanStatus` and withhold the preview `url` unless the file is clean. Off, it
  reports `clean` as before.
- **Refused files are not deleted.** Sandbox can't delete, and the submit check
  already stops them. Expiry is an infra lifecycle concern (#3322).
- **Local development plays GuardDuty.** When `S3_ENDPOINT` is set
  (LocalStack/MinIO), confirm-upload writes the tag from the file name (`eicar` →
  infected, `unsupported` → unscannable), whatever the switch says, so the real
  check runs locally. Deployed environments never set `S3_ENDPOINT`, and their
  role has no `s3:PutObjectTagging`.
- **Logs are a contract with infra.** One JSON line per upload verdict,
  `{"event":"upload.scan_verdict","verdict":…,"scan_tag":…}`, and
  `{"event":"upload.scan_tag_read_denied"}` at error level, written through
  `writeBusinessLog` (`log_type: "security_event"`). Never the object key, which
  embeds the citizen's file name. `scan_tag` rather than `status`, which Datadog
  reserves.

## Consequences

- Don't put the submit check behind a flag, and don't widen "clean" beyond the
  one exact value.
- Renaming `event` or `verdict`, or changing their values, silently disables the
  infra alarm (alpha-infra#698). Tell infra first.
- Raising `UPLOAD_MAX_SIZE_BYTES` above ~15MB needs the 4s wait revisited, because
  scan time grows with file size.
- The two refusal messages live in the policy module and must match the upload
  page (#2940).
