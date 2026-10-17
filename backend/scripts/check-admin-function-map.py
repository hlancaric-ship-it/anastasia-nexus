#!/usr/bin/env python3
"""Check the admin map against source files; this is not a runtime acceptance test."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
METHODS = r"GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD"


def check():
    data = json.loads((ROOT / "backend/docs/wp/admin-function-map.json").read_text())
    features = {feature["id"]: feature for feature in data["features"]}
    assert len(features) == len(data["features"]), "Duplicate feature ID"
    for feature in features.values():
        for field in ("label_sk", "request", "remaining", "acceptance", "sources"):
            assert feature[field], f"Missing {field}: {feature['id']}"
        for source in feature["sources"]:
            assert (ROOT / source).is_file(), f"Missing source: {source}"

    api = ROOT / "backend/src/api"
    actual = {}
    for source in api.rglob("route.ts"):
        path = "/" + re.sub(r"\[([^\]]+)\]", r":\1", str(source.parent.relative_to(api)))
        actual[path] = sorted(set(re.findall(
            rf"export\s+(?:async\s+)?(?:function|const)\s+({METHODS})\b", source.read_text())))
    routes = data["custom_routes"]
    assert len({row["path"] for row in routes}) == len(routes), "Duplicate custom route"
    assert {row["path"]: row["methods"] for row in routes} == actual, "Custom API coverage changed"
    for row in routes:
        assert row["feature"] in features, f"Unassigned route: {row['path']}"
        digest = hashlib.sha256((ROOT / row["source"]).read_bytes()).hexdigest()
        assert digest == row["sha256"], f"Re-review changed contract: {row['source']}"

    package = ROOT / "backend/node_modules/@medusajs/medusa"
    assert json.loads((package / "package.json").read_text())["version"] == data["native_medusa_version"], "Re-review Medusa version"
    native_root = package / "dist/api/admin"
    actual_native = {}
    for source in native_root.rglob("route.js"):
        actual_native[str(source.relative_to(package))] = sorted(set(re.findall(
            rf"exports\.({METHODS})\s*=", source.read_text())))
    native = data["native_admin_routes"]
    assert len({row["installed_source"] for row in native}) == len(native), "Duplicate native route"
    assert {row["installed_source"].removeprefix("@medusajs/medusa/"): row["methods"] for row in native} == actual_native, "Native API coverage changed"
    assert all(row["feature"] in features for row in native), "Unassigned native API"

    worker = (ROOT / "nexus/workers/api/index.ts").read_text()
    assert re.findall(r"case\s+'([^']+)'", worker) == data["worker_router_cases"], "Worker router changed"
    prefix = data["worker_prefix_route"]
    source = (ROOT / prefix["source"]).read_text()
    assert re.search(r"MEDIA_PATH_PREFIX\s*=\s*[\"']([^\"']+)", source).group(1) == prefix["prefix"], "Media prefix changed"

    patterns = {
        "jobs": "backend/src/jobs/*.ts", "subscribers": "backend/src/subscribers/*.ts",
        "workflows": "backend/src/workflows/*.ts", "models": "backend/src/modules/*/models/*.ts",
        "modules": "backend/src/modules/*/index.ts", "nexus_domains": "nexus/domains/*/*.ts",
        "nexus_connectors": "nexus/connectors/**/*.ts",
    }
    for kind, pattern in patterns.items():
        paths = sorted(str(p.relative_to(ROOT)) for p in ROOT.glob(pattern)
                       if "__tests__" not in p.parts and not p.name.endswith((".test.ts", ".spec.ts")))
        assert paths == data["source_units"][kind], f"Source coverage changed: {kind}"
    for source in data["test_sources"]:
        assert (ROOT / source).is_file(), f"Missing test source: {source}"
    evidence = json.loads((ROOT / data["baseline_ci_evidence"]).read_text())
    assert evidence["status"] == "VERIFIED" and evidence["failures"] == 0, "Invalid baseline evidence"
    print(f"PASS: {len(features)} features, {len(routes)} custom routes, "
          f"{len(native)} native routes; source coverage only, no runtime/UI acceptance claim.")


if __name__ == "__main__":
    check()
