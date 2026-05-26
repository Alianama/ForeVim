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
            reason="Data historis atau forecast tidak mencukupi untuk analisis."
        )

    # Use 95th percentile to ignore sudden spikes
    hist_vals = [p.value for p in forecast_data.historical if p.value is not None]
    fcst_vals = [p.value for p in forecast_data.forecast if p.value is not None]
    
    if not hist_vals or not fcst_vals:
         return ResourceRecommendation(
            action="KEEP",
            current_capacity=current_capacity,
            recommended_capacity=current_capacity,
            reason="Tidak ada nilai valid dalam data."
        )

    peak_hist = float(np.percentile(hist_vals, 95))
    peak_fcst = float(np.percentile(fcst_vals, 95))
    
    action = "KEEP"
    reason = f"Penggunaan {metric_name.upper()} diprediksi normal dan stabil (Puncak: {peak_fcst:.1f}%)."
    recommended_cap = current_capacity

    if metric_name.lower() == "disk":
        if peak_fcst > THRESHOLD_DISK_INCREASE:
            action = "INCREASE"
            reason = f"Prediksi puncak penggunaan Disk mencapai {peak_fcst:.1f}%. Disarankan menambah kapasitas agar utilisasi aman di {TARGET_UTILIZATION_INCREASE}%."
            if current_capacity:
                recommended_cap = round((peak_fcst / TARGET_UTILIZATION_INCREASE) * current_capacity, 2)
        else:
            action = "KEEP"
            reason = f"Prediksi puncak penggunaan Disk {peak_fcst:.1f}% masih dalam batas aman (< {THRESHOLD_DISK_INCREASE}%)."
    else:
        if peak_fcst > THRESHOLD_INCREASE:
            action = "INCREASE"
            reason = f"Prediksi puncak penggunaan {metric_name.upper()} mencapai {peak_fcst:.1f}%. Disarankan menambah kapasitas agar utilisasi turun ke target {TARGET_UTILIZATION_INCREASE}%."
            if current_capacity:
                recommended_cap = round((peak_fcst / TARGET_UTILIZATION_INCREASE) * current_capacity, 2)
        elif peak_fcst < THRESHOLD_DECREASE and peak_hist < THRESHOLD_DECREASE:
            action = "DECREASE"
            reason = f"Penggunaan {metric_name.upper()} sangat rendah (Historis: {peak_hist:.1f}%, Prediksi: {peak_fcst:.1f}%). Kapasitas bisa dikurangi untuk efisiensi ke target utilisasi {TARGET_UTILIZATION_DECREASE}%."
            if current_capacity:
                # If peak is 10% and current is 8 cores, recommended is 8 * 10 / 60 = 1.33 cores
                # Let's ensure it doesn't drop to 0
                calc_cap = round((peak_fcst / TARGET_UTILIZATION_DECREASE) * current_capacity, 2)
                recommended_cap = max(calc_cap, 1.0 if metric_name.lower() == "cpu" else 0.5)

    return ResourceRecommendation(
        action=action,
        current_capacity=current_capacity,
        recommended_capacity=recommended_cap,
        reason=reason
    )
