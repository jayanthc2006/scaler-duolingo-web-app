"""Guard rails for the layering described in docs/ARCHITECTURE.md."""
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
ROUTER_FILES = sorted((APP / "routers").glob("*.py"))
FORBIDDEN = [r"\bselect\(", r"db\.(commit|rollback|add|execute|query|scalar|scalars|get)\(", r"\.stats\b", r"\braise\b"]


def test_routers_only_delegate_to_services():
    """Routers parse the request, inject dependencies and call a service. No queries, no commits, no rules."""
    offenders = []
    for path in ROUTER_FILES:
        for lineno, line in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
            code = line.split("#")[0]
            if any(re.search(p, code) for p in FORBIDDEN):
                offenders.append(f"{path.name}:{lineno}: {line.strip()}")
    # health.py is allowed its single liveness ping (SELECT 1)
    offenders = [o for o in offenders if not o.startswith("health.py")]
    assert not offenders, "business logic leaked into routers:\n" + "\n".join(offenders)


def test_services_do_not_import_the_web_layer():
    for path in (APP / "services").glob("*.py"):
        text = path.read_text(encoding="utf8")
        assert "fastapi" not in text and "app.routers" not in text, path.name
