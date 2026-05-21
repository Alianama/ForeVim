"""
Script uji koneksi Prometheus — URL wajib dari argumen (bukan env).
Contoh: python test_sync.py http://192.168.9.16:9090
"""
import asyncio
import sys

from app.prometheus.client import prometheus_service

NODE_EXPORTER_JOBS = {"nodeexporter", "node_exporter", "node", "inconis", "gag_nikel", "proxmox"}


async def test(url: str) -> None:
    targets = await prometheus_service.list_targets(url=url)
    print(f"Total targets fetched dari {url}: {len(targets)}")
    for t in targets:
        labels = t.get("labels", {})
        job = labels.get("job", "")
        instance = labels.get("instance", "")
        is_node = (
            job.lower() in NODE_EXPORTER_JOBS
            or (("9100" in instance or "9101" in instance) and not instance.startswith("http"))
        )
        if not is_node:
            continue
        if not instance or ":" not in instance:
            continue
        ip = instance.split(":")[0]
        if not ip[0].isdigit():
            continue
        print(f"Valid node target: job={job}, instance={instance}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_sync.py <prometheus_url>")
        print("Example: python test_sync.py http://192.168.9.16:9090")
        sys.exit(1)
    asyncio.run(test(sys.argv[1]))
