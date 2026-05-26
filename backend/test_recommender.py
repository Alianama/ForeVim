import asyncio
from uuid import UUID
from app.api.deps import get_db
from app.services.vm_service import vm_service
from app.models.models import ForecastAlgorithm
import uuid

async def test():
    async for db in get_db():
        vms = await vm_service.get_all(db, limit=1)
        if not vms:
            print("No VMs found")
            return
        
        vm_id = vms[0].id
        print(f"Testing recommendation for VM {vm_id}")
        
        # Test directly calling recommender logic by mocking the endpoint call logic, 
        # but since I am in backend dir I can just call the endpoint function
        from app.api.v1.endpoints.vms import get_vm_recommendation
        
        try:
            res = await get_vm_recommendation(
                vm_id=vm_id,
                db=db,
                current_user=None, # mock user
                algorithm=ForecastAlgorithm.AUTO,
                period_days=7
            )
            print("Recommendation Result:", res.model_dump_json(indent=2))
        except Exception as e:
            print("Error:", e)
        break

if __name__ == "__main__":
    asyncio.run(test())
