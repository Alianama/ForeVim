"""
VM Resource Recommendation Engine.
Analyzes historical usage and forecasted trends to provide sizing recommendations.
"""
from typing import List, Optional
import numpy as np

from app.schemas.schemas import ForecastResponse, ResourceRecommendation

# Settings for recommendations
TARGET_UTILIZATION_INCREASE = 75.0
TARGET_UTILIZATION_DECREASE = 60.0

THRESHOLD_INCREASE = 80.0
THRESHOLD_DECREASE = 40.0
THRESHOLD_DISK_INCREASE = 85.0

def analyze_metric(
    metric_name: str,
    forecast_data: Optional[ForecastResponse],
    current_capacity: Optional[float] = None
) -> ResourceRecommendation:
    """
    Analyzes forecast and historical data to recommend action.
    """
    if not forecast_data or not forecast_data.forecast or not forecast_data.historical:
        return ResourceRecommendation(
            action="KEEP",
            current_capacity=current_capacity,
            recommended_capacity=current_capacity,
            reason="Historical or forecasted data is insufficient for analysis."
        )

    # Use 95th percentile to ignore sudden spikes
    hist_vals = [p.value for p in forecast_data.historical if p.value is not None]
    fcst_vals = [p.value for p in forecast_data.forecast if p.value is not None]
    
    if not hist_vals or not fcst_vals:
         return ResourceRecommendation(
            action="KEEP",
            current_capacity=current_capacity,
            recommended_capacity=current_capacity,
            reason="No valid values in data."
        )

    peak_hist = float(np.percentile(hist_vals, 95))
    peak_fcst = float(np.percentile(fcst_vals, 95))
    
    action = "KEEP"
    reason = f"Predicted {metric_name.upper()} usage is normal and stable (Peak: {peak_fcst:.1f}%)."
    recommended_cap = current_capacity

    if metric_name.lower() == "disk":
        if peak_fcst > THRESHOLD_DISK_INCREASE:
            action = "INCREASE"
            reason = f"Predicted peak Disk usage reaches {peak_fcst:.1f}%. It is recommended to increase capacity to keep utilization safe at {TARGET_UTILIZATION_INCREASE}%."
            if current_capacity:
                recommended_cap = round((peak_fcst / TARGET_UTILIZATION_INCREASE) * current_capacity, 2)
        else:
            action = "KEEP"
            reason = f"Predicted peak Disk usage of {peak_fcst:.1f}% is still within safe limits (< {THRESHOLD_DISK_INCREASE}%)."
    elif metric_name.lower() == "ram":
        # Handle RAM recommendations (in multiples of 2GB)
        if peak_fcst > THRESHOLD_INCREASE:
            action = "INCREASE"
            if current_capacity:
                raw_cap = (peak_fcst / TARGET_UTILIZATION_INCREASE) * current_capacity
                recommended_cap = max(2.0, float(round(raw_cap / 2.0) * 2.0))
                if recommended_cap <= current_capacity:
                    recommended_cap = current_capacity + 2.0
                reason = f"Predicted peak RAM usage reaches {peak_fcst:.1f}%. It is recommended to increase capacity to {int(recommended_cap)}GB to bring utilization down to target {TARGET_UTILIZATION_INCREASE}%."
            else:
                reason = f"Predicted peak RAM usage reaches {peak_fcst:.1f}%. It is recommended to increase capacity to bring utilization down to target {TARGET_UTILIZATION_INCREASE}%."
        elif peak_fcst < THRESHOLD_DECREASE and peak_hist < THRESHOLD_DECREASE:
            if current_capacity:
                raw_cap = (peak_fcst / TARGET_UTILIZATION_DECREASE) * current_capacity
                recommended_cap = max(2.0, float(round(raw_cap / 2.0) * 2.0))
                if recommended_cap >= current_capacity:
                    recommended_cap = max(2.0, current_capacity - 2.0)
                
                if recommended_cap < current_capacity:
                    action = "DECREASE"
                    reason = f"RAM usage is very low (Historical: {peak_hist:.1f}%, Predicted: {peak_fcst:.1f}%). Capacity can be reduced to {int(recommended_cap)}GB for efficiency to target utilization {TARGET_UTILIZATION_DECREASE}%."
                else:
                    action = "KEEP"
                    recommended_cap = current_capacity
                    reason = f"RAM usage is predicted to be normal and stable (Peak: {peak_fcst:.1f}%)."
            else:
                action = "DECREASE"
                reason = f"RAM usage is very low (Historical: {peak_hist:.1f}%, Predicted: {peak_fcst:.1f}%). Capacity can be reduced for efficiency to target utilization {TARGET_UTILIZATION_DECREASE}%."
        else:
            action = "KEEP"
            reason = f"RAM usage is predicted to be normal and stable (Peak: {peak_fcst:.1f}%)."
    else:
        if peak_fcst > THRESHOLD_INCREASE:
            action = "INCREASE"
            reason = f"Predicted peak {metric_name.upper()} usage reaches {peak_fcst:.1f}%. It is recommended to increase capacity to bring utilization down to target {TARGET_UTILIZATION_INCREASE}%."
            if current_capacity:
                recommended_cap = round((peak_fcst / TARGET_UTILIZATION_INCREASE) * current_capacity, 2)
        elif peak_fcst < THRESHOLD_DECREASE and peak_hist < THRESHOLD_DECREASE:
            action = "DECREASE"
            reason = f"{metric_name.upper()} usage is very low (Historical: {peak_hist:.1f}%, Predicted: {peak_fcst:.1f}%). Capacity can be reduced for efficiency to target utilization {TARGET_UTILIZATION_DECREASE}%."
            if current_capacity:
                calc_cap = round((peak_fcst / TARGET_UTILIZATION_DECREASE) * current_capacity, 2)
                recommended_cap = max(calc_cap, 1.0 if metric_name.lower() == "cpu" else 0.5)

    return ResourceRecommendation(
        action=action,
        current_capacity=current_capacity,
        recommended_capacity=recommended_cap,
        reason=reason
    )
