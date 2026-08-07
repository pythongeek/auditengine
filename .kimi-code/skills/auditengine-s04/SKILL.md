---
name: auditengine-s04
description: Run AuditEngine build session S04 from the build bible
type: flow
whenToUse: When the user wants to execute S04 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. Confirm S01-S03 are ✅ before proceeding.
2. These are markdown files — no TypeScript, no JSON, no code.
3. Do not invent categories not listed per agent type below.
4. Do not touch files outside the scope of this session.
5. After completing, update BUILD_STATE.md.

---

PROJECT: AuditEngine
THIS SESSION: Create 11 constitution markdown files in src/constitutions/

Each file must follow this structure:
# [Agent Type] Agent Constitution — AuditEngine v1.0

## IDENTITY
You are the [Type] Specialist Agent for AuditEngine. You analyze [description].

## MANDATE
[What this agent is responsible for finding]

## FINDING CATEGORIES
[List every category this agent can use — these are the only valid category values]

## EVIDENCE STANDARDS
[What counts as acceptable evidence for each finding type]

## SEVERITY RULES
[When to use critical/high/medium/low/info for this agent type]

## BANNED BEHAVIORS
- Never use: production ready, looks good, should work, seems correct, appears to,
  likely works, no issues found, clean code, well structured, everything looks
- Never claim a feature "should work" without tracing the full execution chain
- Never output prose — only JSON arrays
- Never hallucinate code — only quote text that appears in the file

## OUTPUT CONTRACT
Output ONLY a JSON array of findings. No prose. No markdown. No explanation.
If you find nothing, output: []

---

CREATE THESE 11 FILES with appropriate content per agent type:

1. src/constitutions/universal.md
   Shared rules injected into ALL agents. Covers: output format, banned phrases,
   evidence quote requirement, JSON schema, execution trace requirement for
   auth/injection/xss/event_handler/api_contract categories.

2. src/constitutions/security.md
   Categories: auth_bypass, injection, xss, csrf, secret_exposure, insecure_deserialization,
   broken_access_control, path_traversal, open_redirect, missing_rate_limit,
   dependency_cve, missing_security_header, privilege_escalation

3. src/constitutions/api.md
   Categories: broken_api_contract, missing_validation, unhandled_error_response,
   missing_auth_middleware, cors_misconfiguration, api_versioning_absent,
   response_data_leak, missing_rate_limit_api, undocumented_endpoint

4. src/constitutions/frontend.md
   Categories: missing_event_handler, dead_button, unhandled_promise_rejection,
   stale_ui_after_action, missing_loading_state, accessibility_violation,
   xss_dom, missing_error_boundary, console_error_in_production

5. src/constitutions/database.md
   Categories: missing_index, n_plus_one_query, missing_transaction, raw_sql_injection_risk,
   missing_migration, schema_drift, missing_foreign_key_constraint,
   unparameterized_query, cascade_delete_risk

6. src/constitutions/architecture.md
   Categories: circular_dependency, god_object, missing_interface_contract,
   broken_module_boundary, hardcoded_config, missing_environment_validation,
   tight_coupling, missing_abstraction_layer

7. src/constitutions/testing.md
   Categories: no_test_coverage, missing_edge_case, test_relies_on_order,
   missing_mock_for_external, no_assertion, test_covers_wrong_path,
   missing_integration_test, flaky_test_pattern

8. src/constitutions/performance.md
   Categories: missing_cache, unnecessary_re_render, blocking_operation_in_main_thread,
   memory_leak_pattern, large_bundle_no_split, unindexed_sort_column,
   over_fetching, missing_pagination

9. src/constitutions/devops.md
   Categories: missing_health_check, missing_rollback_plan, secret_in_env_file,
   no_container_resource_limit, missing_liveness_probe, deploy_without_migration,
   missing_monitoring_alert, untagged_docker_image

10. src/constitutions/documentation.md
    Categories: missing_jsdoc, undocumented_env_var, missing_readme_section,
    outdated_comment, missing_api_doc, broken_example_in_readme,
    undocumented_error_code, missing_changelog_entry

11. src/constitutions/visual-qa.md
    Categories: visual_qa_failure, dead_button, http_500_on_navigation,
    blank_page_on_error, stale_ui_after_action, privilege_ui_visible,
    console_error_on_page_load, no_network_request_on_submit

---

RULES:
- Each file must include the BANNED BEHAVIORS section with the same banned phrases list
- Each file must include the OUTPUT CONTRACT section
- The Finding Categories section must list the exact category strings that will be used
  in D1 findings.category — these are the canonical values, no variations

SUCCESS CRITERIA:
□ All 11 files exist in src/constitutions/
□ Each file has all 6 required sections
□ No file contains TypeScript or JSON — markdown only
□ Category strings use snake_case throughout

SESSION END:
1. BUILD_STATE.md: all 11 constitution files ✅
2. SESSION_LOG.md row
3. git add -A && git commit -m "S04: constitution files (11 agents)"
