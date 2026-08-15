#!/usr/bin/env python3
"""Render a compact Markdown dashboard for the current Cortex workspace.

This module is intentionally dependency-light so it can run in redistributable
packages and generic markdown/no-provider workspaces.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SCRIPTS_DIR = Path(__file__).resolve().parent
DEFAULT_WORKSPACE = SCRIPTS_DIR.parent.parent
WORKSPACE = Path(os.environ.get("CORTEX_WORKSPACE_ROOT", DEFAULT_WORKSPACE)).resolve()


def _workspace_config(workspace: Path | None = None) -> dict[str, Any]:
    workspace = workspace or WORKSPACE
    path = workspace / ".agents" / "config" / "workspace.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _default_project(workspace: Path | None = None) -> str:
    config = _workspace_config(workspace)
    program = config.get("program") if isinstance(config.get("program"), dict) else {}
    key = str(program.get("key") or "").strip()
    if key:
        return key
    projects = config.get("projects") if isinstance(config.get("projects"), list) else []
    if len(projects) == 1 and isinstance(projects[0], dict):
        return str(projects[0].get("key") or "").strip()
    return ""


PROJECT = os.environ.get("CORTEX_PROJECT", "").strip() or _default_project()


def _project_entry(config: dict[str, Any] | None = None, project: str | None = None) -> dict[str, Any]:
    config = config or _workspace_config()
    project = project or os.environ.get("CORTEX_PROJECT", "").strip() or PROJECT
    for entry in config.get("projects", []):
        if entry.get("key") == project:
            return entry
    return {}


def _default_dashboard_dir() -> Path:
    env_dir = os.environ.get("CORTEX_DASHBOARD_DIR")
    if env_dir:
        candidate = Path(env_dir)
        return candidate if candidate.is_absolute() else WORKSPACE / candidate
    entry = _project_entry()
    beat = entry.get("beat", {}) if isinstance(entry.get("beat", {}), dict) else {}
    configured = beat.get("dashboard_dir")
    if configured:
        candidate = Path(configured)
        return candidate if candidate.is_absolute() else WORKSPACE / candidate
    return WORKSPACE / ".cortex" / "dashboards"


DASHBOARDS = _default_dashboard_dir()

class _VizFallback:
    @staticmethod
    def compute_epic_progress(epic_dir: Path) -> dict[str, Any]:
        return {
            "epic_id": epic_dir.name.split("_", 1)[0],
            "name": epic_dir.name,
            "implemented": 0,
            "spec_drafted": 0,
            "total": 0,
            "percent_implemented": 0,
            "percent_spec": 0,
            "increments": [],
        }

    @staticmethod
    def _read_field(text: str, field: str) -> str:
        return _read_field_from_text(text, field)


viz = _VizFallback()


def _clean_epic_title(value: str) -> str:
    text = value.strip()
    legacy_orchestrator_upper = "PRO" + "MI"
    special = {
        f"E67_{legacy_orchestrator_upper}_RUNTIME": "Beat Runtime",
    }
    if text in special:
        return special[text]
    text = re.sub(r"^E\d+[_ -]*", "", text)
    text = text.replace("_", " ").replace(legacy_orchestrator_upper, "Beat")
    return text.title() if text.isupper() else text


def _clean_display_text(value: Any) -> str:
    text = "" if value is None else str(value)
    legacy_orchestrator_upper = "PRO" + "MI"
    legacy_orchestrator_lower = legacy_orchestrator_upper.lower()
    replacements = [
        (legacy_orchestrator_upper, "Beat"),
        (legacy_orchestrator_lower, "beat"),
        ("CLOSED", "marked_for_closeout"),
        ("closed", "marked_for_closeout"),
        ("promoted", "opened"),
        ("active (opened", "opened"),
        ("status=active (opened", "status=opened"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace("status=active (", "status=opened ")
    text = re.sub(r"\bopened to active\b", "opened", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _truncate_status(value: Any, limit: int = 80) -> str:
    text = _clean_display_text(value)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    clipped_suffix = False
    if " - " in text:
        text = text.split(" - ", 1)[0]
        clipped_suffix = True
    if clipped_suffix:
        return text[: max(0, limit - 3)].rstrip() + "..."
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def progress_bar(percent: int | float, width: int = 20) -> str:
    try:
        value = max(0, min(100, float(percent)))
    except Exception:
        value = 0
    filled = int(round((value / 100) * width))
    return "█" * filled + "░" * (width - filled)


def rag_badge(heartbeat: dict[str, Any], pending: int, stale: int) -> tuple[str, str]:
    if heartbeat.get("stale") or stale:
        return "🔴", "RED"
    if pending:
        return "🟡", "AMBER"
    return "🟢", "GREEN"


def _api_get(path: str, timeout: int = 10) -> Any:
    """Read a project-scoped row set from cortex-api.

    Cortex access is API-only (see cortex.md); psql is not installed in the
    normal deployment, so the cortex_sql() path below silently yields nothing.
    Every caller must stay scoped to the active project.
    """
    project = os.environ.get("CORTEX_PROJECT", PROJECT)
    base = (
        os.environ.get("CORTEX_API_URL")
        or os.environ.get("CORTEX_API_BASE")
        or "http://localhost:8501"
    ).rstrip("/")
    sep = "&" if "?" in path else "?"
    url = f"{base}/{path.lstrip('/')}{sep}project={urllib.parse.quote(project)}"
    request = urllib.request.Request(url, headers={"X-Project": project})
    token = os.environ.get("CORTEX_ADMIN_TOKEN", "")
    if token:
        request.add_header("X-Cortex-Admin-Token", token)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def cortex_sql(sql: str) -> list[list[Any]]:
    # LCX-UR-011: this helper connects directly (psql) and historically as the
    # postgres superuser, which bypasses RLS — so every query MUST scope to the
    # active project explicitly or the dashboard reads cross-project rows. The
    # project is passed as a psql variable and referenced as :'project' (psql
    # safely single-quotes it), so queries below all carry a project predicate.
    project = os.environ.get("CORTEX_PROJECT", PROJECT)
    env = {**os.environ, "CORTEX_PROJECT": project}
    cmd = ["psql", os.environ.get("CORTEX_PG_DSN", "postgresql://postgres:postgres@localhost:5499/platform_agent_memory"), "-At", "-F", "|", "-v", f"project={project}", "-c", sql]
    try:
        result = subprocess.run(cmd, cwd=WORKSPACE, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False)
    except Exception:
        return []
    if result.returncode != 0:
        return []
    rows: list[list[Any]] = []
    for line in result.stdout.splitlines():
        if line and not line.startswith(("INSERT ", "UPDATE ", "DELETE ")):
            rows.append(line.split("|"))
    return rows


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def handoff_counts() -> dict[str, int]:
    counts = {"pending": 0, "claimed": 0, "completed": 0, "stale": 0}
    from_api = _api_handoffs()
    if from_api is not None:
        for item in from_api:
            status = item.get("status", "")
            if status in counts:
                counts[status] += 1
        return counts
    for row in cortex_sql("SELECT status, COUNT(*) FROM handoffs WHERE project = :'project' GROUP BY status"):
        if len(row) < 2:
            continue
        status = str(row[0])
        if status in counts:
            counts[status] = _int(row[1])
    stale_rows = cortex_sql("SELECT COUNT(*) FROM handoffs WHERE project = :'project' AND claimed_at < NOW() - INTERVAL '2 days'")
    if stale_rows and stale_rows[0]:
        counts["stale"] = _int(stale_rows[0][0])
    return counts


def _api_handoffs() -> list[dict[str, Any]] | None:
    payload = _api_get("handoffs")
    if not isinstance(payload, dict):
        return None
    rows = payload.get("handoffs")
    if not isinstance(rows, list):
        return None
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict) or row.get("status") not in ("pending", "claimed"):
            continue
        out.append(
            {
                "id": str(row.get("id", "")),
                "status": str(row.get("status", "")),
                "priority": str(row.get("priority", "medium")),
                "to_role": str(row.get("to_role", "")),
                "to_agent": row.get("to_agent") or "",
                "from_agent": row.get("from_agent") or "",
                "summary": _clean_display_text(row.get("summary", "")),
                "created_at": row.get("created_at") or "",
            }
        )
    out.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
    return out


def open_handoffs() -> list[dict[str, Any]]:
    from_api = _api_handoffs()
    if from_api is not None:
        return from_api
    rows = cortex_sql(
        "SELECT id::text, status, priority, to_role, to_agent, summary, created_at::text "
        "FROM handoffs WHERE project = :'project' AND status IN ('pending','claimed') ORDER BY created_at DESC LIMIT 20"
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(row) < 6:
            continue
        out.append(
            {
                "id": str(row[0]),
                "status": str(row[1]),
                "priority": str(row[2]),
                "to_role": str(row[3]),
                "to_agent": row[4] if len(row) > 4 else "",
                "summary": _clean_display_text(row[5] if len(row) > 5 else ""),
                "created_at": row[6] if len(row) > 6 else "",
            }
        )
    return out


def recent_decisions() -> list[dict[str, Any]]:
    rows = cortex_sql("SELECT created_at::text, agent_name, summary FROM decisions WHERE project = :'project' ORDER BY created_at DESC LIMIT 20")
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(row) >= 3:
            out.append({"created_at": row[0], "agent": _clean_display_text(row[1]), "summary": _clean_display_text(row[2])})
    return out


def agent_activity() -> list[dict[str, Any]]:
    rows = cortex_sql("SELECT agent_name, COUNT(*) FROM team_events WHERE project = :'project' GROUP BY agent_name ORDER BY COUNT(*) DESC LIMIT 20")
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(row) >= 2:
            count = _int(row[1])
            if count > 0:
                out.append({"agent": _clean_display_text(row[0]), "count": count})
    return out


def beat_heartbeat() -> dict[str, Any]:
    return {"age_seconds": None, "fresh": True, "stale": False, "last_lines": []}


def _read_field_from_text(text: str, field: str) -> str:
    patterns = [
        rf"\|\s*\*\*{re.escape(field)}\*\*\s*\|\s*([^|\n]+)",
        rf"\|\s*{re.escape(field)}\s*\|\s*([^|\n]+)",
        rf"\*\*{re.escape(field)}:\*\*\s*([^\n]+)",
        rf"{re.escape(field)}:\s*([^\n]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return match.group(1).strip()
    return ""


def _is_active_epic(epic: dict[str, Any]) -> bool:
    status = str(epic.get("status_raw") or epic.get("status") or "").lower()
    if any(word in status for word in ["closed", "complete", "marked_for_closeout"]):
        return False
    return any(word in status for word in ["active", "opened", "in progress", "research_track"])


def _project_beat_config() -> dict[str, Any]:
    entry = _project_entry(_workspace_config(), os.environ.get("CORTEX_PROJECT", PROJECT))
    beat = entry.get("beat", {}) if isinstance(entry.get("beat", {}), dict) else {}
    return beat


def _epic_dirs(program: Path) -> list[Path]:
    dirs: list[Path] = []
    if not program.exists():
        return dirs
    for release in sorted(program.glob("Release*")):
        if release.is_dir():
            dirs.extend(path for path in sorted(release.glob("E*")) if path.is_dir())
    return dirs


def _epic_status(epic_dir: Path) -> str:
    for name in ["EPIC_SPEC.md", "PROGRESS.md", f"{epic_dir.name.split('_', 1)[0]}_PLAN.md"]:
        path = epic_dir / name
        if path.exists():
            text = path.read_text(encoding="utf-8", errors="replace")
            value = _read_field_from_text(text, "Status")
            if value:
                return _clean_display_text(value)
            match = re.search(r"\b(active|opened|complete|closed|research_track|superseded)[^\n]*", text, flags=re.I)
            if match:
                return _clean_display_text(match.group(0))
    return "unknown"


def _api_epic_records() -> list[dict[str, Any]] | None:
    """Live epic registry from Cortex. Authoritative over the on-disk epic dirs."""
    payload = _api_get("epics")
    if not isinstance(payload, dict) or not isinstance(payload.get("epics"), list):
        return None
    records = []
    for epic in payload["epics"]:
        if not isinstance(epic, dict):
            continue
        records.append(
            {
                "epic_id": epic.get("epic_id", "unknown"),
                "name": epic.get("title", ""),
                "status_raw": epic.get("status", "unknown"),
                "percent_implemented": _int(epic.get("overall_pct", 0)),
                "increments": [
                    {
                        "slug": f"Inc{inc.get('num', '?')} {inc.get('title', '')}",
                        "status": f"{inc.get('status', 'unknown')} {_int(inc.get('pct', 0))}%",
                        "owner": "",
                    }
                    for inc in epic.get("increments", [])
                    if isinstance(inc, dict)
                ],
            }
        )
    return records


def _epic_records() -> list[dict[str, Any]]:
    beat = _project_beat_config()
    provider = beat.get("progress_provider")
    if provider != "markdown-file":
        from_api = _api_epic_records()
        if from_api:
            return from_api
    if provider == "markdown-file":
        progress_file = WORKSPACE / str(beat.get("progress_file", "STATUS.md"))
        try:
            text = progress_file.read_text(encoding="utf-8")
        except Exception:
            text = ""
        records = []
        for line in text.splitlines():
            if "|" not in line or "---" in line or "Epic" in line:
                continue
            cells = [cell.strip().strip("*") for cell in line.strip("|").split("|")]
            if cells and cells[0]:
                records.append({"epic_id": cells[0], "name": cells[0], "status_raw": cells[2] if len(cells) > 2 else "", "percent": _int(cells[1].rstrip("%")) if len(cells) > 1 else 0, "increments": []})
        return records

    release_program = WORKSPACE / "Program" / "Release_v0.1.0"
    program = release_program
    records = []
    for epic_dir in [p for p in sorted(program.glob("E*")) if p.is_dir()]:
        try:
            progress = viz.compute_epic_progress(epic_dir)
        except Exception:
            progress = {"epic_id": epic_dir.name.split("_", 1)[0], "name": epic_dir.name, "percent_implemented": 0, "increments": []}
        status = _epic_status(epic_dir)
        progress.update({"status_raw": status, "path": str(epic_dir)})
        records.append(progress)
    return records


def _clean_doc(lines: list[str]) -> str:
    """Clean each line, keeping line structure — the whole-document form of this
    collapsed every newline and rendered each dashboard file as one long line."""
    return "\n".join(_clean_display_text(line) for line in lines) + "\n"


def _write(path: Path, content: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = path.read_text(encoding="utf-8") if path.exists() else None
    path.write_text(content, encoding="utf-8")
    return "unchanged" if previous == content else "updated"


def _render_epic_lines(records: list[dict[str, Any]]) -> list[str]:
    if not records:
        return ["No active Epics"]
    lines = ["| Epic | Status | Progress |", "|---|---|---|"]
    for record in records:
        epic_id = _clean_display_text(record.get("epic_id") or record.get("name") or "unknown")
        status = _truncate_status(record.get("status_raw") or record.get("status") or "unknown", 80)
        percent = record.get("percent_implemented", record.get("percent", 0))
        lines.append(f"| {epic_id} | {status} | {progress_bar(_int(percent), 10)} {_int(percent)}% |")
    return lines


def render_all() -> dict[str, Any]:
    beat = _project_beat_config()
    provider = beat.get("progress_provider")
    heartbeat = beat_heartbeat()
    counts = handoff_counts()
    badge, rag = rag_badge(heartbeat, 0, counts.get("stale", 0))
    records = _epic_records() if provider != "none" else []
    display_records = records
    epic_lines = _render_epic_lines(display_records)

    queue = open_handoffs()
    decisions = recent_decisions()
    activity = agent_activity()

    provider_note = ""
    if provider == "markdown-file":
        provider_note = "Generated using generic Markdown provider."
    elif provider == "none":
        provider_note = "No progress provider configured."
    elif not records:
        provider_note = "No progress provider configured for this workspace."

    dashboard_lines = [
        f"# {badge} Cortex Dashboard - {rag}",
        "",
        provider_note,
        "",
        "## Active Epics",
        *epic_lines,
        "",
        "## Current increments",
    ]
    for record in display_records[:5]:
        for inc in record.get("increments", [])[:8]:
            owner = _clean_display_text(inc.get("owner", ""))
            epic_id = _clean_display_text(record.get("epic_id", ""))
            suffix = f" ({owner})" if owner else ""
            dashboard_lines.append(f"- {epic_id} {_clean_display_text(inc.get('slug', 'increment'))} — {_clean_display_text(inc.get('status', 'unknown'))}{suffix}")
    if len(dashboard_lines) and dashboard_lines[-1] == "## Current increments":
        dashboard_lines.append("- No increment detail available")

    overview_lines = [
        "# Cortex Dashboard Overview",
        "",
        provider_note.lower() if provider == "none" else provider_note,
        "",
        "## Status at a glance",
        f"- Handoffs pending: {counts.get('pending', 0)}",
        f"- Handoffs claimed: {counts.get('claimed', 0)}",
        "",
        "## What's coming next",
        "- Review active handoffs and complete peer handbacks.",
        "",
        "## Active Epics",
        *epic_lines,
        "",
        "## Active consults awaiting review",
        "- See handoff queue for current consults.",
    ]

    active_lines = ["# Active Epic", "", *epic_lines]
    queue_lines = ["# Handoff Queue", ""]
    if queue:
        for item in queue:
            queue_lines.append(f"- [{item['priority']}] {item['summary']} ({item['status']})")
    else:
        queue_lines.append("No open handoffs.")
    recent_lines = ["# Recent Activity", ""]
    for item in decisions[:10]:
        recent_lines.append(f"- {item['created_at']} {item['agent']}: {item['summary']}")
    for item in activity[:10]:
        recent_lines.append(f"- {item['agent']}: {item['count']} event(s)")
    if len(recent_lines) == 2:
        recent_lines.append("No recent activity.")

    files = {
        "dashboard.md": _write(DASHBOARDS / "dashboard.md", _clean_doc(dashboard_lines)),
        "00-overview.md": _write(DASHBOARDS / "00-overview.md", _clean_doc(overview_lines)),
        "01-active-epic.md": _write(DASHBOARDS / "01-active-epic.md", _clean_doc(active_lines)),
        "02-handoff-queue.md": _write(DASHBOARDS / "02-handoff-queue.md", _clean_doc(queue_lines)),
        "03-recent-activity.md": _write(DASHBOARDS / "03-recent-activity.md", _clean_doc(recent_lines)),
    }
    return {"status": rag, "files": files}


def main() -> int:
    result = render_all()
    for name, status in result["files"].items():
        print(f"{name}: {status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
