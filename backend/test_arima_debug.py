import asyncio
from app.api.deps import get_db
from app.services.vm_service import vm_service
from app.forecasting.service import forecast_service
from app.models.models import ForecastAlgorithm, ForecastMetric

async def debug_arima():
    async for db in get_db():
        vms = await vm_service.get_all(db, limit=5)
        if not vms:
            print("No VMs found in DB.")
            return
            
        for vm in vms:
            print(f"\n==================================================")
            print(f"VM Hostname: {vm.hostname} (IP: {vm.ip_address})")
            print(f"Prometheus instance: {vm.prometheus_instance}")
            if not vm.prometheus_source:
                print("No Prometheus source connected.")
                continue
            print(f"Prometheus Source URL: {vm.prometheus_source.url}")
            
            for metric in [ForecastMetric.CPU, ForecastMetric.RAM, ForecastMetric.DISK]:
                print(f"\nGenerating forecast for metric: {metric.value}...")
                try:
                    res = await forecast_service.generate_forecast(
                        vm=vm,
                        metric=metric,
                        algorithm=ForecastAlgorithm.ARIMA,
                        period_days=7
                    )
                    print(f"  Accuracy: {res.accuracy_score} ({res.accuracy_metric})")
                    print(f"  Points: Historical={len(res.historical)}, Forecast={len(res.forecast)}")
                    print(f"  Model Info: {res.model_info}")
                except Exception as e:
                    import traceback
                    print(f"  !!! Error generating forecast:")
                    traceback.print_exc()
        break

if __name__ == "__main__":
    asyncio.run(debug_arima())
