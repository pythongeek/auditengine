import os

files = [
    ('src/dashboard/index.html', 'src/dashboard/dashboard-html.ts', 'DASHBOARD_HTML'),
    ('src/dashboard/home.html', 'src/dashboard/home-html.ts', 'HOME_HTML'),
    ('src/dashboard/audit-new.html', 'src/dashboard/audit-new-html.ts', 'AUDIT_NEW_HTML'),
    ('src/dashboard/onboarding.html', 'src/dashboard/onboarding-html.ts', 'ONBOARDING_HTML'),
    ('src/dashboard/settings.html', 'src/dashboard/settings-html.ts', 'SETTINGS_HTML'),
]

for html_path, ts_path, var_name in files:
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    html = html.replace('\\', '\\\\')
    html = html.replace('`', '\\`')
    html = html.replace('$', '\\$')
    ts_content = f'export const {var_name} = `{html}`\n'
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write(ts_content)
    print(f'Generated {ts_path} ({len(ts_content)} chars)')
