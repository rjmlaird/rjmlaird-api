#!/usr/bin/env python3
"""
Scan a Hono + Cloudflare Workers monorepo and emit:

- repo-inventory.json: Worker configuration, source files, route modules and
  binding usage
- repo-architecture.mmd: Mermaid architecture diagram
- repo-architecture.svg: optional Mermaid CLI render

Usage:
    python scan_hono_architecture.py [--root .] [--out output]
        [--include-staging] [--render]

Evidence model:
- Wrangler configuration is authoritative for Cloudflare resources.
- Source scanning detects Hono routes, router mounts, base paths and c.env usage.
- Route groups are derived from actual source-file/folder layout.
- No external providers, API semantics, route categories or dependencies are
  inferred from route names, imports, URL strings or package dependencies.
- Imported router resolution is deliberately limited to simple local imports.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterator

IGNORE_DIRS = {
    ".git",
    ".wrangler",
    ".astro",
    ".next",
    ".turbo",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "output",
    ".venv",
    "__pycache__",
}

SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

INDEX_BASENAMES = {"index", "main", "app", "router", "routes"}

HONO_ROUTE_RE = re.compile(
    r"""\b(?P<router>[\w$.]+)\.(?P<method>get|post|put|patch|delete|options|head|all)\s*\(\s*["'`](?P<path>[^"'`]+)["'`]""",
    re.IGNORECASE,
)

HONO_MOUNT_RE = re.compile(
    r"""\b(?P<parent>[\w$.]+)\.route\s*\(\s*["'`](?P<prefix>[^"'`]+)["'`]\s*,\s*(?P<child>[\w$]+)""",
    re.IGNORECASE,
)

HONO_BASE_PATH_RE = re.compile(
    r"""\b(?P<router>[\w$.]+)\.basePath\s*\(\s*["'`](?P<prefix>[^"'`]+)["'`]""",
    re.IGNORECASE,
)

PATHNAME_RE = re.compile(
    r"""(?:pathname|c\.req\.path|ctx\.req\.path)\s*===?\s*["'](/[^"']*)["']"""
)

HONO_ENV_RE = re.compile(r"""\b(?:c|ctx)\.env\.([A-Z][A-Z0-9_]{2,})\b""")
RAW_ENV_RE = re.compile(r"""\benv\.([A-Z][A-Z0-9_]{2,})\b""")

IMPORT_RE = re.compile(
    r"""
    import\s+
    (?:
        type\s+
    )?
    (?P<bindings>[\s\S]*?)
    \s+from\s+
    ["'](?P<path>\.[^"']+)["']
    """,
    re.VERBOSE,
)

DEFAULT_IMPORT_RE = re.compile(
    r"""^\s*(?P<name>[A-Za-z_$][\w$]*)\s*(?:,|$)"""
)

NAMED_IMPORT_RE = re.compile(
    r"""\{(?P<names>[^}]+)\}"""
)

SECRET_SUFFIXES = (
    "_KEY",
    "_TOKEN",
    "_SECRET",
    "_PASSWORD",
    "_API_KEY",
    "_PRIVATE_KEY",
    "_WEBHOOK_SECRET",
)

_JSONC = re.compile(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*.*?\*/', re.DOTALL)


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def iter_files(root: Path) -> Iterator[Path]:
    """Yield project files while excluding dependencies and generated output."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(
            directory
            for directory in dirnames
            if directory not in IGNORE_DIRS
        )

        for filename in sorted(filenames):
            yield Path(dirpath) / filename


def is_test(path: Path) -> bool:
    """Return True for common test, fixture and mock files."""
    return (
        any(
            part.lower() in {"test", "tests", "__tests__", "fixtures", "mocks"}
            for part in path.parts
        )
        or bool(re.search(r"\.(test|spec)\.[^.]+$", path.name, re.IGNORECASE))
    )


def read_text(path: Path) -> str:
    """Read text safely."""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def relative_path(path: Path, root: Path) -> str:
    """Return a POSIX path relative to the repository root."""
    return path.relative_to(root).as_posix()


def slug(value: str) -> str:
    """Create a Mermaid-safe identifier."""
    return re.sub(r"\W+", "_", value).strip("_") or "unnamed"


def mermaid_escape(value: str) -> str:
    """Escape text for quoted Mermaid labels."""
    return (
        value.replace('"', "'")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


def as_list(value: Any) -> list[Any]:
    """Normalise a missing, singular or list value to a list."""
    if value is None:
        return []

    return value if isinstance(value, list) else [value]


def load_jsonc(path: Path) -> dict[str, Any]:
    """Load basic JSONC, allowing comments and trailing commas."""
    raw = read_text(path)
    stripped = _JSONC.sub(lambda match: match.group(1) or "", raw)
    stripped = re.sub(r",(\s*[}\]])", r"\1", stripped)

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        return {"_error": f"{path}: {exc}"}

    if not isinstance(parsed, dict):
        return {"_error": f"{path}: root is not an object"}

    return parsed


def is_wrangler_config(path: Path) -> bool:
    """Identify conventional Wrangler JSON and JSONC config files."""
    return bool(re.fullmatch(r"wrangler(?:\.[\w.-]+)?\.jsonc?", path.name))


def normalise_url_path(value: str) -> str:
    """Normalise a detected Hono path or mount prefix."""
    if not value.startswith("/"):
        return value

    if value == "/":
        return "/"

    return "/" + value.strip("/")


def join_url_path(prefix: str, path: str) -> str:
    """Join a Hono mount/base path and child route."""
    prefix = normalise_url_path(prefix)
    path = normalise_url_path(path)

    if prefix in {"", "/"}:
        return path

    if path in {"", "/"}:
        return prefix

    return f"{prefix.rstrip('/')}/{path.lstrip('/')}"


def path_stem(path: Path) -> str:
    """Return a concise source label from a file path."""
    stem = path.stem

    if stem.lower() not in INDEX_BASENAMES:
        return stem

    parent = path.parent.name
    if parent and parent != ".":
        return parent

    return stem


def humanise(value: str) -> str:
    """Convert a filename/folder token into a readable Mermaid label."""
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    value = re.sub(r"[_\-.]+", " ", value)
    return value.strip().title() or "Routes"


# ---------------------------------------------------------------------------
# Wrangler scanning
# ---------------------------------------------------------------------------

def parse_routes(config: dict[str, Any]) -> list[str]:
    """Extract Worker route patterns from a Wrangler config block."""
    routes: set[str] = set()

    for route in as_list(config.get("routes")):
        if isinstance(route, str):
            routes.add(route)
        elif isinstance(route, dict) and route.get("pattern"):
            routes.add(str(route["pattern"]))

    route = config.get("route")

    if isinstance(route, str):
        routes.add(route)
    elif isinstance(route, dict) and route.get("pattern"):
        routes.add(str(route["pattern"]))

    return sorted(routes)


def parse_env_block(config: dict[str, Any]) -> dict[str, Any]:
    """Extract explicitly configured Cloudflare resources."""
    queues = config.get("queues") or {}
    durable_objects = config.get("durable_objects") or {}

    return {
        "routes": parse_routes(config),
        "producers": [
            {
                "binding": item.get("binding"),
                "queue": item.get("queue"),
            }
            for item in queues.get("producers") or []
            if isinstance(item, dict)
        ],
        "consumers": [
            {
                "queue": item.get("queue"),
                "dead_letter_queue": item.get("dead_letter_queue"),
            }
            for item in queues.get("consumers") or []
            if isinstance(item, dict)
        ],
        "d1": [
            {
                "binding": item.get("binding"),
                "database": item.get("database_name"),
            }
            for item in config.get("d1_databases") or []
            if isinstance(item, dict)
        ],
        "services": [
            {
                "binding": item.get("binding"),
                "service": item.get("service"),
            }
            for item in config.get("services") or []
            if isinstance(item, dict)
        ],
        "kv": sorted(
            item["binding"]
            for item in config.get("kv_namespaces") or []
            if isinstance(item, dict) and item.get("binding")
        ),
        "r2": sorted(
            item["binding"]
            for item in config.get("r2_buckets") or []
            if isinstance(item, dict) and item.get("binding")
        ),
        "durable_objects": sorted(
            item["binding"]
            for item in durable_objects.get("bindings") or []
            if isinstance(item, dict) and item.get("binding")
        ),
        "vectorize": sorted(
            item["binding"]
            for item in config.get("vectorize") or []
            if isinstance(item, dict) and item.get("binding")
        ),
        "ai": (
            config.get("ai", {}).get("binding")
            if isinstance(config.get("ai"), dict)
            else None
        ),
        "vars": sorted((config.get("vars") or {}).keys()),
        "crons": sorted((config.get("triggers") or {}).get("crons") or []),
    }


def scan_wrangler(root: Path) -> list[dict[str, Any]]:
    """Find and parse each Wrangler config file."""
    workers: list[dict[str, Any]] = []

    for path in sorted(iter_files(root)):
        if not is_wrangler_config(path):
            continue

        config = load_jsonc(path)
        config_file = relative_path(path, root)

        if "_error" in config:
            workers.append(
                {
                    "file": config_file,
                    "error": config["_error"],
                }
            )
            continue

        environments = config.get("env") or {}

        workers.append(
            {
                "file": config_file,
                "name": config.get("name") or path.parent.name,
                "main": config.get("main"),
                "compatibility_date": config.get("compatibility_date"),
                "compatibility_flags": config.get("compatibility_flags") or [],
                "production": parse_env_block(config),
                "environments": {
                    environment: parse_env_block(block)
                    for environment, block in environments.items()
                    if isinstance(block, dict)
                },
            }
        )

    return workers


# ---------------------------------------------------------------------------
# Source ownership and import resolution
# ---------------------------------------------------------------------------

def owner_of(path: Path, worker_dirs: dict[Path, str]) -> str:
    """Resolve a file to its nearest containing Worker config directory."""
    for parent in path.parents:
        if parent in worker_dirs:
            return worker_dirs[parent]

    return "shared"


def resolve_local_module(importer: Path, specifier: str) -> Path | None:
    """
    Resolve a relative TS/JS import to a project file.

    Supports:
      ./routes/profile
      ./routes/profile.ts
      ./routes/profile/index.ts

    It intentionally does not resolve aliases, package imports or tsconfig paths.
    """
    base = (importer.parent / specifier).resolve()

    candidates: list[Path] = []

    if base.suffix:
        candidates.append(base)
    else:
        candidates.extend(base.with_suffix(extension) for extension in SOURCE_EXTENSIONS)
        candidates.extend(
            base / f"index{extension}"
            for extension in SOURCE_EXTENSIONS
        )

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    return None


def imported_names(bindings: str) -> list[str]:
    """Extract local identifier names from a simple ES module import."""
    names: list[str] = []

    default_match = DEFAULT_IMPORT_RE.search(bindings.strip())
    if default_match:
        names.append(default_match.group("name"))

    named_match = NAMED_IMPORT_RE.search(bindings)
    if named_match:
        for item in named_match.group("names").split(","):
            token = item.strip()

            if not token:
                continue

            # `sourceName as localName` -> localName.
            if " as " in token:
                token = token.split(" as ")[-1].strip()

            # Ignore TypeScript `type Foo` markers.
            token = re.sub(r"^type\s+", "", token).strip()

            if re.fullmatch(r"[A-Za-z_$][\w$]*", token):
                names.append(token)

    return names


def find_local_imports(path: Path, text: str) -> dict[str, Path]:
    """
    Map imported local identifiers to source files.

    Example:
      import profileRoutes from './routes/profile'
      -> {'profileRoutes': /absolute/path/routes/profile.ts}
    """
    imports: dict[str, Path] = {}

    for match in IMPORT_RE.finditer(text):
        target = resolve_local_module(path, match.group("path"))

        if not target:
            continue

        for name in imported_names(match.group("bindings")):
            imports[name] = target

    return imports


# ---------------------------------------------------------------------------
# Hono source scanning
# ---------------------------------------------------------------------------

def scan_source(root: Path, workers: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Detect Hono route modules, local router mounts and Worker binding usage.

    Each route is retained against the exact source file where it was detected.
    Route modules are grouped from actual source-folder/file structure, never
    by assumed endpoint semantics.
    """
    worker_dirs = {
        (root / worker["file"]).parent.resolve(): worker["name"]
        for worker in workers
        if worker.get("name") and worker.get("file")
    }

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "files": set(),
            "routes": set(),
            "mounts": [],
            "base_paths": [],
            "env_vars": set(),
            "route_modules": {},
        }
    )

    source_files = [
        path
        for path in iter_files(root)
        if path.suffix.lower() in SOURCE_EXTENSIONS
        and not is_test(path.relative_to(root))
    ]

    source_text: dict[Path, str] = {
        path.resolve(): read_text(path)
        for path in source_files
    }

    for original_path in source_files:
        path = original_path.resolve()
        text = source_text[path]
        owner = owner_of(path, worker_dirs)
        bucket = buckets[owner]

        bucket["files"].add(relative_path(path, root))

        imports = find_local_imports(path, text)

        file_routes: list[dict[str, str]] = []
        file_mounts: list[dict[str, str]] = []
        file_base_paths: list[dict[str, str]] = []

        for match in HONO_ROUTE_RE.finditer(text):
            method = match.group("method").upper()
            route_path = match.group("path")

            if not route_path.startswith("/"):
                continue

            route = f"{method} {normalise_url_path(route_path)}"
            bucket["routes"].add(route)

            file_routes.append(
                {
                    "method": method,
                    "path": normalise_url_path(route_path),
                    "route": route,
                    "router": match.group("router"),
                }
            )

        for route_path in PATHNAME_RE.findall(text):
            route = f"ANY {normalise_url_path(route_path)}"
            bucket["routes"].add(route)

            file_routes.append(
                {
                    "method": "ANY",
                    "path": normalise_url_path(route_path),
                    "route": route,
                    "router": "pathname",
                }
            )

        for match in HONO_MOUNT_RE.finditer(text):
            prefix = match.group("prefix")

            if not prefix.startswith("/"):
                continue

            child_name = match.group("child")
            child_file = imports.get(child_name)

            mount = {
                "parent_router": match.group("parent"),
                "child_router": child_name,
                "prefix": normalise_url_path(prefix),
                "source_file": relative_path(path, root),
                "child_file": (
                    relative_path(child_file, root)
                    if child_file
                    else None
                ),
            }

            bucket["mounts"].append(mount)
            file_mounts.append(mount)

        for match in HONO_BASE_PATH_RE.finditer(text):
            prefix = match.group("prefix")

            if not prefix.startswith("/"):
                continue

            base_path = {
                "router": match.group("router"),
                "prefix": normalise_url_path(prefix),
                "source_file": relative_path(path, root),
            }

            bucket["base_paths"].append(base_path)
            file_base_paths.append(base_path)

        bucket["env_vars"].update(HONO_ENV_RE.findall(text))
        bucket["env_vars"].update(RAW_ENV_RE.findall(text))

        if file_routes or file_mounts or file_base_paths:
            rel = relative_path(path, root)
            bucket["route_modules"][rel] = {
                "file": rel,
                "folder": relative_path(path.parent, root),
                "label": humanise(path_stem(path)),
                "routes": file_routes,
                "mounts": file_mounts,
                "base_paths": file_base_paths,
            }

    result: dict[str, Any] = {}

    for owner, bucket in sorted(buckets.items()):
        env_vars = sorted(bucket["env_vars"])

        result[owner] = {
            "files": sorted(bucket["files"]),
            "routes": sorted(bucket["routes"]),
            "mounts": sorted(
                bucket["mounts"],
                key=lambda item: (
                    item["source_file"],
                    item["prefix"],
                    item["child_router"],
                ),
            ),
            "base_paths": sorted(
                bucket["base_paths"],
                key=lambda item: (
                    item["source_file"],
                    item["prefix"],
                    item["router"],
                ),
            ),
            "route_modules": sorted(
                bucket["route_modules"].values(),
                key=lambda item: item["file"],
            ),
            "env_vars": env_vars,
            "secrets": sorted(
                binding
                for binding in env_vars
                if binding.endswith(SECRET_SUFFIXES)
            ),
        }

    return result


# ---------------------------------------------------------------------------
# Route-module path resolution
# ---------------------------------------------------------------------------

def module_route_prefixes(source_info: dict[str, Any]) -> dict[str, list[str]]:
    """
    Derive route prefixes from actual local app.route() relationships.

    A child module receives its directly mounted prefix only when:
    - its router identifier was imported locally; and
    - the mount scanner resolved that local file.

    This deliberately avoids claiming a route prefix when a mount target could
    not be resolved from project source.
    """
    prefixes: dict[str, set[str]] = defaultdict(set)

    for mount in source_info.get("mounts", []):
        child_file = mount.get("child_file")
        prefix = mount.get("prefix")

        if child_file and prefix:
            prefixes[child_file].add(prefix)

    for base_path in source_info.get("base_paths", []):
        source_file = base_path.get("source_file")
        prefix = base_path.get("prefix")

        if source_file and prefix:
            prefixes[source_file].add(prefix)

    return {
        file: sorted(values)
        for file, values in prefixes.items()
    }


def display_routes_for_module(
    module: dict[str, Any],
    prefixes: list[str],
) -> list[str]:
    """
    Return route labels, applying only direct evidence-backed local prefixes.

    If a module is mounted multiple times, each directly known mounted route is
    shown. If no prefix is resolvable, its declared path remains unchanged.
    """
    routes: set[str] = set()

    for route in module.get("routes", []):
        method = route["method"]
        path = route["path"]

        if prefixes:
            for prefix in prefixes:
                routes.add(f"{method} {join_url_path(prefix, path)}")
        else:
            routes.add(f"{method} {path}")

    return sorted(routes)


def summarise_routes(routes: list[str], limit: int = 7) -> str:
    """Render a concise route list, preserving all data in JSON inventory."""
    if len(routes) <= limit:
        return "<br/>".join(mermaid_escape(route) for route in routes)

    visible = routes[:limit]
    remainder = len(routes) - len(visible)

    return (
        "<br/>".join(mermaid_escape(route) for route in visible)
        + f"<br/>+ {remainder} more"
    )


# ---------------------------------------------------------------------------
# Binding audit
# ---------------------------------------------------------------------------

def configured_bindings(block: dict[str, Any]) -> set[str]:
    """Return every explicitly configured named binding."""
    bindings = set(block.get("vars", []))
    bindings.update(block.get("kv", []))
    bindings.update(block.get("r2", []))
    bindings.update(block.get("durable_objects", []))
    bindings.update(block.get("vectorize", []))

    if block.get("ai"):
        bindings.add(block["ai"])

    for item in block.get("producers", []):
        if item.get("binding"):
            bindings.add(item["binding"])

    for item in block.get("d1", []):
        if item.get("binding"):
            bindings.add(item["binding"])

    for item in block.get("services", []):
        if item.get("binding"):
            bindings.add(item["binding"])

    return bindings


def make_binding_audit(
    workers: list[dict[str, Any]],
    source: dict[str, Any],
) -> dict[str, Any]:
    """Compare detected source binding use with production config."""
    audit: dict[str, Any] = {}

    for worker in workers:
        name = worker.get("name")

        if not name:
            continue

        used = set(source.get(name, {}).get("env_vars", []))
        configured = configured_bindings(worker["production"])

        audit[name] = {
            "used_in_source": sorted(used),
            "configured_in_production": sorted(configured),
            "used_not_declared": sorted(used - configured),
            "declared_not_detected": sorted(configured - used),
        }

    return audit


# ---------------------------------------------------------------------------
# Mermaid generation
# ---------------------------------------------------------------------------

def worker_node(
    worker: dict[str, Any],
    source: dict[str, Any],
    node_class: str,
) -> str:
    """Create a concise deployment node for a Worker."""
    name = worker["name"]
    source_info = source.get(name, {})
    details: list[str] = []

    if worker.get("main"):
        details.append(f"Entry: {worker['main']}")

    mounted_prefixes = sorted(
        {
            mount["prefix"]
            for mount in source_info.get("mounts", [])
            if mount.get("prefix")
        }
    )

    if mounted_prefixes:
        details.append("Detected mounts: " + ", ".join(mounted_prefixes))

    label = mermaid_escape(name)

    if details:
        label += "<br/><small>" + "<br/>".join(
            mermaid_escape(detail)
            for detail in details
        ) + "</small>"

    return f'        W_{slug(name)}["{label}"]:::{node_class}'


def route_module_nodes(
    worker: dict[str, Any],
    source: dict[str, Any],
) -> tuple[list[str], list[str]]:
    """
    Build route nodes from actual route source modules.

    Nodes are named from source folders/files, never from a hard-coded API
    domain taxonomy. Examples:
      src/routes/v1/cv.ts       -> V1 Cv
      src/routes/projects.ts    -> Projects
      src/routes/webdav/index.ts -> Webdav
    """
    worker_name = worker["name"]
    worker_id = f"W_{slug(worker_name)}"
    source_info = source.get(worker_name, {})
    prefix_map = module_route_prefixes(source_info)

    nodes: list[str] = []
    edges: list[str] = []

    for module in source_info.get("route_modules", []):
        routes = display_routes_for_module(
            module,
            prefix_map.get(module["file"], []),
        )

        if not routes:
            continue

        node_id = f"R_{slug(worker_name)}_{slug(module['file'])}"
        folder = module.get("folder", "")

        label_parts = [mermaid_escape(module["label"])]

        if folder not in {"", "."}:
            label_parts.append(
                f"<small>{mermaid_escape(folder)}</small>"
            )

        label_parts.append(
            f"<small>{summarise_routes(routes)}</small>"
        )

        label = "<br/>".join(label_parts)

        nodes.append(
            f'        {node_id}["{label}"]:::route'
        )
        edges.append(f"    {worker_id} --> {node_id}")

    return nodes, edges


def make_mermaid(inventory: dict[str, Any], include_staging: bool = False) -> str:
    """Create a Mermaid diagram from source and Wrangler evidence."""
    workers = [
        worker
        for worker in inventory["workers"]
        if worker.get("name") and not worker.get("error")
    ]
    source = inventory["source"]

    public_workers: list[dict[str, Any]] = []
    internal_workers: list[dict[str, Any]] = []

    for worker in workers:
        name = worker["name"]

        is_public = (
            bool(worker["production"].get("routes"))
            or bool(source.get(name, {}).get("routes"))
        )

        if is_public:
            public_workers.append(worker)
        else:
            internal_workers.append(worker)

    lines = [
        "%%{init: {'flowchart': {'curve': 'basis', 'nodeSpacing': 46, 'rankSpacing': 68}}}%%",
        "flowchart LR",
        "    classDef worker fill:#ecfdf5,stroke:#047857,stroke-width:2px,color:#064e3b",
        "    classDef edge fill:#e6f4ff,stroke:#1769aa,stroke-width:2px,color:#102a43",
        "    classDef route fill:#f8fafc,stroke:#64748b,stroke-width:1.5px,color:#0f172a",
        "    classDef queue fill:#fff7ed,stroke:#c2410c,color:#7c2d12",
        "    classDef dlq fill:#fef2f2,stroke:#b91c1c,stroke-dasharray:4 3,color:#7f1d1d",
        "    classDef database fill:#f1f5f9,stroke:#475569,color:#0f172a",
        "    classDef storage fill:#f0fdf4,stroke:#15803d,color:#14532d",
        "    classDef compute fill:#fefce8,stroke:#a16207,color:#713f12",
    ]

    queues: set[str] = set()
    dead_letter_queues: set[str] = set()
    databases: set[str] = set()
    kv_bindings: set[str] = set()
    r2_bindings: set[str] = set()
    durable_objects: set[str] = set()
    vectorize_bindings: set[str] = set()
    ai_bindings: set[str] = set()
    edges: set[str] = set()
    route_nodes: list[str] = []

    known_workers = {worker["name"] for worker in workers}

    if public_workers:
        lines.append('    subgraph EDGE["Public API / edge Workers"]')
        lines.extend(
            worker_node(worker, source, "edge")
            for worker in sorted(public_workers, key=lambda item: item["name"])
        )
        lines.append("    end")

    if internal_workers:
        lines.append('    subgraph INTERNAL["Internal Workers and consumers"]')
        lines.extend(
            worker_node(worker, source, "worker")
            for worker in sorted(internal_workers, key=lambda item: item["name"])
        )
        lines.append("    end")

    for worker in public_workers:
        nodes, module_edges = route_module_nodes(worker, source)
        route_nodes.extend(nodes)
        edges.update(module_edges)

    if route_nodes:
        lines.append('    subgraph ROUTE_MODULES["Detected route modules"]')
        lines.extend(route_nodes)
        lines.append("    end")

    for worker in workers:
        name = worker["name"]
        worker_id = f"W_{slug(name)}"
        block = worker["production"]

        for producer in block.get("producers", []):
            queue = producer.get("queue")

            if queue:
                queues.add(queue)
                edges.add(f"    {worker_id} -->|send| Q_{slug(str(queue))}")

        for consumer in block.get("consumers", []):
            queue = consumer.get("queue")
            dead_letter_queue = consumer.get("dead_letter_queue")

            if queue:
                queues.add(queue)
                edges.add(f"    Q_{slug(str(queue))} ==>|consume| {worker_id}")

            if queue and dead_letter_queue:
                dead_letter_queues.add(dead_letter_queue)
                edges.add(
                    f"    Q_{slug(str(queue))} -.->|failed| "
                    f"DLQ_{slug(str(dead_letter_queue))}"
                )

        for item in block.get("d1", []):
            database = item.get("database")

            if database:
                databases.add(database)
                edges.add(f"    {worker_id} --- D1_{slug(str(database))}")

        for binding in block.get("kv", []):
            kv_bindings.add(binding)
            edges.add(f"    {worker_id} --- KV_{slug(binding)}")

        for binding in block.get("r2", []):
            r2_bindings.add(binding)
            edges.add(f"    {worker_id} --- R2_{slug(binding)}")

        for binding in block.get("durable_objects", []):
            durable_objects.add(binding)
            edges.add(f"    {worker_id} --- DO_{slug(binding)}")

        for binding in block.get("vectorize", []):
            vectorize_bindings.add(binding)
            edges.add(f"    {worker_id} --- VEC_{slug(binding)}")

        if block.get("ai"):
            binding = str(block["ai"])
            ai_bindings.add(binding)
            edges.add(f"    {worker_id} --- AI_{slug(binding)}")

        for service in block.get("services", []):
            target = service.get("service")

            # Draw only verified Worker-to-Worker links within this repository.
            if target and target in known_workers:
                edges.add(
                    f"    {worker_id} -->|service binding| "
                    f"W_{slug(str(target))}"
                )

    if queues or dead_letter_queues:
        lines.append('    subgraph QUEUES["Cloudflare Queues"]')
        lines.extend(
            f'        Q_{slug(queue)}(["{mermaid_escape(queue)}"]):::queue'
            for queue in sorted(queues)
        )
        lines.extend(
            f'        DLQ_{slug(queue)}(["{mermaid_escape(queue)}"]):::dlq'
            for queue in sorted(dead_letter_queues)
        )
        lines.append("    end")

    if databases:
        lines.append('    subgraph D1_DATABASES["D1 databases"]')
        lines.extend(
            f'        D1_{slug(database)}[("{mermaid_escape(database)}")]:::database'
            for database in sorted(databases)
        )
        lines.append("    end")

    if kv_bindings or r2_bindings or durable_objects or vectorize_bindings:
        lines.append('    subgraph STATE["Storage and state"]')

        lines.extend(
            f'        KV_{slug(binding)}[("KV: {mermaid_escape(binding)}")]:::storage'
            for binding in sorted(kv_bindings)
        )
        lines.extend(
            f'        R2_{slug(binding)}[("R2: {mermaid_escape(binding)}")]:::storage'
            for binding in sorted(r2_bindings)
        )
        lines.extend(
            f'        DO_{slug(binding)}[("Durable Object: {mermaid_escape(binding)}")]:::storage'
            for binding in sorted(durable_objects)
        )
        lines.extend(
            f'        VEC_{slug(binding)}[("Vectorize: {mermaid_escape(binding)}")]:::storage'
            for binding in sorted(vectorize_bindings)
        )

        lines.append("    end")

    if ai_bindings:
        lines.append('    subgraph AI["Workers AI"]')
        lines.extend(
            f'        AI_{slug(binding)}[("{mermaid_escape(binding)}")]:::compute'
            for binding in sorted(ai_bindings)
        )
        lines.append("    end")

    lines.extend(sorted(edges))

    if include_staging:
        lines.append(
            "    %% Non-production environments are listed in repo-inventory.json."
        )

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def load_package(root: Path) -> dict[str, Any]:
    """Load package.json when present."""
    package_path = root / "package.json"

    if not package_path.exists():
        return {}

    try:
        package = json.loads(read_text(package_path))
    except json.JSONDecodeError:
        return {"_error": f"Could not parse {package_path.name}"}

    return package if isinstance(package, dict) else {}


def render_mermaid(source: Path, destination: Path) -> bool:
    """Render Mermaid to SVG using Mermaid CLI."""
    mmdc = shutil.which("mmdc")

    if not mmdc:
        print("mmdc not found: npm i -g @mermaid-js/mermaid-cli")
        return False

    result = subprocess.run(
        [mmdc, "-i", str(source), "-o", str(destination), "-b", "white"],
        check=False,
    )

    return result.returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Repository root to scan (default: current directory).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: <root>/output).",
    )
    parser.add_argument(
        "--include-staging",
        action="store_true",
        help="Add a note about non-production environments to Mermaid output.",
    )
    parser.add_argument(
        "--render",
        action="store_true",
        help="Render SVG using Mermaid CLI, if installed.",
    )
    args = parser.parse_args()

    root = args.root.resolve()

    if not root.is_dir():
        parser.error(f"Root is not a directory: {root}")

    output = (args.out or root / "output").resolve()
    output.mkdir(parents=True, exist_ok=True)

    package = load_package(root)
    workers = scan_wrangler(root)
    source = scan_source(root, workers)

    inventory = {
        "repository": root.name,
        "package": {
            "name": package.get("name"),
            "scripts": package.get("scripts", {}),
        },
        "workers": workers,
        "source": source,
        "binding_audit": make_binding_audit(workers, source),
    }

    inventory_path = output / "repo-inventory.json"
    mermaid_path = output / "repo-architecture.mmd"
    svg_path = output / "repo-architecture.svg"

    inventory_path.write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    mermaid_path.write_text(
        make_mermaid(inventory, include_staging=args.include_staging),
        encoding="utf-8",
    )

    print(f"Inventory: {inventory_path}")
    print(f"Mermaid:   {mermaid_path}")

    if args.render and render_mermaid(mermaid_path, svg_path):
        print(f"SVG:       {svg_path}")


if __name__ == "__main__":
    main()
