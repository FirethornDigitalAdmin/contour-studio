"""Preserve installed Python and frontend dependency notices in desktop bundles."""
from importlib.metadata import distributions
from pathlib import Path
from scripts.build_release import frontend_notices


def write_notices(root):
    notices = [frontend_notices(), '\nPython dependency notices\n']
    for distribution in sorted(distributions(), key=lambda d: d.metadata.get('Name', '')):
        for name in distribution.files or []:
            if name.name.lower().startswith(('license', 'licence', 'copying', 'notice', 'copyright')):
                path = distribution.locate_file(name)
                if path.is_file():
                    notices.append(f'\n--- {distribution.metadata.get("Name", "dependency")} / {name} ---\n')
                    notices.append(path.read_text(encoding='utf-8', errors='replace'))
    output = Path(root) / 'build-desktop' / 'THIRD-PARTY-NOTICES.txt'
    output.parent.mkdir(exist_ok=True)
    output.write_text('\n'.join(notices), encoding='utf-8')
    return output
