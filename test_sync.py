import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.prometheus.client import prometheus_service
import os

os.environ["PROMETHEUS_URL"] = "http://192.168.9.16:9090"
NODE_EXPORTER_JOBS = {"nodeexporter", "node_exporter", "node", "inconis", "gag_nikel", "proxmox"}

async def test():
    targets = await prometheus_service.list_targets()
    print(f"Total targets fetched: {len(targets)}")
    for t in targets:
        labels = t.get("labels", {})
        job = labels.get("job", "")
        instance = labels.get("instance", "")
        is_node = (
            job.lower() in NODE_EXPORTER_JOBS
            or (("9100" in instance or "9101" in instance) and not instance.startswith("http"))
        )
        if not is_node: continue
        if not instance or ":" not in instance: continue
        ip = instance.split(":")[0]
        if not ip[0].isdigit(): continue
        print(f"Valid node target: job={job}, instance={instance}")

asyncio.run(test())
