import pandas as pd
import numpy as np
from pathlib import Path
from math import radians, sin, cos, sqrt, atan2

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------

INPUT = Path("data/gsi_landslide_clean.csv")
OUTPUT = Path("data/gsi_historical_risk.csv")

# Search radius around a location, in kilometres
RADIUS_KM = 25


# ---------------------------------------------------------
# HAVERSINE DISTANCE
# ---------------------------------------------------------

def haversine_km(lat1, lon1, lat2, lon2):
    """
    Calculate great-circle distance between two coordinates.
    """

    R = 6371.0

    lat1 = radians(lat1)
    lon1 = radians(lon1)
    lat2 = radians(lat2)
    lon2 = radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        sin(dlat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c


# ---------------------------------------------------------
# LOAD DATA
# ---------------------------------------------------------

print("Loading GSI landslide inventory...")

df = pd.read_csv(INPUT)

df["latitude"] = pd.to_numeric(
    df["latitude"],
    errors="coerce"
)

df["longitude"] = pd.to_numeric(
    df["longitude"],
    errors="coerce"
)

df = df.dropna(
    subset=["latitude", "longitude"]
).reset_index(drop=True)

print(f"Valid GSI coordinates: {len(df)}")


# ---------------------------------------------------------
# HISTORICAL DENSITY
# ---------------------------------------------------------

# Instead of calculating every point against every other point,
# use geographic grid cells.

GRID_SIZE = 0.25

df["lat_grid"] = (
    df["latitude"] / GRID_SIZE
).round() * GRID_SIZE

df["lon_grid"] = (
    df["longitude"] / GRID_SIZE
).round() * GRID_SIZE


grid = (
    df.groupby(
        ["lat_grid", "lon_grid"]
    )
    .size()
    .reset_index(
        name="historical_events"
    )
)


# ---------------------------------------------------------
# NORMALIZE RISK
# ---------------------------------------------------------

# Log scaling prevents a few extremely dense locations
# from dominating the entire country.

grid["log_events"] = np.log1p(
    grid["historical_events"]
)

max_log = grid["log_events"].max()

if max_log > 0:
    grid["historical_risk"] = (
        grid["log_events"] / max_log
    ) * 100
else:
    grid["historical_risk"] = 0


grid["historical_risk"] = (
    grid["historical_risk"]
    .round(2)
)


# ---------------------------------------------------------
# RISK CATEGORY
# ---------------------------------------------------------

def risk_level(score):

    if score >= 80:
        return "CRITICAL"

    if score >= 60:
        return "HIGH"

    if score >= 40:
        return "MODERATE"

    return "LOW"


grid["risk_level"] = (
    grid["historical_risk"]
    .apply(risk_level)
)


# ---------------------------------------------------------
# SAVE
# ---------------------------------------------------------

grid.to_csv(
    OUTPUT,
    index=False
)

print()
print("Historical risk generation complete!")
print(f"Grid cells: {len(grid)}")
print(f"Saved to: {OUTPUT}")

print()
print("Risk distribution:")

print(
    grid["risk_level"]
    .value_counts()
    .to_string()
)

print()
print("Highest-risk locations:")

print(
    grid.sort_values(
        "historical_risk",
        ascending=False
    )
    .head(20)
    .to_string(index=False)
)