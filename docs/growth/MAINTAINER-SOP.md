# Weekly maintainer routine

Owner: the maintainer role, currently @TechInjectIndia. Budget: one to two hours per week for community maintenance. Choose a regular weekly slot manually; this document does not create a schedule or promise monitoring.

Response targets below are aspirations, not SLAs. See [support](../../SUPPORT.md) and [security policy](../../SECURITY.md). Private security reports follow the private channel; never reproduce their details in public issues.

## Weekly checklist

1. **Triage, 20 minutes.** Review open issues and pull requests. Check duplicates, runtime/version, a synthetic reproduction and whether a security issue needs a private channel. Aim to acknowledge ordinary reports within seven days when capacity permits. Ask for the smallest missing detail once, label actionable work and explain deferrals.
2. **Contributor work, 25 minutes.** Keep three small, clearly specified starter issues available when useful work exists. Each needs a concrete outcome, relevant files, validation command and explicit scope limits. Review one external PR with actionable feedback; credit the contributor when merged. Do not create busywork to meet a count.
3. **Onboarding evidence, 20 minutes.** Review actual pilot blockers and reproduce the highest-impact one. Update quickstart/integration documentation when behavior changes. Record assisted setup separately from independent setup. Check the day-14 outcome only for participants who consented to follow-up.
4. **Release and reliability, 20 minutes.** Review CI and dependency/security alerts. Follow [maintaining](../MAINTAINING.md) before a release. Prepare concise release notes naming behavior changes, validation and limits. Registry publication requires the release checklist and account ownership; the existence of a package version is not publication evidence.
5. **One useful update, 15 minutes.** Select one runnable example, fix or verified case-study result. Prepare a short post linking the relevant artifact. Start with a selected LinkedIn account, then a selected community only when its rules allow the post. Account/channel selection and actual sending remain separate actions; no automatic recurring outreach is configured.
6. **Scorecard, 10 minutes.** Append only observed rows to [SCORECARD.csv](SCORECARD.csv). Record actual maintenance minutes, installations, verified day-14 retention, external contributions and qualified leads. Stars remain secondary. Leave unavailable values blank.

If maintenance exceeds two hours, prioritize security/reproducible failures and onboarding blockers. Defer optional integrations and broad promotion; report the real backlog rather than overstating support capacity.

## Release-note format

Describe the user-visible change, affected runtimes/providers, verification performed and any migration step. Include contributors and known limitations. Do not claim production support or live provider delivery from fixture tests.

## Monthly review

Compare observed results with the proposed first-month targets: five external installations, two projects retaining usage, one verified case study and one outside contribution. Report shortfalls honestly. Decide whether to improve onboarding, narrow the audience or continue testing before expanding distribution.
