"""Connect widgets when the team's original app.py is run directly."""
import os
from pathlib import Path
from .sx_widgets import attach


def connect_dashboard(app):
    """Read only the project's root .env; never create or modify settings."""
    env_path = Path(app.root_path) / '.env'
    if env_path.is_file():
        for line in env_path.read_text(encoding='utf-8-sig').splitlines():
            name, separator, value = line.partition('=')
            if separator and name.strip().isidentifier():
                os.environ.setdefault(name.strip(), value.strip().strip('\"\''))
    attach(app)
